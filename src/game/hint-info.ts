// What the hint panel shows for each beginner objective (docs/QUEST_GUIDANCE_SPEC.md,
// part B): the name, what to look for, why you need it, what to avoid, and the
// reference pictures. Pictures are described, not stored: HintImages renders them
// from the game's own item and resource meshes. Every claim here is checked
// against the item and blueprint definitions in tests/hint-info.test.ts, and
// location advice only names places that really hold the thing (world-layout.ts).

import { BLUEPRINTS } from './blueprint.js';
import type { ItemId } from './items.js';

/** One object in a reference picture, laid out on the ground plane (metres). */
export type HintPiece =
  | { kind: 'item'; id: ItemId; x: number; z: number; y?: number; tint?: number; scale?: [number, number, number] }
  /** A scenery look from resourceMesh (e.g. the green fibre plant, the dry-grass tuft). */
  | { kind: 'look'; id: string; x: number; z: number; y?: number; tint?: number }
  /** A bare tree trunk to show bark on. */
  | { kind: 'trunk'; x: number; z: number }
  /** A whole landmark as the world builds it (`ruins`: the collapsed station, the rusted mast and the carved Science Roadmap wall). */
  | { kind: 'landmark'; id: 'ruins' };

export interface HintView {
  pieces: HintPiece[];
  /** Short line under the picture. */
  caption: string;
  /** Frame only the first piece (a closer look). */
  focusFirst?: boolean;
}

export interface HintInfo {
  /** Big name label above the picture. */
  name: string;
  look: string;
  why: string;
  avoid: string;
  /** Pictures: the first is shown at hint level 1, the second (if any) from level 2. */
  views: HintView[];
}

/** The flint nodule is drawn with the dark-stone look, which is bigger than a nodule: scaled to the item's real 10 cm. */
const FLINT_SCALE: [number, number, number] = [0.45, 0.45, 0.45];
const item = (id: ItemId, x = 0, z = 0, y = 0, scale?: [number, number, number]): HintPiece => ({ kind: 'item', id, x, z, y, scale });

/** The completed workbench: three stones on the blueprint's marks with the slab across them. */
function workbenchPieces(): HintPiece[] {
  const bp = BLUEPRINTS.workbench;
  // Drawn as the game draws it (BuildSystem): the legs are stacked stones, 3.2 times as tall.
  const out: HintPiece[] = bp.spots.map((s) => item('dryStone', s.x, s.z, 0, [1.6, 3.2, 1.6]));
  out.push(item('slab', 0, 0, bp.key.y));
  return out;
}
const supportPieces = (): HintPiece[] => BLUEPRINTS.workbench.spots.map((s) => item('dryStone', s.x, s.z));

const single = (id: ItemId, caption: string): HintView[] => [{ pieces: [item(id)], caption }, { pieces: [item(id)], caption, focusFirst: true }];

