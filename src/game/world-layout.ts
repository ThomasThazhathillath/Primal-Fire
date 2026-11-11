// The forest's layout as plain data: hidden places, the stream, trees and
// gatherable resources. Both the scene assets (rendering) and the game rules
// (blueprint placement, hints) read it, so it must stay free of three.js.
//
// Coordinates are metres on the ground plane. North is −z, east is +x.
// The player wakes at the origin, in a small empty clearing by the stream.
// v4 has no pre-built camp: camp is wherever the player builds.

import type { ItemId } from './items.js';
import { clamp, mulberry32, range, valueNoise } from './rng.js';
import { SpatialGrid } from './spatial-grid.js';

export interface Landmark {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Discovery radius: walking this close reveals it on the compass. */
  r: number;
  /** Radius kept free of trees. */
  clear: number;
  /** Known from the start (shown on the compass immediately). */
  known?: boolean;
}

export const LANDMARKS: Landmark[] = [
  { id: 'wake', name: 'Waking Clearing', x: 0, z: 0, r: 6, clear: 6.5, known: true },
  { id: 'meadow', name: 'Sunny Meadow', x: 18, z: 14, r: 7, clear: 8 },
  { id: 'glade', name: 'Lightning Glade', x: -17, z: 11, r: 6, clear: 5.5 },
  { id: 'bend', name: 'Clay Bend', x: 6.2, z: -20, r: 6, clear: 4.5 },
  { id: 'ruins', name: 'The Ruins', x: -22, z: -19, r: 7, clear: 6.5 },
  { id: 'splitRock', name: 'Split Rock', x: -4, z: 26, r: 6, clear: 4.5 },
];

export const LANDMARK_BY_ID: Record<string, Landmark> = Object.fromEntries(
  LANDMARKS.map((l) => [l.id, l]),
);

/** Stream centreline, north to south. */
export const STREAM: ReadonlyArray<readonly [number, number]> = [
  [6.3, 52],
  [5.6, 35],
  [3.9, 21],
  [4.9, 10],
  [4.4, 3],
  [4.2, -3],
  [5.3, -10],
  [8.8, -18],
  [9.5, -24],
  [12.6, -34],
  [15.4, -52],
];

export const STREAM_HALF_WIDTH = 0.65;
/** Inside this distance from the centreline the ground is soft, wet bank. */
export const STREAM_BANK = 2.0;
/** Playable radius around the origin. Trees thin out to a wall beyond it. */
export const WORLD_RADIUS = 46;

export function streamDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [ax, az] = STREAM[i];
    const [bx, bz] = STREAM[i + 1];
    const abx = bx - ax;
    const abz = bz - az;
    const t = Math.max(
      0,
      Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)),
    );
    const dx = x - (ax + abx * t);
    const dz = z - (az + abz * t);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

/**
 * Gentle ground undulation (a few cm), flattened in clearings and along the
 * stream so building and water stay level. Shared by the ground mesh and
 * anything that sits on it.
 */
export function groundHeight(x: number, z: number): number {
  const h = (valueNoise(x * 0.18, z * 0.18) - 0.5) * 0.16 + (valueNoise(x * 0.6 + 21, z * 0.6) - 0.5) * 0.04;
  let flat = clamp((streamDistance(x, z) - 1.5) / 3, 0, 1);
  for (const l of LANDMARKS) flat = Math.min(flat, clamp((Math.hypot(x - l.x, z - l.z) - l.clear) / 3, 0, 1));
  return h * flat;
}

export const inClearing = (x: number, z: number, pad = 0): boolean =>
  LANDMARKS.some((l) => Math.hypot(x - l.x, z - l.z) < l.clear + pad);

// ---------------------------------------------------------------- trees

export interface Tree {
  x: number;
  z: number;
  scale: number;
  rotY: number;
  /** Index into the canopy palette. */
  tint: number;
  /** 0 = pine, 1 = broadleaf, 2 = dead snag. */
  kind: 0 | 1 | 2;
  /** Height multiplier on top of `scale` (young trees are short, old ones tall). */
  height: number;
  /** Trunk width multiplier. */
  girth: number;
  /** Tilt away from vertical (rad) and its compass direction. */
  lean: number;
  leanDir: number;
}

