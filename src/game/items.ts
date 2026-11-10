// Every material and tool in Chapter 1. Ported from the v3 prototype, plus the
// v4 building materials (stones, slabs, sticks and canes; see docs/DESIGN.md).

export type ItemId =
  | 'dryGrass'
  | 'dampMoss'
  | 'twigs'
  | 'logs'
  | 'pole'
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
  | 'bark'
  // FOOD (Level 3, Science session): see src/game/food.ts.
  | 'fishingSpear'
  | 'fish'
  | 'cookedFish'
  | 'tuber'
  | 'seeds';

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
  | 'tool'
  | 'food';

export interface ItemDef {
  name: string;
  cats: ItemCategory[];
  /** sRGB hex, used for satchel chips and simple item meshes. */
  color: number;
  /** Carry weight in kg of one unit. */
  weight: number;
  /** One line, shown beside the item in the bag: what you use it for. */
  usedFor: string;
  /** Notebook entry unlocked the first time this item is gathered. */
  firstObservation?: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  dryGrass: { name: 'Dry grass', cats: ['tinder'], color: 0xd9c27a, weight: 0.1, usedFor: 'Tinder: it catches the first spark of a fire' },
  dampMoss: {
    name: 'Damp moss',
    cats: ['tinder'],
    color: 0x47703a,
    weight: 0.2, usedFor: 'Tinder, but damp: it smothers an ember',
    firstObservation: 'g_moss',
  },
  twigs: {
    name: 'Twigs',
    cats: ['fuel'],
    color: 0x8a6a45,
    weight: 0.3, usedFor: 'Kindling: small sticks that build a fire',
    firstObservation: 'g_dead',
  },
  logs: {
    name: 'Log',
    cats: ['fuel'],
    color: 0x6b4a2b,
    weight: 3, usedFor: 'Fuel that keeps a fire burning; chop with an axe',
    firstObservation: 'g_dead',
  },
  pole: { name: 'Long pole', cats: ['fuel', 'craft'], color: 0x8a6a45, weight: 2.2, usedFor: 'Uprights, ridge and ribs of a shelter frame' },
  fibers: { name: 'Plant fibres', cats: ['craft'], color: 0x7a9a42, weight: 0.1, usedFor: 'Twist into cord at your workbench' },
  cord: { name: 'Cord', cats: ['craft'], color: 0xc9b48a, weight: 0.1, usedFor: 'Lashes tools together; strings a bow drill' },
  spindle: { name: 'Straight stick', cats: ['craft'], color: 0xc49a66, weight: 0.4, usedFor: 'The spinning stick of a bow drill; handles and arrows' },
  board: { name: 'Flat board', cats: ['craft'], color: 0x9a7650, weight: 1.5, usedFor: 'The hearth board a bow drill spins on' },
  greenBranch: {
    name: 'Flexible branch',
    cats: ['craft'],
    color: 0x6a8a3a,
    weight: 0.8, usedFor: 'Bends without snapping: the bow of a bow drill',
    firstObservation: 'g_green',
  },
  clay: {
    name: 'Clay',
    cats: ['clay'],
    color: 0xb06a45,
    weight: 0.8, usedFor: 'Shape it into a pot at your workbench',
    firstObservation: 'g_clay',
  },
  gravel: { name: 'Gravel', cats: ['filter'], color: 0x8c8c8c, weight: 0.6, usedFor: 'The coarse top layer of a water filter' },
  sand: { name: 'Sand', cats: ['filter'], color: 0xe0cf9a, weight: 0.6, usedFor: 'A fine filter layer, and grit that stops clay cracking' },
  cloth: { name: 'Cloth', cats: ['filter'], color: 0xe8e2d0, weight: 0.1, usedFor: 'The screen at the bottom of a water filter' },
  charcoal: { name: 'Charcoal', cats: ['filter', 'fuel'], color: 0x1d1d1f, weight: 0.3, usedFor: 'Cleans water in a filter; burns hot' },
  pot: { name: 'Clay pot', cats: ['pot'], color: 0xa4552f, weight: 1.2, usedFor: 'Carries water: fire it, fill it, boil it' },
  lens: { name: 'Lens', cats: ['lens'], color: 0xb8a070, weight: 0.1, usedFor: 'Lets you look closely at what is in the water' },
  ember: { name: 'Ember', cats: ['ember'], color: 0xff6a1a, weight: 0, usedFor: 'A glowing coal: carry it to the tinder and fan it' },
  torch: { name: 'Burning stick', cats: ['torch'], color: 0x6b4a2b, weight: 0.5, usedFor: 'A burning stick for light and carrying fire' },
  dryStone: { name: 'Dry stone', cats: ['stone'], color: 0xa39a8a, weight: 1.5, usedFor: 'Workbench supports, a fire ring and tools' },
  wetStone: { name: 'Wet stone', cats: ['stone'], color: 0x5f6a6e, weight: 1.8, usedFor: 'Workbench supports. Never put it in a fire' },
  slab: { name: 'Flat stone slab', cats: ['stone'], color: 0x8d8780, weight: 6, usedFor: 'The flat top of your workbench' },
  diggingStick: { name: 'Digging stick', cats: ['tool'], color: 0x7d5f3e, weight: 0.8, usedFor: 'Digs the pit for charcoal and plots for food' },
  forkedStick: { name: 'Forked stick', cats: ['craft'], color: 0x8a6a45, weight: 0.5, usedFor: 'A workbench leg, and the legs of a water filter' },
  cane: {
    name: 'Hollow cane',
    cats: ['craft'],
    color: 0x9fae5a,
    weight: 0.4, usedFor: 'The hollow spout of a water filter',
    firstObservation: 'g_hollow',
  },
  branch: { name: 'Dead branch', cats: ['fuel', 'craft'], color: 0x7a5a3a, weight: 1.2, usedFor: 'Snap into twigs and a stick; also fuel' },
  flint: { name: 'Flint nodule', cats: ['stone', 'craft'], color: 0x4a4a55, weight: 0.7, usedFor: 'Hit it with a stone to break off sharp flakes' },
  flake: { name: 'Sharp flake', cats: ['stone', 'craft'], color: 0x6b6b78, weight: 0.1, usedFor: 'A sharp edge: cuts cane, cord and soft wood' },
  knife: { name: 'Flint knife', cats: ['tool'], color: 0x8a8a96, weight: 0.3, usedFor: 'Cuts plants cleanly for extra' },
  axe: { name: 'Stone axe', cats: ['tool'], color: 0x7d6a55, weight: 1.6, usedFor: 'Chops wood for double the logs' },
  hammer: { name: 'Stone hammer', cats: ['tool'], color: 0x857a6a, weight: 1.8, usedFor: 'Drives build parts home; breaks off more stone' },
  feather: { name: 'Feather', cats: ['craft'], color: 0xe8e2d0, weight: 0.01, usedFor: 'Goes on the back of an arrow' },
  bow: { name: 'Hunting bow', cats: ['tool'], color: 0x6a8a3a, weight: 0.6, usedFor: 'Shoots arrows for hunting' },
  arrow: { name: 'Arrow', cats: ['tool'], color: 0xc49a66, weight: 0.05, usedFor: 'Shot from a bow at game' },
  bowDrill: { name: 'Bow drill', cats: ['tool'], color: 0xc49a66, weight: 0.8, usedFor: 'Saw it over the fire pit to make an ember' },
  // WORLD stream: ground-litter materials.
  dryBranch: { name: 'Dry branch', cats: ['fuel'], color: 0x7a6248, weight: 0.9, usedFor: 'Snap into twigs and a stick; also fuel' },
  leafLitter: { name: 'Dry leaves', cats: ['tinder'], color: 0xa8793a, weight: 0.05, usedFor: 'Tinder for a fire, or a soft bed' },
  vine: { name: 'Vine', cats: ['craft'], color: 0x4f7a34, weight: 0.15, usedFor: 'Pull into strands and twist into cord' },
  bark: { name: 'Bark', cats: ['craft', 'tinder'], color: 0x6e5238, weight: 0.1, usedFor: 'Its inner strands twist into cord; also tinder' },
  // FOOD (Level 3, Science session): see src/game/food.ts.
  fishingSpear: { name: 'Fishing spear', cats: ['tool'], color: 0xb08a5a, weight: 0.6, usedFor: 'Spear fish in the stream' },
  fish: { name: 'Raw fish', cats: ['food'], color: 0x8fa7b3, weight: 0.4, usedFor: 'Raw: cook it over the fire before eating' },
  cookedFish: { name: 'Cooked fish', cats: ['food'], color: 0xe2c79a, weight: 0.3, usedFor: 'Safe to eat, cooked through' },
  tuber: { name: 'Wild tuber', cats: ['food'], color: 0x9a6b3f, weight: 0.25, usedFor: 'Food: eat it cooked, or plant it to grow more' },
  seeds: { name: 'Seeds', cats: ['food'], color: 0xc8b46a, weight: 0.02, usedFor: 'Plant them in dug ground to grow food' },
};

