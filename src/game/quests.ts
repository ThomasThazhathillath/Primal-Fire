// Quests say what you NEED, never where to find it (docs/DESIGN.md, Quest 0).
// Each step has two escalating hints (the science, then the kind of place);
// asking a third time points the way (see Game.hint).
//
// Chapter 1 chain (v4): Scavenger → First Fire → Hold Water → Black Gold →
// Clear ≠ Safe → First Lab. Steps whose mechanics are not built yet (M2/M3)
// simply cannot complete; they are listed so the whole arc is visible.

import type { StructureKind } from './blueprint.js';
import type { Game } from './game.js';
import type { ItemId } from './items.js';

export type HintTarget =
  | { items: ItemId[] }
  | { structure: StructureKind; items: ItemId[] };

export interface QuestStep {
  text: (g: Game) => string;
  done: (g: Game) => boolean;
  hints: [string, string];
  target: HintTarget;
}

export interface Quest {
  title: string;
  desc: string;
  /** Roadmap node this quest lights up when complete. */
  roadmapNode: string | null;
  steps: QuestStep[];
}

const mark = (ok: boolean): string => (ok ? '✓' : '·');
const count = (g: Game, id: ItemId, n: number): string =>
  `${Math.min(n, g.gatheredCount(id))}/${n}`;

