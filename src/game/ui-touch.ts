// Fingertip tapping for floating UI icons (hands-only spec, method A). Pure
// rules, no three.js: the caller gives the index fingertip in the panel's own
// frame (metres: x right, y up, z towards the viewer, panel surface at z = 0)
// and the icon regions; this decides which icon was deliberately poked.
//
// A tap needs: coming from in front of the surface, over the icon, moving
// forward fast enough, finger pointing roughly into the panel. Sliding along
// the surface, hovering, or passing by never activates. After a tap there is a
// cooldown and the fingertip must leave the icon before it can tap again.
// A pinch is never consulted here.

/** Tunable at runtime (e.g. from the console); all distances in metres. */
export const TOUCH_CONFIG = {
  /** Fingertip this far (m) in front of the surface and over an icon = "approaching". */
  approachDepth: 0.07,
  /** Must have been this far in front (m) before crossing, or it is not a tap. */
  armDepth: 0.02,
  /** Crossing z <= this (m) counts as touching the surface. */
  touchDepth: 0.004,
  /** Past this depth behind the surface (m) the fingertip is no longer in the icon. */
  throughDepth: -0.06,
  /** Minimum speed towards the surface (m/s) at the moment of crossing. */
  minSpeed: 0.1,
  /** Finger direction · into-panel must exceed this (1 = pointing straight in). */
  minAim: 0.35,
  /** Icon hit radius = icon radius * this (a little forgiving). */
  radiusScale: 1.05,
  /** Seconds after a tap before the same hand may tap again. */
  cooldown: 0.45,
  /** Must be this far (m) outside the icon region, or in front of it, to re-arm. */
  leaveMargin: 0.03,
  /** Seconds the "activated" visual lasts. */
  flash: 0.22,
  /** Thumb-index tip distance (m) below which the hand counts as pinching: no UI taps. A relaxed hand rests at 2-4 cm, so only touching tips (< 2 cm) count. */
  pinchOn: 0.02,
  /** ...and it stays "pinching" until the tips are this far apart (hysteresis). */
  pinchOff: 0.032,
  /**
   * Max sideways travel per unit of forward travel. Applies to the crossing
   * frame and to the whole approach from the last time the tip was in front,
   * so sideways slides across icons never fire. 1.4 ≈ 54° off normal: a real hand drifts while it pokes (Quest log: 37 'slide' refusals at 0.9).
   */
  maxSlideRatio: 1.4,
  /** The approach (tip last seen >= armDepth in front) must be this recent (s). */
  approachWindow: 0.8,
  /**
   * A fingertip that moves farther than this (m) in one frame is a tracking
   * jump, not a hand: that frame can never tap, and a fresh approach is
   * needed afterwards. Real fast pokes are a few cm per frame.
   */
  maxJump: 0.3,
  /** 1 = only a pointing hand (index out, other fingers curled) can tap; a resting or lowered hand never does. */
  requirePoint: 1,
  /** Travel along the surface (m) after touching down beyond which the touch is a swipe: it cancels the tap and scrolls instead. */
  swipeStart: 0.03,
  /** With commitOnRelease: the fingertip must come back this far (m) off the surface for the tap to commit. */
  releaseMargin: 0.012,
  /** Smallest tap target (m): every button and row is at least this big, whatever it looks like (4.5 cm). */
  minTarget: 0.045,
} satisfies Record<string, number>;

export const enum IconState {
  Normal = 0,
  Approaching = 1,
  Touched = 2,
  Activated = 3,
  Disabled = 4,
}

export interface TouchIcon {
  /** Centre in the panel frame (m). */
  x: number;
  y: number;
  /** Radius (m). */
  r: number;
  /** Half width / height (m) for a rectangular target (a list row, a wide button); omit for a round one. */
  hw?: number;
  hh?: number;
  enabled: boolean;
}

/**
 * A target never smaller than TOUCH_CONFIG.minTarget (4.5 cm) each way: small
 * on-screen buttons stay easy to hit. Mutates and returns `t`.
 */
export function fitTarget<T extends TouchIcon>(t: T, minSize: number = TOUCH_CONFIG.minTarget): T {
  const half = minSize / 2;
  if (t.hw !== undefined || t.hh !== undefined) {
    t.hw = Math.max(t.hw ?? 0, half);
    t.hh = Math.max(t.hh ?? 0, half);
  } else t.r = Math.max(t.r, half);
  return t;
}

/** Why a tap that was aimed at something did not count (for the play-test log). */
export type RejectReason = 'pinching' | 'notPointing' | 'tooSlow' | 'angle' | 'slide' | 'noApproach' | 'cooldown' | 'disabled' | 'miss' | 'jump' | 'swipe';

export interface TipSample {
  x: number;
  y: number;
  z: number;
  /** Finger pointing direction in the panel frame; dz < 0 points into the panel. */
  dz: number;
  /** False while tracking is lost: the tracker resets and activates nothing. */
  tracked: boolean;
  /** Thumb-tip to index-tip distance (m); omit when unknown (e.g. a mouse). */
  pinchDist?: number;
  /** Index pointing with the other fingers curled; omit when unknown (e.g. a mouse). */
  pointing?: boolean;
}

