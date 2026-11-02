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
  | 'bowDrill'
  | 'branch'
  | 'flint'
  | 'flake'
  | 'knife'
  | 'axe'
  | 'hammer'
  | 'feather'
  | 'bow'
  | 'arrow'
  // WORLD stream: ground-litter materials.
  | 'dryBranch'
  | 'leafLitter'
  | 'vine'
  | 'bark';

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
  branch: { name: 'Dead branch', cats: ['fuel', 'craft'], color: 0x7a5a3a, weight: 1.2 },
  flint: { name: 'Flint nodule', cats: ['stone', 'craft'], color: 0x4a4a55, weight: 0.7 },
  flake: { name: 'Sharp flake', cats: ['stone', 'craft'], color: 0x6b6b78, weight: 0.1 },
  knife: { name: 'Flint knife', cats: ['tool'], color: 0x8a8a96, weight: 0.3 },
  axe: { name: 'Stone axe', cats: ['tool'], color: 0x7d6a55, weight: 1.6 },
  hammer: { name: 'Stone hammer', cats: ['tool'], color: 0x857a6a, weight: 1.8 },
  feather: { name: 'Feather', cats: ['craft'], color: 0xe8e2d0, weight: 0.01 },
  bow: { name: 'Hunting bow', cats: ['tool'], color: 0x6a8a3a, weight: 0.6 },
  arrow: { name: 'Arrow', cats: ['tool'], color: 0xc49a66, weight: 0.05 },
  bowDrill: { name: 'Bow drill', cats: ['tool'], color: 0xc49a66, weight: 0.8 },
  // WORLD stream: ground-litter materials.
  dryBranch: { name: 'Dry branch', cats: ['fuel'], color: 0x7a6248, weight: 0.9 },
  leafLitter: { name: 'Dry leaves', cats: ['tinder'], color: 0xa8793a, weight: 0.05 },
  vine: { name: 'Vine', cats: ['craft'], color: 0x4f7a34, weight: 0.15 },
  bark: { name: 'Bark', cats: ['craft', 'tinder'], color: 0x6e5238, weight: 0.1 },
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
  'bow',
  'arrow',
  'feather',
  'knife',
  'axe',
  'hammer',
  'branch',
  'flint',
  'flake',
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
  'dryBranch',
  'leafLitter',
  'vine',
  'bark',
];

export const itemName = (id: ItemId): string => ITEMS[id].name;
