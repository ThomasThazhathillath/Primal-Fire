// Fingertip taps for any UIKit panel (hands-only spec, method A). Instead of
// each panel hard-coding where its buttons are, this reads every registered
// element's real layout (size and position inside the panel) each frame, makes
// each one a tap target of at least 4.5 cm, and runs the same TouchTracker the
// icon grid uses. A tap calls the same handler the mouse click would. Pinch and
// ray clicks stay off in VR (the panel's RayInteractable is removed), and
// every refused tap is written to the play-test log with its reason.

import { type Entity, RayInteractable, type UIKitMLAsset, Vector3, type World } from '@iwsdk/core';
import { RejectLog, rejectLine } from '../game/menu.js';
import { fitTarget, IconState, TOUCH_CONFIG, TouchTracker, type TipSample, type TouchIcon } from '../game/ui-touch.js';
import { hands } from './hand-input-system.js';
import { tapSound } from './ui-fx.js';
import { type GazeUiAdd, type GazeUiOwner, gazeUi, getGame, handClaims } from './shared.js';

/** UIKit layout units are 1/100 of a panel-scale unit: px * 0.01 * scale = metres. */
const UNIT = 0.01;
/** Space around the panel's buttons where a pinch is never a grab or a teleport (m). */
const ZONE_MARGIN = 0.1;
const ZONE_FRONT = 0.2;
const ZONE_BEHIND = 0.3;
/** How long the tapped target stays flashed (s). */
const FLASH_SECONDS = 0.14;

interface Target {
  id: string;
  el: ReturnType<UIKitMLAsset['requireElementById']>;
  tap: () => void;
}

const rejectLog = new RejectLog(1500);
/** The default tap-area scale (ui-touch.ts); adaptive assistance multiplies it. */
const BASE_TAP_SCALE = TOUCH_CONFIG.radiusScale;

/** Is the element and everything above it displayed (display: none hides a whole row)? */
function shown(el: Target['el']): boolean {
  let n: unknown = el;
  for (let i = 0; i < 12 && n; i++) {
    const d = (n as { displayed?: { peek(): boolean } }).displayed;
    if (d && !d.peek()) return false;
    n = (n as { parentContainer?: { peek?: () => unknown } & object }).parentContainer;
    if (n && typeof (n as { peek?: () => unknown }).peek === 'function') n = (n as { peek: () => unknown }).peek();
  }
  return true;
}

export class PanelTouch implements GazeUiOwner {
  private targets: Target[] = [];
  private active: Target[] = [];
  private icons: TouchIcon[] = [];
  private trackers = [new TouchTracker(), new TouchTracker()];
  private tip = new Vector3();
  private dir = new Vector3();
  private sampleOut: TipSample = { x: 0, y: 0, z: 0, dz: 0, tracked: false };
  private lastState: number[] = [];
  /** Ids tapped by a fingertip, newest last (debug and tests). */
  readonly taps: string[] = [];

  constructor(
    private world: World,
    private panel: UIKitMLAsset,
    private scale: number,
    private name: string,
  ) {
    // An open panel does not ask for a pointing pose: the depth and approach rules are enough.
    for (const t of this.trackers) t.requirePoint = false;
    // Debug / tuning: window.__touch[name].targets() lists where every target is in the world.
    const g = window as unknown as { __touch?: Record<string, unknown> };
    gazeUi.push(this);
    (g.__touch ??= {})[name] = { targets: () => this.debugTargets(), taps: this.taps, tap: (id: string) => this.tapById(id) };
  }

  /**
   * Test hook: run target `id`'s tap handler exactly as a real tap would (same handler, same tap log),
   * but only if the panel is open and the target is on show. It does NOT bypass the fingertip rules:
   * those are what a real tap is judged by; this only stands in for a finished, accepted tap.
   */
  tapById(id: string): boolean {
    if (!this.panel.visible) return false;
    const t = this.targets.find((x) => x.id === id);
    if (!t || !shown(t.el)) return false;
    if (this.taps.length > 50) this.taps.shift();
    this.taps.push(t.id);
    t.tap();
    return true;
  }

