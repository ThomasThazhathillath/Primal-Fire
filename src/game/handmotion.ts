// How a hand is moving, filtered, and what that means when something is let
// go (hands-only spec, phase 3). HandInputSystem feeds one HandMotion per hand
// once a frame; CarrySystem asks throwImpulse() on release. Pure and
// allocation-free: fixed ring buffer, results written into caller-owned objects.

import type { V3 } from './carry.js';

export const MOTION_CONFIG = {
  /** Window (s) the velocity is fitted over: long enough to smooth jitter, short enough to feel the flick. */
  window: 0.12,
  /** A gap in samples longer than this (s) is tracking loss: history is dropped. */
  maxGap: 0.15,
  /** Faster than this (m/s) between two samples is a tracking jump, not a hand: history is dropped. */
  jumpSpeed: 14,
  /** Swing strength reaches 1 at this speed (m/s). */
  fullSwing: 3.5,
  /** Fastest hand velocity (m/s) the rest of the game ever sees. */
  maxSpeed: 10,
};

const N = 16;

export class HandMotion {
  private xs = new Float32Array(N);
  private ys = new Float32Array(N);
  private zs = new Float32Array(N);
  private ts = new Float32Array(N);
  private head = 0;
  private n = 0;
  /** Filtered velocity (m/s), clamped to MOTION_CONFIG.maxSpeed. */
  readonly vel: V3 = { x: 0, y: 0, z: 0 };
  /** Filtered acceleration (m/s²): newer half of the window against the older half. */
  readonly accel: V3 = { x: 0, y: 0, z: 0 };
  speed = 0;
  /** 0 (still) .. 1 (a full swing). */
  swing = 0;
  /** Samples currently usable (0 right after tracking loss). */
  get samples(): number {
    return this.n;
  }

  reset(): void {
    this.n = 0;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.accel.x = this.accel.y = this.accel.z = 0;
    this.speed = this.swing = 0;
  }

  /** One sample per frame, `t` in seconds. */
  push(x: number, y: number, z: number, t: number, cfg = MOTION_CONFIG): void {
    if (this.n > 0) {
      const last = (this.head + N - 1) % N;
      const dt = t - this.ts[last];
      if (dt <= 0) return;
      const jump = Math.hypot(x - this.xs[last], y - this.ys[last], z - this.zs[last]) / dt;
      if (dt > cfg.maxGap || jump > cfg.jumpSpeed) this.reset();
    }
    this.xs[this.head] = x;
    this.ys[this.head] = y;
    this.zs[this.head] = z;
    this.ts[this.head] = t;
    this.head = (this.head + 1) % N;
    this.n = Math.min(N, this.n + 1);
    this.compute(cfg);
  }

  /** Least-squares slope of each axis over samples with time in [t0, t1]; false if fewer than 2. */
  private slope(t0: number, t1: number, out: V3): boolean {
    let c = 0;
    let tm = 0;
    let xm = 0;
    let ym = 0;
    let zm = 0;
    for (let k = 0; k < this.n; k++) {
      const i = (this.head - 1 - k + N * 2) % N;
      const t = this.ts[i];
      if (t < t0) break;
      if (t > t1) continue;
      c++;
      tm += t;
      xm += this.xs[i];
      ym += this.ys[i];
      zm += this.zs[i];
    }
    if (c < 2) return false;
    tm /= c;
    xm /= c;
    ym /= c;
    zm /= c;
    let st = 0;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let k = 0; k < this.n; k++) {
      const i = (this.head - 1 - k + N * 2) % N;
      const t = this.ts[i];
      if (t < t0) break;
      if (t > t1) continue;
      const d = t - tm;
      st += d * d;
      sx += d * (this.xs[i] - xm);
      sy += d * (this.ys[i] - ym);
      sz += d * (this.zs[i] - zm);
    }
    if (st < 1e-9) return false;
    out.x = sx / st;
    out.y = sy / st;
    out.z = sz / st;
    return true;
  }

  private newer: V3 = { x: 0, y: 0, z: 0 };
  private older: V3 = { x: 0, y: 0, z: 0 };

  private compute(cfg: typeof MOTION_CONFIG): void {
    const now = this.ts[(this.head + N - 1) % N];
    if (!this.slope(now - cfg.window, now, this.vel)) {
      this.vel.x = this.vel.y = this.vel.z = 0;
      this.accel.x = this.accel.y = this.accel.z = 0;
      this.speed = this.swing = 0;
      return;
    }
    let s = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    if (s > cfg.maxSpeed) {
      const k = cfg.maxSpeed / s;
      this.vel.x *= k;
      this.vel.y *= k;
      this.vel.z *= k;
      s = cfg.maxSpeed;
    }
    this.speed = s;
    this.swing = Math.min(1, s / cfg.fullSwing);
    const half = cfg.window / 2;
    if (this.slope(now - half, now, this.newer) && this.slope(now - cfg.window, now - half, this.older)) {
      const k = 1 / half;
      this.accel.x = (this.newer.x - this.older.x) * k;
      this.accel.y = (this.newer.y - this.older.y) * k;
      this.accel.z = (this.newer.z - this.older.z) * k;
    } else this.accel.x = this.accel.y = this.accel.z = 0;
  }
}

export const THROW_CONFIG = {
  /** At or below this hand speed (m/s) a release transfers nothing: it is a drop or a place. */
  gentle: 0.7,
  /** From here (m/s) the hand's momentum is passed on at full share. */
  full: 2.2,
  /** Share passed on at the top of the gentle ramp... */
  minShare: 0.3,
  /** Hand momentum is not all passed on: a flick of the fingers is not an arm. */
  maxShare: 0.9,
  /** Mass (kg) up to which things fly as easily as a stone. */
  lightMass: 0.4,
  /** Hardest throw (m/s). */
  maxSpeed: 9,
  /** Vertical limits (m/s): no rocketing up or slamming down from a jittery sample. */
  maxUp: 6.5,
  maxDown: -8,
};

/** Fraction of the hand's velocity a thing of `mass` kg leaves with at hand speed `speed`. */
export function throwShare(speed: number, mass: number, cfg = THROW_CONFIG): number {
  if (speed <= cfg.gentle) return 0;
  const t = Math.min(1, (speed - cfg.gentle) / (cfg.full - cfg.gentle));
  const ramp = cfg.minShare + (cfg.maxShare - cfg.minShare) * t;
  return ramp / (1 + 0.3 * Math.max(0, mass - cfg.lightMass));
}

/**
 * The velocity a released object leaves with: a controlled, mass-scaled share
 * of the hand's velocity, clamped. Zero for a gentle release. Returns `out`.
 */
export function throwImpulse(hand: V3, mass: number, out: V3, cfg = THROW_CONFIG): V3 {
  const speed = Math.hypot(hand.x, hand.y, hand.z);
  if (!Number.isFinite(speed)) {
    out.x = out.y = out.z = 0;
    return out;
  }
  const k = throwShare(speed, mass, cfg);
  out.x = hand.x * k;
  out.y = hand.y * k;
  out.z = hand.z * k;
  const s = Math.hypot(out.x, out.y, out.z);
  if (s > cfg.maxSpeed) {
    const c = cfg.maxSpeed / s;
    out.x *= c;
    out.y *= c;
    out.z *= c;
  }
  out.y = Math.max(cfg.maxDown, Math.min(cfg.maxUp, out.y));
  return out;
}
