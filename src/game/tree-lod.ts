// Forest trees as data (Phase: EZ-Tree visual round). Pure, no three.js: which of the five baked variants each
// tree uses, the understory saplings, and the distance rules that choose a level of detail. TREES (world-layout)
// stays the single source of positions, so collision, perching, the mast sightline and gaze occlusion are unchanged.

import { mulberry32, range, valueNoise } from './rng.js';
import { groundHeight, inClearing, streamDistance, TREES, WORLD_RADIUS } from './world-layout.js';

export const TREE_VARIANTS = ['oak', 'ash', 'aspen', 'pine', 'snag', 'bush1', 'bush2', 'bush3', 'fern'] as const;
export type TreeVariant = (typeof TREE_VARIANTS)[number];

/** Level of detail: 0 full, 1 medium, 2 low, 3 billboard. */
export type Lod = 0 | 1 | 2 | 3;
/** Distances (m) at which a tree drops to the next level; hysteresis stops flicker at a boundary. */
export const LOD_DISTANCE = [4.5, 10.5, 19.5] as const;
export const LOD_HYSTERESIS = 2;
/** Beyond this distance a tree behind you (angle past ~105 degrees) is not drawn at all. */
export const CULL_NEAR = 9;
export const CULL_COS = -0.26;

export interface TreeInstance {
  x: number;
  y: number;
  z: number;
  rotY: number;
  lean: number;
  leanDir: number;
  /** Non-uniform scale: width (x and z) and height. */
  w: number;
  h: number;
  variant: TreeVariant;
  /** Shade variation 0..3. */
  tint: number;
  /** Small trees look coarse sooner: their distance counts this many times over for the level of detail. */
  bias: number;
  /** Index into TREES for real trees; -1 for understory saplings. */
  tree: number;
}

/** Which variant a game tree is: kind 0 pine, 1 broadleaf (oak, ash or aspen by tint), 2 dead snag. */
export function variantOf(kind: 0 | 1 | 2, tint: number): TreeVariant {
  if (kind === 0) return 'pine';
  if (kind === 2) return 'snag';
  return (['oak', 'ash', 'aspen', 'oak'] as const)[tint % 4];
}

/** Young trees under the canopy: the same loop and seed as before, so they stay where they were. */
export function understory(count = 420): TreeInstance[] {
  const rng = mulberry32(73);
  const out: TreeInstance[] = [];
  for (let tries = 0; out.length < count && tries < 8000; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 6 + Math.sqrt(rng()) * (WORLD_RADIUS + 4);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inClearing(x, z, 0.5) || streamDistance(x, z) < 1.5 || rng() > valueNoise(x * 0.08 + 5, z * 0.08) * 1.5) continue;
    const sc = range(rng, 0.22, 0.45);
    const rot = rng() * 6;
    const hh = sc * range(rng, 0.8, 1.2);
    const n = out.length;
    out.push({ x, y: groundHeight(x, z) - 0.03, z, rotY: rot, lean: 0, leanDir: 0, w: sc, h: hh * 1.1, variant: n % 3 === 0 ? 'ash' : n % 3 === 1 ? 'oak' : 'aspen', tint: n % 4, bias: 2.2, tree: -1 });
  }
  return out;
}

/** Shrubs (walk-through): the same seeded loop as the old faceted bushes, so they stay where they were. */
export function bushes(count = 260): TreeInstance[] {
  const rng = mulberry32(31);
  const out: TreeInstance[] = [];
  for (let tries = 0; out.length < count && tries < 6000; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 6 + rng() * (WORLD_RADIUS + 4);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inClearing(x, z, -0.5) || streamDistance(x, z) < 1.6) continue;
    const sc = range(rng, 0.25, 0.6);
    const rot = rng() * 6;
    const n = out.length;
    out.push({ x, y: groundHeight(x, z) - 0.02, z, rotY: rot, lean: 0, leanDir: 0, w: sc * 2.2, h: sc * 2.0, variant: (['bush1', 'bush2', 'bush3'] as const)[n % 3], tint: n % 4, bias: 2.4, tree: -1 });
  }
  return out;
}

/**
 * Ferns: the same seeded loop as the old spiky fronds (it continues the random draws of the shrub loop, as before),
 * so each fern stays where it was. Drawn as arching leaf cards.
 */
export function ferns(count = 700): TreeInstance[] {
  const rng = mulberry32(31);
  // Replay the shrub loop's draws so the fern loop starts from the same state as in the original layout.
  for (let tries = 0, n = 0; n < 260 && tries < 6000; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 6 + rng() * (WORLD_RADIUS + 4);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inClearing(x, z, -0.5) || streamDistance(x, z) < 1.6) continue;
    range(rng, 0.25, 0.6);
    rng();
    n++;
  }
  const out: TreeInstance[] = [];
  for (let tries = 0; out.length < count && tries < 12000; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 4 + Math.sqrt(rng()) * (WORLD_RADIUS + 6);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inClearing(x, z, 0) || streamDistance(x, z) < 1.2) continue;
    const sc = range(rng, 0.6, 1.3);
    const rot = rng() * 6;
    out.push({ x, y: groundHeight(x, z), z, rotY: rot, lean: 0, leanDir: 0, w: sc, h: sc * 0.9, variant: 'fern', tint: out.length % 4, bias: 2.6, tree: -1 });
  }
  return out;
}

export function allTrees(): TreeInstance[] {
  const out: TreeInstance[] = TREES.map((t, i) => ({
    x: t.x,
    y: groundHeight(t.x, t.z) - 0.05,
    z: t.z,
    rotY: t.rotY,
    lean: t.lean,
    leanDir: t.leanDir,
    w: t.scale * t.girth,
    h: t.scale * t.height,
    variant: variantOf(t.kind, t.tint),
    tint: t.tint,
    bias: Math.max(1, Math.min(1.6, 1.15 / (t.scale * t.height))),
    tree: i,
  }));
  return out.concat(understory(), bushes(), ferns());
}

/** The level of detail for a tree at squared distance `d2`, given the one it had (null = first time). */
export function lodFor(d2: number, prev: Lod | null): Lod {
  const band = (i: number, dir: number) => (LOD_DISTANCE[i] + dir * LOD_HYSTERESIS) ** 2;
  let lod: Lod = 3;
  for (let i = 0; i < 3; i++) {
    // Staying at a coarser level than the boundary needs a little more than the boundary to come back.
    const edge = prev !== null && prev <= i ? band(i, 1) : band(i, -1);
    if (d2 < edge) {
      lod = i as Lod;
      break;
    }
  }
  return lod;
}

/** Is a tree at distance `d` whose direction has cosine `cosToView` with the view direction worth drawing? */
export const worthDrawing = (d: number, cosToView: number): boolean => d < CULL_NEAR || cosToView > CULL_COS;
