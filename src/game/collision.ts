// Player and object collision on the ground plane. Everything solid is a
// circle or a capsule (a line segment with a radius) in XZ; height is ignored
// because nothing here is low enough to step over or high enough to walk
// under. Static proxies come from the world layout; built structures and
// heavy dropped items are dynamic.
//
// Pure and allocation-free on the hot path: results go into caller-owned
// `out` objects and the query buffer is reused.

import { BLUEPRINTS, type PlacedStructure } from './blueprint.js';
import {
  BOULDERS,
  FALLEN_TRUNKS,
  LANDMARK_BY_ID,
  TREES,
  WORLD_RADIUS,
} from './world-layout.js';

export interface Proxy {
  /** Segment start (a circle has a == b). */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
  /** What it is, for logs and other systems. */
  tag: string;
}

export interface XZ {
  x: number;
  z: number;
}

/** Default player body radius (m). */
export const PLAYER_RADIUS = 0.25;
/** Longest single step resolveMove takes, so fast moves cannot tunnel. */
const MAX_STEP = 0.1;
const ITERATIONS = 4;
const CELL = 2;

const circle = (x: number, z: number, r: number, tag: string): Proxy => ({ ax: x, az: z, bx: x, bz: z, r, tag });

/** Rotates a local (x, z) offset by `deg` about Y, like the scene's rotationDeg. */
function rotY(x: number, z: number, deg: number): [number, number] {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [x * c + z * s, -x * s + z * c];
}

function capsuleAt(ox: number, oz: number, deg: number, a: [number, number], b: [number, number], r: number, tag: string): Proxy {
  const [ax, az] = rotY(a[0], a[1], deg);
  const [bx, bz] = rotY(b[0], b[1], deg);
  return { ax: ox + ax, az: oz + az, bx: ox + bx, bz: oz + bz, r, tag };
}

/** Every static solid in the forest. Positions match the scene JSON transforms. */
export function buildStaticProxies(): Proxy[] {
  const out: Proxy[] = [];
  for (const t of TREES) {
    // Trunk base radius ≈ 0.17–0.2 m in the tree geometries.
    out.push(circle(t.x, t.z, 0.19 * t.scale * t.girth, 'tree'));
  }
  for (const b of BOULDERS) out.push(circle(b.x, b.z, b.size * 0.9, 'boulder'));
  for (const t of FALLEN_TRUNKS) {
    const hx = Math.cos(t.rotY) * t.length * 0.5;
    const hz = -Math.sin(t.rotY) * t.length * 0.5;
    out.push({ ax: t.x - hx, az: t.z - hz, bx: t.x + hx, bz: t.z + hz, r: 0.2 * t.thick, tag: 'log' });
  }
  // Split Rock: two halves 1.5 m apart, scene rotation 20°.
  const sr = LANDMARK_BY_ID.splitRock;
  for (const side of [-1, 1]) {
    const [x, z] = rotY(side * 0.75, 0, 20);
    out.push(circle(sr.x + x, sr.z + z, 0.85, 'splitRock'));
  }
  // The Ruins (scene rotation 49°): walls from createRuins, plus the mast.
  const ru = LANDMARK_BY_ID.ruins;
  out.push(capsuleAt(ru.x, ru.z, 49, [-1.6, -3.4], [2.4, -3.4], 0.18, 'ruinsWall'));
  out.push(capsuleAt(ru.x, ru.z, 49, [-2.6, -3.4], [-2.6, -0.4], 0.18, 'ruinsWall'));
  out.push(capsuleAt(ru.x, ru.z, 49, [2.6, -3.3], [2.6, -1.9], 0.18, 'ruinsWall'));
  out.push(capsuleAt(ru.x, ru.z, 49, [-3.6, -3.8], [-3.6, -3.8], 0.3, 'mast'));
  // Lightning Glade's shattered trunk.
  const gl = LANDMARK_BY_ID.glade;
  out.push(circle(gl.x, gl.z, 0.35, 'shatteredTree'));
  return out;
}

