// The bottom icon bar: a compact row of round icons low in view. In the browser
// it is pinned to the bottom of the screen and clicked with the mouse. In VR it
// floats (still, StaticAnchor) below the centre of view, within seated reach,
// and is operated ONLY by a deliberate fingertip poke (src/game/ui-touch.ts);
// ray / pinch clicking is disabled on it so a pinch can never press an icon.

import {
  createSystem,
  type Entity,
  RayInteractable,
  ScreenSpace,
  type UIKit,
  type UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { fitsPouch } from '../game/items.js';
import { IconState, TouchTracker, type TipSample, type TouchIcon } from '../game/ui-touch.js';
import { hands } from './hand-input-system.js';
import { getGame, getUi, handClaims, hidePanel, StaticAnchor } from './shared.js';
import { clearSave, WorldSystem } from './world-system.js';

const SLOT = 52;
const GAP = 6;
const PAD = 8;
/** Panel local units → metres (UIKit units are ~1 cm; the panel is scaled by PANEL_SCALE). */
const PANEL_SCALE = 0.09;
const UNIT_M = 0.01 * PANEL_SCALE;

interface Def {
  id: string;
  /** Visible right now? */
  show: (s: IconBarSystem) => boolean;
  run: (s: IconBarSystem) => void;
}

/** Second tap on Restart must come within this long (ms). */
const RESTART_CONFIRM_MS = 4000;

const DEFS: Def[] = [
  { id: 'satchel', show: () => true, run: (s) => getUi(s.world).toggleSatchel?.() },
  { id: 'quest', show: () => true, run: (s) => getUi(s.world).toggleQuest?.() },
  { id: 'hint', show: () => true, run: (s) => getUi(s.world).showHint?.() },
  { id: 'guide', show: () => true, run: (s) => getUi(s.world).toggleGuide?.() },
  { id: 'notebook', show: () => true, run: (s) => getUi(s.world).openNotebook?.() },
  { id: 'stow', show: (s) => !!getGame(s.world).held, run: (s) => s.stow() },
  { id: 'drop', show: (s) => !!getGame(s.world).held, run: (s) => s.dropHeld() },
  { id: 'turn-left', show: (s) => s.vr, run: (s) => getUi(s.world).snapTurn?.(45) },
  { id: 'turn-right', show: (s) => s.vr, run: (s) => getUi(s.world).snapTurn?.(-45) },
  { id: 'remove', show: (s) => s.canRemove, run: (s) => s.removeBuild() },
  { id: 'reload', show: () => true, run: (s) => s.reload() },
  { id: 'exit', show: (s) => s.vr, run: (s) => s.exitVr() },
  { id: 'book', show: () => true, run: (s) => getUi(s.world).toggleBook?.() },
  { id: 'restart', show: () => true, run: (s) => s.restart() },
];

const COLORS = {
  [IconState.Normal]: '#3a352c',
  [IconState.Approaching]: '#6b5f49',
  [IconState.Touched]: '#ffb547',
  [IconState.Activated]: '#ffb547',
  [IconState.Disabled]: '#2a2722',
} as const;

/** Where the bar hangs (m): within a seated arm's reach, below eye level, either hand. */
export const BAR_DISTANCE = 0.4;
export const BAR_DOWN = 0.5;

export class IconBarSystem extends createSystem({}) {
  private bar!: UIKitMLAsset;
  private entity!: Entity;
  private anchor = new StaticAnchor(BAR_DISTANCE, 0, BAR_DOWN, 0.9, 1);
  private ready = false;
  private shown = false;
  vr = false;
  canRemove = false;
  private removeTimer = 0;
  /** Indices into DEFS of the icons currently visible, in order. */
  private visible: number[] = [];
  private lastVisible = '';
  private buttons: Array<ReturnType<UIKitMLAsset["requireElementById"]>> = [];
  private slots: Array<ReturnType<UIKitMLAsset["requireElementById"]>> = [];
  private lastState: number[] = [];
  private icons: TouchIcon[] = [];
  private trackers = [new TouchTracker(), new TouchTracker()];
  private merged: number[] = [];
  private tipLocal = new Vector3();
  /** Ids of icons activated by a fingertip tap, newest last (debug/tests). */
  private taps: string[] = [];
  private lastNotes = -1;
  private lastQuestOpen = false;
  private ctx: AudioContext | null = null;

  async init(): Promise<void> {
    const bar = await this.world.assets.instantiate<UIKitMLAsset>('iconbar-panel');
    this.bar = bar;
    bar.name = 'IconBar';
    bar.scale.setScalar(PANEL_SCALE);
    this.entity = this.world.createTransformEntity(bar);
    hidePanel(bar);
    DEFS.forEach((d, i) => {
      const btn = bar.requireElementById(`ic-${d.id}`);
      this.buttons.push(btn);
      this.slots.push(bar.requireElementById(`slot-${i}`));
      btn.setProperties({ width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS[IconState.Normal] } as never);
      const click = () => {
        // Mouse clicks (flat view). In VR the ray component is removed, and a tap never goes through here.
        if (!this.vr) d.run(this);
      };
      btn.addEventListener('click', click);
      this.cleanupFuncs.push(() => btn.removeEventListener('click', click));
    });
    this.cleanupFuncs.push(this.world.visibilityState.subscribe((v) => this.onVisibility(v)));
    this.ready = true;
    // Debug/tuning hook: where each icon is, in the panel frame (metres).
    (window as unknown as { __iconbar?: unknown }).__iconbar = {
      icons: this.icons,
      visible: () => this.visible.map((i) => DEFS[i].id),
      panel: bar,
      trackers: this.trackers,
      taps: this.taps,
    };
  }

  private onVisibility(v: VisibilityState): void {
    this.vr = v !== VisibilityState.NonImmersive;
    if (!this.shown) return;
    // Ray/pinch click only in the flat view: in VR a poke is the one way to press an icon.
    if (this.vr && this.entity.hasComponent(RayInteractable)) this.entity.removeComponent(RayInteractable);
    if (!this.vr && !this.entity.hasComponent(RayInteractable)) this.entity.addComponent(RayInteractable);
    this.anchor.reset();
    this.trackers[0].reset();
    this.trackers[1].reset();
    this.lastVisible = '';
  }

  private reveal(): void {
    this.shown = true;
    this.bar.visible = true;
    this.entity.addComponent(ScreenSpace, { width: '720px', height: '76px', bottom: '8px', left: 'calc(50% - 360px)', top: 'auto', right: 'auto', zOffset: 0.25 });
    this.onVisibility(this.world.visibilityState.peek());
  }

  // ---- actions (same behaviour the old HUD buttons had)
  stow(): void {
    const game = getGame(this.world);
    const held = game.held;
    if (!held) return game.toast('Your hands are empty.', 'note');
    if (fitsPouch(held)) game.stow();
    else getUi(this.world).dropHeld?.(held);
  }
  dropHeld(): void {
    const game = getGame(this.world);
    if (game.held) getUi(this.world).dropHeld?.(game.held);
    else game.toast('Take something out of the bag first, then drop it.', 'note');
  }
  removeBuild(): void {
    const game = getGame(this.world);
    const s = game.nearestUnfinished(6);
    if (s) game.removeStructure(s.id);
    else game.toast('No unfinished build near you to remove.', 'note');
  }
  reload(): void {
    getUi(this.world).saveNow?.();
    location.reload();
  }
  private restartArmedAt = -1e9;
  /** Start a brand-new game. Needs a second tap within a few seconds, so a stray touch never wipes the save. */
  restart(): void {
    const now = performance.now();
    if (now - this.restartArmedAt > RESTART_CONFIRM_MS) {
      this.restartArmedAt = now;
      getGame(this.world).toast('Start over from the beginning? Tap restart again to confirm.', 'note');
      return;
    }
    clearSave();
    location.reload();
  }
  exitVr(): void {
    getUi(this.world).saveNow?.();
    void this.renderer.xr.getSession()?.end();
  }

  /** A soft procedural tick. */
  private click(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      const ctx = this.ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      if (ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1500, t);
      o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.08);
    } catch {
      // No audio.
    }
  }

  /** Re-lay out when the set of visible icons changes. */
  private layout(): void {
    const key = this.visible.join(',');
    if (key === this.lastVisible) return;
    this.lastVisible = key;
    const shown = new Set(this.visible);
    DEFS.forEach((_, i) => this.slots[i].setProperties({ display: shown.has(i) ? 'flex' : 'none' }));
    const n = this.visible.length;
    const w = PAD * 2 + n * SLOT + (n - 1) * GAP;
    this.bar.requireElementById('bar').setProperties({ width: w });
    this.icons.length = n;
    for (let v = 0; v < n; v++) {
      const px = -w / 2 + PAD + SLOT / 2 + v * (SLOT + GAP);
      const ic = this.icons[v] ?? (this.icons[v] = { x: 0, y: 0, r: 0, enabled: true });
      ic.x = px * UNIT_M;
      ic.y = 0;
      ic.r = (SLOT / 2) * UNIT_M * 0.9;
      ic.enabled = true;
    }
    this.lastState.length = 0;
    if (!this.vr) {
      this.entity.removeComponent(ScreenSpace);
      this.entity.addComponent(ScreenSpace, { width: `${w * 1.15}px`, height: '76px', bottom: '8px', left: `calc(50% - ${(w * 1.15) / 2}px)`, top: 'auto', right: 'auto', zOffset: 0.25 });
    }
  }

  update(delta: number): void {
    if (!this.ready) return;
    if (!this.shown) {
      if (this.world.getSystem(WorldSystem)?.started) this.reveal();
      return;
    }
    const game = getGame(this.world);
    if ((this.removeTimer -= delta) <= 0) {
      this.removeTimer = 0.25;
      this.canRemove = !!game.nearestUnfinished(6);
    }
    this.visible.length = 0;
    DEFS.forEach((d, i) => d.show(this) && this.visible.push(i));
    this.layout();

    // Badges and active dots.
    const notes = getUi(this.world).newNotes?.() ?? 0;
    if (notes !== this.lastNotes) {
      this.lastNotes = notes;
      this.bar.requireElementById<UIKit.Text>('badge-4').setProperties({ display: notes > 0 ? 'flex' : 'none', text: String(notes) });
    }
    const qo = getUi(this.world).questOpen?.() ?? false;
    if (qo !== this.lastQuestOpen) {
      this.lastQuestOpen = qo;
      this.bar.requireElementById('dot-1').setProperties({ display: qo ? 'flex' : 'none' });
    }

    if (this.vr) {
      this.anchor.update(this.bar, this.camera);
      this.bar.updateMatrixWorld(true);
      this.tapUpdate(delta);
    }
  }

  private tapUpdate(dt: number): void {
    const n = this.icons.length;
    this.merged.length = n;
    this.merged.fill(IconState.Normal);
    for (let h = 0; h < 2; h++) {
      const hand = hands[h];
      const tr = this.trackers[h];
      const s = this.sample(hand.tipPos, hand.tipDir, hand.tipTracked, hand.pinchDist);
      const hit = tr.update(dt, this.icons, s);
      for (let i = 0; i < n; i++) if (tr.states[i] > this.merged[i]) this.merged[i] = tr.states[i];
      handClaims.uiNear[h] = tr.hoverIcon >= 0;
      if (hit >= 0) {
        handClaims.uiTapAt[h] = performance.now() / 1000;
        this.click();
        if (this.taps.length > 50) this.taps.shift();
        this.taps.push(DEFS[this.visible[hit]].id);
        DEFS[this.visible[hit]].run(this);
      }
    }
    // Paint only what changed.
    for (let v = 0; v < n; v++) {
      if (this.lastState[v] === this.merged[v]) continue;
      this.lastState[v] = this.merged[v];
      const st = this.merged[v] as IconState;
      const btn = this.buttons[this.visible[v]];
      const big = st === IconState.Activated ? 42 : st === IconState.Approaching ? 56 : 48;
      btn.setProperties({ backgroundColor: COLORS[st], width: big, height: big, opacity: st === IconState.Disabled ? 0.4 : 1 } as never);
    }
  }

  private sampleOut: TipSample = { x: 0, y: 0, z: 0, dz: 0, tracked: false };
  private dirTmp = new Vector3();

  /** World fingertip → panel frame in metres (x right, y up, z towards the viewer). */
  private sample(pos: Vector3, dir: Vector3, tracked: boolean, pinchDist: number): TipSample {
    const o = this.sampleOut;
    o.tracked = tracked;
    o.pinchDist = pinchDist;
    if (!tracked) return o;
    this.tipLocal.copy(pos);
    this.bar.worldToLocal(this.tipLocal);
    o.x = this.tipLocal.x * PANEL_SCALE;
    o.y = this.tipLocal.y * PANEL_SCALE;
    o.z = this.tipLocal.z * PANEL_SCALE;
    // Direction in panel space: rotate by the inverse of the panel's world rotation (scale is uniform).
    const e = this.bar.matrixWorld.elements;
    const sc = PANEL_SCALE;
    this.dirTmp.copy(dir);
    o.dz = (this.dirTmp.x * e[8] + this.dirTmp.y * e[9] + this.dirTmp.z * e[10]) / sc;
    return o;
  }
}
