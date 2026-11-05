// The crafting guide card (src/game/guides.ts): one compact panel showing the
// active step, its materials, a hand cue, the last mistake and a science line.
// Browser: pinned top-right, clear of the work in front of you. VR: follows lazily, low in view, so it never
// blocks what your hands are doing. J, its Hide button or the HUD's Guide
// button toggle it; the guide is optional and the choice is saved.

import {
  createSystem,
  type Entity,
  Follower,
  FollowBehavior,
  findUIKitDocument,
  type Object3D,
  ScreenSpace,
  type UIKit,
  type UIKitMLAsset,
  Visibility,
  VisibilityState,
} from '@iwsdk/core';
import type { GuideView, HandDiagram } from '../game/guides.js';
import { ITEMS, type ItemId } from '../game/items.js';
import { RESOURCES } from '../game/world-layout.js';
import { PanelTouch } from './panel-touch.js';
import { getGame, getUi, StaticAnchor, uiText } from './shared.js';
import { WorldSystem } from './world-system.js';

const REFRESH_SECONDS = 0.25;
const CHIPS = 4;
/** Resources this close (m) count as 'nearby' for choosing a guide. */
const NEARBY = 4;

const HAND_CUES: Record<HandDiagram, string> = {
  twoHandLift: 'Both hands: lift',
  push: 'Hand: press down',
  twist: 'Both hands: roll opposite ways',
  strike: 'Hand: quick glancing strike',
  wrap: 'Hand: wrap and pull tight',
  bend: 'Both hands: bend gently',
  draw: 'Pull the string back',
  place: 'Hand: set it on the glowing spot',
  swing: 'Swing: fast, edge square on',
};

export class GuideSystem extends createSystem({}) {
  private panel: UIKitMLAsset | null = null;
  private doc: Object3D | null = null;
  private entity!: Entity;
  private timer = 0;
  private lastKey = '';
  private visible = false;
  private anchor = new StaticAnchor(0.55, 0.2, 0.3);
  private touch!: PanelTouch;
  private vr = false;
  private nearby: ItemId[] = [];
  private selectCtx = { nearby: this.nearby as readonly ItemId[] };

  async init(): Promise<void> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('guide-panel');
    panel.name = 'GuideCard';
    panel.scale.setScalar(0.07);
    this.entity = this.world.createTransformEntity(panel);
    this.entity.setValue(Visibility, 'isVisible', false);
    this.panel = panel;
    this.doc = findUIKitDocument(panel);
    if (this.doc) this.doc.visible = false;

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyJ') this.toggle();
    };
    window.addEventListener('keydown', onKey);
    const close = panel.requireElementById('guide-close');
    const onClose = () => this.toggle();
    close.addEventListener('click', onClose);
    getUi(this.world).toggleGuide = () => this.toggle();
    // Its Hide button is a fingertip target in VR (no ray or pinch).
    this.touch = new PanelTouch(this.world, panel, 0.07, 'guide');
    this.touch.setRequirePoint(true);
    this.touch.add('guide-close', () => this.toggle());
    this.cleanupFuncs.push(
      () => window.removeEventListener('keydown', onKey),
      () => close.removeEventListener('click', onClose),
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        PanelTouch.setRay(this.world, this.entity, this.vr);
        this.place(v);
      }),
      getGame(this.world).on(() => (this.timer = REFRESH_SECONDS)),
    );
  }

  /** Show or hide the card (J key, its Hide button, or the HUD's Guide button). */
  toggle(): void {
    const game = getGame(this.world);
    game.guide.hidden = !game.guide.hidden;
    game.log.add(`guide ${game.guide.hidden ? 'hidden' : 'shown'}`);
    game.toast(game.guide.hidden ? 'Guide hidden. Press J or the Guide button to show it.' : 'Guide shown (J to hide).');
    this.lastKey = '';
    this.timer = REFRESH_SECONDS;
  }

  update(delta: number): void {
    if (!this.panel) return;
    if (this.visible && this.vr) {
      this.anchor.update(this.panel, this.camera);
      this.touch.update(delta);
    }
    this.timer += delta;
    if (this.timer < REFRESH_SECONDS) return;
    this.timer = 0;
    const game = getGame(this.world);
    const started = this.world.getSystem(WorldSystem)?.started ?? false;
    this.nearby.length = 0;
    for (const r of RESOURCES) {
      if (Math.abs(r.x - game.player.x) < NEARBY && Math.abs(r.z - game.player.z) < NEARBY && !this.nearby.includes(r.itemId)) {
        this.nearby.push(r.itemId);
      }
    }
    const view = started && !game.guide.hidden ? game.guide.current(this.selectCtx) : null;
    if (!view) {
      this.setVisible(false);
      return;
    }
    const key = `${view.guide.id}.${view.step.id}.${view.complete}.${view.failure?.code ?? ''}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.render(view);
    }
    this.setVisible(true);
  }

  private setVisible(on: boolean): void {
    if (on === this.visible || !this.panel) return;
    this.visible = on;
    // The entity's Visibility component drives object.visible every frame.
    this.entity.setValue(Visibility, 'isVisible', on);
    // In the browser ScreenSpace reparents the UIKit document onto the camera,
    // so hiding the entity alone leaves the card on screen: hide the document too.
    if (this.doc) this.doc.visible = on;
    if (!on) {
      if (this.entity.hasComponent(Follower)) this.entity.removeComponent(Follower);
      return;
    }
    if (!this.entity.hasComponent(ScreenSpace)) {
      this.entity.addComponent(ScreenSpace, { width: '340px', height: '300px', top: '12px', right: '12px', bottom: 'auto', left: 'auto', zOffset: 0.25 });
    }
    this.place(this.world.visibilityState.peek());
  }

  private place(v: VisibilityState): void {
    if (!this.visible) return;
    // VR: still, low and slightly right (StaticAnchor in update); it never glides after you.
    if (this.entity.hasComponent(Follower)) this.entity.removeComponent(Follower);
    if (v !== VisibilityState.NonImmersive) this.anchor.reset();
  }

  private render(v: GuideView): void {
    const p = this.panel!;
    const text = (id: string, t: string) => p.requireElementById<UIKit.Text>(id).setProperties({ text: uiText(t) });
    const show = (id: string, on: boolean) => p.requireElementById(id).setProperties({ display: on ? 'flex' : 'none' });
    text('guide-name', v.guide.name.toUpperCase());
    text('guide-count', v.complete ? 'DONE' : `${v.index + 1} / ${v.guide.steps.length}`);
    text('guide-title', v.complete ? v.step.success : v.step.title);
    const mats = Object.entries(v.step.materials) as Array<[ItemId, number]>;
    for (let i = 0; i < CHIPS; i++) {
      const m = mats[i];
      show(`guide-mat-${i}`, !!m && !v.complete);
      if (!m) continue;
      text(`guide-mt-${i}`, `${m[1]} ${ITEMS[m[0]].name}`);
      p.requireElementById(`guide-sw-${i}`).setProperties({ backgroundColor: `#${ITEMS[m[0]].color.toString(16).padStart(6, '0')}` });
    }
    const cue = v.step.visual?.handDiagram;
    show('guide-hands', !!cue && !v.complete);
    if (cue) text('guide-hands', HAND_CUES[cue]);
    show('guide-fail', !!v.failure);
    if (v.failure) text('guide-fail', v.failure.text);
    text('guide-sci', v.step.uncertain ? `${v.step.science} (${v.step.uncertain})` : v.step.science);
  }
}