/** One tracker per hand. */
export class TouchTracker {
  /** Per-icon state for this hand, valid after update(). */
  states: number[] = [];
  private prevZ = 0;
  private hadPrev = false;
  private prevX = 0;
  private prevY = 0;
  /** Last sample seen well in front of the surface: where the current approach began. */
  private frontX = 0;
  private frontY = 0;
  private frontZ = 0;
  private frontAge = Infinity;
  private pinching = false;
  private cooldown = 0;
  /** Icon that was just activated; the tip must leave it before another tap. */
  private locked = -1;
  private flashT = 0;
  private flashIcon = -1;
  /** Seconds the finger has been over the same icon, in front (for the hover line). */
  hoverIcon = -1;
  /** Why the last aimed-at tap was refused this frame, or null; `rejectIcon` is the target it was aimed at. */
  reject: RejectReason | null = null;
  rejectIcon = -1;
  /** Override TOUCH_CONFIG.requirePoint for this tracker (panels that are already open drop it). */
  requirePoint: boolean | null = null;
  /**
   * Commit a tap when the finger leaves the surface (and only if it did not travel along it), instead
   * of the moment it crosses: a swipe that starts on a button then scrolls and never presses it.
   */
  commitOnRelease = false;
  private pending: { icon: number; x: number; y: number } | null = null;
  /** A touch-down that travelled past swipeStart: true while the finger is dragging; dragX/Y are its travel from the touch-down point (m, panel frame). */
  swiping = false;
  dragX = 0;
  dragY = 0;
  private swipeX = 0;
  private swipeY = 0;

  reset(): void {
    this.pending = null;
    this.swiping = false;
    this.hadPrev = false;
    this.frontAge = Infinity;
    this.locked = -1;
    this.hoverIcon = -1;
  }