const TREE_SEED = 11;
/** Dense forest, but all trees are two instanced draw calls (see forest.scene-asset). */
const TREE_TARGET = 900;
const TREE_SPACING = 1.6;

function generateTrees(): Tree[] {
  const rng = mulberry32(TREE_SEED);
  const trees: Tree[] = [];
  const grid = new SpatialGrid<Tree>(4);
  let tries = 0;
  while (trees.length < TREE_TARGET && tries++ < 60000) {
    const a = rng() * Math.PI * 2;
    const r = 7 + Math.sqrt(rng()) * (WORLD_RADIUS + 8 - 7);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inClearing(x, z, 1.2) || streamDistance(x, z) < STREAM_BANK + 0.4) {
      continue;
    }
    if (grid.nearest(x, z, TREE_SPACING) !== null) continue;
    // Clustered stands and gaps instead of uniform spacing.
    if (rng() > 0.2 + valueNoise(x * 0.07 + 13, z * 0.07 - 4) * 1.1) continue;
    const tree: Tree = {
      x,
      z,
      scale: 0.8 + rng() * 0.9,
      rotY: rng() * Math.PI * 2,
      tint: Math.floor(rng() * 4),
      kind: 0,
      height: 1,
      girth: 1,
      lean: 0,
      leanDir: rng() * Math.PI * 2,
    };
    // Broadleaf trees favour the damper ground near the stream; ~8% are dead snags.
    const roll = rng();
    const wet = streamDistance(x, z) < 14;
    tree.kind = roll < 0.08 ? 2 : roll < (wet ? 0.5 : 0.3) ? 1 : 0;
    const age = rng();
    if (age < 0.22) {
      // Young: short and slim.
      tree.scale *= 0.55;
      tree.height = 0.9 + rng() * 0.3;
    } else if (age > 0.85) {
      // Old giant: tall and thick.
      tree.scale *= 1.25;
      tree.height = 1.15 + rng() * 0.35;
      tree.girth = 1.3;
    } else {
      tree.height = 0.85 + rng() * 0.5;
      tree.girth = 0.85 + rng() * 0.35;
    }
    tree.lean = tree.kind === 2 ? rng() * 0.3 : rng() < 0.18 ? 0.08 + rng() * 0.16 : rng() * 0.04;
    trees.push(tree);
    grid.insert(x, z, tree);
  }
  return trees;
}

export const TREES: Tree[] = generateTrees();

const TREE_GRID = new SpatialGrid<Tree>(4);
for (const t of TREES) TREE_GRID.insert(t.x, t.z, t);

/** Distance to the nearest tree trunk, capped at `maxRange`. */
export function nearestTreeDistance(x: number, z: number, maxRange = 6): number {
  const t = TREE_GRID.nearest(x, z, maxRange);
  return t ? Math.hypot(t.x - x, t.z - z) : maxRange;
}

// ------------------------------------------- boulders and fallen trunks
// Shared by the scene (rendering) and collision, so both agree on placement.

export interface Boulder {
  x: number;
  z: number;
  /** Instance scale; the rendered dodecahedron has radius ≈ size. */
  size: number;
  rotY: number;
}

export interface FallenTrunk {
  x: number;
  z: number;
  /** Direction of the trunk's long axis (rad about Y). */
  rotY: number;
  length: number;
  /** Thickness multiplier (base radius 0.2 m). */
  thick: number;
}

function generateBoulders(): Boulder[] {
  const rng = mulberry32(32);
  const out: Boulder[] = [];
  for (let tries = 0; out.length < 45 && tries < 2000; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 8 + rng() * WORLD_RADIUS;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inClearing(x, z, 0.5) || streamDistance(x, z) < 1.8) continue;
    // Large only: anything hand-sized must be a gatherable stone instead.
    out.push({ x, z, size: range(rng, 0.45, 0.95), rotY: rng() * 6 });
  }
  return out;
}

