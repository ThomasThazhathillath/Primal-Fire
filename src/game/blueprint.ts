// Snap-to-blueprint building (docs/DESIGN.md → "How building works"):
//   1. hold a structure's key part over open ground → a ghost outline appears;
//   2. release it to place the outline;
//   3. fill every glowing snap spot to finish the structure.
// Definitions and placement rules are plain data so they can be unit-tested.

import type { ItemId } from './items.js';
import { SUPPORT_TOLERANCE } from './interact.js';
import {
  nearestTreeDistance,
  STREAM_BANK,
  streamDistance,
  WORLD_RADIUS,
} from './world-layout.js';

export type StructureKind = 'firePit' | 'workbench' | 'filter' | 'shelter' | 'storage';

export interface SnapSpotDef {
  /** Offset from the structure origin, in the structure's local frame. */
  x: number;
  y: number;
  z: number;
  accepts: ItemId[];
  label: string;
}

export interface BlueprintDef {
  kind: StructureKind;
  name: string;
  /** Items that start this blueprint when held over open ground. */
  keyAccepts: ItemId[];
  /** Where the key part sits once placed (local frame). */
  key: { x: number; y: number; z: number };
  spots: SnapSpotDef[];
  /** Footprint radius, for spacing from trees, water and other structures. */
  radius: number;
  xp: number;
  /** Notebook entry unlocked when the structure is finished. */
  completeObservation?: string;
  /** Third-level hint text when nothing is built yet. */
  groundAdvice: string;
  /**
   * The key part goes on LAST (a workbench slab on its supports): placing the
   * outline does not use it up, and the structure is finished by setting the
   * key part down and passing the push test.
   */
  keyLast?: boolean;
  /** How close (m) a released part must land to its spot to seat there. */
  spotTolerance?: number;
}

const STONES: ItemId[] = ['dryStone', 'wetStone'];
const ring = (i: number, n: number, r: number) => ({
  x: Math.cos((i / n) * Math.PI * 2) * r,
  z: Math.sin((i / n) * Math.PI * 2) * r,
});

export const BLUEPRINTS: Record<StructureKind, BlueprintDef> = {
  firePit: {
    kind: 'firePit',
    name: 'Fire pit',
    keyAccepts: STONES,
    key: { ...ring(0, 4, 0.38), y: 0.06 },
    spots: [1, 2, 3].map((i) => ({
      ...ring(i, 4, 0.38),
      y: 0.06,
      accepts: STONES,
      label: 'Stone for the ring',
    })),
    radius: 0.7,
    xp: 30,
    groundAdvice:
      'Open, flat ground with no trees overhead — near water, but not on the soft bank.',
  },
  workbench: {
    kind: 'workbench',
    name: 'Workbench',
    keyAccepts: ['slab', 'board'],
    key: { x: 0, y: 0.36, z: 0 },
    keyLast: true,
    spotTolerance: SUPPORT_TOLERANCE,
    spots: [0, 1, 2].map((i) => ({
      ...ring(i, 3, 0.26),
      y: 0.1,
      accepts: [...STONES, 'forkedStick'],
      label: 'Stone or forked-stick leg',
    })),
    radius: 0.6,
    xp: 30,
    completeObservation: 'b_tripod',
    groundAdvice: 'Any open, dry ground near where you plan to make fire.',
  },
  // Filter tripod: two more forked sticks complete the tripod, a hollow cane
  // is the spout, then layers go in bottom to top: cloth, charcoal, sand, gravel.
  filter: {
    kind: 'filter',
    name: 'Water filter',
    keyAccepts: ['forkedStick'],
    key: { ...ring(0, 3, 0.25), y: 0.45 },
    spots: [
      { ...ring(1, 3, 0.25), y: 0.45, accepts: ['forkedStick'], label: 'Forked stick leg' },
      { ...ring(2, 3, 0.25), y: 0.45, accepts: ['forkedStick'], label: 'Forked stick leg' },
      { x: 0, z: 0, y: 0.3, accepts: ['cane'], label: 'Hollow cane spout' },
      { x: 0, z: 0, y: 0.55, accepts: ['cloth'], label: 'Cloth screen' },
      { x: 0, z: 0, y: 0.62, accepts: ['charcoal'], label: 'Charcoal layer' },
      { x: 0, z: 0, y: 0.69, accepts: ['sand'], label: 'Sand layer' },
      { x: 0, z: 0, y: 0.76, accepts: ['gravel'], label: 'Gravel layer' },
    ],
    radius: 0.6,
    xp: 40,
    groundAdvice: 'Beside the stream on firm ground, so you can carry water to it.',
  },
  // Lean-to: a ridge branch, two more branches as ribs, twigs as thatch, cloth as the roof.
  shelter: {
    kind: 'shelter',
    name: 'Lean-to shelter',
    keyAccepts: ['branch'],
    key: { x: 0, y: 0.8, z: 0 },
    spots: [
      { x: -0.5, z: 0, y: 0.5, accepts: ['branch'], label: 'Rib branch' },
      { x: 0.5, z: 0, y: 0.5, accepts: ['branch'], label: 'Rib branch' },
      { x: 0, z: 0.3, y: 0.4, accepts: ['twigs'], label: 'Thatch twigs' },
      { x: 0, z: 0.45, y: 0.3, accepts: ['cloth', 'dryGrass'], label: 'Roof cover' },
    ],
    radius: 1.2,
    xp: 50,
    groundAdvice: 'Flat, dry ground away from the stream bank, near your fire.',
  },
  // Storage basket: a stash that stays at camp; see Game.stash / Game.withdraw.
  storage: {
    kind: 'storage',
    name: 'Storage basket',
    keyAccepts: ['cane'],
    key: { x: 0, y: 0.25, z: 0 },
    spots: [
      { x: 0.15, z: 0, y: 0.15, accepts: ['cane'], label: 'Weave cane' },
      { x: -0.15, z: 0, y: 0.15, accepts: ['cane'], label: 'Weave cane' },
      { x: 0, z: 0.15, y: 0.4, accepts: ['cord'], label: 'Bind with cord' },
    ],
    radius: 0.5,
    xp: 30,
    groundAdvice: 'Beside your fire and shelter.',
  },
};

