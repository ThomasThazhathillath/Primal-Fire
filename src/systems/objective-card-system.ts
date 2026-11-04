// The objective card (docs/QUEST_GUIDANCE_SPEC.md, part A): one compact card
// near the top of view showing the current beginner objective: title, one or
// two sentences, progress, a hint icon and a close icon. Closing only hides
// it; tracking continues and it comes back from the bottom bar's quest icon.
// Nothing reopens it on minor events.
//
// Browser: pinned top-centre, mouse clicks. VR: a StaticAnchor panel above
// the middle of view, operated ONLY by a deliberate fingertip poke
// (src/game/ui-touch.ts) like the icon bar, never a pinch or controller button.

import { createSystem, type Entity, findUIKitDocument, RayInteractable, ScreenSpace, type UIKit, type UIKitMLAsset, Vector3, VisibilityState } from '@iwsdk/core';
import { cardView, objectiveById, type ObjectiveView } from '../game/objectives.js';
import { TouchTracker, type TipSample, type TouchIcon } from '../game/ui-touch.js';
import { hands } from './hand-input-system.js';
import { getGame, getUi, handClaims, hidePanel, StaticAnchor, uiText } from './shared.js';
import { WorldSystem } from './world-system.js';

/** UIKit units are ~1 cm; the panel is scaled so the 520-wide card is ~26 cm. */
const PANEL_SCALE = 0.05;
const UNIT_M = 0.01 * PANEL_SCALE;
const CARD_W = 520;
const CARD_H = 380;
/** Header buttons (centres, in panel units from the panel centre; y up). */
const HINT_X = 156;
const CLOSE_X = 212;
const BTN_Y = CARD_H / 2 - 14 - 22;
/** Where the card hangs in VR: above the middle of view and within a seated arm's reach, so a fingertip can poke it. */
const DISTANCE = 0.5;
const UP = 0.2;

export class ObjectiveCardSystem extends createSystem({}) {
  private panel!: UIKitMLAsset;
  private entity!: Entity;
  private doc: ReturnType<typeof findUIKitDocument> = null;
  private anchor = new StaticAnchor(DISTANCE, 0, -UP, 0.9, 1);
  private ready = false;
  private shown = false;
  private open = true;
  private hintOn = false;
  private vr = false;
  private dirty = true;
  private timer = 0;
  private sig = '';
  private view: ObjectiveView | null = null;
  private icons: TouchIcon[] = [
    { x: HINT_X * UNIT_M, y: BTN_Y * UNIT_M, r: 24 * UNIT_M, enabled: true },
    { x: CLOSE_X * UNIT_M, y: BTN_Y * UNIT_M, r: 24 * UNIT_M, enabled: true },
  ];
  private trackers = [new TouchTracker(), new TouchTracker()];
  private tipLocal = new Vector3();
  private dirTmp = new Vector3();
  private sampleOut: TipSample = { x: 0, y: 0, z: 0, dz: 0, tracked: false };
  private taps: string[] = [];

