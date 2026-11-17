// Hint = Find (Quest test 2026-11-17): the Hint button opens a list of every item you can gather; choosing one puts a
// sky beacon on every spot of it on the map (systems/beacon-system.ts). Pure: which items the list offers, in what
// order, and which spots get a beacon.

import { type ItemId, itemName } from './items.js';

/** Buttons on the Find card (hint.uikitml find-0 .. find-27). */
export const FIND_SLOTS = 28;
/** Most beacons drawn at once (nearest first). */
export const MAX_BEACONS = 64;

/** Every item some resource spot offers, once each, by name. */
export function findableItems(spots: ReadonlyArray<{ itemId: ItemId }>): ItemId[] {
  const seen = new Set<ItemId>();
  for (const s of spots) seen.add(s.itemId);
  return [...seen].sort((a, b) => itemName(a).localeCompare(itemName(b)));
}

/** The card's order: what the current step needs first (in its own order), then everything else by name. */
export function findOrder(items: readonly ItemId[], needed: readonly ItemId[]): { item: ItemId; needed: boolean }[] {
  const want = needed.filter((i, k) => items.includes(i) && needed.indexOf(i) === k);
  const rest = items.filter((i) => !want.includes(i));
  return [...want.map((item) => ({ item, needed: true })), ...rest.map((item) => ({ item, needed: false }))].slice(0, FIND_SLOTS);
}

/** The nearest `max` points to (x, z), nearest first (beacons beyond the cap are the far ones). */
export function nearestFirst<T extends { x: number; z: number }>(points: readonly T[], x: number, z: number, max = MAX_BEACONS): T[] {
  return points
    .map((p) => ({ p, d: (p.x - x) ** 2 + (p.z - z) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((e) => e.p);
}
