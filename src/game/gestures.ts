// Contextual hand gestures (hands-only spec, phase 5), as plain maths so they
// are testable: back-and-forth strokes (bow drill, fanning) and tilting a
// container to pour. Systems feed filtered hand data (handmotion.ts) once a
// frame; nothing allocates.

import type { V3 } from './carry.js';

export const STROKE = {
  /** Slower than this (m/s) is not a stroke. */
  minSpeed: 0.25,
  /** Rhythm gained per direction reversal. */
  perReversal: 0.35,
  /** Rhythm lost per second while moving without reversing. */
  decay: 0.6,
  /** ...and per second while (nearly) still: a pause breaks the rhythm. */
  pauseDecay: 2.5,
};

/**
 * Reciprocating motion: counts how steadily a hand goes back and forth.
 * `rhythm` climbs with every reversal of direction and fades when the hand
 * stops or only drifts one way, so a continuous sawing or waving scores 1
 * and a single sweep scores little.
 */
export class Reciprocation {
  rhythm = 0;
  private dx = 0;
  private dy = 0;
  private dz = 0;
  private has = false;

  reset(): void {
    this.rhythm = 0;
    this.has = false;
  }

  /** `vx,vy,vz` the hand's filtered velocity; pass vy = 0 to ignore height (sawing). */
  update(dt: number, vx: number, vy: number, vz: number, cfg = STROKE): number {
    const s = Math.hypot(vx, vy, vz);
    if (s < cfg.minSpeed) {
      this.rhythm = Math.max(0, this.rhythm - cfg.pauseDecay * dt);
      return this.rhythm;
    }
    const ux = vx / s;
    const uy = vy / s;
    const uz = vz / s;
    if (this.has && ux * this.dx + uy * this.dy + uz * this.dz < -0.3) {
      this.rhythm = Math.min(1, this.rhythm + cfg.perReversal);
    } else this.rhythm = Math.max(0, this.rhythm - cfg.decay * dt);
    this.dx = ux;
    this.dy = uy;
    this.dz = uz;
    this.has = true;
    return this.rhythm;
  }
}

export const DRILL = {
  /** Speed (m/s) of the bow hand that is counted: a wild flail is no faster at making heat. */
  maxSpeed: 2.5,
  /** The steadying hand must be this close (m) to the spindle... */
  steadyRadius: 0.4,
  /** ...and move no faster than this (m/s). */
  steadySpeed: 0.5,
  /** Heat made with no steadying hand: the spindle wanders and slips. */
  unsteady: 0.3,
};

/**
 * Bow drill: one hand drives the bow back and forth, the other steadies the
 * spindle. Returns the multiplier (0..1) applied to the hand travel when it
 * is turned into heat: rhythm (a continuous stroke) times pressure (a steady,
 * close second hand).
 */
export class BowDrillMotion {
  readonly strokes = new Reciprocation();

  reset(): void {
    this.strokes.reset();
  }

  /**
   * @param vx,vz the bow hand's horizontal velocity (m/s)
   * @param steadyDist distance (m) from the other hand to the spindle (Infinity if untracked)
   * @param steadySpeed that hand's speed (m/s)
   */
  update(dt: number, vx: number, vz: number, steadyDist: number, steadySpeed: number, cfg = DRILL): number {
    const rhythm = this.strokes.update(dt, vx, 0, vz);
    const steady = steadyDist <= cfg.steadyRadius && steadySpeed <= cfg.steadySpeed ? 1 : cfg.unsteady;
    return steady * (0.25 + 0.75 * rhythm);
  }
}

export const FAN = {
  /** Slower hand speed (m/s) than this moves no air. */
  minSpeed: 0.5,
  /** Speed range (m/s) above minSpeed over which strength rises to its maximum. */
  speedRange: 1.6,
  /** Share of the strength an un-rhythmic hand (a single sweep) still gets; the rest needs back-and-forth waving. */
  rhythmFloor: 0.4,
};

/** Fanning: a hand waved over embers. Returns strength 0..1 per second. */
export function fanStrength(speed: number, rhythm: number, cfg = FAN): number {
  if (speed < cfg.minSpeed) return 0;
  const sp = Math.min(1, (speed - cfg.minSpeed) / cfg.speedRange);
  return sp * (cfg.rhythmFloor + (1 - cfg.rhythmFloor) * rhythm);
}

export const POUR = {
  /** Tilt (degrees from upright) where liquid starts to run, and where it runs freely. */
  start: 40,
  full: 100,
  /** Fraction of the container poured per second at full tilt. */
  fullRate: 0.5,
};

