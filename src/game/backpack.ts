// Backpack: every item has a weight (ITEMS[id].weight) and your pack has a
// limited number of pockets and a comfortable load. Heavier loads slow you
// and, past the comfort line, stop you running. Pack upgrades are data, so
// other systems can add more.

import { carryRules, ITEMS, type ItemId } from './items.js';

export interface PackUpgrade {
  id: string;
  name: string;
  inputs: Partial<Record<ItemId, number>>;
  /** Extra pockets (item count) and comfortable load (kg). */
  pockets: number;
  load: number;
  /** Notebook entry, if any. */
  observation?: string;
}

export const BASE_POCKETS = 20;
export const BASE_LOAD = 12;

export const PACK_UPGRADES: PackUpgrade[] = [
  { id: 'sling', name: 'Fibre sling', inputs: { cord: 2, fibers: 4 }, pockets: 10, load: 4 },
  { id: 'basket', name: 'Woven basket', inputs: { cane: 3, cord: 2 }, pockets: 16, load: 6 },
  { id: 'hideRoll', name: 'Cloth bedroll pack', inputs: { cloth: 3, cord: 3 }, pockets: 12, load: 8 },
];

export type Encumbrance = 'light' | 'loaded' | 'overloaded';

export interface MoveLimits {
  encumbrance: Encumbrance;
  /** Multiplier on walking speed. */
  speed: number;
  canRun: boolean;
}

export function itemsWeight(contents: Iterable<[ItemId, number]>): number {
  let w = 0;
  for (const [id, n] of contents) w += ITEMS[id].weight * n;
  return w;
}

export function itemsCount(contents: Iterable<[ItemId, number]>): number {
  let n = 0;
  for (const [, c] of contents) n += c;
  return n;
}

export function capacityFor(upgrades: Iterable<string>): { pockets: number; load: number } {
  if (carryRules.easy) return { pockets: Number.MAX_SAFE_INTEGER, load: Number.MAX_SAFE_INTEGER };
  let pockets = BASE_POCKETS;
  let load = BASE_LOAD;
  for (const id of upgrades) {
    const u = PACK_UPGRADES.find((x) => x.id === id);
    if (u) {
      pockets += u.pockets;
      load += u.load;
    }
  }
  return { pockets, load };
}

/** Light up to 75% of your load, loaded to 100%, then overloaded. */
export function moveLimits(weight: number, load: number): MoveLimits {
  const ratio = load > 0 ? weight / load : 1;
  if (ratio <= 0.75) return { encumbrance: 'light', speed: 1, canRun: true };
  if (ratio <= 1) return { encumbrance: 'loaded', speed: 0.85, canRun: false };
  return { encumbrance: 'overloaded', speed: Math.max(0.35, 0.7 - (ratio - 1) * 0.5), canRun: false };
}
