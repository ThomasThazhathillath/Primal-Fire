// Hand-action crafting: hold an item and do the motion. Each action is data
// (input item, motion, effort needed, outputs) so other systems can add more.
// The VR/browser input layer reports "effort" (metres of hand travel, or
// strikes); the game turns enough effort into the outputs.

import type { ItemId } from './items.js';

export type Motion = 'snap' | 'rub' | 'knap';

export interface ActionDef {
  id: string;
  name: string;
  motion: Motion;
  /** Item you hold; consumed when the work completes. */
  input: ItemId;
  /** Items that must also be in the satchel (kept, e.g. a hammerstone). */
  needs?: ItemId[];
  /** Effort to finish: metres of bend/rub travel, or number of strikes. */
  work: number;
  outputs: Partial<Record<ItemId, number>>;
  /** Short instruction for the player. */
  hint: string;
  observation?: string;
  /** Science event (src/game/science-events.ts) fired when finished. */
  science?: string;
}

export const ACTIONS: ActionDef[] = [
  {
    id: 'snapBranch',
    name: 'Snap the branch',
    motion: 'snap',
    input: 'branch',
    work: 0.5,
    outputs: { twigs: 3, spindle: 1 },
    hint: 'Hold it in both hands and bend it until it snaps.',
  },
  {
    id: 'rubCord',
    name: 'Twist cord',
    motion: 'rub',
    input: 'fibers',
    work: 2.5,
    outputs: { cord: 1 },
    hint: 'Rub the fibres against your thigh to twist them into string.',
    observation: 'g_cord',
    science: 'craft.cord',
  },
  {
    id: 'knapFlint',
    name: 'Knap a flake',
    motion: 'knap',
    input: 'flint',
    needs: ['dryStone'],
    work: 6,
    outputs: { flake: 2 },
    hint: 'Strike the flint with a stone, again and again, to chip off sharp flakes.',
    science: 'tool.knap.flake',
  },
];

export function actionFor(held: ItemId | null): ActionDef | null {
  return held ? (ACTIONS.find((a) => a.input === held) ?? null) : null;
}
