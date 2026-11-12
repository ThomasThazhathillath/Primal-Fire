// The icon bar. In the browser it is a row pinned to the bottom of the screen,
// clicked with the mouse. In VR it is folded to one Menu button off to your
// right; tapping Menu unfolds a grid of labelled icons (Bag, Quest, Hint, Guide,
// Notes, Build, Put away, Drop, Turn, Remove, Reload, Restart, Exit, and Bench
// when you stand at one). Opening a panel folds the grid; the panel's Back
// button (or Menu) brings it back. Operated ONLY by a fingertip poke
// (PanelTouch / src/game/ui-touch.ts): ray and pinch clicks are disabled in VR.

import {
  createSystem,
  type Entity,
  RayInteractable,
  ScreenSpace,
  type UIKit,
  type UIKitMLAsset,
  VisibilityState,
} from '@iwsdk/core';
import { fitsPouch } from '../game/items.js';
import { PanelTouch } from './panel-touch.js';
import { keepsGridOpen, pageLayout } from '../game/menu.js';
import { getGame, getUi, hidePanel, menu, StaticAnchor, SwipePager } from './shared.js';
import { clearSave, WorldSystem } from './world-system.js';

const SLOT = 68;
const GAP = 10;
const SLOT_H = 80;
/** VR: icons sit in a small grid this many wide, off to your right. */
const COLS = 7;
/** VR: one row; this many icons show at once between the Menu button and the page arrows. */
const PAGE = 4;
/** VR: an open menu folds itself away after this long without a tap (s). */
/** Tunable at runtime (window.__iconbar.config): seconds before an unfolded grid folds itself. */
export const MENU_CONFIG = { gridIdleSeconds: 20 };
const PAD = 8;
/** Panel local units → metres (UIKit units are ~1 cm; the panel is scaled by PANEL_SCALE). */
const PANEL_SCALE = 0.09;

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
  // VR: the bar folds into this one button on your right; tap it to open the icons, tap again to fold.
  { id: 'menu', show: (s) => s.vr, run: () => menu.toggleGrid() },
  // Only at a finished workbench: opens its recipe panel (no more poking the 3D bench).
  { id: 'bench', show: (s) => s.benchNear, run: (s) => getUi(s.world).openNearestBench?.() },
  // Only during the guided opening: the story card's steps, Do again / Skip (TutorialSystem).
  { id: 'prev', show: () => false, run: (s) => s.turnPage(-1) },
  { id: 'next', show: () => false, run: (s) => s.turnPage(1) },
  { id: 'story', show: (s) => !!getUi(s.world).toggleStory, run: (s) => getUi(s.world).toggleStory?.() },
];

/** Icons that act and fold the grid (the rest open a panel, which folds it itself). */

/** Where the bar hangs (m): within a seated arm's reach, below eye level, either hand. */
export const BAR_DISTANCE = 0.4;
// The bottom edge of the bar (the Menu button when folded) hangs this far below eye level: chest height for a
// seated player, off to the right. An unfolded grid grows UP from there, so every row stays in view and reach.
export const BAR_BOTTOM = 0.42;
export const BAR_DOWN = BAR_BOTTOM;
export const BAR_SIDE = 0;

export class IconBarSystem extends createSystem({}) {
  private bar!: UIKitMLAsset;
  private entity!: Entity;
  private anchor = new StaticAnchor(BAR_DISTANCE, BAR_SIDE, BAR_DOWN, 0.9, 1);
  private menuIdle = 0;
  private btns: Array<ReturnType<UIKitMLAsset['requireElementById']>> = [];
  /** Icons mid-shrink after a tap (restored after a moment). */
  private shrunk: Array<{ i: number; left: number }> = [];
  private touch!: PanelTouch;
  benchNear = false;
  private page = 0;
  /** Pinch-drag or finger swipe along the row pages it (the Back / More arrows stay as the fallback). */
  private swipe = new SwipePager((d) => this.turnPage(d), 520, 90, 0, 'x');
  turnPage(d: number): void {
    this.page = Math.max(0, this.page + d);
    this.lastVisible = '';
  }
  private ready = false;
  private shown = false;
  vr = false;
  canRemove = false;
  private removeTimer = 0;
  /** Indices into DEFS of the icons currently visible, in order. */
  private visible: number[] = [];
  private lastVisible = '';
  private slots: Array<ReturnType<UIKitMLAsset["requireElementById"]>> = [];
  private lastNotes = -1;
  private lastQuestOpen = false;

