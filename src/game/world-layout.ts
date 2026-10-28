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
}

const TREE_SEED = 11;
/** Fewer trees than the prototype's 720: Quest's browser has a tight budget. */
const TREE_TARGET = 380;
const TREE_SPACING = 2.0;

function generateTrees(): Tree[] {
  const rng = mulberry32(TREE_SEED);
  const trees: Tree[] = [];
  const grid = new SpatialGrid<Tree>(4);
  let tries = 0;
  while (trees.length < TREE_TARGET && tries++ < 30000) {
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
    };
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
  | 'cane';

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
};

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
  return spots;
}

export const RESOURCES: ResourceSpot[] = generateResources();