function generateTrunks(): FallenTrunk[] {
  const rng = mulberry32(33);
  const out: FallenTrunk[] = [];
  for (let tries = 0; out.length < 40 && tries < 3000; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 7 + rng() * (WORLD_RADIUS - 4);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inClearing(x, z, 1) || streamDistance(x, z) < 2.4 || nearestTreeDistance(x, z, 2) < 1.2) continue;
    out.push({ x, z, length: range(rng, 2, 4.5), thick: range(rng, 0.8, 1.5), rotY: rng() * 6 });
  }
  return out;
}

export const BOULDERS: Boulder[] = generateBoulders();
export const FALLEN_TRUNKS: FallenTrunk[] = generateTrunks();

// ------------------------------------------------- gatherable resources

export interface ResourceSpot {
  /** Stable id, used by the event log and save data. */
  id: string;
  itemId: ItemId;
  x: number;
  z: number;
  /** How many you can take before it is used up. */
  charges: number;
  /** Seconds until a used-up spot grows back; 0 = never. */
  regrow: number;
  /** The only description shown until you have gathered one. */
  label: string;
  /** Looks like this: drives which mesh the scene builds. */
  look: ResourceLook;
  rotY: number;
  /** Id of the habitat cluster this spot belongs to (resource-overhaul), if any. */
  cluster?: string;
}

export type ResourceLook =
  | 'grass'
  | 'fibrePlant'
  | 'twigPile'
  | 'fallenLog'
  | 'sapling'
  | 'mossRock'
  | 'straightStick'
  | 'board'
  | 'clayPatch'
  | 'sandBar'
  | 'gravelBed'
  | 'cloth'
  | 'lens'
  | 'stone'
  | 'wetStone'
  | 'slab'
  | 'forkedStick'
  | 'diggingStick'
  | 'cane'
  | 'dryBranch'
  | 'leafLitter'
  | 'vine'
  | 'bark'
  | 'stoneDark'
  | 'stonePale'
  | 'pole';

const LABELS: Record<ResourceLook, string> = {
  grass: 'Tall, pale grass that crackles when touched',
  fibrePlant: 'A tall plant with long, stringy stems',
  twigPile: 'Grey, fallen sticks',
  fallenLog: 'A fallen, long-dead trunk',
  sapling: 'A young, living sapling',
  mossRock: 'A shaded rock furred with soft green moss',
  straightStick: 'A perfectly straight, dry stick',
  board: 'A flat slab of wood split off by lightning',
  clayPatch: 'Sticky, reddish earth at the water’s edge',
  sandBar: 'A bar of fine, pale grains',
  gravelBed: 'Rounded little stones',
  cloth: 'Scraps of old woven fabric',
  lens: 'Something glinting in the rubble',
  stone: 'A sun-warmed, fist-sized stone',
  wetStone: 'A smooth stone, cold and dark from the stream',
  slab: 'A flat slab of stone',
  forkedStick: 'A sturdy stick that splits into a Y',
  diggingStick: 'A thick stick, hard and pointed at one end',
  cane: 'Tall, jointed stems by the water',
  dryBranch: 'A long, brittle branch fallen from a dead tree',
  leafLitter: 'A drift of crisp, brown leaves',
  vine: 'A tough, trailing vine hanging from the trees',
  bark: 'A curl of bark peeling from a dead trunk',
  stoneDark: 'Flint: a dark, glassy stone that breaks into sharp flakes',
  stonePale: 'A pale, chalky stone with a flat face',
  pole: 'A long, straight, dry pole: a dead sapling',
};

const LOOK_ITEM: Record<ResourceLook, ItemId> = {
  grass: 'dryGrass',
  fibrePlant: 'fibers',
  twigPile: 'twigs',
  fallenLog: 'logs',
  sapling: 'greenBranch',
  mossRock: 'dampMoss',
  straightStick: 'spindle',
  board: 'board',
  clayPatch: 'clay',
  sandBar: 'sand',
  gravelBed: 'gravel',
  cloth: 'cloth',
  lens: 'lens',
  stone: 'dryStone',
  wetStone: 'wetStone',
  slab: 'slab',
  forkedStick: 'forkedStick',
  diggingStick: 'diggingStick',
  cane: 'cane',
  dryBranch: 'dryBranch',
  leafLitter: 'leafLitter',
  vine: 'vine',
  bark: 'bark',
  // The dark, glassy stones are the flint you knap (they used to give plain stone, so flint was nowhere).
  stoneDark: 'flint',
  stonePale: 'dryStone',
  pole: 'pole',
};

