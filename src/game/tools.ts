// Tools bound by hand from stone + stick + cord, and what they are good for.
// Carrying a tool in the satchel gives a bonus when you gather the matching
// material; tools wear out. All data, so other sessions can add more.

import type { ItemId } from './items.js';

export interface ToolDef {
  id: ItemId;
  /** Gathering these items yields +1 while the tool is in your satchel. */
  bonus: ItemId[];
  /** Uses before it breaks. */
  uses: number;
  /** What using it teaches, for the toast. */
  verb: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'knife', bonus: ['fibers', 'dryGrass', 'cane', 'cloth'], uses: 25, verb: 'cut cleanly with your knife' },
  { id: 'axe', bonus: ['logs', 'twigs', 'branch'], uses: 20, verb: 'chopped extra with your axe' },
  { id: 'hammer', bonus: ['dryStone', 'wetStone', 'flint', 'gravel'], uses: 30, verb: 'broke off more with your hammer' },
  { id: 'diggingStick', bonus: ['clay', 'sand', 'gravel'], uses: 20, verb: 'dug extra with your digging stick' },
];

export interface HandRecipe {
  id: string;
  name: string;
  inputs: Partial<Record<ItemId, number>>;
  output: ItemId;
  observation?: string;
}

/** Bound in your hands: no workbench needed. */
export const HAND_RECIPES: HandRecipe[] = [
  { id: 'knife', name: 'Bind flint knife', inputs: { flake: 1, spindle: 1, cord: 1 }, output: 'knife' },
  { id: 'axe', name: 'Bind stone axe', inputs: { dryStone: 1, spindle: 1, cord: 2 }, output: 'axe' },
  { id: 'hammer', name: 'Bind stone hammer', inputs: { dryStone: 1, spindle: 1, cord: 1 }, output: 'hammer' },
  { id: 'pot', name: 'Shape clay pot', inputs: { clay: 2, sand: 1 }, output: 'pot' },
  { id: 'diggingStick', name: 'Sharpen digging stick', inputs: { spindle: 1, flake: 1 }, output: 'diggingStick' },
];

export const toolFor = (item: ItemId): ToolDef | undefined => TOOLS.find((t) => t.bonus.includes(item));