export const QUESTS: Quest[] = [
  {
    title: 'Scavenger',
    roadmapNode: null,
    desc: 'To make fire from nothing you need tinder, kindling, fuel, somewhere steady to work — and a tool that makes heat from friction.',
    steps: [
      {
        text: (g) => `Tinder: something dry and fine that catches a spark (${count(g, 'dryGrass', 2)})`,
        done: (g) => g.gatheredCount('dryGrass') >= 2,
        hints: [
          'Tinder must be bone-dry and fluffy. Think sun, not shade.',
          'Grass dries out where sunlight reaches the ground — a big open clearing in the forest.',
        ],
        target: { items: ['dryGrass'] },
      },
      {
        text: (g) =>
          `Kindling and fuel: small dry sticks (${count(g, 'twigs', 3)}) and dry logs (${count(g, 'logs', 2)})`,
        done: (g) => g.gatheredCount('twigs') >= 3 && g.gatheredCount('logs') >= 2,
        hints: [
          'Dead wood is dry; living wood is full of water.',
          'Fallen sticks lie under the trees all through the forest. Fallen trunks give logs.',
        ],
        target: { items: ['twigs', 'logs'] },
      },
      {
        text: (g) => `A steady surface to work on ${mark(g.hasStructure('workbench'))}`,
        done: (g) => g.hasStructure('workbench'),
        hints: [
          'A flat, heavy top on legs that can never wobble. How many legs is that?',
          'Flat slabs of stone break off on rocky, sunny ridges — and old builders left some behind.',
        ],
        target: { structure: 'workbench', items: ['slab'] },
      },
      {
        text: (g) =>
          `Friction tool: a straight dry stick ${mark(g.gatheredCount('spindle') > 0)}  a flat board ${mark(g.gatheredCount('board') > 0)}  a springy bow ${mark(g.gatheredCount('greenBranch') > 0)}`,
        done: (g) =>
          g.gatheredCount('spindle') > 0 &&
          g.gatheredCount('board') > 0 &&
          g.gatheredCount('greenBranch') > 0,
        hints: [
          'A bow drill needs a spindle, a hearth board and a bow. The bow must bend without snapping — what kind of wood bends?',
          'Lightning splits trees into dry, flat pieces. For the bow, look for young living trees in the sun.',
        ],
        target: { items: ['spindle', 'board', 'greenBranch'] },
      },
      {
        text: (g) =>
          `Cord: stringy fibres you could twist (${count(g, 'fibers', 3)}) — twisted at your workbench`,
        done: (g) => g.flag('cordMade'),
        hints: [
          'Some tall plants have long, tough fibres in their stems.',
          'They grow in open, sunny ground and along the stream.',
        ],
        target: { items: ['fibers'] },
      },
      {
        text: () => 'Build the friction tool at your workbench',
        done: (g) => g.flag('hasDrill'),
        hints: [
          'Stand at your workbench with every part in your satchel, and craft.',
          'A spindle, a board, a bow and a cord make a bow drill.',
        ],
        target: { structure: 'workbench', items: ['slab'] },
      },
    ],
  },
  {
    title: 'First Fire',
    roadmapNode: 'fire',
    desc: 'Night will come. No lighters, no matches — only physics.',
    steps: [
      {
        text: (g) => `A safe place for a fire ${mark(g.hasStructure('firePit'))}`,
        done: (g) => g.hasStructure('firePit'),
        hints: [
          'Fire must be contained, on bare ground, with nothing overhead that could catch.',
          'A ring of stones does it. Hold a stone low over open ground.',
        ],
        target: { structure: 'firePit', items: ['dryStone', 'wetStone'] },
      },
      {
        text: () => 'Build a fire lay in the pit: tinder, kindling, fuel',
        done: (g) => g.flag('fireLit') || g.flag('fireLayBuilt'),
        hints: [
          'Fire climbs a ladder of fuel: the finest first, the biggest last.',
          'A nest of tinder, a teepee of twigs around it, logs outside that.',
        ],
        target: { structure: 'firePit', items: ['dryStone', 'wetStone'] },
      },
      {
        text: () => 'Make an ember with the bow drill',
        done: (g) => g.flag('emberMade'),
        hints: [
          'Saw the bow back and forth — fast.',
          'Faster strokes, more friction, more heat.',
        ],
        target: { structure: 'firePit', items: [] },
      },
      {
        text: () => 'Bring the ember to the tinder and keep it alive',
        done: (g) => g.flag('fireLit'),
        hints: [
          'A glowing ember is fuel reacting with oxygen. What does it need more of?',
          'Wave an open palm over it — fan it.',
        ],
        target: { structure: 'firePit', items: [] },
      },
    ],
  },
  {
    title: 'Hold Water',
    roadmapNode: 'pottery',
    desc: 'You need something to hold water that won’t leak — and that can sit in a fire.',
    steps: [
      {
        text: (g) =>
          `Something that holds its shape when wet (${count(g, 'clay', 2)}) and something gritty to mix in ${mark(g.gatheredCount('sand') > 0)}`,
        done: (g) => g.flag('potFired') || (g.gatheredCount('clay') >= 2 && g.gatheredCount('sand') > 0),
        hints: [
          'You need an earth you can shape — and grit to keep it from cracking as it dries.',
          'Streams drop fine sticky earth and sand where the water slows down on a bend.',
        ],
        target: { items: ['clay', 'sand'] },
      },
      {
        text: () => 'Shape a pot at your workbench and let it dry',
        done: (g) => g.flag('potFired') || g.flag('potDry'),
        hints: ['Wet clay is soft. What happens to water left in it?', 'Leave it on the bench a while.'],
        target: { structure: 'workbench', items: [] },
      },
      {
        text: () => 'Fire it in your fire',
        done: (g) => g.flag('potFired'),
        hints: ['Clay changes for good when it gets hot enough.', 'Set it in the flames.'],
        target: { structure: 'firePit', items: [] },
      },
    ],
  },
  {
    title: 'Black Gold',
    roadmapNode: 'charcoal',
    desc: 'A good water filter needs charcoal. But ordinary burning leaves only ash…',
    steps: [
      {
        text: (g) => `Something hard and pointed to dig with ${mark(g.gatheredCount('diggingStick') > 0)}`,
        done: (g) => g.flag('charcoalMade') || g.gatheredCount('diggingStick') > 0,
        hints: [
          'Your hands are poor shovels. A tough, pointed stick works better.',
          'Lightning leaves broken, hard wood behind.',
        ],
        target: { items: ['diggingStick'] },
      },
      {
        text: () => 'Dig a pit, stack wood in it and cover it with earth',
        done: (g) => g.flag('charcoalMade') || g.flag('moundBuilt'),
        hints: [
          'Where is the ground dry enough that a hole stays dry?',
          'Dig away from the stream.',
        ],
        target: { items: ['logs'] },
      },
      {
        text: () => 'Decide: leave the vents open, or seal them with clay?',
        done: (g) => g.flag('charcoalMade') || g.flag('kilnLit'),
        hints: [
          'What happens to burning wood when oxygen runs short?',
          'Same wood, less oxygen, different chemistry.',
        ],
        target: { items: ['clay'] },
      },
      {
        text: () => 'Watch the smoke — open the mound at the right moment',
        done: (g) => g.flag('charcoalMade'),
        hints: ['Smoke tells you what is leaving the wood.', 'White → yellow → thin blue.'],
        target: { items: [] },
      },
    ],
  },
  {
    title: 'Clear ≠ Safe',
    roadmapNode: 'water',
    desc: 'The stream is murky. Make water that is clear, odour-free and disinfected — then prove it.',
    steps: [
      {
        text: (g) => `A way to see what’s in the water ${mark(g.gatheredCount('lens') > 0)}`,
        done: (g) => g.flag('waterSafe') || g.gatheredCount('lens') > 0,
        hints: [
          'People lived in this forest once. Their buildings may still hold useful things.',
          'Look for something glinting among old ruins.',
        ],
        target: { items: ['lens'] },
      },
      {
        text: (g) =>
          `Filter materials: something coarse ${mark(g.gatheredCount('gravel') > 0)} something fine ${mark(g.gatheredCount('sand') > 0)} a woven screen ${mark(g.gatheredCount('cloth') > 0)}`,
        done: (g) =>
          g.flag('waterSafe') ||
          (g.gatheredCount('gravel') > 0 && g.gatheredCount('sand') > 0 && g.gatheredCount('cloth') > 0),
        hints: [
          'Moving water sorts stones by size and drops the finest grains where it slows.',
          'A stream bend has stones and sand. Woven fabric survives only where people lived.',
        ],
        target: { items: ['gravel', 'sand', 'cloth'] },
      },
      {
        text: (g) =>
          `A stand and a tube for the filter: forked sticks (${count(g, 'forkedStick', 3)}) and something hollow ${mark(g.gatheredCount('cane') > 0)}`,
        done: (g) =>
          g.flag('waterSafe') || (g.gatheredCount('forkedStick') >= 3 && g.gatheredCount('cane') > 0),
        hints: [
          'Three legs always stand firm. What holds a tube upright?',
          'Y-shaped sticks lie where lightning shattered a tree; hollow stems grow by the water.',
        ],
        target: { items: ['forkedStick', 'cane'] },
      },
      {
        text: () => 'Filter the water, boil it, and check it with the lens',
        done: (g) => g.flag('waterSafe'),
        hints: [
          'Water flows top to bottom. What should it meet first — and what holds everything in at the bottom?',
          'Particles aren’t the only danger in water.',
        ],
        target: { structure: 'firePit', items: [] },
      },
    ],
  },
  {
    title: 'First Lab',
    roadmapNode: 'chem',
    desc: 'Night is falling. Bring what you learned to the Science Roadmap.',
    steps: [
      {
        text: () => 'Touch the Science Roadmap',
        done: (g) => g.flag('finale'),
        hints: ['Someone carved a map of science into stone.', 'Follow the rusted mast to the ruins.'],
        target: { items: [] },
      },
    ],
  },
];
