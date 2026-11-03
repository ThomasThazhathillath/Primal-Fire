import { describe, expect, it } from 'vitest';
import { CollisionWorld, collisionWorld, nudgeOut, PLAYER_RADIUS, type Proxy, type XZ } from '../src/game/collision.js';
import type { PlacedStructure } from '../src/game/blueprint.js';
import { TREES, WORLD_RADIUS } from '../src/game/world-layout.js';

const R = PLAYER_RADIUS;
const tree = (x: number, z: number, r = 0.2): Proxy => ({ ax: x, az: z, bx: x, bz: z, r, tag: 'tree' });

/** Walks in small frame steps, like the desktop controls. */
function walk(w: CollisionWorld, from: XZ, dx: number, dz: number, frames: number): XZ[] {
  const path: XZ[] = [];
  const pos = { ...from };
  const to = { x: 0, z: 0 };
  for (let i = 0; i < frames; i++) {
    to.x = pos.x + dx;
    to.z = pos.z + dz;
    w.resolveMove(pos, to, R, pos);
    path.push({ ...pos });
  }
  return path;
}

describe('collision', () => {
  it('cannot walk through a tree', () => {
    const w = new CollisionWorld([tree(0, -2)]);
    const path = walk(w, { x: 0, z: 0 }, 0, -0.05, 100);
    for (const p of path) expect(w.isBlocked(p.x, p.z, R)).toBe(false);
    expect(path[path.length - 1].z).toBeGreaterThan(-2);
  });

  it('slides along a trunk when walking into it at an angle', () => {
    const w = new CollisionWorld([tree(0, -2)]);
    const end = walk(w, { x: 0.05, z: 0 }, 0.01, -0.05, 120).pop()!;
    // Got past the tree instead of sticking to it.
    expect(end.z).toBeLessThan(-2.5);
  });

  it('a corner between two trees does not trap inside or jitter', () => {
    // Gap 0.3 m between surfaces: narrower than the body (0.5 m).
    const w = new CollisionWorld([tree(-0.35, -2, 0.2), tree(0.35, -2, 0.2)]);
    const path = walk(w, { x: 0, z: 0 }, 0, -0.05, 120);
    for (const p of path) expect(w.isBlocked(p.x, p.z, R)).toBe(false);
    const last = path.slice(-20);
    const spread = Math.max(...last.map((p) => Math.hypot(p.x - last[0].x, p.z - last[0].z)));
    expect(spread).toBeLessThan(1e-6);
    expect(last[0].z).toBeGreaterThan(-2);
  });

  it('blocks a long fallen log (capsule) and slides along it', () => {
    const w = new CollisionWorld([{ ax: -10, az: -2, bx: 10, bz: -2, r: 0.2, tag: 'log' }]);
    const end = walk(w, { x: 0, z: 0 }, 0.03, -0.05, 120).pop()!;
    expect(end.z).toBeGreaterThan(-2);
    expect(end.x).toBeGreaterThan(2);
  });

  it('built structures block', () => {
    const w = new CollisionWorld([]);
    const s = { id: 1, kind: 'workbench', x: 0, z: -3, rotY: 0, key: 'slab', spots: [], complete: true } as unknown as PlacedStructure;
    w.setStructures([s]);
    expect(w.isBlocked(0, -3, R)).toBe(true);
    const end = walk(w, { x: 0, z: 0 }, 0, -0.05, 100).pop()!;
    expect(end.z).toBeGreaterThan(-3);
    expect(w.blockersNear(0, -3, R).some((p) => p.tag === 'workbench')).toBe(true);
  });

  it('a teleport into a tree is rejected and nudged to a free spot', () => {
    const w = collisionWorld();
    const t = TREES.find((t) => Math.hypot(t.x, t.z) < 30)!;
    expect(w.isBlocked(t.x, t.z, R)).toBe(true);
    const free = nudgeOut(t.x, t.z, R);
    expect(w.isBlocked(free.x, free.z, R)).toBe(false);
    expect(Math.hypot(free.x - t.x, free.z - t.z)).toBeLessThan(1.5);
  });

  it('stops at the world edge', () => {
    const w = new CollisionWorld([]);
    const end = walk(w, { x: WORLD_RADIUS - 2, z: 0 }, 0.1, 0, 60).pop()!;
    expect(Math.hypot(end.x, end.z)).toBeLessThanOrEqual(WORLD_RADIUS);
    expect(w.isBlocked(WORLD_RADIUS + 1, 0, R)).toBe(true);
  });

  it('the waking spot is free', () => {
    expect(collisionWorld().isBlocked(0, 0, R)).toBe(false);
  });
});
