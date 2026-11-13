// The objective card (docs/QUEST_GUIDANCE_SPEC.md, part A): one compact card
// near the top of view showing the current beginner objective: title, one or
// two sentences, progress, a hint icon and a close icon. Closing only hides
// it; tracking continues and it comes back from the bottom bar's quest icon.
// Nothing reopens it on minor events.
//
// Browser: pinned top-centre, mouse clicks. VR: a StaticAnchor panel above
// the middle of view, operated ONLY by a deliberate fingertip poke
// (src/game/ui-touch.ts) like the icon bar, never a pinch or controller button.

import { createSystem, type Entity, findUIKitDocument, RayInteractable, ScreenSpace, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { cardView, objectiveById, type ObjectiveView } from '../game/objectives.js';
import { PanelTouch } from './panel-touch.js';
import { PopIn } from './ui-fx.js';
import { OBJECTIVE_CLIPS } from './ghost-hand-system.js';
import { ghost, getGame, getUi, hidePanel, headYaw, menu, reveal, StaticAnchor, uiText } from './shared.js';
import { WorldSystem } from './world-system.js';

/** UIKit units are ~1 cm; the panel is scaled so the 520-wide card is ~26 cm. */
const PANEL_SCALE = 0.05;
const CARD_W = 520;
const CARD_H = 330;
/** Where the card hangs in VR: above the middle of view and within a seated arm's reach, so a fingertip can poke it. */
const DISTANCE = 0.5;
/** About 12 degrees below eye level at that distance: readable without tilting the head up. */
const DOWN = 0.11;

export class ObjectiveCardSystem extends createSystem({}) {
  private panel!: UIKitMLAsset;
  private entity!: Entity;
  private doc: ReturnType<typeof findUIKitDocument> = null;
  private anchor = new StaticAnchor(DISTANCE, 0, DOWN, 0.9, 1).movable('objective', CARD_W, CARD_H);
  private ready = false;
  private shown = false;
  private open = true;
  private hintOn = false;
  /** The long how-to is folded away behind a small "How?" until it is asked for. */
  private howOpen = false;
  private howFor = '';
  private lastHeight = 0;
  /** Seconds into the completion check-mark pop (null when not celebrating). */
  private celeT: number | null = null;
  private vr = false;
  private dirty = true;
  private timer = 0;
  private sig = '';
  private view: ObjectiveView | null = null;
  private touch!: PanelTouch;
  private pop!: PopIn;
  private wasShown = false;
  private popPending = false;

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
    wire('obj-how', () => this.toggleHow());
    // Fingertip targets (never smaller than 4.5 cm, even for the small header icons).
    this.touch = new PanelTouch(this.world, panel, PANEL_SCALE, 'objective');
    this.pop = new PopIn(panel, () => PANEL_SCALE);
    this.touch.add('obj-hint', () => this.view?.id !== 'quest' && !this.view?.celebrating && this.hint());
    this.touch.add('obj-close', () => this.setOpen(false));
    this.touch.add('obj-how', () => this.toggleHow());

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
      panel,
      taps: this.touch.taps,
      state: () => ({ open: this.open, shown: this.shown, vr: this.vr, view: this.view }),
    };
  }

  private onVisibility(v: VisibilityState): void {
    this.vr = v !== VisibilityState.NonImmersive;
    if (!this.shown) return;
    if (this.vr && this.entity.hasComponent(RayInteractable)) this.entity.removeComponent(RayInteractable);
    if (!this.vr && !this.entity.hasComponent(RayInteractable)) this.entity.addComponent(RayInteractable);
    this.anchor.reset();
    this.touch.reset();
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
    const show = this.open && this.view !== null && !this.hintOn && reveal.objective;
    // ScreenSpace reparents the UIKit document onto the camera, so the document is hidden too.
    const was = this.wasShown;
    this.wasShown = show;
    const hide = (): void => {
      if (this.doc) this.doc.visible = false;
      hidePanel(this.panel);
      if (this.entity.hasComponent(ScreenSpace)) this.entity.removeComponent(ScreenSpace);
    };
    if (!show) {
      // VR: ease out before hiding; the flat view's card is a screen overlay and just goes.
      if (this.vr && was && this.panel.visible) this.pop.close(hide);
      else hide();
      return;
    }
    if (this.doc) this.doc.visible = true;
    this.panel.visible = true;
    this.popPending = this.vr && !was;
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

  private toggleHow(): void {
    this.howOpen = !this.howOpen;
    ghost.how = this.howOpen ? (OBJECTIVE_CLIPS[this.view?.id ?? ''] ?? null) : null;
    this.sig = ''; // re-render now
    this.dirty = true;
  }

  private render(v: ObjectiveView): void {
    const text = (id: string, t: string) => this.panel.requireElementById<UIKit.Text>(id).setProperties({ text: uiText(t || ' ') });
    const show = (id: string, on: boolean) => this.panel.requireElementById(id).setProperties({ display: on ? 'flex' : 'none' });
    const cele = !!v.celebrating;
    text('obj-step', cele ? 'DONE' : v.id === 'quest' ? 'QUEST' : `GOAL ${v.step}`);
    // One instruction, verb first (NPE simplicity round). Everything else waits behind 'Why?'.
    text('obj-title', cele ? v.title : (v.short ?? v.title));
    show('obj-body', !cele);
    show('obj-cele', cele);
    this.panel.requireElementById('obj-hint').setProperties({ display: v.id === 'quest' || cele ? 'none' : 'flex' });
    if (cele) {
      // The action was done: the 'How?' demo ends now, so the next objective's own clip (often the same grab) does not keep playing.
      this.howOpen = false;
      this.howFor = '';
      ghost.how = null;
      text('obj-cele-text', v.celebrating!.message);
      this.lastHeight = 0;
      this.panel.requireElementById('obj-root').setProperties({ height: 190 } as never);
      this.celeT = 0;
      return;
    }
    if (v.id !== this.howFor) {
      this.howFor = v.id;
      this.howOpen = false; // a new objective starts folded
      ghost.how = null;
    }
    const open = this.howOpen;
    text('obj-instr', v.instruction);
    const where = open ? (v.where ?? '') : '';
    text('obj-where', where);
    show('obj-prow', !!v.progress);
    if (v.progress) {
      text('obj-ptext', `${v.progress.have} / ${v.progress.need}`);
      this.panel.requireElementById('obj-fill').setProperties({ width: Math.round((330 * v.progress.have) / v.progress.need) });
    }
    const subs = open ? v.substeps.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.text}`).join('   ') : '';
    text('obj-subs', subs);
    const parts = open ? (v.parts ?? '') : '';
    text('obj-parts', parts);
    // Folded, only a short live line shows: help that is due, or why the last try failed.
    const nextLine = v.feedback ? '' : (v.message ?? '');
    text('obj-next', nextLine);
    text('obj-bad', v.feedback ?? '');
    const how = open ? (v.next ?? v.tip ?? '') : '';
    text('obj-note', how);
    text('obj-how-label', open ? 'Hide' : 'Why?');
    // Rows that have nothing to say take no room (height, not display: a display toggle left rows zero-height).
    const h = {
      instr: open ? 60 : 0,
      where: where ? 28 : 0,
      subs: subs ? 44 : 0,
      how: 44,
      note: how ? 100 : 0,
      bad: v.feedback ? 40 : 0,
      parts: parts ? 26 : 0,
      next: nextLine ? (nextLine.length > 52 ? 52 : 28) : 0,
    };
    const set = (id: string, height: number) => this.panel.requireElementById(id).setProperties({ height } as never);
    set('obj-instr', h.instr);
    set('obj-where', h.where);
    set('obj-subs', h.subs);
    set('obj-howrow', h.how);
    set('obj-note', h.note);
    set('obj-bad', h.bad);
    set('obj-parts', h.parts);
    set('obj-next', h.next);
    const total = 16 + 56 + 6 + h.instr + h.where + (v.progress ? 30 : 0) + h.subs + h.how + h.note + h.bad + h.parts + h.next + 14 + 6 * 7;
    if (total !== this.lastHeight) {
      this.lastHeight = total;
      this.panel.requireElementById('obj-root').setProperties({ height: total } as never);
    }
  }

  private refresh(): void {
    const game = getGame(this.world);
    game.facingYaw = headYaw(this.camera);
    const v = cardView(game);
    this.view = v;
    const sig = JSON.stringify(v);
    if (sig === this.sig) return;
    this.sig = sig;
    if (v) this.render(v);
    this.place();
  }

  update(delta: number): void {
    if (this.pop?.busy) this.pop.update(delta);
    if (this.celeT !== null) this.checkPop(delta);
    if (!this.ready) return;
    if (!this.shown) {
      if (!this.world.getSystem(WorldSystem)?.started) return;
      this.shown = true;
      this.onVisibility(this.world.visibilityState.peek());
      this.refresh();
      this.place();
    }
    // The hint panel opens over the same area: hide the card while it is open, restore it on close.
    // (and in VR any open panel: the bag, build book, ... has the view to itself)
    const ui = getUi(this.world);
    const hint = (ui.hintOpen?.() ?? false) || (ui.notebookOpen?.() ?? false) || menu.current !== null;
    if (hint !== this.hintOn) {
      this.hintOn = hint;
      this.touch.reset();
      this.place();
    }
    if (this.dirty || (this.timer += delta) > 0.25) {
      this.timer = 0;
      this.dirty = false;
      this.refresh();
    }
    if (!this.open || !this.view || !this.vr || this.hintOn) return;
    this.anchor.update(this.panel, this.camera);
    if (this.popPending) {
      this.popPending = false;
      this.pop.open();
    }
    this.touch.update(delta);
  }

  /** The completion check mark pops (a short swell and settle); only runs while it plays. */
  private checkPop(dt: number): void {
    const t = (this.celeT = (this.celeT ?? 0) + dt);
    const k = Math.min(1, t / 0.55);
    const size = 36 + 26 * Math.sin(k * Math.PI) * (1 - k * 0.3) + 8 * k;
    this.panel.requireElementById('obj-check').setProperties({ width: Math.round(size), height: Math.round(size), backgroundColor: k < 1 ? '#7bd88f' : '#4fae68' } as never);
    if (k >= 1) this.celeT = null;
  }
}
