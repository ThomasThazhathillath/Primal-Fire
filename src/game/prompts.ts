// What to tell the player an item is good for. Data-driven: add an entry to
// ITEM_ACTIONS and the tooltip, bag prompt and tests pick it up.

import type { ItemId } from './items.js';
import { ITEMS } from './items.js';

/** One short instruction per item: what you DO with it. */
export const ITEM_ACTIONS: Partial<Record<ItemId, string>> = {
  twigs: 'Pick up - they burn fast: perfect kindling',
  logs: 'Pick up - chop with an axe for double wood',
  branch: 'Hold with both hands and snap it for twigs and a stick',
  dryBranch: 'Hold with both hands and snap it for twigs and a stick',
  dryGrass: 'Pick up - the best tinder for a spark',
  dampMoss: 'Pick up - damp, so it will smother an ember',
  fibers: 'Hold it, drag sideways to pull strands apart, then scroll the wheel to twist cord',
  vine: 'Hold it, drag sideways to pull strands apart, then scroll the wheel to twist cord',
  bark: 'Pick up - stringy inner bark twists into cord',
  leafLitter: 'Pick up - dry leaves make tinder or a bed',
  dryStone: 'Pick up - knock two stones together to make a sharp flake',
  wetStone: 'Pick up - never put stream stones in a fire',
  slab: 'Pick up (heavy) - a flat top for a workbench',
  flint: 'Pick up - strike it with a stone to make sharp flakes',
  clay: 'Pick up - shape it into a pot with sand',
  sand: 'Pick up - temper for clay, and a filter layer',
  gravel: 'Pick up - the coarse layer of a water filter',
  cane: 'Pick up - a hollow stem: filter spout or basket weave',
  greenBranch: 'Pick up - it bends: a bow, with cord',
  spindle: 'Pick up - a straight stick for tools and arrows',
  forkedStick: 'Pick up - three make a tripod for a filter',
  feather: 'Pick up - fletching for arrows',
  cloth: 'Pick up - a filter screen or shelter cover',
  charcoal: 'Pick up - burns hotter and cleans water',
};

export type HeldContext = ItemId | null;

const WOOD: ItemId[] = ['logs', 'branch', 'dryBranch', 'twigs'];
const SOFT: ItemId[] = ['fibers', 'vine', 'bark', 'dryGrass', 'cane', 'cloth'];

/**
 * The line to show when you aim at `item` while holding `held`:
 * an axe turns wood into "chop", a knife turns soft plants into "cut".
 */
export function gatherPrompt(item: ItemId, held: HeldContext, carrying: ReadonlySet<ItemId> | ((i: ItemId) => boolean)): string {
  const has = (i: ItemId) => (typeof carrying === 'function' ? carrying(i) : carrying.has(i));
  if ((held === 'axe' || has('axe')) && WOOD.includes(item)) return held === 'axe' ? 'Swing to chop: you get extra wood' : 'Gather - your axe gets you extra wood';
  if ((held === 'knife' || has('knife')) && SOFT.includes(item)) return 'Gather - your knife cuts cleanly for extra';
  if (held === 'hammer' && (item === 'dryStone' || item === 'flint')) return 'Gather - your hammer breaks off more';
  return ITEM_ACTIONS[item] ?? `Pick up the ${ITEMS[item].name.toLowerCase()}`;
}

/** Prompt for an item in the opened bag. */
export function bagPrompt(item: ItemId, nearStorage: boolean): string {
  return `${ITEMS[item].name}: click to hold - G drop - ${nearStorage ? 'F stash in storage' : 'F stash (no storage near)'}`;
}
