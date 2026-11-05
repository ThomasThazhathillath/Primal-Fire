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
  VisibilityState,
} from '@iwsdk/core';
import { hintInfo, hintView } from '../game/hint-info.js';
import { cardView, objectiveById } from '../game/objectives.js';
import { type HintImages, sharedImages } from './hint-images.js';
import { PanelTouch } from './panel-touch.js';
import { PopIn } from './ui-fx.js';
import { getGame, getUi, hidePanel, menu, PANEL_DISTANCE, PANEL_DOWN, placeInFront, StaticAnchor, uiText } from './shared.js';

const PANEL_SCALE = 0.047;
/** Layout (px, from hint.uikitml): the root is 600 x 904; the picture area is 456 x 342 at 74 px from the top. */
const W = 600;
const H = 904;
const PIC_X = 0;
const PIC_Y = (H / 2 - (74 + 171)) * 0.01;
const LEVEL_NAME = ['', 'What to look for', 'What it looks like', 'Where to look', 'Exactly what to do'];
const IDLE_CLOSE = 90;

export class HintPanelSystem extends createSystem({}) {
  private panel!: UIKitMLAsset;
  private entity!: Entity;
  private images: HintImages | null = null;
  private pic!: Mesh;
  private picMat!: MeshBasicMaterial;
  private anchor = new StaticAnchor(PANEL_DISTANCE, 0, PANEL_DOWN - 0.1, 0.9, 1);
  private ready = false;
  private opened: string | null = null;
  private idle = 0;
  private watch = 0;
  private vr = false;
  private touch!: PanelTouch;
  private pop!: PopIn;

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
    wire('hint-close', () => menu.back());
    this.touch = new PanelTouch(this.world, panel, PANEL_SCALE, 'hint');
    this.pop = new PopIn(panel, () => PANEL_SCALE);
    this.touch.add('hint-more', () => this.more());
    this.touch.add('hint-close', () => menu.back());
    menu.register('hint', () => this.close());

    getUi(this.world).hintOpen = () => this.opened !== null;
    getUi(this.world).openHint = (id: string) => (this.opened === id ? this.close() : this.open(id));
    this.cleanupFuncs.push(this.world.visibilityState.subscribe((v) => this.onVisibility(v)));
    this.ready = true;
    (window as unknown as { __hint?: unknown }).__hint = {
      panel,
      taps: this.touch.taps,
      state: () => ({ opened: this.opened, vr: this.vr, level: this.opened ? getGame(this.world).objectives.hintLevel(this.opened) : 0 }),
      open: (id: string) => this.open(id),
      image: (id: string, level: number) => {
        const v = hintView(id, level);
        return v ? this.imgs().dataUrl(v) : null;
      },
    };
  }

  private imgs(): HintImages {
    return (this.images ??= sharedImages(this.renderer));
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
    menu.open('hint');
    this.opened = id;
    this.idle = 0;
    this.render();
    this.panel.visible = true;
    this.anchor.reset();
    this.touch.reset();
    this.place();
    this.pop.open();
  }

  close(): void {
    menu.closed('hint');
    this.opened = null;
    this.pop.close(() => {
      hidePanel(this.panel);
      this.pic.visible = false;
    });
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
    else placeInFront(this.panel, this.camera, 0.6, 0, 0.1); // below the top HUD (Enter XR button)
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
    if (this.pop?.busy) this.pop.update(delta);
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
    this.touch.update(delta);
  }
}