  /** Index of the icon under the tip (lateral test only), or -1. */
  private hit(icons: readonly TouchIcon[], s: TipSample, grow = 1): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < icons.length; i++) {
      const ic = icons[i];
      const dx = s.x - ic.x;
      const dy = s.y - ic.y;
      if (ic.hw !== undefined && ic.hh !== undefined) {
        // Rectangular target: inside the box; the nearest centre wins where boxes overlap.
        if (Math.abs(dx) <= ic.hw * TOUCH_CONFIG.radiusScale * grow && Math.abs(dy) <= ic.hh * TOUCH_CONFIG.radiusScale * grow) {
          const d = Math.hypot(dx / ic.hw, dy / ic.hh);
          if (d < bestD) {
            best = i;
            bestD = d;
          }
        }
        continue;
      }
      const d = Math.hypot(dx, dy) / Math.max(ic.r, 1e-6);
      if (d <= TOUCH_CONFIG.radiusScale * grow && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * Advance one frame. Returns the index of an icon activated this frame, or -1.
   */
  update(dt: number, icons: readonly TouchIcon[], s: TipSample): number {
    const c = TOUCH_CONFIG;
    while (this.states.length < icons.length) this.states.push(IconState.Normal);
    this.states.length = icons.length;
    for (let i = 0; i < icons.length; i++) this.states[i] = icons[i].enabled ? IconState.Normal : IconState.Disabled;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.flashT > 0) this.flashT -= dt;
    this.reject = null;
    this.rejectIcon = -1;

    if (!s.tracked) {
      this.reset();
      this.showFlash(icons);
      return -1;
    }

    // A pinching hand never taps: pinch is for grabbing, not for UI.
    if (s.pinchDist !== undefined) {
      if (s.pinchDist < c.pinchOn) this.pinching = true;
      else if (s.pinchDist > c.pinchOff) this.pinching = false;
    } else this.pinching = false;
    // Only a deliberate point taps: a relaxed hand dropping past the bar never does.
    const needPoint = this.requirePoint ?? c.requirePoint !== 0;
    const notPointing = needPoint && s.pointing === false;
    if (this.pinching || notPointing) {
      this.pending = null;
      this.swiping = false;
      // Say why, but only while the finger is actually at something (not for every hand wave).
      const near = this.hit(icons, s);
      if (near >= 0 && s.z < c.approachDepth && s.z > c.throughDepth) {
        this.reject = this.pinching ? 'pinching' : 'notPointing';
        this.rejectIcon = near;
      }
      this.hadPrev = false;
      this.frontAge = Infinity;
      this.hoverIcon = -1;
      this.showFlash(icons);
      return -1;
    }

    if (this.hadPrev && Math.hypot(s.x - this.prevX, s.y - this.prevY, s.z - this.prevZ) > c.maxJump) {
      // Tracking jump: drop the history so nothing crosses the surface on this frame.
      this.reject = 'jump';
      this.hadPrev = false;
      this.frontAge = Infinity;
      this.hoverIcon = -1;
    }

    const over = this.hit(icons, s);
    const fwd = this.prevZ - s.z; // + = moved towards/into the surface this frame
    const speed = this.hadPrev && dt > 0 ? fwd / dt : 0;
    let activated = -1;

    // A touch-down waiting for its release: a swipe cancels it, withdrawing the finger commits it.
    const released = s.z > c.touchDepth + c.releaseMargin;
    if (this.pending) {
      const pd = this.pending;
      if (Math.hypot(s.x - pd.x, s.y - pd.y) > c.swipeStart) {
        this.pending = null;
        this.swiping = true;
        this.swipeX = pd.x;
        this.swipeY = pd.y;
        this.reject = 'swipe';
        this.rejectIcon = pd.icon;
      } else if (released) {
        this.pending = null;
        activated = pd.icon;
        this.cooldown = c.cooldown;
        this.flashT = c.flash;
        this.flashIcon = pd.icon;
      }
    }
    if (this.swiping) {
      this.dragX = s.x - this.swipeX;
      this.dragY = s.y - this.swipeY;
      if (released) this.swiping = false;
    }

    // Re-arm once the tip has left the locked icon (sideways, or backed away in front).
    if (this.locked >= 0 && (over !== this.locked || s.z > c.armDepth + c.leaveMargin)) this.locked = -1;

    // Remember where the tip last was clearly in front: the approach must come from there.
    this.frontAge += dt;
    if (s.z > c.armDepth && s.z < c.approachDepth + 0.1) {
      this.frontX = s.x;
      this.frontY = s.y;
      this.frontZ = s.z;
      this.frontAge = 0;
    }

    // Sweep the segment prev -> now against the surface plane, so a fast poke
    // that jumps from in front to behind in one frame still lands on the icon
    // it crossed (the frame-end position may be past the icon or the press depth).
    if (this.hadPrev && this.prevZ > c.touchDepth && s.z <= c.touchDepth && fwd > 0) {
      const t = (this.prevZ - c.touchDepth) / fwd;
      const cx = this.prevX + (s.x - this.prevX) * t;
      const cy = this.prevY + (s.y - this.prevY) * t;
      const hit = this.hit(icons, { ...s, x: cx, y: cy });
      const lateralFrame = Math.hypot(s.x - this.prevX, s.y - this.prevY);
      const lateralApproach = Math.hypot(cx - this.frontX, cy - this.frontY);
      const forwardApproach = this.frontZ - c.touchDepth;
      const fromFront = this.frontAge <= c.approachWindow && forwardApproach >= c.armDepth - c.touchDepth;
      const slideOk = lateralFrame <= fwd * c.maxSlideRatio && lateralApproach <= forwardApproach * c.maxSlideRatio;
      // Name the first rule that refused it (aimed at a target, or crossing right beside one).
      if (hit < 0) {
        const nearby = this.hit(icons, { ...s, x: cx, y: cy, tracked: true }, 1.8);
        if (nearby >= 0) {
          this.reject = 'miss';
          this.rejectIcon = nearby;
        }
      } else if (!icons[hit].enabled) this.reject = 'disabled';
      else if (!fromFront) this.reject = 'noApproach';
      else if (this.locked >= 0 || this.cooldown > 0) this.reject = 'cooldown';
      else if (speed < c.minSpeed) this.reject = 'tooSlow';
      else if (-s.dz < c.minAim) this.reject = 'angle';
      else if (!slideOk) this.reject = 'slide';
      if (this.reject && hit >= 0) this.rejectIcon = hit;
      if (
        fromFront &&
        hit >= 0 &&
        icons[hit].enabled &&
        this.locked < 0 &&
        this.cooldown <= 0 &&
        speed >= c.minSpeed &&
        -s.dz >= c.minAim &&
        slideOk
      ) {
        this.reject = null;
        this.locked = hit;
        this.frontAge = Infinity;
        if (this.commitOnRelease) this.pending = { icon: hit, x: s.x, y: s.y };
        else {
          activated = hit;
          this.cooldown = c.cooldown;
          this.flashT = c.flash;
          this.flashIcon = hit;
        }
      }
    }

    if (over >= 0 && icons[over].enabled) {
      if (s.z > c.touchDepth && s.z < c.approachDepth && over !== this.locked) this.states[over] = IconState.Approaching;
      // Pressed through the surface after a real tap: shown as touched until the finger comes out.
      else if (s.z <= c.touchDepth && over === this.locked) this.states[over] = IconState.Touched;
    }
    this.hoverIcon = over >= 0 && s.z < c.approachDepth && s.z > c.throughDepth ? over : -1;
    this.showFlash(icons);
    this.prevZ = s.z;
    this.prevX = s.x;
    this.prevY = s.y;
    this.hadPrev = true;
    return activated;
  }

  private showFlash(icons: readonly TouchIcon[]): void {
    if (this.flashT > 0 && this.flashIcon >= 0 && this.flashIcon < icons.length) this.states[this.flashIcon] = IconState.Activated;
  }
}

/** Evenly spaced icon centres for a row of `n` centred on x = 0, in metres. */
export function rowCentres(n: number, size: number, gap: number): number[] {
  const total = n * size + (n - 1) * gap;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(-total / 2 + size / 2 + i * (size + gap));
  return out;
}