  /** World centre and facing of each live target, for tests (metres, world frame). */
  private debugTargets(): Array<{ id: string; c: number[]; n: number[]; w: number; h: number }> {
    this.panel.updateMatrixWorld(true);
    this.layout();
    const q = this.panel.matrixWorld.elements;
    const n = [q[8], q[9], q[10]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    return this.active.map((t, i) => {
      const ic = this.icons[i];
      const v = new Vector3(ic.x / this.scale, ic.y / this.scale, 0);
      this.panel.localToWorld(v);
      return { id: t.id, c: [v.x, v.y, v.z], n: n.map((x) => x / len), w: (ic.hw ?? ic.r) * 2, h: (ic.hh ?? ic.r) * 2 };
    });
  }

  private gazeIds: string[] = [];
  private gazeV = new Vector3();

  /** Gaze selection: offer every shown target of this panel (10 Hz, only while the panel is up). */
  collectGaze(add: GazeUiAdd): void {
    this.gazeIds.length = 0;
    if (!this.panel.visible) return;
    this.panel.updateMatrixWorld(true);
    this.layout();
    for (let i = 0; i < this.active.length; i++) {
      const ic = this.icons[i];
      this.gazeV.set(ic.x / this.scale, ic.y / this.scale, 0);
      this.panel.localToWorld(this.gazeV);
      this.gazeIds.push(this.active[i].id);
      add(`ui:${this.name}:`, this.active[i].id, this.gazeV.x, this.gazeV.y, this.gazeV.z, Math.max(ic.hw ?? ic.r, ic.hh ?? ic.r), this, i);
    }
  }

  private gazeTarget(i: number): Target | undefined {
    const id = this.gazeIds[i];
    return id === undefined ? undefined : this.targets.find((t) => t.id === id);
  }

  /** The same activation a fingertip tap runs (sound, assist, flash, handler). */
  gazeActivate(i: number): void {
    const t = this.gazeTarget(i);
    if (!t || !this.panel.visible || !shown(t.el)) return;
    if (this.taps.length > 50) this.taps.shift();
    this.taps.push(t.id);
    tapSound();
    this.flash(t);
    t.tap();
  }

  gazeHover(i: number, on: boolean): void {
    const t = this.gazeTarget(i);
    if (!t) return;
    t.el.setProperties((on ? { borderWidth: 3, borderColor: '#ffc283' } : { borderWidth: 0 }) as never);
    this.lastState.length = 0; // let the fingertip hover logic re-apply its own ring
  }

  /** Make element `id` a fingertip target that runs `tap` (the same handler its click runs). */
  add(id: string, tap: () => void): void {
    this.targets.push({ id, el: this.panel.requireElementById(id), tap });
  }

  /** The panel was rescaled (e.g. smaller in VR so a tall list fits the view). */
  setScale(scale: number): void {
    this.scale = scale;
  }

  /** Panels that stay up while your hands are busy (the bench while crafting) ask for a deliberate point. */
  setRequirePoint(on: boolean): void {
    for (const t of this.trackers) t.requirePoint = on;
  }

  reset(): void {
    for (const t of this.trackers) t.reset();
    this.lastState.length = 0;
  }

  /** In VR a panel is operated by fingertip only; in the flat view the mouse (RayInteractable) does it. */
  static setRay(world: World, entity: Entity, vr: boolean): void {
    void world;
    if (vr && entity.hasComponent(RayInteractable)) entity.removeComponent(RayInteractable);
    if (!vr && !entity.hasComponent(RayInteractable)) entity.addComponent(RayInteractable);
  }

  /** Targets as they are laid out now (panel frame, metres). */
  private layout(): void {
    this.active.length = 0;
    this.icons.length = 0;
    for (const t of this.targets) {
      if (!shown(t.el)) continue;
      const size = t.el.size?.peek?.();
      const gm = t.el.globalMatrix?.peek?.();
      if (!size || !gm || size[0] < 1 || size[1] < 1) continue; // folded away (zero size): not a target
      const e = gm.elements;
      this.active.push(t);
      this.icons.push(
        fitTarget({
          x: e[12] * this.scale,
          y: e[13] * this.scale,
          r: 0,
          hw: (size[0] / 2) * UNIT * this.scale,
          hh: (size[1] / 2) * UNIT * this.scale,
          enabled: true,
        }),
      );
    }
  }

  private flashing: Array<{ t: Target; left: number }> = [];

  /** A quick shrink and flash on the tapped target: scale it down, light its ring, then restore. */
  private flash(t: Target): void {
    t.el.setProperties({ opacity: 0.55, borderWidth: 4, borderColor: '#ffd6a8' } as never);
    this.flashing.push({ t, left: FLASH_SECONDS });
  }

  /** Call every frame while the panel is open in VR. */
  update(dt: number): void {
    if (this.flashing.length) {
      for (let i = this.flashing.length - 1; i >= 0; i--) {
        const f = this.flashing[i];
        if ((f.left -= dt) > 0) continue;
        f.t.el.setProperties({ opacity: 1, borderWidth: 0 } as never);
        this.flashing.splice(i, 1);
      }
    }
    this.panel.updateMatrixWorld(true);
    this.layout();
    const n = this.icons.length;
    const merged: number[] = [];
    for (let i = 0; i < n; i++) merged.push(IconState.Normal);
    for (let h = 0; h < 2; h++) {
      const hand = hands[h];
      const tr = this.trackers[h];
      const s = this.sample(hand.tipPos, hand.tipDir, hand.tipTracked, hand.pinchDist, hand.pointing);
      const hit = tr.update(dt, this.icons, s);
      for (let i = 0; i < n; i++) if (tr.states[i] > merged[i]) merged[i] = tr.states[i];
      // Around the panel a pinch is never a grab or a teleport.
      if (tr.hoverIcon >= 0 || (s.tracked && this.inZone(s))) {
        handClaims.uiNear[h] = true;
        handClaims.uiNearAt[h] = performance.now() / 1000;
      }
      if (tr.reject && tr.rejectIcon >= 0 && tr.rejectIcon < n) {
        const id = this.active[tr.rejectIcon].id;
        if (rejectLog.shouldLog(`${this.name}:${id}:${tr.reject}:${h}`, performance.now())) {
          getGame(this.world).log.add(rejectLine(this.name, id, tr.reject, h));
          // A tap that keeps being refused makes the targets a little bigger (adaptive.ts).
          getGame(this.world).assist.fail('tap');
          TOUCH_CONFIG.radiusScale = BASE_TAP_SCALE * getGame(this.world).assist.scale('tap');
        }
      }
      if (hit >= 0 && hit < n) {
        handClaims.uiTapAt[h] = performance.now() / 1000;
        const t = this.active[hit];
        if (this.taps.length > 50) this.taps.shift();
        this.taps.push(t.id);
        tapSound();
        getGame(this.world).assist.success('tap');
        TOUCH_CONFIG.radiusScale = BASE_TAP_SCALE * getGame(this.world).assist.scale('tap');
        this.flash(t);
        t.tap();
        return; // the handler may have closed the panel
      }
    }
    // Hover highlight: a ring on the target a fingertip is approaching or touching.
    for (let i = 0; i < n; i++) {
      if (this.lastState[i] === merged[i]) continue;
      this.lastState[i] = merged[i];
      const st = merged[i];
      const props =
        st === IconState.Approaching
          ? { borderWidth: 3, borderColor: '#ff8a3d' }
          : st === IconState.Touched || st === IconState.Activated
            ? { borderWidth: 4, borderColor: '#7dff8a' }
            : { borderWidth: 0 };
      this.active[i].el.setProperties(props as never);
    }
    this.lastState.length = n;
  }

  private inZone(s: TipSample): boolean {
    if (!this.icons.length || s.z > ZONE_FRONT || s.z < -ZONE_BEHIND) return false;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const ic of this.icons) {
      minX = Math.min(minX, ic.x - (ic.hw ?? ic.r));
      maxX = Math.max(maxX, ic.x + (ic.hw ?? ic.r));
      minY = Math.min(minY, ic.y - (ic.hh ?? ic.r));
      maxY = Math.max(maxY, ic.y + (ic.hh ?? ic.r));
    }
    return s.x > minX - ZONE_MARGIN && s.x < maxX + ZONE_MARGIN && s.y > minY - ZONE_MARGIN && s.y < maxY + ZONE_MARGIN;
  }

  /** World fingertip to the panel's frame in metres (x right, y up, z towards the viewer). */
  private sample(pos: Vector3, dir: Vector3, tracked: boolean, pinchDist: number, pointing: boolean): TipSample {
    const o = this.sampleOut;
    o.tracked = tracked;
    o.pinchDist = pinchDist;
    o.pointing = pointing;
    if (!tracked) return o;
    this.tip.copy(pos);
    this.panel.worldToLocal(this.tip);
    o.x = this.tip.x * this.scale;
    o.y = this.tip.y * this.scale;
    o.z = this.tip.z * this.scale;
    const e = this.panel.matrixWorld.elements;
    this.dir.copy(dir);
    o.dz = (this.dir.x * e[8] + this.dir.y * e[9] + this.dir.z * e[10]) / this.scale;
    return o;
  }
}
