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

export const TOUCH_CONFIG = {
  /** Fingertip this far (m) in front of the surface and over an icon = "approaching". */
  approachDepth: 0.07,
  /** Must have been this far in front (m) before crossing, or it is not a tap. */
  armDepth: 0.025,
  /** Crossing z <= this (m) counts as touching the surface. */
  touchDepth: 0.004,
  /** Past this depth behind the surface (m) the fingertip is no longer in the icon. */
  throughDepth: -0.06,
  /** Minimum speed towards the surface (m/s) at the moment of crossing. */
  minSpeed: 0.12,
  /** Finger direction · into-panel must exceed this (1 = pointing straight in). */
  minAim: 0.35,
  /** Icon hit radius = icon radius * this (a little forgiving). */
  radiusScale: 1.15,
  /** Seconds after a tap before the same hand may tap again. */
  cooldown: 0.45,
  /** Must be this far (m) outside the icon region, or in front of it, to re-arm. */
  leaveMargin: 0.03,
  /** Seconds the "activated" visual lasts. */
  flash: 0.22,
} as const;

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
  enabled: boolean;
}

export interface TipSample {
  x: number;
  y: number;
  z: number;
  /** Finger pointing direction in the panel frame; dz < 0 points into the panel. */
  dz: number;
  /** False while tracking is lost: the tracker resets and activates nothing. */
  tracked: boolean;
}

/** One tracker per hand. */
export class TouchTracker {
  /** Per-icon state for this hand, valid after update(). */
  states: number[] = [];
  private prevZ = 0;
  private hadPrev = false;
  private armed = false;
  private cooldown = 0;
  /** Icon that was just activated; the tip must leave it before another tap. */
  private locked = -1;
  private flashT = 0;
  private flashIcon = -1;
  /** Seconds the finger has been over the same icon, in front (for the hover line). */
  hoverIcon = -1;

  reset(): void {
    this.hadPrev = false;
    this.armed = false;
    this.locked = -1;
    this.hoverIcon = -1;
  }

  /** Index of the icon under the tip (lateral test only), or -1. */
  private hit(icons: readonly TouchIcon[], s: TipSample): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < icons.length; i++) {
      const ic = icons[i];
      const d = Math.hypot(s.x - ic.x, s.y - ic.y);
      if (d <= ic.r * TOUCH_CONFIG.radiusScale && d < bestD) {
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

    if (!s.tracked) {
      this.reset();
      this.showFlash(icons);
      return -1;
    }

    const over = this.hit(icons, s);
    const speed = this.hadPrev && dt > 0 ? (this.prevZ - s.z) / dt : 0; // + = moving towards/into the surface
    let activated = -1;

    // Re-arm once the tip has left the locked icon (sideways, or backed away in front).
    if (this.locked >= 0 && (over !== this.locked || s.z > c.armDepth + c.leaveMargin)) this.locked = -1;

    // "Armed" = seen in front of the surface over an icon region: only then can a crossing be a tap.
    if (over >= 0 && s.z > c.armDepth && s.z < c.approachDepth + 0.1) this.armed = true;
    if (over < 0 || s.z > c.approachDepth + 0.1 || s.z < c.throughDepth) this.armed = false;

    const crossing = this.hadPrev && this.prevZ > c.touchDepth && s.z <= c.touchDepth;
    if (crossing && this.armed && over >= 0 && icons[over].enabled && this.locked < 0 && this.cooldown <= 0) {
      const aim = -s.dz;
      if (speed >= c.minSpeed && aim >= c.minAim) {
        activated = over;
        this.locked = over;
        this.cooldown = c.cooldown;
        this.flashT = c.flash;
        this.flashIcon = over;
        this.armed = false;
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