const LOOK_CHARGES: Partial<Record<ResourceLook, [number, number]>> = {
  // [charges, regrow seconds]
  grass: [1, 45],
  fibrePlant: [2, 45],
  twigPile: [2, 50],
  fallenLog: [3, 60],
  sapling: [2, 60],
  mossRock: [2, 40],
  straightStick: [1, 60],
  board: [1, 70],
  // Clay and sand are finite beds, big and slow to come back; gravel is the stream's own and returns.
  clayPatch: [6, 1800],
  sandBar: [6, 900],
  gravelBed: [4, 300],
  cloth: [2, 90],
  lens: [1, 0],
  // Stones come back very slowly (frost and the stream expose new ones); flint slower still.
  stone: [1, 1500],
  wetStone: [1, 1200],
  slab: [1, 0],
  forkedStick: [1, 90],
  diggingStick: [1, 0],
  cane: [2, 60],
  dryBranch: [2, 80],
  leafLitter: [2, 40],
  vine: [2, 70],
  bark: [2, 90],
  stoneDark: [1, 3000],
  stonePale: [1, 1500],
  pole: [1, 120],
};

/** Where a scatter rule may place spots. */
export type ScatterZone = 'forest' | 'stream';

export interface ScatterRule {
  look: ResourceLook;
  count: number;
  zone: ScatterZone;
  /** Forest: distance from the origin. Stream: distance from the water's centreline. */
  minR: number;
  maxR: number;
  /** Min distance to a tree trunk (default 0.7). */
  treeClear?: number;
  /** Min distance to any other resource spot (default 1.2). */
  spacing?: number;
}

/** Ground clutter to scatter through the playable area. Data only: add rows freely. */
export const SCATTER_RULES: ScatterRule[] = [
  { look: 'twigPile', count: 60, zone: 'forest', minR: 6, maxR: 44 },
  { look: 'dryBranch', count: 50, zone: 'forest', minR: 6, maxR: 44 },
  { look: 'leafLitter', count: 70, zone: 'forest', minR: 5, maxR: 44, spacing: 1 },
  { look: 'bark', count: 28, zone: 'forest', minR: 8, maxR: 44, treeClear: 0.9 },
  { look: 'vine', count: 18, zone: 'forest', minR: 9, maxR: 44, treeClear: 0.9 },
  { look: 'fibrePlant', count: 14, zone: 'forest', minR: 8, maxR: 42 },
  { look: 'stone', count: 30, zone: 'forest', minR: 6, maxR: 44 },
  { look: 'stoneDark', count: 14, zone: 'forest', minR: 8, maxR: 44 },
  { look: 'stonePale', count: 10, zone: 'forest', minR: 8, maxR: 44 },
  { look: 'slab', count: 6, zone: 'forest', minR: 12, maxR: 44 },
  { look: 'grass', count: 10, zone: 'forest', minR: 8, maxR: 40 },
  { look: 'mossRock', count: 8, zone: 'forest', minR: 8, maxR: 42 },
  { look: 'clayPatch', count: 5, zone: 'stream', minR: 0.9, maxR: 1.6 },
  { look: 'wetStone', count: 30, zone: 'stream', minR: 0.8, maxR: 1.5 },
  { look: 'gravelBed', count: 10, zone: 'stream', minR: 0.9, maxR: 1.7 },
  { look: 'sandBar', count: 3, zone: 'stream', minR: 0.9, maxR: 1.5 },
  { look: 'cane', count: 5, zone: 'stream', minR: 1.1, maxR: 2.2 },
  // Last, so the random layout of everything above stays exactly where it was.
  // A few flint nodules close to where you wake, for the first sharp stone.
  { look: 'stoneDark', count: 3, zone: 'forest', minR: 3, maxR: 7 },
  // Chapter 2: long straight poles for the shelter frame, scattered through the forest (appended last).
  { look: 'pole', count: 12, zone: 'forest', minR: 7, maxR: 40, treeClear: 0.9 },
];