  async init(): Promise<void> {
    const game = getGame(this.world);
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('objective-panel');
    this.panel = panel;
    panel.name = 'ObjectiveCard';
    panel.scale.setScalar(PANEL_SCALE);
    this.entity = this.world.createTransformEntity(panel);
    hidePanel(panel);
    this.doc = findUIKitDocument(panel);
    if (this.doc) this.doc.visible = false;
    this.open = !game.objectives.closed;

    const wire = (id: string, fn: () => void) => {
      const el = panel.requireElementById(id);
      // Mouse clicks only (flat view); in VR a fingertip poke is the one way to press.
      const click = () => {
        if (!this.vr) fn();
      };
      el.addEventListener('click', click);
      this.cleanupFuncs.push(() => el.removeEventListener('click', click));
    };
    wire('obj-hint', () => this.hint());
    wire('obj-close', () => this.setOpen(false));

    const ui = getUi(this.world);
    ui.toggleQuest = () => this.setOpen(!this.open);
    ui.questOpen = () => this.open && this.shown;

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => this.onVisibility(v)),
      game.on((e) => {
        if (e.type === 'objective' || e.type === 'quest' || e.type === 'satchel' || e.type === 'structure' || e.type === 'toast') this.dirty = true;
      }),
    );
    this.ready = true;
    (window as unknown as { __objcard?: unknown }).__objcard = {
      icons: this.icons,
      panel,
      trackers: this.trackers,
      taps: this.taps,
      state: () => ({ open: this.open, shown: this.shown, vr: this.vr, view: this.view }),
    };
  }

  private onVisibility(v: VisibilityState): void {
    this.vr = v !== VisibilityState.NonImmersive;
    if (!this.shown) return;
    if (this.vr && this.entity.hasComponent(RayInteractable)) this.entity.removeComponent(RayInteractable);
    if (!this.vr && !this.entity.hasComponent(RayInteractable)) this.entity.addComponent(RayInteractable);
    this.anchor.reset();
    this.trackers[0].reset();
    this.trackers[1].reset();
    this.place();
  }

  /** Show or hide the card. Only visibility changes: nothing is paused, reset or lost. */
  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    getGame(this.world).objectives.setClosed(!open);
    this.place();
    this.dirty = true;
  }

  private place(): void {
    if (!this.shown) return;
    const show = this.open && this.view !== null && !this.hintOn;
    // ScreenSpace reparents the UIKit document onto the camera, so the document is hidden too.
    if (this.doc) this.doc.visible = show;
    if (!show) {
      hidePanel(this.panel);
      if (this.entity.hasComponent(ScreenSpace)) this.entity.removeComponent(ScreenSpace);
      return;
    }
    this.panel.visible = true;
    if (this.vr) {
      if (this.entity.hasComponent(ScreenSpace)) this.entity.removeComponent(ScreenSpace);
      this.anchor.reset();
    } else if (!this.entity.hasComponent(ScreenSpace)) {
      this.entity.addComponent(ScreenSpace, { width: `${CARD_W * 0.7}px`, height: `${CARD_H * 0.7}px`, top: '10px', left: `calc(50% - ${CARD_W * 0.35}px)`, bottom: 'auto', right: 'auto', zOffset: 0.25 });
    }
  }

  /** The hint icon: opens the image-hint panel (part B) when it exists; until then it unlocks a level and says it. */
  private hint(): void {
    const v = this.view;
    if (!v || v.id === 'quest') return;
    const ui = getUi(this.world);
    if (ui.openHint) {
      ui.openHint(v.id);
      return;
    }
    const game = getGame(this.world);
    const level = game.objectives.unlockHint(v.id);
    const o = objectiveById(v.id);
    if (o) game.toast(`Hint ${level}/4: ${o.hint.levels[level - 1]}`, 'note');
    this.dirty = true;
  }

  private render(v: ObjectiveView): void {
    const text = (id: string, t: string) => this.panel.requireElementById<UIKit.Text>(id).setProperties({ text: uiText(t || ' ') });
    const show = (id: string, on: boolean) => this.panel.requireElementById(id).setProperties({ display: on ? 'flex' : 'none' });
    const cele = !!v.celebrating;
    text('obj-step', cele ? 'DONE' : v.id === 'quest' ? 'QUEST' : `OBJECTIVE ${v.step} OF ${v.total}`);
    text('obj-title', v.title);
    show('obj-body', !cele);
    show('obj-cele', cele);
    this.panel.requireElementById('obj-hint').setProperties({ display: v.id === 'quest' || cele ? 'none' : 'flex' });
    if (cele) {
      text('obj-cele-text', v.celebrating!.message);
      return;
    }
    text('obj-instr', v.instruction);
    show('obj-prow', !!v.progress);
    if (v.progress) {
      text('obj-ptext', `${v.progress.have} / ${v.progress.need}`);
      this.panel.requireElementById('obj-fill').setProperties({ width: Math.round((330 * v.progress.have) / v.progress.need) });
    }
    const subs = v.substeps.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.text}`).join('   ');
    text('obj-subs', subs);  // rows stay display:flex with fixed heights; toggling display from none left them zero-height
    // A failed attempt is explained first; the control lesson only until it is learned.
    text('obj-bad', v.feedback ?? '');
    text('obj-note', v.feedback ? '' : (v.tip ?? ''));
  }

  private refresh(): void {
    const game = getGame(this.world);
    const v = cardView(game);
    this.view = v;
    const sig = JSON.stringify(v);
    if (sig === this.sig) return;
    this.sig = sig;
    if (v) this.render(v);
    this.place();
  }

  update(delta: number): void {
    if (!this.ready) return;
    if (!this.shown) {
      if (!this.world.getSystem(WorldSystem)?.started) return;
      this.shown = true;
      this.onVisibility(this.world.visibilityState.peek());
      this.refresh();
      this.place();
    }
    // The hint panel opens over the same area: hide the card while it is open, restore it on close.
    const hint = getUi(this.world).hintOpen?.() ?? false;
    if (hint !== this.hintOn) {
      this.hintOn = hint;
      this.trackers[0].reset();
      this.trackers[1].reset();
      this.place();
    }
    if (this.dirty || (this.timer += delta) > 0.25) {
      this.timer = 0;
      this.dirty = false;
      this.refresh();
    }
    if (!this.open || !this.view || !this.vr || this.hintOn) return;
    this.anchor.update(this.panel, this.camera);
    this.panel.updateMatrixWorld(true);
    this.tapUpdate(delta);
  }

  private tapUpdate(dt: number): void {
    for (let h = 0; h < 2; h++) {
      const hand = hands[h];
      const tr = this.trackers[h];
      const s = this.sample(hand.tipPos, hand.tipDir, hand.tipTracked, hand.pinchDist);
      this.icons[0].enabled = this.view?.id !== 'quest' && !this.view?.celebrating;
      const hit = tr.update(dt, this.icons, s);
      handClaims.uiNear[h] = handClaims.uiNear[h] || tr.hoverIcon >= 0;
      if (hit < 0) continue;
      handClaims.uiTapAt[h] = performance.now() / 1000;
      if (this.taps.length > 50) this.taps.shift();
      this.taps.push(hit === 0 ? 'hint' : 'close');
      if (hit === 0) this.hint();
      else this.setOpen(false);
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

