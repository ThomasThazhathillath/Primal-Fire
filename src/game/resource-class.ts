// What every object in the world IS (docs/RESOURCE_OVERHAUL_SPEC.md, section 2). One rule holds
// everywhere: if something is drawn as a collectible it is a gatherable spot in RESOURCES, reached
// by the same gaze, pinch, ray and click paths as everything else. Things that are not meant to be
// picked up are 'decor' and are drawn so they cannot be mistaken for a resource (big, mossy, or
// fixed in the ground), and anything small enough to carry that sits near them is a real spot.

import type { ResourceLook } from './world-layout.js';

export type ResourceClass = 'resource' | 'interactable' | 'decor' | 'quest' | 'constructed';

/** Class of every gatherable look. Exhaustive on purpose (the type makes a new look fail to compile). */
export const LOOK_CLASS: Record<ResourceLook, ResourceClass> = {
  grass: 'resource',
  fibrePlant: 'resource',
  twigPile: 'resource',
  // Dragged, not lifted: still gathered through the same path (a click breaks off a piece).
  fallenLog: 'interactable',
  sapling: 'resource',
  mossRock: 'resource',
  straightStick: 'resource',
  board: 'resource',
  clayPatch: 'resource',
  sandBar: 'resource',
  gravelBed: 'resource',
  cloth: 'resource',
  lens: 'quest',
  stone: 'resource',
  wetStone: 'resource',
  slab: 'resource',
  forkedStick: 'resource',
  diggingStick: 'resource',
  cane: 'resource',
  dryBranch: 'resource',
  leafLitter: 'resource',
  vine: 'resource',
  bark: 'resource',
  stoneDark: 'resource',
  stonePale: 'resource',
  pole: 'resource',
};

/** World objects that are not gatherable spots, with the reason they may stay that way. */
export const WORLD_OBJECTS: Record<string, { cls: ResourceClass; why: string }> = {
  boulder: { cls: 'decor', why: 'Large outcrop (0.45-0.95 m). Loose stones and flint lie beside it as real spots.' },
  fallenTrunk: { cls: 'decor', why: 'Fixed deadfall. Sticks, branches and bark lying round it are real spots.' },
  mossCushion: { cls: 'decor', why: 'Flat moss on the ground; the gatherable moss is a mossRock.' },
  grassClump: { cls: 'decor', why: 'Living green grass, walked through. Dry pale grass is the resource.' },
  fern: { cls: 'decor', why: 'Living plant.' },
  tree: { cls: 'decor', why: 'Living tree; fallen wood is the resource.' },
  treeRoot: { cls: 'decor', why: 'Fixed to the tree.' },
  stream: { cls: 'interactable', why: 'Water: drink, fill the pot, spear fish.' },
  forageBush: { cls: 'interactable', why: 'Looked at, identified, then picked (food.ts).' },
  cropPlot: { cls: 'interactable', why: 'Dug and planted by the player.' },
  structure: { cls: 'constructed', why: 'Built from the blueprints.' },
  roadmapWall: { cls: 'quest', why: 'Lights as quests complete.' },
  splitRock: { cls: 'quest', why: 'Story landmark.' },
  ruins: { cls: 'quest', why: 'Story landmark.' },
};

export const isCollectibleLook = (look: ResourceLook): boolean => LOOK_CLASS[look] !== 'decor';