function scatterPoint(rule: ScatterRule, rng: () => number): [number, number] | null {
  if (rule.zone === 'forest') {
    const a = rng() * Math.PI * 2;
    const r = range(rng, rule.minR, rule.maxR);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    return streamDistance(x, z) > STREAM_BANK + 0.3 ? [x, z] : null;
  }
  // Stream: pick a point along the centreline, step sideways.
  const i = Math.floor(rng() * (STREAM.length - 1));
  const t = rng();
  const [ax, az] = STREAM[i];
  const [bx, bz] = STREAM[i + 1];
  const len = Math.hypot(bx - ax, bz - az) || 1;
  const off = range(rng, rule.minR, rule.maxR) * (rng() < 0.5 ? -1 : 1);
  const x = ax + (bx - ax) * t - ((bz - az) / len) * off;
  const z = az + (bz - az) * t + ((bx - ax) / len) * off;
  return Math.hypot(x, z) < WORLD_RADIUS - 2 ? [x, z] : null;
}

function generateResources(): ResourceSpot[] {
  const rng = mulberry32(23);
  const spots: ResourceSpot[] = [];
  const counts: Partial<Record<ResourceLook, number>> = {};
  const add = (look: ResourceLook, x: number, z: number, cluster?: string): void => {
    const n = (counts[look] = (counts[look] ?? 0) + 1);
    const [charges, regrow] = LOOK_CHARGES[look] ?? [1, 0];
    spots.push({
      ...(cluster ? { cluster } : {}),
      id: `${look}-${n}`,
      itemId: LOOK_ITEM[look],
      x,
      z,
      charges,
      regrow,
      label: LABELS[look],
      look,
      rotY: rng() * Math.PI * 2,
    });
  };
  const around = (l: Landmark, r0: number, r1: number): [number, number] => {
    const a = rng() * Math.PI * 2;
    const r = range(rng, r0, r1);
    return [l.x + Math.cos(a) * r, l.z + Math.sin(a) * r];
  };
  const L = LANDMARK_BY_ID;

  // Waking Clearing: almost nothing, on purpose. A couple of stones so the
  // first blueprint (a fire pit) is reachable within the first minutes, and
  // wet stones in the stream bed as the tempting, wrong choice.
  add('stone', -2.2, -2.6);
  add('stone', 2.1, -3.4);
  add('wetStone', 3.5, -1.2);
  add('wetStone', 3.6, 1.4);
  add('wetStone', 3.4, -4.6);
  add('twigPile', -3.2, 1.8);

  // Sunny Meadow: dry grass, fibre plants, saplings at the edge, dry stones.
  for (let i = 0; i < 8; i++) add('grass', ...around(L.meadow, 0.5, 5));
  for (let i = 0; i < 4; i++) add('fibrePlant', ...around(L.meadow, 3.5, 6.5));
  for (let i = 0; i < 2; i++) add('sapling', ...around(L.meadow, 6.8, 7.6));
  for (let i = 0; i < 3; i++) add('stone', ...around(L.meadow, 1, 5));

  // Lightning Glade: a shattered tree, split boards, a straight stick, twigs,
  // a fallen trunk, forked sticks and a digging stick.
  add('straightStick', L.glade.x + 0.35, L.glade.z + 0.9);
  add('board', L.glade.x + 1.6, L.glade.z + 1.2);
  add('board', L.glade.x - 1.4, L.glade.z + 1.7);
  add('fallenLog', L.glade.x + 2.4, L.glade.z - 1.4);
  for (let i = 0; i < 3; i++) add('twigPile', ...around(L.glade, 2, 4.5));
  for (let i = 0; i < 2; i++) add('grass', ...around(L.glade, 2.5, 4.5));
  for (let i = 0; i < 3; i++) add('forkedStick', ...around(L.glade, 2, 4.5));
  add('diggingStick', L.glade.x - 2.2, L.glade.z - 0.8);

  // Clay Bend: clay, sand, gravel, a mossy rock, canes along the water.
  add('clayPatch', L.bend.x + 0.3, L.bend.z + 0.6);
  add('sandBar', L.bend.x + 0.9, L.bend.z - 1.6);
  add('gravelBed', L.bend.x - 0.5, L.bend.z + 2.0);
  add('mossRock', L.bend.x - 1.6, L.bend.z - 1.0);
  for (let i = 0; i < 2; i++) add('cane', ...around(L.bend, 2.2, 3.6));
  for (let i = 0; i < 2; i++) add('wetStone', ...around(L.bend, 1, 2.5));

  // The Ruins: one-of-a-kind finds among the rubble.
  add('cloth', L.ruins.x + 1.2, L.ruins.z + 0.8);
  add('lens', L.ruins.x - 1.3, L.ruins.z + 0.2);
  add('slab', L.ruins.x + 2.4, L.ruins.z + 2.4);

  // Split Rock: dry stones and stone slabs on a sunny ridge.
  add('slab', L.splitRock.x + 2.3, L.splitRock.z - 0.8);
  add('slab', L.splitRock.x - 2.4, L.splitRock.z + 1.0);
  for (let i = 0; i < 5; i++) add('stone', ...around(L.splitRock, 2.2, 4.2));

  // Scattered through the forest.
  const forestSpot = (minR: number, maxR: number): [number, number] => {
    for (let i = 0; i < 200; i++) {
      const a = rng() * Math.PI * 2;
      const r = range(rng, minR, maxR);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (
        !inClearing(x, z, 1) &&
        streamDistance(x, z) > STREAM_BANK + 0.5 &&
        nearestTreeDistance(x, z) > 0.9
      ) {
        return [x, z];
      }
    }
    return [14, 0];
  };
  for (let i = 0; i < 12; i++) add('twigPile', ...forestSpot(8, 40));
  for (let i = 0; i < 4; i++) add('fallenLog', ...forestSpot(9, 36));
  for (let i = 0; i < 4; i++) add('stone', ...forestSpot(8, 38));
  for (const [x, z] of [
    [3.2, 14],
    [6.6, 24],
    [3.6, -7],
    [6.6, -14],
  ] as const) {
    add('mossRock', x, z);
  }
  for (const [x, z] of [
    [6.4, 18],
    [2.9, 30],
  ] as const) {
    add('fibrePlant', x, z);
  }
  add('sapling', 6.6, 7);
  add('sapling', -9, -13);

  // Rule-driven scatter (own RNG, appended last so the hand-placed spots
  // above keep their ids). Extend SCATTER_RULES to add more of anything.
  const srng = mulberry32(101);
  const sgrid = new SpatialGrid<ResourceSpot>(3);
  for (const sp of spots) sgrid.insert(sp.x, sp.z, sp);
  for (const rule of SCATTER_RULES) {
    for (let placed = 0, tries = 0; placed < rule.count && tries < rule.count * 60; tries++) {
      const pt = scatterPoint(rule, srng);
      if (!pt) continue;
      const [x, z] = pt;
      if (inClearing(x, z, rule.zone === 'stream' ? 0 : 1)) continue;
      if (nearestTreeDistance(x, z) < (rule.treeClear ?? 0.7)) continue;
      if (sgrid.nearest(x, z, rule.spacing ?? 1.2)) continue;
      add(rule.look, x, z);
      sgrid.insert(x, z, spots[spots.length - 1]);
      placed++;
    }
  }
  // Habitat clusters (resource overhaul), appended after everything else so older ids never move.
  CLUSTERS.length = 0;
  generateClusters(add, spots, sgrid, CLUSTERS);
  return spots;
}

