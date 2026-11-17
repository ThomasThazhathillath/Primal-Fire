// Body feedback (curriculum Phase 1, C8): shows the body simulation (game/survival/body.ts) with as little
// HUD as possible.
// - A small status card lists only the needs that are low right now (Cold, Thirsty, Hungry, Tired, Wet),
//   each with a bar. Desktop: a screen overlay in the bottom-right corner. VR: a little card above the left
//   wrist, turned to the eyes. Nothing shows while every need is fine.
// - A frost ring creeps in from the edge of the view as you get cold: one transparent ring mesh on the
//   camera (an annulus, so the centre of the view costs nothing), hidden when you are warm.
// Updated at 4 Hz; the wrist card follows the hand every frame only while it is shown.

import {
  AdditiveBlending,
  createSystem,
  type Entity,
  findUIKitDocument,
  Mesh,
  RingGeometry,
  ScreenSpace,
  ShaderMaterial,
  type UIKit,
  type UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Need } from '../game/survival/body.js';
import { currentMode } from '../game/tutorial-mode.js';
import { getGame, getUi, hidePanel } from './shared.js';
import { WorldSystem } from './world-system.js';

type Row = Need | 'wet';
const ROWS: readonly Row[] = ['warmth', 'water', 'food', 'rest', 'wet'];
const LABEL: Record<Need, [string, string]> = {
  warmth: ['COLD', 'VERY COLD'],
  water: ['THIRSTY', 'VERY THIRSTY'],
  food: ['HUNGRY', 'VERY HUNGRY'],
  rest: ['TIRED', 'EXHAUSTED'],
};
/** Wrist card size (UIKit units are centimetres at scale 1): about 9 cm wide. */
const WRIST_SCALE = 0.035;
/** Bar track width in the document (px). */
const TRACK = 196;
/** Desktop overlay height per shown row, plus padding (px). */
const ROW_PX = 52;

const ringVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// RingGeometry uv.x runs 0 (inner edge) to 1 (outer edge) when built with phi segments: fade in outwards.
const ringFragment = /* glsl */ `
  uniform float uAmount;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = smoothstep(0.35, 1.0, r) * uAmount;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export class BodySystem extends createSystem({}) {
  private panel: UIKitMLAsset | null = null;
  private entity: Entity | null = null;
  private vr = false;
  private shown = false;
  private timer = 0;
  private shownKey = '';
  private lastFill: Record<Row, number> = { warmth: -1, water: -1, food: -1, rest: -1, wet: -1 };
  private ring!: Mesh;
  private ringMat!: ShaderMaterial;
  private frost = 0;
  private hand = new Vector3();
  private head = new Vector3();

  async init(): Promise<void> {
    // The frost ring: on the camera, drawn last, never depth-tested; invisible while warm.
    this.ringMat = new ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      uniforms: { uAmount: { value: 0 }, uColor: { value: new Vector3(0.75, 0.88, 1.0) } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.ring = new Mesh(new RingGeometry(0.12, 0.42, 48, 1), this.ringMat);
    this.ring.position.set(0, 0, -0.25);
    this.ring.renderOrder = 999;
    this.ring.frustumCulled = false;
    this.ring.visible = false;
    this.ring.name = 'FrostRing';
    this.camera.add(this.ring);

    const panel = await this.world.assets.instantiate<UIKitMLAsset>('body-panel');
    panel.name = 'BodyStatus';
    panel.scale.setScalar(WRIST_SCALE);
    this.entity = this.world.createTransformEntity(panel);
    hidePanel(panel);
    this.panel = panel;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        this.shownKey = '';
        this.layout(0);
      }),
      () => this.ring.removeFromParent(),
    );
    (window as unknown as { __body?: unknown }).__body = {
      state: () => ({ shown: this.shown, rows: this.shownKey, frost: this.frost, vr: this.vr }),
      panel,
    };
  }

  /** Which rows to show now, as a key ("warmth:low,wet:low"), and the values for the bars. */
  private rowsNow(): string {
    const b = getGame(this.world).body;
    const parts: string[] = [];
    for (const need of ['warmth', 'water', 'food', 'rest'] as const) {
      const l = b.level(need);
      if (l !== 'ok') parts.push(`${need}:${l}`);
    }
    if (b.wet > 0.3) parts.push(`wet:${b.wet > 0.7 ? 'critical' : 'low'}`);
    return parts.join(',');
  }

  private active(): boolean {
    const started = this.world.getSystem(WorldSystem)?.started ?? false;
    const g = getGame(this.world);
    return started && !getUi(this.world).paused?.() && g.body.pressure !== 'off' && currentMode() !== 'tutorial';
  }

  update(delta: number): void {
    if (!this.panel) return;
    // The wrist card rides on the left hand (only while shown in the headset).
    if (this.shown && this.vr) this.followWrist();
    if ((this.timer -= delta) > 0) return;
    this.timer = 0.25;
    const g = getGame(this.world);
    const on = this.active();
    // Frost: grows as warmth falls below 40, stronger when critical.
    const target = on ? Math.max(0, Math.min(1, (40 - g.body.warmth) / 40)) * 0.55 : 0;
    this.frost += (target - this.frost) * 0.3;
    if (this.frost < 0.01 && target === 0) this.frost = 0;
    this.ringMat.uniforms.uAmount.value = this.frost;
    this.ring.visible = this.frost > 0;

    const key = on ? this.rowsNow() : '';
    if (key !== this.shownKey) this.render(key);
    if (key) this.fills();
  }

  private render(key: string): void {
    const p = this.panel!;
    this.shownKey = key;
    const levels = new Map(key ? key.split(',').map((s) => s.split(':') as [Row, string]) : []);
    for (const r of ROWS) {
      const l = levels.get(r);
      p.requireElementById(`b-row-${r}`).setProperties({ display: l ? 'flex' : 'none' });
      if (!l) continue;
      const crit = l === 'critical';
      const text = r === 'wet' ? (crit ? 'SOAKED' : 'WET') : LABEL[r][crit ? 1 : 0];
      p.requireElementById<UIKit.Text>(`b-label-${r}`).setProperties({ text, color: crit ? '#ff8f73' : '#f3e6cc' } as never);
      p.requireElementById(`b-fill-${r}`).setProperties({ backgroundColor: crit ? '#ff8f73' : '#f0a54e' } as never);
      this.lastFill[r] = -1;
    }
    this.layout(levels.size);
  }

  /** Bars: how much of each need is left (wetness: how wet). Only rewritten when it moved visibly. */
  private fills(): void {
    const b = getGame(this.world).body;
    for (const r of ROWS) {
      const v = r === 'wet' ? b.wet * 100 : b[r];
      const w = Math.round((Math.max(4, v) / 100) * TRACK);
      if (Math.abs(w - this.lastFill[r]) < 3) continue;
      this.lastFill[r] = w;
      this.panel!.requireElementById(`b-fill-${r}`).setProperties({ width: w });
    }
  }

  /** Show or hide, as a corner overlay (desktop) or a wrist card (VR). */
  private layout(rows: number): void {
    const p = this.panel;
    const e = this.entity;
    if (!p || !e) return;
    const show = rows > 0;
    this.shown = show;
    if (e.hasComponent(ScreenSpace)) e.removeComponent(ScreenSpace);
    const doc = findUIKitDocument(p);
    if (!show) {
      hidePanel(p);
      if (doc) doc.visible = false;
      return;
    }
    if (doc) doc.visible = true;
    p.visible = true;
    if (!this.vr) {
      const h = 24 + rows * ROW_PX;
      // Bottom-right corner: clear of the HUD (top-left), the objective card (top), Pause (top-right) and the menu bar.
      e.addComponent(ScreenSpace, { width: '230px', height: `${h}px`, right: '12px', bottom: '12px', top: 'auto', left: 'auto', zOffset: 0.25 } as never);
    } else this.followWrist();
  }

  /** Just above the back of the left wrist, facing the eyes. */
  private followWrist(): void {
    const grip = this.player.gripSpaces.left;
    const p = this.panel;
    if (!grip || !p) return;
    grip.getWorldPosition(this.hand);
    this.camera.getWorldPosition(this.head);
    p.position.set(this.hand.x, this.hand.y + 0.07, this.hand.z);
    p.lookAt(this.head);
  }
}