export const STORAGE_SLOTS = 40;
/** Structures closer than this (m) to the fire pit count as your camp. */
export const CAMP_RADIUS = 14;

/** The kinds a held item could start, in priority order. */
export function blueprintsForKeyItem(item: ItemId, prefer?: StructureKind | null): BlueprintDef[] {
  const all = Object.values(BLUEPRINTS).filter((b) => b.keyAccepts.includes(item));
  // The structure the current objective builds comes first: a stone in hand must offer the workbench
  // (not the fire pit that shares the stone) while the player is building the workbench.
  return prefer ? [...all.filter((b) => b.kind === prefer), ...all.filter((b) => b.kind !== prefer)] : all;
}

export interface PlacedStructure {
  id: number;
  kind: StructureKind;
  x: number;
  z: number;
  rotY: number;
  key: ItemId;
  /** What fills each snap spot, in BLUEPRINTS[kind].spots order. */
  spots: Array<ItemId | null>;
  complete: boolean;
  /** keyLast structures: has the key part been set down yet? */
  keyPlaced?: boolean;
  /**
   * Placed from the build book: the key part (of a structure that is not keyLast)
   * is a slot like any other and still has to be filled. Absent in older saves.
   */
  keyOpen?: boolean;
  /** Where the key part actually landed (world), when placed by hand. */
  keyPos?: { x: number; z: number };
  /** Where each part actually landed (world), when placed by hand. */
  spotPos?: Array<{ x: number; z: number } | null>;
  /** Stored items (storage structures only). */
  store?: Partial<Record<ItemId, number>>;
  /** Finished at least once: rebuilding after taking it apart gives no second reward. */
  built?: boolean;
}

export type PlacementResult =
  | { ok: true }
  | { ok: false; reason: 'bounds' | 'bank' | 'trees' | 'structure' | 'unfinished'; message: string };

export function checkPlacement(
  kind: StructureKind,
  x: number,
  z: number,
  structures: readonly PlacedStructure[],
): PlacementResult {
  const def = BLUEPRINTS[kind];
  if (Math.hypot(x, z) > WORLD_RADIUS - 2) {
    return { ok: false, reason: 'bounds', message: 'The forest is too thick here to build.' };
  }
  if (streamDistance(x, z) < STREAM_BANK + def.radius * 0.5) {
    return {
      ok: false,
      reason: 'bank',
      message: 'The bank is soft and wet here — move back from the water.',
    };
  }
  if (nearestTreeDistance(x, z) < def.radius + 0.6) {
    return { ok: false, reason: 'trees', message: 'Too cramped between the trees.' };
  }
  for (const s of structures) {
    const gap = Math.hypot(s.x - x, s.z - z);
    if (gap < BLUEPRINTS[s.kind].radius + def.radius + 0.3) {
      return {
        ok: false,
        reason: 'structure',
        message: `Too close to your ${BLUEPRINTS[s.kind].name.toLowerCase()}.`,
      };
    }
  }
  return { ok: true };
}

/** World-space position of a snap spot (or the key part when `index` is -1). */
export function spotWorldPosition(
  s: Pick<PlacedStructure, 'kind' | 'x' | 'z' | 'rotY'>,
  index: number,
): { x: number; y: number; z: number } {
  const def = BLUEPRINTS[s.kind];
  const local = index < 0 ? def.key : def.spots[index];
  const c = Math.cos(s.rotY);
  const n = Math.sin(s.rotY);
  // Same convention as three.js: rotating about +Y by rotY.
  return {
    x: s.x + local.x * c + local.z * n,
    y: local.y,
    z: s.z - local.x * n + local.z * c,
  };
}

/** Default distance (m) a released part may land from its spot and still seat. */
export const DEFAULT_SPOT_TOLERANCE = 0.3;
