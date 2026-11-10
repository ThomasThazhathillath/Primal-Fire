// The training camp of "THE FIRST STEPS": a few real resource spots laid out
// in a half ring in front of where you wake (0,0 faces -Z), all within a step
// or two so a seated player can reach them. They are ordinary ResourceSpots,
// gathered by the real ResourceSystem; they regrow quickly so any lesson can
// be repeated.

import type { ItemId } from './items.js';
import type { ResourceLook, ResourceSpot } from './world-layout.js';

interface CampSpot {
  look: ResourceLook;
  item: ItemId;
  label: string;
  x: number;
  z: number;
}

const CAMP: CampSpot[] = [
  { look: 'stone', item: 'dryStone', label: 'A dry, fist-sized stone', x: -0.7, z: -1.2 },
  { look: 'stone', item: 'dryStone', label: 'A dry, fist-sized stone', x: -0.35, z: -1.45 },
  { look: 'twigPile', item: 'twigs', label: 'Grey, fallen sticks', x: 0.35, z: -1.45 },
  { look: 'grass', item: 'dryGrass', label: 'Tall, pale grass that crackles when touched', x: 0.75, z: -1.2 },
  { look: 'fibrePlant', item: 'fibers', label: 'A tall plant with long, stringy stems', x: 1.25, z: -0.75 },
  { look: 'fibrePlant', item: 'fibers', label: 'A tall plant with long, stringy stems', x: 1.45, z: -0.2 },
  { look: 'mossRock', item: 'dampMoss', label: 'A shaded rock furred with soft green moss', x: -1.25, z: -0.75 },
  { look: 'fallenLog', item: 'logs', label: 'A fallen, long-dead trunk', x: -1.5, z: -0.15 },
  { look: 'slab', item: 'slab', label: 'A flat slab of stone', x: 0, z: -1.9 },
  { look: 'straightStick', item: 'spindle', label: 'A perfectly straight, dry stick', x: 1.05, z: -1.7 },
  { look: 'board', item: 'board', label: 'A flat slab of wood split off by lightning', x: -1.05, z: -1.7 },
  { look: 'sapling', item: 'greenBranch', label: 'A young, living sapling', x: 1.9, z: -1.1 },
];

/** Every camp spot regrows after this long (s), so lessons can be replayed. */
export const CAMP_REGROW = 15;
export const CAMP_CHARGES = 6;

export function tutorialSpots(): ResourceSpot[] {
  return CAMP.map((c, i) => ({
    id: `tutorial-${c.look}-${i}`,
    itemId: c.item,
    x: c.x,
    z: c.z,
    charges: CAMP_CHARGES,
    regrow: CAMP_REGROW,
    label: c.label,
    look: c.look,
    rotY: i * 1.3,
  }));
}

/** Items the camp offers (tests check every lesson's needs are on offer). */
export function campItems(): Set<ItemId> {
  return new Set(CAMP.map((c) => c.item));
}
