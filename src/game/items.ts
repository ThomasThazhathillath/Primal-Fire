// Every material and tool in Chapter 1. Ported from the v3 prototype, plus the
// v4 building materials (stones, slabs, sticks and canes; see docs/DESIGN.md).

export type ItemId =
  | 'dryGrass'
  | 'dampMoss'
  | 'twigs'
  | 'logs'
  | 'fibers'
  | 'cord'
  | 'spindle'
  | 'board'
  | 'greenBranch'
  | 'clay'
  | 'gravel'
  | 'sand'
  | 'cloth'
  | 'charcoal'
  | 'pot'
  | 'lens'
  | 'ember'
  | 'torch'
  | 'dryStone'
  | 'wetStone'
  | 'slab'
  | 'diggingStick'
  | 'forkedStick'
  | 'cane'
  | 'bowDrill';

export type ItemCategory =
  | 'tinder'
  | 'fuel'
  | 'craft'
  | 'clay'
  | 'filter'
  | 'pot'
  | 'lens'
  | 'ember'
  | 'torch'
  | 'stone'
  | 'tool';

export interface ItemDef {
  name: string;
  cats: ItemCategory[];
  /** sRGB hex, used for satchel chips and simple item meshes. */
  color: number;
  /** Notebook entry unlocked the first time this item is gathered. */
  firstObservation?: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  dryGrass: { name: 'Dry grass', cats: ['tinder'], color: 0xd9c27a },
  dampMoss: {
    name: 'Damp moss',
    cats: ['tinder'],
    color: 0x47703a,
    firstObservation: 'g_moss',
  },
  twigs: {
    name: 'Twigs',
    cats: ['fuel'],
    color: 0x8a6a45,
    firstObservation: 'g_dead',
  },
  logs: {
    name: 'Log',
    cats: ['fuel'],
    color: 0x6b4a2b,
    firstObservation: 'g_dead',
  },
  fibers: { name: 'Plant fibres', cats: ['craft'], color: 0x7a9a42 },
  cord: { name: 'Cord', cats: ['craft'], color: 0xc9b48a },
  spindle: { name: 'Straight stick', cats: ['craft'], color: 0xc49a66 },
  board: { name: 'Flat board', cats: ['craft'], color: 0x9a7650 },
  greenBranch: {
    name: 'Flexible branch',
    cats: ['craft'],
    color: 0x6a8a3a,
    firstObservation: 'g_green',
  },
  clay: {
    name: 'Clay',
    cats: ['clay'],
    color: 0xb06a45,
    firstObservation: 'g_clay',
  },
  gravel: { name: 'Gravel', cats: ['filter'], color: 0x8c8c8c },
  sand: { name: 'Sand', cats: ['filter'], color: 0xe0cf9a },
  cloth: { name: 'Cloth', cats: ['filter'], color: 0xe8e2d0 },
  charcoal: { name: 'Charcoal', cats: ['filter', 'fuel'], color: 0x1d1d1f },
  pot: { name: 'Clay pot', cats: ['pot'], color: 0xa4552f },
  lens: { name: 'Lens', cats: ['lens'], color: 0xb8a070 },
  ember: { name: 'Ember', cats: ['ember'], color: 0xff6a1a },
  torch: { name: 'Burning stick', cats: ['torch'], color: 0x6b4a2b },
  dryStone: { name: 'Dry stone', cats: ['stone'], color: 0xa39a8a },
  wetStone: { name: 'Wet stone', cats: ['stone'], color: 0x5f6a6e },
  slab: { name: 'Flat stone slab', cats: ['stone'], color: 0x8d8780 },
  diggingStick: { name: 'Digging stick', cats: ['tool'], color: 0x7d5f3e },
  forkedStick: { name: 'Forked stick', cats: ['craft'], color: 0x8a6a45 },
  cane: {
    name: 'Hollow cane',
    cats: ['craft'],
    color: 0x9fae5a,
    firstObservation: 'g_hollow',
  },
  bowDrill: { name: 'Bow drill', cats: ['tool'], color: 0xc49a66 },
};

/** Display order in the satchel. */
export const SATCHEL_ORDER: ItemId[] = [
  'dryGrass',
  'dampMoss',
  'twigs',
  'logs',
  'fibers',
  'cord',
  'spindle',
  'board',
  'greenBranch',
  'bowDrill',
  'dryStone',
  'wetStone',
  'slab',
  'diggingStick',
  'forkedStick',
  'cane',
  'clay',
  'gravel',
  'sand',
  'cloth',
  'charcoal',
  'pot',
  'lens',
];

export const itemName = (id: ItemId): string => ITEMS[id].name;