  async init(): Promise<void> {
    const bar = await this.world.assets.instantiate<UIKitMLAsset>('iconbar-panel');
    this.bar = bar;
    bar.name = 'IconBar';
    bar.scale.setScalar(PANEL_SCALE);
    this.entity = this.world.createTransformEntity(bar);
    hidePanel(bar);
    this.touch = new PanelTouch(this.world, bar, PANEL_SCALE, 'menu');
    // The icon grid sits off to the side, so it asks for a deliberate pointing hand (open panels do not).
    this.touch.setRequirePoint(true);
    DEFS.forEach((d, i) => {
      const btn = bar.requireElementById(`ic-${d.id}`);
      this.slots.push(bar.requireElementById(`slot-${i}`));
      this.btns.push(btn);
      btn.setProperties({ width: 48, height: 48, borderRadius: 24 } as never);
      // The whole slot (icon and its label) is the fingertip target.
      this.touch.add(`slot-${i}`, () => this.activate(i));
      const click = () => {
        // Mouse clicks (flat view). In VR the ray component is removed, and a tap never goes through here.
        if (!this.vr) d.run(this);
      };
      btn.addEventListener('click', click);
      this.cleanupFuncs.push(() => btn.removeEventListener('click', click));
    });
    this.cleanupFuncs.push(this.world.visibilityState.subscribe((v) => this.onVisibility(v)));
    this.ready = true;
    // Test hook: window.__menu.tap(id) taps a visible icon (e.g. 'satchel'), tapPanel(elementId) a target in the open
    // panel. Both run the same activation a real fingertip tap runs, after the tap has been accepted; the
    // fingertip rules themselves (speed, angle, pinch, ...) are not bypassed, they are simply not involved.
    (window as unknown as { __menu?: unknown }).__menu = {
      tap: (id: string) => {
        const di = DEFS.findIndex((d) => d.id === id);
        if (di < 0 || !this.visible.includes(di)) return false;
        this.activate(di);
        return true;
      },
      tapPanel: (elementId: string) => {
        const reg = (window as unknown as { __touch?: Record<string, { tap(id: string): boolean }> }).__touch ?? {};
        return Object.values(reg).some((t) => t.tap(elementId));
      },
    };
    // Debug/tuning hook: where each icon is, in the panel frame (metres).
    (window as unknown as { __iconbar?: unknown }).__iconbar = {
      visible: () => this.visible.map((i) => DEFS[i].id),
      panel: bar,
      taps: this.touch.taps,
      menu,
      config: MENU_CONFIG,
    };
  }