/** Closest point on segment ab to p, written into `out`. */
function closest(p: Proxy, x: number, z: number, out: XZ): void {
  const abx = p.bx - p.ax;
  const abz = p.bz - p.az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((x - p.ax) * abx + (z - p.az) * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.x = p.ax + abx * t;
  out.z = p.az + abz * t;
}

export class CollisionWorld {
  private cells = new Map<number, Proxy[]>();
  private dynamic = new Map<string, Proxy>();
  private structures: readonly PlacedStructure[] = [];
  private structureProxy: Proxy = circle(0, 0, 0, 'structure');
  private near: Proxy[] = [];
  private tmp: XZ = { x: 0, z: 0 };
  private tmp2: XZ = { x: 0, z: 0 };
  private step: XZ = { x: 0, z: 0 };
  private structurePool: Proxy[] = [];
  private maxStaticR = 0;

  constructor(
    statics: Proxy[] = buildStaticProxies(),
    readonly worldRadius = WORLD_RADIUS,
  ) {
    for (const p of statics) this.addStatic(p);
  }

  private key(ix: number, iz: number): number {
    return (ix + 1000) * 4096 + (iz + 1000);
  }

  private addStatic(p: Proxy): void {
    this.maxStaticR = Math.max(this.maxStaticR, p.r);
    const x0 = Math.floor((Math.min(p.ax, p.bx) - p.r) / CELL);
    const x1 = Math.floor((Math.max(p.ax, p.bx) + p.r) / CELL);
    const z0 = Math.floor((Math.min(p.az, p.bz) - p.r) / CELL);
    const z1 = Math.floor((Math.max(p.az, p.bz) + p.r) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(p);
      }
    }
  }

  /** Built structures block the player; pass the game's live array once. */
  setStructures(list: readonly PlacedStructure[]): void {
    this.structures = list;
  }

  /** Adds or moves a dynamic solid (e.g. a heavy dropped item). */
  setDynamic(id: string, x: number, z: number, r: number, tag = 'dynamic'): void {
    const p = this.dynamic.get(id);
    if (p) {
      p.ax = p.bx = x;
      p.az = p.bz = z;
      p.r = r;
    } else this.dynamic.set(id, circle(x, z, r, tag));
  }

  removeDynamic(id: string): void {
    this.dynamic.delete(id);
  }

  /**
   * Solids whose surface is within `r` of (x, z). The returned array is
   * reused by the next call: copy it if you need to keep it.
   */
  blockersNear(x: number, z: number, r: number): readonly Proxy[] {
    const near = this.near;
    near.length = 0;
    const reach = r;
    const x0 = Math.floor((x - reach) / CELL);
    const x1 = Math.floor((x + reach) / CELL);
    const z0 = Math.floor((z - reach) / CELL);
    const z1 = Math.floor((z + reach) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.cells.get(this.key(ix, iz));
        if (!list) continue;
        for (const p of list) if (!near.includes(p) && this.overlaps(p, x, z, r)) near.push(p);
      }
    }
    for (const p of this.dynamic.values()) if (this.overlaps(p, x, z, r)) near.push(p);
    // Structures move with the game state: refresh pooled proxies each query.
    for (let i = 0; i < this.structures.length; i++) {
      const s = this.structures[i];
      // The shelter is walked into (its poles are thin): only the solid builds block you.
      if (s.kind === 'leanTo' || s.kind === 'drainage') continue;
      const sp = (this.structurePool[i] ??= circle(0, 0, 0, 'structure'));
      sp.ax = sp.bx = s.x;
      sp.az = sp.bz = s.z;
      sp.r = BLUEPRINTS[s.kind].radius * 0.8;
      sp.tag = s.kind;
      if (this.overlaps(sp, x, z, r)) near.push(sp);
    }
    return near;
  }

  private overlaps(p: Proxy, x: number, z: number, r: number): boolean {
    closest(p, x, z, this.tmp2);
    const dx = x - this.tmp2.x;
    const dz = z - this.tmp2.z;
    const rr = p.r + r;
    return dx * dx + dz * dz < rr * rr;
  }

  /** True when a body of radius r at (x, z) overlaps a solid or leaves the world. */
  isBlocked(x: number, z: number, r: number): boolean {
    if (Math.hypot(x, z) > this.worldRadius) return true;
    return this.anyOverlap(x, z, r);
  }

  private anyOverlap(x: number, z: number, r: number): boolean {
    const ix = Math.floor(x / CELL);
    const iz = Math.floor(z / CELL);
    const span = Math.ceil(r / CELL);
    for (let a = ix - span; a <= ix + span; a++) {
      for (let b = iz - span; b <= iz + span; b++) {
        const list = this.cells.get(this.key(a, b));
        if (list) for (const p of list) if (this.overlaps(p, x, z, r)) return true;
      }
    }
    for (const p of this.dynamic.values()) if (this.overlaps(p, x, z, r)) return true;
    const sp = this.structureProxy;
    for (const s of this.structures) {
      if (s.kind === 'leanTo' || s.kind === 'drainage') continue;
      sp.ax = sp.bx = s.x;
      sp.az = sp.bz = s.z;
      sp.r = BLUEPRINTS[s.kind].radius * 0.8;
      if (this.overlaps(sp, x, z, r)) return true;
    }
    return false;
  }

  /** Pushes (x, z) out of every overlapping solid once. Returns true if it moved. */
  private pushOut(pos: XZ, r: number): boolean {
    let moved = false;
    const near = this.blockersNear(pos.x, pos.z, r);
    for (const p of near) {
      closest(p, pos.x, pos.z, this.tmp);
      let dx = pos.x - this.tmp.x;
      let dz = pos.z - this.tmp.z;
      let d = Math.hypot(dx, dz);
      // A hair of skin so float error never leaves the body just inside.
      const rr = p.r + r + 1e-4;
      if (d >= rr) continue;
      if (d < 1e-6) {
        // Dead centre: push along the segment's normal (or +x for a circle).
        const abx = p.bx - p.ax;
        const abz = p.bz - p.az;
        const len = Math.hypot(abx, abz);
        dx = len > 0 ? -abz / len : 1;
        dz = len > 0 ? abx / len : 0;
        d = 1;
        pos.x = this.tmp.x + dx * rr;
        pos.z = this.tmp.z + dz * rr;
      } else {
        pos.x = this.tmp.x + (dx / d) * rr;
        pos.z = this.tmp.z + (dz / d) * rr;
      }
      moved = true;
    }
    const dr = Math.hypot(pos.x, pos.z);
    const lim = this.worldRadius - r;
    if (dr > lim) {
      pos.x *= lim / dr;
      pos.z *= lim / dr;
      moved = true;
    }
    return moved;
  }

  /**
   * Moves a body of radius r from `from` towards `to`, sliding along any
   * solid it meets. Writes the end position into `out` (which may be `to`).
   * Never ends inside a solid: if a step cannot be resolved (a gap narrower
   * than the body), it stops at the last free position.
   */
  resolveMove(from: XZ, to: XZ, r: number, out: XZ): XZ {
    let x = from.x;
    let z = from.z;
    if (this.isBlocked(x, z, r)) {
      // Started inside something (spawned, or a structure appeared): get out first.
      this.nudgeOut(x, z, r, this.tmp);
      x = this.tmp.x;
      z = this.tmp.z;
    }
    const tx = to.x;
    const tz = to.z;
    const dist = Math.hypot(tx - x, tz - z);
    const steps = Math.max(1, Math.ceil(dist / MAX_STEP));
    const sx = (tx - x) / steps;
    const sz = (tz - z) / steps;
    const pos = this.step;
    for (let i = 0; i < steps; i++) {
      pos.x = x + sx;
      pos.z = z + sz;
      for (let k = 0; k < ITERATIONS && this.pushOut(pos, r); k++);
      if (this.isBlocked(pos.x, pos.z, r)) break; // wedged: stay put
      x = pos.x;
      z = pos.z;
    }
    out.x = x;
    out.z = z;
    return out;
  }

  /**
   * The nearest free spot for a body of radius r at (x, z): itself if free,
   * else the first free point on growing rings. Falls back to (x, z).
   */
  nudgeOut(x: number, z: number, r: number, out: XZ): XZ {
    out.x = x;
    out.z = z;
    if (!this.isBlocked(x, z, r)) return out;
    for (let ring = 1; ring <= 24; ring++) {
      const d = ring * 0.15;
      const n = 8 + ring * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * d;
        const pz = z + Math.sin(a) * d;
        if (!this.isBlocked(px, pz, r)) {
          out.x = px;
          out.z = pz;
          return out;
        }
      }
    }
    return out;
  }
}

let shared: CollisionWorld | null = null;

/** The one collision world for the forest, built on first use. */
export function collisionWorld(): CollisionWorld {
  return (shared ??= new CollisionWorld());
}

const nudgeTmp: XZ = { x: 0, z: 0 };

/**
 * For other systems (drops, released objects): the nearest point to (x, z)
 * where something of radius r can rest without overlapping a solid.
 * The returned object is reused by the next call.
 */
export function nudgeOut(x: number, z: number, r: number): XZ {
  return collisionWorld().nudgeOut(x, z, r, nudgeTmp);
}