/** Fraction of the container that pours out each second at this tilt (0 until the rim dips). */
export function pourRate(tiltDeg: number, cfg = POUR): number {
  if (!(tiltDeg > cfg.start)) return 0;
  const t = Math.min(1, (tiltDeg - cfg.start) / (cfg.full - cfg.start));
  return cfg.fullRate * t * t * (3 - 2 * t);
}

/** Tilt in degrees of an object whose up vector has world-y component `upY`. */
export function tiltDegrees(upY: number): number {
  return (Math.acos(Math.max(-1, Math.min(1, upY))) * 180) / Math.PI;
}

/** A container being poured: the angle sets the flow, and the flow the amount. */
export class PourState {
  /** 1 = full, 0 = empty. */
  level = 1;

  refill(): void {
    this.level = 1;
  }

  /** Advance one frame; returns the fraction poured this frame (0 when upright or empty). */
  step(dt: number, tiltDeg: number): number {
    if (this.level <= 0) return 0;
    const out = Math.min(this.level, pourRate(tiltDeg) * dt);
    this.level -= out;
    if (this.level < 1e-6) this.level = 0;
    return out;
  }

  get empty(): boolean {
    return this.level <= 0;
  }
}

// ------------------------------------------------------- what the hands show

export const RIG = {
  /** Spindle spin (rad/s) per m/s of bow travel, and its cap. A real spindle turns many times per stroke. */
  spinGain: 70,
  spinMax: 45,
  /** The bow slides along its own length no farther than this (m) from the spindle, so the string always loops it. */
  slideMax: 0.2,
  /** The bow hand must be within this horizontal distance (m) of the spindle to drive it. */
  reach: 0.6,
  /** Spin (rad/s) below which nothing smokes. */
  smokeSpin: 6,
};

/** Spindle spin for a bow moving at signed speed `vAxis` (m/s) along its length: it reverses with the stroke. */
export function drillSpin(vAxis: number, cfg = RIG): number {
  return Math.max(-cfg.spinMax, Math.min(cfg.spinMax, vAxis * cfg.spinGain));
}

/** Where the bow sits along its axis: it follows the drawing hand but cannot leave the spindle's string. */
export function bowSlide(handOffset: number, cfg = RIG): number {
  return Math.max(-cfg.slideMax, Math.min(cfg.slideMax, handOffset));
}

/** Puffs of smoke per second from the drilled board: none while the spindle crawls, more as it heats. */
export function drillSmokeRate(spin: number, heat: number, cfg = RIG): number {
  const s = Math.abs(spin);
  if (s < cfg.smokeSpin) return 0;
  return (0.6 + heat * 3.4) * Math.min(1, s / 25);
}

/**
 * The line the bow slides along. It starts across the player's view (so the stroke is sideways to you) and
 * turns to the direction the hand really saws in, without flipping when the hand reverses (sign-free).
 */
export class SawAxis {
  x = 1;
  z = 0;

  set(x: number, z: number): void {
    const l = Math.hypot(x, z) || 1;
    this.x = x / l;
    this.z = z / l;
  }

  /** Follow a hand velocity (m/s) once it is a real stroke. */
  update(dt: number, vx: number, vz: number, minSpeed = 0.3): void {
    const s = Math.hypot(vx, vz);
    if (s < minSpeed) return;
    let ux = vx / s;
    let uz = vz / s;
    if (ux * this.x + uz * this.z < 0) {
      ux = -ux;
      uz = -uz;
    }
    const k = Math.min(1, dt * 3);
    this.set(this.x + (ux - this.x) * k, this.z + (uz - this.z) * k);
  }

  /** Signed component of a velocity along the axis. */
  along(vx: number, vz: number): number {
    return vx * this.x + vz * this.z;
  }
}

export const FAN_FX = {
  /** Smoke and sparks drift at most this fast (m/s) sideways with the hand. */
  maxDrift: 0.9,
  /** Drift per m/s of hand sweep. */
  gain: 0.5,
  /** How quickly the drift follows the hand (1/s). */
  follow: 6,
};

/** Smoke and sparks lean with the hand's sweep: a smoothed horizontal drift (writes `out`). */
export function fanLean(out: { x: number; z: number }, dt: number, vx: number, vz: number, active: boolean, cfg = FAN_FX): void {
  let tx = 0;
  let tz = 0;
  if (active) {
    tx = vx * cfg.gain;
    tz = vz * cfg.gain;
    const m = Math.hypot(tx, tz);
    if (m > cfg.maxDrift) {
      tx = (tx / m) * cfg.maxDrift;
      tz = (tz / m) * cfg.maxDrift;
    }
  }
  const k = Math.min(1, dt * cfg.follow);
  out.x += (tx - out.x) * k;
  out.z += (tz - out.z) * k;
}
