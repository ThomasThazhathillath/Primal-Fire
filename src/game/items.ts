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
  /** Carry weight in kg of one unit. */
  weight: number;
  /** Notebook entry unlocked the first time this item is gathered. */
  firstObservation?: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  dryGrass: { name: 'Dry grass', cats: ['tinder'], color: 0xd9c27a, weight: 0.1 },
  dampMoss: {
    name: 'Damp moss',
    cats: ['tinder'],
    color: 0x47703a,
    weight: 0.2,
    firstObservation: 'g_moss',
  },
  twigs: {
    name: 'Twigs',
    cats: ['fuel'],
    color: 0x8a6a45,
    weight: 0.3,
    firstObservation: 'g_dead',
  },
  logs: {
    name: 'Log',
    cats: ['fuel'],
    color: 0x6b4a2b,
    weight: 3,
    firstObservation: 'g_dead',
  },
  fibers: { name: 'Plant fibres', cats: ['craft'], color: 0x7a9a42, weight: 0.1 },
  cord: { name: 'Cord', cats: ['craft'], color: 0xc9b48a, weight: 0.1 },
  spindle: { name: 'Straight stick', cats: ['craft'], color: 0xc49a66, weight: 0.4 },
  board: { name: 'Flat board', cats: ['craft'], color: 0x9a7650, weight: 1.5 },
  greenBranch: {
    name: 'Flexible branch',
    cats: ['craft'],
    color: 0x6a8a3a,
    weight: 0.8,
    firstObservation: 'g_green',
  },
  clay: {
    name: 'Clay',
    cats: ['clay'],
    color: 0xb06a45,
    weight: 0.8,
    firstObservation: 'g_clay',
  },
  gravel: { name: 'Gravel', cats: ['filter'], color: 0x8c8c8c, weight: 0.6 },
  sand: { name: 'Sand', cats: ['filter'], color: 0xe0cf9a, weight: 0.6 },
  cloth: { name: 'Cloth', cats: ['filter'], color: 0xe8e2d0, weight: 0.1 },
  charcoal: { name: 'Charcoal', cats: ['filter', 'fuel'], color: 0x1d1d1f, weight: 0.3 },
  pot: { name: 'Clay pot', cats: ['pot'], color: 0xa4552f, weight: 1.2 },
  lens: { name: 'Lens', cats: ['lens'], color: 0xb8a070, weight: 0.1 },
  ember: { name: 'Ember', cats: ['ember'], color: 0xff6a1a, weight: 0 },
  torch: { name: 'Burning stick', cats: ['torch'], color: 0x6b4a2b, weight: 0.5 },
  dryStone: { name: 'Dry stone', cats: ['stone'], color: 0xa39a8a, weight: 1.5 },
  wetStone: { name: 'Wet stone', cats: ['stone'], color: 0x5f6a6e, weight: 1.8 },
  slab: { name: 'Flat stone slab', cats: ['stone'], color: 0x8d8780, weight: 6 },
  diggingStick: { name: 'Digging stick', cats: ['tool'], color: 0x7d5f3e, weight: 0.8 },
  forkedStick: { name: 'Forked stick', cats: ['craft'], color: 0x8a6a45, weight: 0.5 },
  cane: {
    name: 'Hollow cane',
    cats: ['craft'],
    color: 0x9fae5a,
    weight: 0.4,
    firstObservation: 'g_hollow',
  },
  bowDrill: { name: 'Bow drill', cats: ['tool'], color: 0xc49a66, weight: 0.8 },
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
