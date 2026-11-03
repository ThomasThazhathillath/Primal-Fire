// The forest's layout as plain data: hidden places, the stream, trees and
// gatherable resources. Both the scene assets (rendering) and the game rules
// (blueprint placement, hints) read it, so it must stay free of three.js.
//
// Coordinates are metres on the ground plane. North is −z, east is +x.
// The player wakes at the origin, in a small empty clearing by the stream.
// v4 has no pre-built camp: camp is wherever the player builds.

import type { ItemId } from './items.js';
import { mulberry32, range } from './rng.js';
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
    out.push({ x, z, size: range(rng, 0.2, 0.85), rotY: rng() * 6 });
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
  | 'stonePale';

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
  stoneDark: 'A heavy, dark stone, rough to the touch',
  stonePale: 'A pale, chalky stone with a flat face',
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
  stoneDark: 'dryStone',
  stonePale: 'dryStone',
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
  clayPatch: [4, 30],
  sandBar: [4, 30],
  gravelBed: [4, 30],
  cloth: [2, 90],
  lens: [1, 0],
  stone: [1, 0],
  wetStone: [1, 0],
  slab: [1, 0],
  forkedStick: [1, 90],
  diggingStick: [1, 0],
  cane: [2, 60],
  dryBranch: [2, 80],
  leafLitter: [2, 40],
  vine: [2, 70],
  bark: [2, 90],
  stoneDark: [1, 0],
  stonePale: [1, 0],
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
  { look: 'twigPile', count: 40, zone: 'forest', minR: 6, maxR: 44 },
  { look: 'dryBranch', count: 34, zone: 'forest', minR: 6, maxR: 44 },
  { look: 'leafLitter', count: 40, zone: 'forest', minR: 5, maxR: 44, spacing: 1 },
  { look: 'bark', count: 18, zone: 'forest', minR: 8, maxR: 44, treeClear: 0.9 },
  { look: 'vine', count: 18, zone: 'forest', minR: 9, maxR: 44, treeClear: 0.9 },
  { look: 'fibrePlant', count: 14, zone: 'forest', minR: 8, maxR: 42 },
  { look: 'stone', count: 14, zone: 'forest', minR: 6, maxR: 44 },
  { look: 'stoneDark', count: 14, zone: 'forest', minR: 8, maxR: 44 },
  { look: 'stonePale', count: 10, zone: 'forest', minR: 8, maxR: 44 },
  { look: 'slab', count: 6, zone: 'forest', minR: 12, maxR: 44 },
  { look: 'grass', count: 10, zone: 'forest', minR: 8, maxR: 40 },
  { look: 'mossRock', count: 8, zone: 'forest', minR: 8, maxR: 42 },
  { look: 'clayPatch', count: 5, zone: 'stream', minR: 0.9, maxR: 1.6 },
  { look: 'wetStone', count: 10, zone: 'stream', minR: 0.8, maxR: 1.5 },
  { look: 'gravelBed', count: 4, zone: 'stream', minR: 0.9, maxR: 1.7 },
  { look: 'sandBar', count: 3, zone: 'stream', minR: 0.9, maxR: 1.5 },
  { look: 'cane', count: 5, zone: 'stream', minR: 1.1, maxR: 2.2 },
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
  const add = (look: ResourceLook, x: number, z: number): void => {
    const n = (counts[look] = (counts[look] ?? 0) + 1);
    const [charges, regrow] = LOOK_CHARGES[look] ?? [1, 0];
    spots.push({
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
  return spots;
}

export const RESOURCES: ResourceSpot[] = generateResources();
