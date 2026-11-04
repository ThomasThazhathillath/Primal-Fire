// Two hands on one thing (hands-only spec, phase 5): logs, big branches, heavy
// stones, slabs and long tools. The object's pose comes from the two hand
// points; releasing one hand leaves the other holding. Pure and
// allocation-free: CarrySystem owns one TwoHandGrip and one TwoHandPose.

import type { V3 } from './carry.js';

export const TWO_HAND = {
  /** A second hand pinching within this distance (m) of the object's axis takes hold. */
  engageRadius: 0.4,
};

/** Which hands hold the carried object. */
export class TwoHandGrip {
  readonly holding: [boolean, boolean] = [false, false];

  get count(): number {
    return (this.holding[0] ? 1 : 0) + (this.holding[1] ? 1 : 0);
  }

  get held(): boolean {
    return this.count > 0;
  }

  /** The hand that holds it when only one does (-1 if none; the lower index if both). */
  get primary(): 0 | 1 | -1 {
    return this.holding[0] ? (this.holding[1] ? 0 : 0) : this.holding[1] ? 1 : -1;
  }

  reset(hand: 0 | 1 | -1): void {
    this.holding[0] = hand === 0;
    this.holding[1] = hand === 1;
  }

  /** The other hand pinched at `distance` m from the object's axis: does it take hold? Only a two-handed thing, only once. */
  engage(hand: 0 | 1, twoHanded: boolean, distance: number, cfg = TWO_HAND): boolean {
    if (!twoHanded || this.holding[hand] || !this.holding[1 - hand] || distance > cfg.engageRadius) return false;
    this.holding[hand] = true;
    return true;
  }

  /**
   * A hand opened its pinch. Returns true if the object is let go (no hand
   * left), false if the other hand is still holding it.
   */
  open(hand: 0 | 1): boolean {
    if (!this.holding[hand]) return !this.held;
    this.holding[hand] = false;
    return !this.held;
  }
}

/** Distance from point p to the segment centre ± axis*halfLength. */
export function distanceToAxis(p: V3, centre: V3, axis: V3, halfLength: number): number {
  const rx = p.x - centre.x;
  const ry = p.y - centre.y;
  const rz = p.z - centre.z;
  const al = Math.hypot(axis.x, axis.y, axis.z) || 1;
  let t = (rx * axis.x + ry * axis.y + rz * axis.z) / al;
  t = Math.max(-halfLength, Math.min(halfLength, t));
  const cx = (axis.x / al) * t;
  const cy = (axis.y / al) * t;
  const cz = (axis.z / al) * t;
  return Math.hypot(rx - cx, ry - cy, rz - cz);
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * The pose of a long object held between two points: its +X axis runs
 * between the hands (full 3D, so lifting one end tilts it). The roll is kept
 * from frame to frame so it never flips, and a swap of left and right hand
 * positions reverses the axis rather than spinning the object.
 */
export class TwoHandPose {
  /** The object's +X, and its up, from the last frame. */
  readonly x: V3 = { x: 1, y: 0, z: 0 };
  readonly up: V3 = { x: 0, y: 1, z: 0 };
  readonly mid: V3 = { x: 0, y: 0, z: 0 };
  readonly q: Quat = { x: 0, y: 0, z: 0, w: 1 };

  /** Start from an object's current orientation (its +X and up vectors). */
  seed(x: V3, up: V3): void {
    Object.assign(this.x, x);
    Object.assign(this.up, up);
  }

  update(a: V3, b: V3): void {
    this.mid.x = (a.x + b.x) / 2;
    this.mid.y = (a.y + b.y) / 2;
    this.mid.z = (a.z + b.z) / 2;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.03) return; // hands together: no direction, keep the last pose
    dx /= len;
    dy /= len;
    dz /= len;
    // Same side as before: the longer way round is never taken.
    if (dx * this.x.x + dy * this.x.y + dz * this.x.z < 0) {
      dx = -dx;
      dy = -dy;
      dz = -dz;
    }
    // Keep the old up, squared up against the new axis.
    const d = this.up.x * dx + this.up.y * dy + this.up.z * dz;
    let ux = this.up.x - d * dx;
    let uy = this.up.y - d * dy;
    let uz = this.up.z - d * dz;
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-4) {
      // Axis straight along the old up: borrow world Z.
      ux = 0;
      uy = 0;
      uz = 1;
      const e = dz;
      ux -= e * dx;
      uy -= e * dy;
      uz -= e * dz;
      ul = Math.hypot(ux, uy, uz) || 1;
    }
    ux /= ul;
    uy /= ul;
    uz /= ul;
    this.x.x = dx;
    this.x.y = dy;
    this.x.z = dz;
    this.up.x = ux;
    this.up.y = uy;
    this.up.z = uz;
    // Basis columns: X = axis, Y = up, Z = X × Y.
    const zx = dy * uz - dz * uy;
    const zy = dz * ux - dx * uz;
    const zz = dx * uy - dy * ux;
    const m00 = dx, m10 = dy, m20 = dz;
    const m01 = ux, m11 = uy, m21 = uz;
    const m02 = zx, m12 = zy, m22 = zz;
    const tr = m00 + m11 + m22;
    const q = this.q;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2;
      q.w = 0.25 * s;
      q.x = (m21 - m12) / s;
      q.y = (m02 - m20) / s;
      q.z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      q.w = (m21 - m12) / s;
      q.x = 0.25 * s;
      q.y = (m01 + m10) / s;
      q.z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      q.w = (m02 - m20) / s;
      q.x = (m01 + m10) / s;
      q.y = 0.25 * s;
      q.z = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      q.w = (m10 - m01) / s;
      q.x = (m02 + m20) / s;
      q.y = (m12 + m21) / s;
      q.z = 0.25 * s;
    }
  }
}