  private onVisibility(v: VisibilityState): void {
    this.vr = v !== VisibilityState.NonImmersive;
    if (!this.shown) return;
    // Ray/pinch click only in the flat view: in VR a poke is the one way to press an icon.
    if (this.vr && this.entity.hasComponent(RayInteractable)) this.entity.removeComponent(RayInteractable);
    if (!this.vr && !this.entity.hasComponent(RayInteractable)) this.entity.addComponent(RayInteractable);
    this.anchor.reset();
    this.touch.reset();
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
    game.cancelRefill(); // Put away stops the build's automatic refill
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
  /** A fingertip tap on slot `i`: run it, then fold the grid unless it opened a panel or is a repeatable turn. */
  private lastTapAt = -1e9;
  private lastGridOpen = false;
  private gridOpenedAt = -1e9;
  private armedId = '';
  private armedAt = -1e9;
  private activate(i: number): void {
    const def = DEFS[i];
    // Misclick guard: a tap right after another tap, or right after the grid unfolded, is a stray touch, not a choice.
    const now = performance.now();
    if (now - this.lastTapAt < 300) {
      getGame(this.world).log.add(`tap rejected: stray (another tap ${Math.round(now - this.lastTapAt)} ms ago) on menu/${def.id}`);
      return;
    }
    if (def.id !== 'menu' && now - this.gridOpenedAt < 350) {
      getGame(this.world).log.add(`tap rejected: grid just opened on menu/${def.id}`);
      return;
    }
    this.lastTapAt = now;
    // Leaving the game needs a deliberate second tap on the same icon.
    if (this.vr && (def.id === 'exit' || def.id === 'reload')) {
      if (this.armedId !== def.id || now - this.armedAt > RESTART_CONFIRM_MS) {
        this.armedId = def.id;
        this.armedAt = now;
        getGame(this.world).toast(`Tap ${def.id === 'exit' ? 'Exit' : 'Reload'} again to confirm.`, 'note');
        return;
      }
      this.armedId = '';
    }
    // A quick shrink on the tapped icon (PanelTouch adds the flash and the sound).
    this.btns[i].setProperties({ width: 38, height: 38 } as never);
    this.shrunk.push({ i, left: 0.12 });
    this.menuIdle = 0;
    def.run(this);
    if (!keepsGridOpen(def.id) && menu.current === null) menu.gridOpen = false;
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

  /** Re-lay out when the set of visible icons changes. */
  private layout(): void {
    const key = this.visible.join(',');
    if (key === this.lastVisible) return;
    this.lastVisible = key;
    const shown = new Set(this.visible);
    DEFS.forEach((_, i) => this.slots[i].setProperties({ display: shown.has(i) ? 'flex' : 'none' }));
    const n = this.visible.length;
    // VR: a compact grid; the flat view keeps one row along the bottom.
    const cols = this.vr ? Math.min(COLS, n) : n; // VR: a single row
    const rows = Math.ceil(n / cols);
    const w = PAD * 2 + cols * SLOT + (cols - 1) * GAP;
    const h = PAD * 2 + rows * SLOT_H + (rows - 1) * GAP;
    this.bar.requireElementById('bar').setProperties({ width: w, height: h, flexWrap: 'wrap', borderRadius: this.vr ? 20 : 32 } as never);
    this.touch.reset();
    // Keep the bottom edge where the folded button was: the grid grows upwards, not down out of view.
    this.anchor.setDown(BAR_BOTTOM - (h * PANEL_SCALE * 0.01) / 2);
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
      this.benchNear = !!game.nearbyWorkbench();
    }
    this.visible.length = 0;
    if (menu.gridOpen !== this.lastGridOpen) {
      this.lastGridOpen = menu.gridOpen;
      if (menu.gridOpen) this.gridOpenedAt = performance.now();
    }
    if (menu.gridOpen && (this.menuIdle += delta) > MENU_CONFIG.gridIdleSeconds) menu.gridOpen = false;
    // Folded (VR): only the Menu button shows, whenever the grid is not unfolded (and always while a panel is open).
    DEFS.forEach((d, i) => d.show(this) && (!this.vr || menu.gridVisible || d.id === 'menu') && this.visible.push(i));
    if (this.vr && menu.gridVisible) {
      // One short row (Menu first), scrolled a page at a time with Back / More.
      const mi = DEFS.findIndex((d) => d.id === 'menu');
      const pi = DEFS.findIndex((d) => d.id === 'prev');
      const ni = DEFS.findIndex((d) => d.id === 'next');
      const others = this.visible.filter((i) => i !== mi);
      const pg = pageLayout(others.length, this.page, PAGE);
      this.page = pg.page;
      const row = others.slice(pg.start, pg.end);
      this.visible.length = 0;
      this.visible.push(mi);
      if (pg.hasPrev) this.visible.push(pi);
      this.visible.push(...row);
      if (pg.hasNext) this.visible.push(ni);
    } else this.page = 0;
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

    for (let k = this.shrunk.length - 1; k >= 0; k--) {
      const f = this.shrunk[k];
      if ((f.left -= delta) > 0) continue;
      this.btns[f.i].setProperties({ width: 48, height: 48 } as never);
      this.shrunk.splice(k, 1);
    }
    if (this.vr) {
      this.anchor.update(this.bar, this.camera);
      this.touch.update(delta);
      if (this.vr && menu.gridVisible) this.swipe.update(this.bar);
    }
  }
}