// ------------------------------------------------- habitat clusters

export type ClusterKind = 'rocky' | 'fallen' | 'stream';

export interface ResourceCluster {
  id: string;
  kind: ClusterKind;
  x: number;
  z: number;
  /** Radius that contains every spot of the cluster (debug rings, tests). */
  r: number;
  /** Count of spots per look. */
  counts: Partial<Record<ResourceLook, number>>;
}

/** Filled by generateResources (the same seeded layout every run). */
export const CLUSTERS: ResourceCluster[] = [];

type AddFn = (look: ResourceLook, x: number, z: number, cluster?: string) => void;

/**
 * Natural groupings on top of the single scattered spots: loose stone and flint deposits beside rock
 * outcrops and on the stream bank, sticks and bark lying round fallen trunks, and clay/sand/gravel beds
 * along the water. Seeded and irregular (no grid): each piece is a random polar offset from the cluster
 * centre, thinned by a minimum spacing, so no two deposits are alike.
 */
function generateClusters(add: AddFn, spots: ResourceSpot[], grid: SpatialGrid<ResourceSpot>, out: ResourceCluster[]): void {
  const rng = mulberry32(202);
  const taken = (x: number, z: number, gap: number) => !!grid.nearest(x, z, gap);
  const place = (cl: ResourceCluster, look: ResourceLook, cx: number, cz: number, rMax: number, opts: { gap: number; stream?: boolean; treeClear?: number }): boolean => {
    for (let t = 0; t < 40; t++) {
      const a = rng() * Math.PI * 2;
      const r = 0.25 + Math.sqrt(rng()) * rMax;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (Math.hypot(x, z) > WORLD_RADIUS - 3 || inClearing(x, z, 0.5)) continue;
      const sd = streamDistance(x, z);
      if (opts.stream ? sd < 0.9 || sd > STREAM_BANK + 0.9 : sd < STREAM_BANK + 0.2) continue;
      if (nearestTreeDistance(x, z, 2) < (opts.treeClear ?? 0.5)) continue;
      if (BOULDERS.some((b) => Math.hypot(b.x - x, b.z - z) < b.size + 0.35)) continue;
      if (FALLEN_TRUNKS.some((f) => onTrunk(f, x, z))) continue;
      if (taken(x, z, opts.gap)) continue;
      const before = spots.length;
      add(look, x, z, cl.id);
      grid.insert(x, z, spots[before]);
      cl.counts[look] = (cl.counts[look] ?? 0) + 1;
      cl.r = Math.max(cl.r, Math.hypot(x - cl.x, z - cl.z));
      return true;
    }
    return false;
  };
  const far = (x: number, z: number, others: ResourceCluster[], d: number) => others.every((c) => Math.hypot(c.x - x, c.z - z) > d);

  // 1. Rocky deposits: 8-15 stones and 3-6 flint beside rock outcrops. One of them sits 12-20 m from the start.
  const rocky: ResourceCluster[] = [];
  const edge = WORLD_RADIUS - 8;
  const outcrops = BOULDERS.filter((b) => streamDistance(b.x, b.z) > 5 && Math.hypot(b.x, b.z) > 10 && Math.hypot(b.x, b.z) < edge && !inClearing(b.x, b.z, 2));
  const starters = outcrops.filter((b) => Math.hypot(b.x, b.z) < 20);
  const picks: Array<{ x: number; z: number }> = [];
  if (starters.length) picks.push(starters[Math.floor(rng() * starters.length)]);
  for (let t = 0; t < 400 && picks.length < 8 && outcrops.length; t++) {
    const b = outcrops[Math.floor(rng() * outcrops.length)];
    if (picks.every((c) => Math.hypot(c.x - b.x, c.z - b.z) > 13)) picks.push(b);
  }
  picks.forEach((b, i) => {
    const a = rng() * Math.PI * 2;
    const cx = b.x + Math.cos(a) * 2;
    const cz = b.z + Math.sin(a) * 2;
    const cl: ResourceCluster = { id: `rocky-${i + 1}`, kind: 'rocky', x: cx, z: cz, r: 0, counts: {} };
    const stones = 8 + Math.floor(rng() * 8);
    const flints = 3 + Math.floor(rng() * 4);
    const R = 1.5 + 0.09 * (stones + flints);
    for (let k = 0; k < stones; k++) place(cl, rng() < 0.7 ? 'stone' : 'stonePale', cx, cz, R, { gap: 0.45 });
    for (let k = 0; k < flints; k++) place(cl, 'stoneDark', cx, cz, R, { gap: 0.45 });
    out.push(cl);
    rocky.push(cl);
  });

  // 2. Fallen-tree clusters: sticks, branches, bark, vine and fibre lie round the trunk.
  const trunks = FALLEN_TRUNKS.filter((f) => streamDistance(f.x, f.z) > 4 && Math.hypot(f.x, f.z) > 8 && Math.hypot(f.x, f.z) < edge);
  const chosen: FallenTrunk[] = [];
  for (let t = 0; t < 400 && chosen.length < 16 && trunks.length; t++) {
    const f = trunks[Math.floor(rng() * trunks.length)];
    if (chosen.every((c) => Math.hypot(c.x - f.x, c.z - f.z) > 7)) chosen.push(f);
  }
  chosen.forEach((f, i) => {
    const cl: ResourceCluster = { id: `fallen-${i + 1}`, kind: 'fallen', x: f.x, z: f.z, r: 0, counts: {} };
    const R = f.length * 0.5 + 0.8;
    const mix: ResourceLook[] = [];
    for (let k = 0; k < 3 + Math.floor(rng() * 3); k++) mix.push('twigPile');
    for (let k = 0; k < 1 + Math.floor(rng() * 2); k++) mix.push('dryBranch');
    for (let k = 0; k < 1 + Math.floor(rng() * 2); k++) mix.push('bark');
    if (rng() < 0.6) mix.push('vine');
    if (rng() < 0.5) mix.push('fibrePlant');
    for (const look of mix) place(cl, look, f.x, f.z, R, { gap: 0.6 });
    out.push(cl);
  });

  // 3. Stream deposits: clay, sand, gravel and wet stones in beds along the water, and a few stones with flint on the bank.
  const beds: ResourceCluster[] = [];
  for (let t = 0; t < 300 && beds.length < 8; t++) {
    const i = Math.floor(rng() * (STREAM.length - 1));
    const u = rng();
    const [ax, az] = STREAM[i];
    const [bx, bz] = STREAM[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const off = range(rng, 1.1, 1.7) * (rng() < 0.5 ? -1 : 1);
    const x = ax + (bx - ax) * u - ((bz - az) / len) * off;
    const z = az + (bz - az) * u + ((bx - ax) / len) * off;
    if (Math.hypot(x, z) > WORLD_RADIUS - 4 || inClearing(x, z, 2) || !far(x, z, beds, 9)) continue;
    const cl: ResourceCluster = { id: `stream-${beds.length + 1}`, kind: 'stream', x, z, r: 0, counts: {} };
    const mix: ResourceLook[] = [];
    const n = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
    for (let k = 0; k < n(2, 3); k++) mix.push('clayPatch');
    for (let k = 0; k < n(1, 2); k++) mix.push('sandBar');
    for (let k = 0; k < n(2, 3); k++) mix.push('gravelBed');
    for (let k = 0; k < n(3, 5); k++) mix.push('wetStone');
    // Flint washes down with the stones: a couple on the bank of every other bed.
    if (beds.length % 2 === 0) for (let k = 0; k < n(2, 3); k++) mix.push('stoneDark');
    for (const look of mix) place(cl, look, x, z, 2.2, { gap: 0.55, stream: true, treeClear: 0.3 });
    out.push(cl);
    beds.push(cl);
  }
}

/** Is (x, z) on the body of a fallen trunk? */
function onTrunk(f: FallenTrunk, x: number, z: number): boolean {
  const dx = x - f.x;
  const dz = z - f.z;
  const c = Math.cos(f.rotY);
  const s = Math.sin(f.rotY);
  // The scene stretches the cylinder along local X, rotated about Y by rotY (three.js: x' = c*x + s*z, z' = -s*x + c*z).
  const along = dx * c - dz * s;
  const across = dx * s + dz * c;
  return Math.abs(along) < f.length * 0.5 + 0.2 && Math.abs(across) < 0.2 * f.thick + 0.25;
}

export const RESOURCES: ResourceSpot[] = generateResources();