/** Display order in the satchel. */
export const SATCHEL_ORDER: ItemId[] = [
  'dryGrass',
  'dampMoss',
  'twigs',
  'logs',
  'pole',
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
  // FOOD (Level 3)
  'fishingSpear',
  'fish',
  'cookedFish',
  'tuber',
  'seeds',
];

export const itemName = (id: ItemId): string => ITEMS[id].name;

// ------------------------------------------------------------ physical properties

export type Material = 'wood' | 'stone' | 'flint' | 'clay' | 'leaf' | 'fibre' | 'bone' | 'cloth' | 'sand' | 'soil' | 'water' | 'ember';
export type Surface = 'rough' | 'smooth' | 'sharp' | 'soft' | 'sticky' | 'grainy';
/**
 * How you handle it: `pouch` fits the bag (small and light), `oneHand` is
 * held in one hand (too long or awkward for the bag), `twoHand` must be
 * carried with both hands, `drag` can only be dragged along the ground.
 */
export type HandleType = 'pouch' | 'oneHand' | 'twoHand' | 'drag';

export interface GripPoint {
  /** Offset (m) from the object's origin, in its own frame (long axis = +X). */
  x: number;
  y: number;
  z: number;
}

export interface ItemPhysics {
  /** Bounding size (m): length (X), height (Y), width (Z). */
  size: [number, number, number];
  material: Material;
  surface: Surface;
  interaction: HandleType;
  /** Where hands hold it: one for one-handed items (a tool's handle end), two for two-handed. */
  grips: GripPoint[];
  /** Centre of mass offset (m) from the origin: an axe is head-heavy. */
  com: GripPoint;
  /** Uses before a tool wears out (tools only). */
  durability?: number;
  /** Can snap or shatter when dropped hard or misused. */
  breakable: boolean;
}

