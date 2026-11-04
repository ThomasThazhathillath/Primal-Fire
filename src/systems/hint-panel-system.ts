// The hint panel (docs/QUEST_GUIDANCE_SPEC.md, part B): opened from the
// objective card's hint icon. It names the thing, shows a reference picture
// rendered from the real game meshes (HintImages), says what to look for, why
// you need it and what to avoid, and reveals one of four hint levels at a time:
// identification, what it looks like, where to look, the exact action.
// "More help" reveals the next level; nothing ever reveals the last one by
// itself. In VR it is operated ONLY by a fingertip poke (src/game/ui-touch.ts),
// never a pinch or controller; in the browser by mouse. It is never left open:
// it closes on the X, when the objective changes, when VR starts or ends, and
// after a quiet minute.

import {
  createSystem,
  type Entity,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RayInteractable,
  type Texture,
  type UIKit,
  type UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { hintInfo, hintView } from '../game/hint-info.js';
import { cardView, objectiveById } from '../game/objectives.js';
import { TouchTracker, type TipSample, type TouchIcon } from '../game/ui-touch.js';
import { hands } from './hand-input-system.js';
import { HintImages } from './hint-images.js';
import { getGame, getUi, handClaims, hidePanel, placeInFront, StaticAnchor, uiText } from './shared.js';

const PANEL_SCALE = 0.065;
const UNIT_M = 0.01 * PANEL_SCALE;
/** Layout (px, from hint.uikitml): the root is 600 x 904; the picture area is 456 x 342 at 74 px from the top. */
const W = 600;
const H = 904;
const PIC_X = 0;
const PIC_Y = (H / 2 - (74 + 171)) * 0.01;
const MORE_X = 205;
const MORE_Y = H / 2 - (702 + 22);
const CLOSE_X = W / 2 - 20 - 24;
const CLOSE_Y = H / 2 - 18 - 24;
const LEVEL_NAME = ['', 'What to look for', 'What it looks like', 'Where to look', 'Exactly what to do'];
const IDLE_CLOSE = 90;

export class HintPanelSystem extends createSystem({}) {
  private panel!: UIKitMLAsset;
  private entity!: Entity;
  private images: HintImages | null = null;
  private pic!: Mesh;
  private picMat!: MeshBasicMaterial;
  private anchor = new StaticAnchor(0.55, 0, 0.02, 0.9, 1);
  private ready = false;
  private opened: string | null = null;
  private idle = 0;
  private watch = 0;
  private vr = false;
  private icons: TouchIcon[] = [
    { x: MORE_X * UNIT_M, y: MORE_Y * UNIT_M, r: 36 * UNIT_M, enabled: true },
    { x: CLOSE_X * UNIT_M, y: CLOSE_Y * UNIT_M, r: 26 * UNIT_M, enabled: true },
  ];
  private trackers = [new TouchTracker(), new TouchTracker()];
  private tipLocal = new Vector3();
  private dirTmp = new Vector3();
  private sampleOut: TipSample = { x: 0, y: 0, z: 0, dz: 0, tracked: false };
  private taps: string[] = [];

  async init(): Promise<void> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('hint-panel');
    this.panel = panel;
    panel.name = 'HintPanel';
    panel.scale.setScalar(PANEL_SCALE);
    this.entity = this.world.createTransformEntity(panel);
    hidePanel(panel);

    this.picMat = new MeshBasicMaterial({ toneMapped: false });
    this.pic = new Mesh(new PlaneGeometry(4.56, 3.42), this.picMat);
    this.pic.position.set(PIC_X, PIC_Y, 0.03);
    this.pic.visible = false;
    panel.add(this.pic);

    const wire = (id: string, fn: () => void) => {
      const el = panel.requireElementById(id);
      // Mouse clicks only (flat view); in VR a fingertip poke is the one way to press.
      const click = () => {
        if (!this.vr) fn();
      };
      el.addEventListener('click', click);
      this.cleanupFuncs.push(() => el.removeEventListener('click', click));
    };
    wire('hint-more', () => this.more());
    wire('hint-close', () => this.close());

    getUi(this.world).openHint = (id: string) => (this.opened === id ? this.close() : this.open(id));
    this.cleanupFuncs.push(this.world.visibilityState.subscribe((v) => this.onVisibility(v)));
    this.ready = true;
    (window as unknown as { __hint?: unknown }).__hint = {
      icons: this.icons,
      panel,
      taps: this.taps,
      state: () => ({ opened: this.opened, vr: this.vr, level: this.opened ? getGame(this.world).objectives.hintLevel(this.opened) : 0 }),
      open: (id: string) => this.open(id),
      image: (id: string, level: number) => {
        const v = hintView(id, level);
        return v ? this.imgs().dataUrl(v) : null;
      },
    };
  }

  private imgs(): HintImages {
    return (this.images ??= new HintImages(this.renderer));
  }

  private onVisibility(v: VisibilityState): void {
    this.vr = v !== VisibilityState.NonImmersive;
    if (this.opened) this.close(); // a mode change never leaves it open
    if (this.vr && this.entity.hasComponent(RayInteractable)) this.entity.removeComponent(RayInteractable);
    if (!this.vr && !this.entity.hasComponent(RayInteractable)) this.entity.addComponent(RayInteractable);
  }

  open(id: string): void {
    if (!this.ready || !objectiveById(id)) return;
    const game = getGame(this.world);
    // Opening always shows the first level; the rest are asked for one at a time.
    if (game.objectives.hintLevel(id) < 1) {
      game.objectives.unlockHint(id);
      getUi(this.world).saveNow?.();
    }
    this.opened = id;
    this.idle = 0;
    this.render();
    this.panel.visible = true;
    this.anchor.reset();
    this.trackers[0].reset();
    this.trackers[1].reset();
    this.place();
  }

  close(): void {
    this.opened = null;
    hidePanel(this.panel);
    this.pic.visible = false;
  }

  private more(): void {
    const id = this.opened;
    if (!id) return;
    const game = getGame(this.world);
    if (game.objectives.hintLevel(id) >= 4) return;
    game.objectives.unlockHint(id);
    getUi(this.world).saveNow?.();
    this.idle = 0;
    this.render();
  }

  private place(): void {
    if (this.vr) this.anchor.update(this.panel, this.camera);
    else placeInFront(this.panel, this.camera, 0.6, 0, 0);
  }

  private render(): void {
    const id = this.opened;
    const o = id ? objectiveById(id) : null;
    if (!id || !o) return;
    const game = getGame(this.world);
    const level = Math.max(1, game.objectives.hintLevel(id));
    const info = hintInfo(id);
    const text = (el: string, t: string) => this.panel.requireElementById<UIKit.Text>(el).setProperties({ text: uiText(t || ' ') });
    const view = cardView(game);
    const instr = view && view.id === id ? view.instruction : typeof o.instruction === 'function' ? o.instruction(game) : o.instruction;
    text('hint-eyebrow', 'HINT');
    text('hint-title', o.title);
    text('hint-name', info?.name ?? o.title);
    text('hint-look', `Look for: ${info?.look ?? o.hint.levels[0]}`);
    text('hint-why', `Why you need it: ${info?.why ?? ''}`);
    text('hint-avoid', `Avoid: ${info?.avoid ?? ''}`);
    text('hint-do', `What to do: ${instr}`);
    text('hint-level', `Hint ${level} of 4: ${LEVEL_NAME[level]}`);
    text('hint-text', o.hint.levels[level - 1]);
    const more = this.panel.requireElementById('hint-more');
    more.setProperties({ display: level >= 4 ? 'none' : 'flex' });
    this.icons[0].enabled = level < 4;

    // The reference picture: from the real game meshes, drawn once and cached.
    const pv = hintView(id, level);
    let tex: Texture | null = null;
    if (pv) tex = this.imgs().get(`${id}:${level >= 2 ? 1 : 0}`, pv);
    this.pic.visible = !!tex;
    if (tex) {
      this.picMat.map = tex;
      this.picMat.needsUpdate = true;
    }
  }

  update(delta: number): void {
    if (!this.ready || !this.opened) return;
    this.idle += delta;
    if (this.idle > IDLE_CLOSE) return this.close();
    // The objective moved on (or the tutorial ended): the panel goes with it.
    if ((this.watch += delta) > 0.25) {
      this.watch = 0;
      const v = cardView(getGame(this.world));
      if (!v || v.id !== this.opened) return this.close();
    }
    this.place();
    if (!this.vr) return;
    this.panel.updateMatrixWorld(true);
    this.tapUpdate(delta);
  }

  private tapUpdate(dt: number): void {
    for (let h = 0; h < 2; h++) {
      const hand = hands[h];
      const tr = this.trackers[h];
      const s = this.sample(hand.tipPos, hand.tipDir, hand.tipTracked, hand.pinchDist);
      const hit = tr.update(dt, this.icons, s);
      handClaims.uiNear[h] = handClaims.uiNear[h] || tr.hoverIcon >= 0;
      if (hit < 0) continue;
      handClaims.uiTapAt[h] = performance.now() / 1000;
      if (this.taps.length > 50) this.taps.shift();
      this.taps.push(hit === 0 ? 'more' : 'close');
      this.idle = 0;
      if (hit === 0) this.more();
      else this.close();
      return;
    }
  }

  /** World fingertip to the panel's frame in metres (x right, y up, z towards the viewer). */
  private sample(pos: Vector3, dir: Vector3, tracked: boolean, pinchDist: number): TipSample {
    const o = this.sampleOut;
    o.tracked = tracked;
    o.pinchDist = pinchDist;
    if (!tracked) return o;
    this.tipLocal.copy(pos);
    this.panel.worldToLocal(this.tipLocal);
    o.x = this.tipLocal.x * PANEL_SCALE;
    o.y = this.tipLocal.y * PANEL_SCALE;
    o.z = this.tipLocal.z * PANEL_SCALE;
    const e = this.panel.matrixWorld.elements;
    this.dirTmp.copy(dir);
    o.dz = (this.dirTmp.x * e[8] + this.dirTmp.y * e[9] + this.dirTmp.z * e[10]) / PANEL_SCALE;
    return o;
  }
}
