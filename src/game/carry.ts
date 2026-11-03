// Holding, carrying and letting go, as plain maths (rendering in CarrySystem):
//   - a held object springs towards its grip pose with lag set by its mass
//     and how many hands hold it (a slab trails; a stone snaps to the hand);
//   - letting go throws it with the hand's recent velocity;
//   - a loose object falls, bounces by material, rolls a little and settles.
// Vectors are {x, y, z} records so callers can pass preallocated objects.

import { carryRules, ITEM_PHYSICS, ITEMS, type ItemId, type Material } from './items.js';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const GRAVITY = 9.8;

/**
 * Spring stiffness (1/s²) for a held object: light things follow almost
 * rigidly, heavy things lag. Two hands make a heavy thing steadier.
 */
export function followStiffness(mass: number, hands: number): number {
  return Math.max(30, 900 / (1 + mass * (hands >= 2 ? 0.6 : 1.5)));
}

/**
 * One step of a critically damped spring pulling `pos` towards `target`
 * (mutates pos and vel). Never overshoots, never teleports.
 */
export function springStep(pos: V3, vel: V3, target: V3, stiffness: number, dt: number): void {
  const damping = 2 * Math.sqrt(stiffness);
  for (const k of ['x', 'y', 'z'] as const) {
    const acc = stiffness * (target[k] - pos[k]) - damping * vel[k];
    vel[k] += acc * dt;
    pos[k] += vel[k] * dt;
  }
}

/**
 * Remembers the last few hand positions so a release can throw the object
 * with the hand's velocity (averaged over ~0.1 s so a twitch does not count).
 */
export class VelocityTracker {
  private xs = new Float32Array(8);
  private ys = new Float32Array(8);
  private zs = new Float32Array(8);
  private ts = new Float32Array(8);
  private head = 0;
  private n = 0;

  push(p: V3, t: number): void {
    this.xs[this.head] = p.x;
    this.ys[this.head] = p.y;
    this.zs[this.head] = p.z;
    this.ts[this.head] = t;
    this.head = (this.head + 1) % 8;
    this.n = Math.min(8, this.n + 1);
  }

  /** Average velocity over the last `window` seconds into `out`. */
  velocity(out: V3, window = 0.1): V3 {
    out.x = out.y = out.z = 0;
    if (this.n < 2) return out;
    const last = (this.head + 7) % 8;
    let first = last;
    for (let k = 1; k < this.n; k++) {
      const i = (last - k + 8) % 8;
      first = i;
      if (this.ts[last] - this.ts[i] >= window) break;
    }
    const dt = this.ts[last] - this.ts[first];
    if (dt <= 0) return out;
    out.x = (this.xs[last] - this.xs[first]) / dt;
    out.y = (this.ys[last] - this.ys[first]) / dt;
    out.z = (this.zs[last] - this.zs[first]) / dt;
    return out;
  }

  reset(): void {
    this.n = 0;
  }
}

/** Bounciness by material (fraction of vertical speed kept on impact). */
export const RESTITUTION: Partial<Record<Material, number>> = {
  stone: 0.3,
  flint: 0.3,
  wood: 0.35,
  bone: 0.3,
  clay: 0.05,
  leaf: 0.05,
  fibre: 0.05,
  cloth: 0.02,
  sand: 0.02,
  ember: 0.1,
};

/** Fraction of ground speed lost per second while sliding / rolling. */
const GROUND_FRICTION = 4;
/** Below this speed (m/s) a resting object stops. */
const REST_SPEED = 0.05;

export interface Body {
  pos: V3;
  vel: V3;
  /** Spin (rad/s) about the vertical, for a little tumble while it flies and rolls. */
  spin: number;
  settled: boolean;
}

export type BodyEvent = { kind: 'impact'; speed: number } | { kind: 'settled' } | null;

/** Advances a loose object; the ground is y = `groundY`. */
export function stepBody(b: Body, item: ItemId, dt: number, groundY = 0): BodyEvent {
  if (b.settled) return null;
  b.vel.y -= GRAVITY * dt;
  b.pos.x += b.vel.x * dt;
  b.pos.y += b.vel.y * dt;
  b.pos.z += b.vel.z * dt;
  if (b.pos.y > groundY) return null;
  b.pos.y = groundY;
  const impact = -b.vel.y;
  const rest = RESTITUTION[ITEM_PHYSICS[item].material] ?? 0.2;
  if (impact > 0.6) {
    b.vel.y = impact * rest;
    // Round, light things roll on; long or heavy ones mostly stop.
    const roll = ITEMS[item].weight < 2 && ITEM_PHYSICS[item].size[0] < 0.2 ? 0.7 : 0.3;
    b.vel.x *= roll;
    b.vel.z *= roll;
    b.spin *= 0.5;
    return { kind: 'impact', speed: impact };
  }
  b.vel.y = 0;
  const k = Math.max(0, 1 - GROUND_FRICTION * dt);
  b.vel.x *= k;
  b.vel.z *= k;
  b.spin *= k;
  if (Math.hypot(b.vel.x, b.vel.z) < REST_SPEED) {
    b.vel.x = b.vel.z = 0;
    b.spin = 0;
    b.settled = true;
    return { kind: 'settled' };
  }
  return null;
}

/** Walking speed factor while carrying `item` in your hands. */
export function carrySpeed(item: ItemId | null): number {
  if (!item || carryRules.easy) return 1;
  if (ITEM_PHYSICS[item].interaction === 'twoHand') return 0.6;
  return ITEMS[item].weight > 1.5 ? 0.85 : 1;
}

/**
 * A loose object that has run into something solid at horizontal normal
 * (nx, nz) (pointing out of the solid): it stops going in, bounces back a
 * little and loses speed. Returns the speed it hit with (0 if it was moving away).
 */
export function bounceOff(b: Body, nx: number, nz: number, restitution = 0.35): number {
  const len = Math.hypot(nx, nz);
  if (len < 1e-6) return 0;
  const ux = nx / len;
  const uz = nz / len;
  const vn = b.vel.x * ux + b.vel.z * uz;
  if (vn >= 0) return 0;
  b.vel.x -= (1 + restitution) * vn * ux;
  b.vel.z -= (1 + restitution) * vn * uz;
  b.vel.x *= 0.8;
  b.vel.z *= 0.8;
  return -vn;
}