/** Physical properties of every item (mass is ITEMS[id].weight). */
export const ITEM_PHYSICS: Record<ItemId, ItemPhysics> = {
  dryGrass: { size: [0.2, 0.08, 0.2], material: 'leaf', surface: 'soft', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  dampMoss: { size: [0.12, 0.05, 0.12], material: 'leaf', surface: 'soft', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  twigs: { size: [0.3, 0.06, 0.1], material: 'wood', surface: 'rough', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: true },
  pole: { size: [1.6, 0.08, 0.08], material: 'wood', surface: 'rough', interaction: 'twoHand', grips: [{ x: -0.5, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  logs: { size: [0.9, 0.18, 0.18], material: 'wood', surface: 'rough', interaction: 'twoHand', grips: [{ x: -0.35, y: 0, z: 0 }, { x: 0.35, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  fibers: { size: [0.3, 0.03, 0.05], material: 'fibre', surface: 'soft', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  cord: { size: [0.1, 0.03, 0.1], material: 'fibre', surface: 'soft', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  spindle: { size: [0.35, 0.025, 0.025], material: 'wood', surface: 'smooth', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: true },
  board: { size: [0.3, 0.03, 0.12], material: 'wood', surface: 'smooth', interaction: 'oneHand', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  greenBranch: { size: [0.8, 0.03, 0.03], material: 'wood', surface: 'smooth', interaction: 'oneHand', grips: [{ x: -0.3, y: 0, z: 0 }, { x: 0.3, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  clay: { size: [0.1, 0.08, 0.1], material: 'clay', surface: 'sticky', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  gravel: { size: [0.1, 0.05, 0.1], material: 'stone', surface: 'grainy', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  sand: { size: [0.1, 0.05, 0.1], material: 'sand', surface: 'grainy', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  cloth: { size: [0.25, 0.02, 0.25], material: 'cloth', surface: 'soft', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  charcoal: { size: [0.06, 0.04, 0.06], material: 'wood', surface: 'rough', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: true },
  pot: { size: [0.18, 0.16, 0.18], material: 'clay', surface: 'smooth', interaction: 'oneHand', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: true, durability: 10 },
  lens: { size: [0.05, 0.01, 0.05], material: 'stone', surface: 'smooth', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  ember: { size: [0.03, 0.02, 0.03], material: 'ember', surface: 'rough', interaction: 'oneHand', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  torch: { size: [0.5, 0.04, 0.04], material: 'wood', surface: 'rough', interaction: 'oneHand', grips: [{ x: -0.18, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: true },
  dryStone: { size: [0.1, 0.07, 0.08], material: 'stone', surface: 'rough', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  wetStone: { size: [0.1, 0.07, 0.08], material: 'stone', surface: 'smooth', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  slab: { size: [0.55, 0.06, 0.4], material: 'stone', surface: 'rough', interaction: 'twoHand', grips: [{ x: -0.25, y: 0, z: 0 }, { x: 0.25, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  diggingStick: { size: [0.9, 0.03, 0.03], material: 'wood', surface: 'rough', interaction: 'oneHand', grips: [{ x: -0.3, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false, durability: 20 },
  forkedStick: { size: [0.7, 0.04, 0.12], material: 'wood', surface: 'rough', interaction: 'oneHand', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  cane: { size: [0.6, 0.03, 0.03], material: 'wood', surface: 'smooth', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  branch: { size: [0.9, 0.04, 0.04], material: 'wood', surface: 'rough', interaction: 'oneHand', grips: [{ x: -0.3, y: 0, z: 0 }, { x: 0.3, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: true },
  flint: { size: [0.1, 0.07, 0.08], material: 'flint', surface: 'smooth', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  flake: { size: [0.06, 0.01, 0.04], material: 'flint', surface: 'sharp', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: true },
  knife: { size: [0.22, 0.03, 0.03], material: 'flint', surface: 'sharp', interaction: 'oneHand', grips: [{ x: -0.07, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: true, durability: 25 },
  axe: { size: [0.5, 0.03, 0.12], material: 'wood', surface: 'rough', interaction: 'oneHand', grips: [{ x: -0.2, y: 0, z: 0 }], com: { x: 0.18, y: 0, z: 0 }, breakable: false, durability: 20 },
  hammer: { size: [0.4, 0.03, 0.09], material: 'stone', surface: 'rough', interaction: 'oneHand', grips: [{ x: -0.15, y: 0, z: 0 }], com: { x: 0.14, y: 0, z: 0 }, breakable: false, durability: 30 },
  feather: { size: [0.15, 0.01, 0.03], material: 'bone', surface: 'soft', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  bow: { size: [1.1, 0.04, 0.04], material: 'wood', surface: 'smooth', interaction: 'oneHand', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false, durability: 60 },
  arrow: { size: [0.7, 0.01, 0.01], material: 'wood', surface: 'smooth', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: true },
  bowDrill: { size: [0.6, 0.05, 0.2], material: 'wood', surface: 'smooth', interaction: 'oneHand', grips: [{ x: -0.2, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: true, durability: 40 },
  dryBranch: { size: [0.8, 0.04, 0.04], material: 'wood', surface: 'rough', interaction: 'oneHand', grips: [{ x: -0.28, y: 0, z: 0 }, { x: 0.28, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: true },
  leafLitter: { size: [0.2, 0.04, 0.2], material: 'leaf', surface: 'soft', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  vine: { size: [0.5, 0.02, 0.02], material: 'fibre', surface: 'soft', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  bark: { size: [0.2, 0.02, 0.1], material: 'wood', surface: 'rough', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  // FOOD (Level 3, Science session): see src/game/food.ts.
  fishingSpear: { size: [1.6, 0.03, 0.03], material: 'wood', surface: 'smooth', interaction: 'oneHand', grips: [{ x: -0.3, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false, durability: 40 },
  fish: { size: [0.3, 0.06, 0.08], material: 'bone', surface: 'smooth', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  cookedFish: { size: [0.28, 0.05, 0.08], material: 'bone', surface: 'soft', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  tuber: { size: [0.1, 0.06, 0.06], material: 'leaf', surface: 'rough', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
  seeds: { size: [0.04, 0.02, 0.04], material: 'leaf', surface: 'rough', interaction: 'pouch', grips: [{ x: 0, y: 0, z: 0 }], com: { x: 0, y: 0, z: 0 }, breakable: false },
};

/** The pack takes small things inside and light sticks and tools strapped on; nothing bigger or heavier. */
export const POUCH_MAX_SIZE = 1.2;
export const POUCH_MAX_MASS = 2;

/** Does it go in (or on) the satchel, or must it be carried in your hands? */
/**
 * Play-test switch: while on, everything fits the bag and nothing weighs you
 * down (no pocket limit, no slow walking). The real rules stay in place and
 * tested; src/index.ts turns this on until carrying is tuned.
 */
export const carryRules = { easy: false };
export function setEasyCarry(on: boolean): void {
  carryRules.easy = on;
}

export function fitsPouch(id: ItemId): boolean {
  if (carryRules.easy) return true;
  const p = ITEM_PHYSICS[id];
  if (p.interaction === 'twoHand' || p.interaction === 'drag') return false;
  return Math.max(...p.size) <= POUCH_MAX_SIZE && ITEMS[id].weight <= POUCH_MAX_MASS;
}

/** Needs both hands to carry. */
export const twoHanded = (id: ItemId): boolean => ITEM_PHYSICS[id].interaction === 'twoHand';
