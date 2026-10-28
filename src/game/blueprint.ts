// Snap-to-blueprint building (docs/DESIGN.md → "How building works"):
//   1. hold a structure's key part over open ground → a ghost outline appears;
//   2. release it to place the outline;
//   3. fill every glowing snap spot to finish the structure.
// Definitions and placement rules are plain data so they can be unit-tested.

import type { ItemId } from './items.js';
import {
  nearestTreeDistance,
  STREAM_BANK,
  streamDistance,
  WORLD_RADIUS,
} from './world-layout.js';

export type StructureKind = 'firePit' | 'workbench';

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
    keyAccepts: ['slab'],
    key: { x: 0, y: 0.36, z: 0 },
    spots: [0, 1, 2].map((i) => ({
      ...ring(i, 3, 0.26),
      y: 0.1,
      accepts: STONES,
      label: 'Stone leg',
    })),
    radius: 0.6,
    xp: 30,
    completeObservation: 'b_tripod',
    groundAdvice: 'Any open, dry ground near where you plan to make fire.',
  },
};

/** The kinds a held item could start, in priority order. */
export function blueprintsForKeyItem(item: ItemId): BlueprintDef[] {
  return Object.values(BLUEPRINTS).filter((b) => b.keyAccepts.includes(item));
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
}

export type PlacementResult =
  | { ok: true }
  | { ok: false; reason: 'bounds' | 'bank' | 'trees' | 'structure'; message: string };

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