export const HINT_INFO: Record<string, HintInfo> = {
  firstStone: {
    name: 'Stone',
    look: 'A small, hard, grey or brown stone lying on the ground, about the size of your fist.',
    why: 'Stones are the first thing you build with: workbench supports, a fire ring, and tools.',
    avoid: 'Leaves, roots and clumps of soil. They are not stone.',
    views: single('dryStone', 'A small natural stone'),
  },
  moreStones: {
    name: 'Three stones',
    look: 'Stones you can hold in one hand. Dry stones and smooth wet stones from the stream both count.',
    why: 'Three stones make the three legs of your workbench. Three legs never wobble.',
    avoid: 'The big flat slab: it is the top of the bench, not a leg.',
    views: [
      { pieces: [item('dryStone', -0.2, 0.05), item('dryStone', 0.02, -0.08), item('wetStone', 0.22, 0.06)], caption: 'Two dry stones and a wet stream stone' },
      { pieces: [item('wetStone')], caption: 'A wet stone: darker and smoother', focusFirst: true },
    ],
  },
  flatStone: {
    name: 'Flat stone slab',
    look: 'A wide, flat piece of stone with a level top, far bigger than the stones you carry.',
    why: 'It becomes the top surface of your workbench, where you will work.',
    avoid: 'Small round stones. They cannot hold up a work surface.',
    views: [
      { pieces: [item('slab', 0, 0), item('dryStone', 0.5, 0.18)], caption: 'The slab, with an ordinary stone beside it for size' },
      { pieces: [item('slab')], caption: 'Broad, flat and level on top', focusFirst: true },
    ],
  },
  workbench: {
    name: 'Stone workbench',
    look: 'Three stones in a triangle with the flat slab resting across all three.',
    why: 'A steady table to work on: it lets you make tools and parts by hand.',
    avoid: 'Soft ground, trees and the stream bank. The legs must sit on firm, dry ground.',
    views: [
      { pieces: workbenchPieces(), caption: 'The finished workbench' },
      { pieces: [...supportPieces(), item('slab', 0.9, 0)], caption: 'Its parts: three supports and the slab' },
    ],
  },
  exploreBench: {
    name: 'Your workbench',
    look: 'The stone table you built: three legs and a broad flat top.',
    why: 'Poking it opens the list of things you can make there.',
    avoid: 'Nothing: you cannot break it. Walk up to it and reach out.',
    views: [{ pieces: workbenchPieces(), caption: 'Your workbench' }],
  },
  stoneTools: {
    name: 'Flint',
    look: 'A dark, fine-grained, glassy stone. It breaks into thin, very sharp flakes.',
    why: 'A sharp flake is your first cutting edge. Soft things like cane and cord can be cut with it.',
    avoid: 'Ordinary rough stones: they crumble instead of making an edge.',
    views: [
      { pieces: [item('flint', -0.1, 0, 0, FLINT_SCALE), item('dryStone', 0.14, 0.02)], caption: 'Flint (dark) and the hammer stone you strike it with' },
      { pieces: [item('flint', 0, 0, 0, FLINT_SCALE)], caption: 'A flint nodule', focusFirst: true },
    ],
  },
  wood: {
    name: 'Dry wood',
    look: 'Dead wood lying on the ground: thin twigs that snap with a crack, and thicker logs.',
    why: 'Dry wood burns. You will need twigs for kindling and logs to keep a fire going.',
    avoid: 'Green, living branches: they are full of water and will not burn well.',
    views: [
      { pieces: [item('twigs', -0.35, 0), item('logs', 0.1, 0.1), item('dryBranch', 0.1, -0.35)], caption: 'Twigs, a log and a dry branch' },
      { pieces: [item('logs')], caption: 'A log: thick, heavy, needs both hands', focusFirst: true },
    ],
  },
  cutting: {
    name: 'Sharp flake and cane',
    look: 'Your sharp stone flake, and something soft to cut: a hollow cane or a plant stem.',
    why: 'Cutting is how you shape sticks, canes and cord into parts.',
    avoid: 'Hard things such as stone: a sharp edge cuts soft things, not hard ones.',
    views: [{ pieces: [item('flake', -0.15, 0), item('cane', 0.15, 0)], caption: 'A flake and a cane to cut' }],
  },
  tinder: {
    name: 'Dry grass',
    look: 'Pale, dry, fluffy grass. It crumbles in your fingers.',
    why: 'Fire starts in fine, dry material. Tinder catches the first ember.',
    avoid: 'Green grass and damp moss. They hold water and will not catch.',
    views: [
      {
        pieces: [item('dryGrass', -0.2, 0), { kind: 'look', id: 'grass', x: 0.2, z: 0, tint: 0x4f8a2e }],
        caption: 'Dry grass (left, pale) and green grass (right, will not burn)',
      },
      { pieces: [{ kind: 'trunk', x: 0, z: 0 }], caption: 'Bark peeling from a dead trunk also works as tinder' },
    ],
  },
  cord: {
    name: 'Plant fibres',
    look: 'A tall green plant with long, tough strands in its stem that pull apart lengthways.',
    why: 'Twisted fibres become cord, which ties the bow drill and many other things.',
    avoid: 'Short grass blades: they snap instead of stretching into strands.',
    views: [{ pieces: [{ kind: 'look', id: 'fibrePlant', x: 0, z: 0 }], caption: 'A fibre plant' }, { pieces: [item('fibers')], caption: 'Fibres', focusFirst: true }],
  },
  frictionParts: {
    name: 'Bow drill parts',
    look: 'A straight dry stick, a flat board, and a springy green branch for the bow.',
    why: 'Together with cord they make a bow drill: the tool that makes fire by friction.',
    avoid: 'A dead, brittle branch for the bow: it will snap when you bend it.',
    views: [{ pieces: [item('spindle', -0.3, 0), item('board', 0.05, 0), item('greenBranch', 0.45, 0)], caption: 'Stick, board and green branch' }],
  },
  bowDrill: {
    name: 'Bow drill',
    look: 'A bow strung with cord, a straight spindle and a flat board.',
    why: 'Sawing it back and forth spins the spindle fast enough to make an ember.',
    avoid: 'Rushing: smooth, steady strokes make heat. Wild ones do not.',
    views: [{ pieces: [item('bowDrill')], caption: 'The bow drill' }],
  },
  firePit: {
    name: 'Fire pit',
    look: 'A ring of dry stones on open, flat ground with nothing hanging over it.',
    why: 'The ring keeps the fire in one place and the stones hold its heat.',
    avoid: 'Wet stream stones: water trapped in them can make them burst in a fire.',
    views: [{ pieces: [0, 1, 2, 3].map((i) => item('dryStone', Math.cos((i / 4) * Math.PI * 2) * 0.38, Math.sin((i / 4) * Math.PI * 2) * 0.38)), caption: 'A ring of dry stones' }],
  },
  fireLay: {
    name: 'Fire fuel',
    look: 'Tinder first, then twigs, then logs: finest fuel to thickest.',
    why: 'Fire climbs a ladder: each size of fuel lights the next one.',
    avoid: 'Putting big logs in first. They will not catch from a tiny ember.',
    views: [{ pieces: [item('dryGrass', -0.4, 0), item('twigs', 0, 0), item('logs', 0.45, 0)], caption: 'Tinder, twigs, logs' }],
  },
  ember: {
    name: 'Bow drill',
    look: 'The bow drill over your fire pit, with the spindle steady in the board.',
    why: 'Friction makes heat. Enough heat makes a glowing ember.',
    avoid: 'Stopping and starting: heat is lost every time you pause.',
    views: [{ pieces: [item('bowDrill')], caption: 'The bow drill' }],
  },
  fireLit: {
    name: 'Ember in tinder',
    look: 'A glowing ember sitting in a nest of dry grass.',
    why: 'An ember needs air to become a flame.',
    avoid: 'Blowing wildly: a steady wave of your open hand is enough.',
    views: [{ pieces: [item('dryGrass')], caption: 'A tinder nest' }],
  },
  pot: {
    name: 'Clay',
    look: 'Sticky red-brown earth by the stream, plus gritty sand to mix in.',
    why: 'Clay shaped and fired makes a pot that holds water and can sit in a fire.',
    avoid: 'Dry crumbly soil: it will not hold a shape.',
    views: [{ pieces: [{ kind: 'look', id: 'clayPatch', x: 0, z: 0 }], caption: 'A patch of clay' }],
  },
  charcoal: {
    name: 'Wood for charcoal',
    look: 'Dry logs to stack in a pit and cover with earth.',
    why: 'Wood burned with very little air turns into charcoal: a clean, hot fuel and a water filter.',
    avoid: 'Leaving air gaps: open burning only makes ash.',
    views: single('logs', 'Dry logs'),
  },
  cleanWater: {
    name: 'Gravel',
    look: 'Loose gravel, one of the filter layers: cloth, charcoal, sand, gravel.',
    why: 'A filter strains out mud. Boiling then kills what you cannot see.',
    avoid: 'Drinking stream water straight from the stream, even when it looks clear.',
    views: [{ pieces: [{ kind: 'look', id: 'gravelBed', x: 0, z: 0 }], caption: 'A gravel bed' }],
  },
  shelter: {
    name: 'Lean-to shelter',
    look: 'Dead branches for the frame, twigs for thatch, and cloth or dry grass as the roof cover, on flat dry ground.',
    why: 'A roof keeps off rain and wind, and the shelter keeps you off the cold ground.',
    avoid: 'The stream bank, and ground under dead overhanging branches.',
    views: [{ pieces: [item('branch', -0.4, 0), item('twigs', 0.05, 0), item('dryGrass', 0.4, 0)], caption: 'Branches, twigs and a roof cover' }],
  },
  science: {
    name: 'Science Roadmap',
    look: 'A wall of carvings at the old ruins, beside a tall rusted mast that rises above the treetops.',
    why: 'Everything you learned was an experiment: touching the map lights up what you discovered.',
    avoid: 'Other broken walls in the ruins. The carved one faces the open clearing.',
    views: [{ pieces: [{ kind: 'landmark', id: 'ruins' }], caption: 'The ruins, the rusted mast and the carved wall' }],
  },
};

export function hintInfo(id: string): HintInfo | undefined {
  return HINT_INFO[id];
}

/** The picture to show at a hint level (1..4): the first at level 1, the second from level 2 if there is one. */
export function hintView(id: string, level: number): HintView | null {
  const v = HINT_INFO[id]?.views;
  if (!v?.length) return null;
  return v[level >= 2 ? Math.min(1, v.length - 1) : 0];
}

/** A picture for a build-book structure (the objective hint pictures already draw the workbench, fire pit and shelter). */
export function structureView(kind: string): HintView | null {
  const map: Record<string, string> = { workbench: 'workbench', firePit: 'firePit', shelter: 'shelter' };
  const id = map[kind];
  return id ? (HINT_INFO[id]?.views[0] ?? null) : null;
}
