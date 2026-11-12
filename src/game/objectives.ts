// Beginner objectives (docs/QUEST_GUIDANCE_SPEC.md, part A): a strictly
// sequential guidance layer over the existing quests. It adds no new rules:
// every objective is decided from state the game already keeps (gathered
// counts, structures, flags, science events), so old saves line up with it for
// free and the existing quest chain, XP and science are untouched.
//
// One objective is current at a time; the rest stay hidden. Multi-step work
// (the workbench) shows substeps on the same card. When an objective finishes
// the state advances and is saved at once; the card then shows a short
// celebration (CELEBRATE_SECONDS) before the next objective takes its place.
// Part B (the image hint panel) reads `hint` and `hintLevel`.

import { MessageGate, openMarks } from './assist.js';
import { BENCH_RECIPES } from './bench.js';
import { BLUEPRINTS, type StructureKind } from './blueprint.js';
import { whereIs, whereLandmark } from './directions.js';
import type { Game, GameEvent } from './game.js';
import { ITEMS, type ItemId } from './items.js';
import { QUESTS } from './quests.js';

/** Seconds the finished objective stays on the card before the next one appears. */
export const CELEBRATE_SECONDS = 2.8;
/** Seconds a build-failure explanation stays on the card. */
export const FEEDBACK_SECONDS = 8;

/** Controls taught the first time they are needed, then never repeated. */
export type InteractionId = 'grab' | 'place' | 'build' | 'bench' | 'tool' | 'fire';

export const TEACH: Record<InteractionId, string> = {
  grab: 'HOW TO PICK UP: 1. Reach your hand to the stone until your fingers are almost touching it. 2. Press your thumb and index fingertips firmly together (a pinch) and hold them shut. 3. It goes into your satchel.',
  place: 'HOW TO PLACE: 1. Tap the bag icon and tap the stone to take it in your hand. 2. Carry it over a glowing mark: it is drawn in, and letting go or touching the mark seats it. 3. The next stone appears in your hand by itself. Or, with an empty hand, just pinch or tap a glowing mark: it takes a stone from your bag. Put away stops it.',
  build: 'Open the hammer icon in the bottom bar to place an outline, then fill each mark.',
  bench: 'Poke the finished workbench with a finger to see what you can make.',
  tool: 'Pinch a tool to hold it, then swing it. Strike with the edge, not the flat.',
  fire: 'Hold the bow drill, saw it back and forth, and steady it with your other hand.',
};

/** Four escalating hints; part B shows `levels[0..hintLevel-1]` with the reference item. */
export interface HintData {
  /** Identify, characteristics, location, exact action. */
  levels: [string, string, string, string];
  /** Item whose in-game model the reference image shows. */
  ref?: ItemId;
}

export interface Objective {
  id: string;
  title: string;
  instruction: string | ((g: Game) => string);
  /** Shown on the card when it finishes. */
  doneMessage: string;
  hint: HintData;
  /** Control taught the first time this objective is on screen. */
  teach?: InteractionId;
  /** Detailed how-to shown on the card for the whole objective, even once learned (the first builds). */
  howTo?: (g: Game) => string | null;
  /** Counts something: shown as "1 / 3". `base` is the stone count when the objective began. */
  progress?: (g: Game, base: number) => { have: number; need: number };
  /** Several conditions of one objective, shown on the same card. */
  substeps?: (g: Game) => Array<{ text: string; done: boolean }>;
  /** Is it finished? `base` is `baseline(g)` as it was when the objective began. */
  done: (g: Game, base: number) => boolean;
  /** Finished because much later play shows it must be (old saves, skipped ahead). */
  implied?: (g: Game) => boolean;
  /** Recorded when the objective begins, so progress counts only what happens now. */
  baseline?: (g: Game) => number;
  /** Same, for a save that predates objectives (the earlier first stone counts). */
  legacyBase?: number;
  /** Items to look for right now (what is still missing): the card says where the nearest one is. */
  find?: (g: Game) => ItemId[];
  /** A landmark to go to, when the objective is a place (the card says which way). */
  place?: string;
  /** The structure this objective builds: a held key part starts THIS outline first, not another that shares the part. */
  structure?: StructureKind;
  /** Failures ("too far", "not stable") are explained on the card while this is current. */
  explains?: boolean;
}

// ------------------------------------------------------------- helpers

const stones = (g: Game): number => g.gatheredCount('dryStone') + g.gatheredCount('wetStone');
const ever = (g: Game, id: ItemId): boolean => g.gatheredCount(id) > 0 || g.count(id) > 0 || g.held === id;
const benchBuilt = (g: Game): boolean => g.hasStructure('workbench');
const litFire = (g: Game): boolean => g.flag('fireLit');
const cleanWater = (g: Game): boolean => g.flag('waterSafe');
const capped = (n: number, max: number): number => Math.min(max, n);
const sub = (text: string, done: boolean) => ({ text, done });

const workbenchStage = (g: Game): 0 | 1 | 2 | 3 => {
  const s = g.structures.find((t) => t.kind === 'workbench');
  if (!s) return 0;
  if (s.complete) return 3;
  return s.spots.every((v) => v !== null) ? 2 : 1;
};

/** Where the nearest thing this objective needs is, or the landmark it asks you to reach. */
function whereFor(o: Objective, g: Game): string | null {
  if (o.structure) return materialsLine(o.structure, g);
  if (o.place) return whereLandmark(o.place, g.player, g.facingYaw);
  const items = o.find?.(g);
  return items && items.length ? whereIs(items, g.player, g.facingYaw) : null;
}

/** Parts of a structure the player has: already placed, in the bag, or in hand. */
function haveParts(g: Game, kind: StructureKind, ids: readonly ItemId[]): number {
  let n = 0;
  for (const s of g.structures) if (s.kind === kind) n += s.spots.filter((v) => v !== null && ids.includes(v)).length;
  for (const id of ids) n += g.count(id) + (g.held === id ? 1 : 0);
  return n;
}

/** "Stones 2/3, flat stone 1/1" for the structure being built, until it is finished (null once done or when it has no counted parts). */
export function materialsLine(kind: StructureKind, g: Game): string | null {
  if (g.hasStructure(kind)) return null;
  if (kind === 'workbench') {
    const stones = Math.min(3, haveParts(g, 'workbench', ['dryStone', 'wetStone']));
    const slab = g.structures.some((s) => s.kind === 'workbench' && s.keyPlaced) ? 1 : Math.min(1, g.count('slab') + (g.held === 'slab' ? 1 : 0));
    return `Stones ${stones}/3, flat stone ${slab}/1`;
  }
  if (kind === 'firePit') return `Stones ${Math.min(4, haveParts(g, 'firePit', ['dryStone']))}/4`;
  return null;
}

/** The note once the parts are all in hand: you can start building now. */
export function readyToBuild(g: Game): string | null {
  const o = g.objectives.current;
  if (!o?.structure || g.hasStructure(o.structure) || g.structures.some((s) => s.kind === o.structure)) return null;
  const line = materialsLine(o.structure, g);
  if (!line) return null;
  const ok = o.structure === 'workbench' ? /Stones 3\/3, flat stone 1\/1/.test(line) : /Stones 4\/4/.test(line);
  return ok ? `You have everything. Ready to build: tap the grid icon, then the hammer, then ${BLUEPRINTS[o.structure].name}.` : null;
}

/**
 * Once every part of a workbench recipe is in the bag: say exactly what to do.
 * Null while no workbench stands, a craft is under way, or the thing is already made.
 */
export function nextStepLine(g: Game): string | null {
  if (!g.hasStructure('workbench') || g.bench) return null;
  for (const e of g.bookEntries()) {
    if (e.kind !== 'recipe' || !e.unlocked || !e.haveAll) continue;
    const r = BENCH_RECIPES.find((x) => `recipe:${x.id}` === e.id);
    if (!r || g.count(r.output) > 0 || g.held === r.output) continue;
    const name = e.name.replace(/ \(.*\)$/, '');
    return `You have everything for ${name.toLowerCase()}: go to your workbench and tap ${name}.`;
  }
  return null;
}

/** "Look for: dry grass, twigs" for an objective about finding things (null for builds: their materials line covers it). */
export function partsLine(o: Objective, g: Game): string | null {
  if (o.structure) return null;
  const items = o.find?.(g) ?? [];
  if (!items.length) return null;
  const names = [...new Set(items)].map((id) => ITEMS[id].name.toLowerCase());
  return `Look for: ${names.join(', ')}`;
}

/**
 * The single next action (NPE D), so the card always says what to do now: a contextual line (assistance, "this
 * fits here") first, then "you have everything", then the first open substep, then how to collect what is missing.
 */
export function nextActionLine(o: Objective, g: Game, message: string | null, next: string | null, substeps: Array<{ text: string; done: boolean }>): string | null {
  if (message) return message;
  if (next) return next;
  const open = substeps.find((x) => !x.done);
  if (open) return `Next: ${open.text.charAt(0).toLowerCase()}${open.text.slice(1)}`;
  const items = o.find?.(g) ?? [];
  if (items.length) return `Next: look at ${ITEMS[items[0]].name.toLowerCase()} and pinch to collect it.`;
  return null;
}

// ------------------------------------------------------------ sequence

export const OBJECTIVES: Objective[] = [
  {
    id: 'firstStone',
    find: () => ['dryStone', 'wetStone'],
    title: 'Find your first stone',
    instruction: 'Look around the forest floor and pick up one stone.',
    doneMessage: "Good. You've found your first resource.",
    teach: 'grab',
    howTo: () => TEACH.grab,
    progress: (g) => ({ have: capped(stones(g), 1), need: 1 }),
    done: (g) => stones(g) >= 1,
    implied: benchBuilt,
    hint: {
      ref: 'dryStone',
      levels: [
        'Look for a small, hard object lying on the forest floor.',
        'A grey or brown stone with a solid surface. Not a leaf, a root or a clump of soil.',
        'A couple of stones lie on the ground around the clearing where you woke. Look within a few steps.',
        'Walk up to the stone, pinch it to pick it up, and open your hand to put it in your satchel.',
      ],
    },
  },
  {
    id: 'moreStones',
    find: () => ['dryStone', 'wetStone'],
    title: 'Gather more stones',
    instruction: 'Find three more stones. They will be the supports of your first workbench.',
    doneMessage: 'Great! You have enough stones to begin building. Three supports never wobble.',
    baseline: stones,
    legacyBase: 1,
    howTo: () => 'Same as before: reach to each stone, pinch thumb and index tightly together and hold for a moment. To teleport closer, point at open ground, pinch and keep holding until a ring appears, then let go.',
    progress: (g, base) => ({ have: capped(stones(g) - base, 3), need: 3 }),
    done: (g, base) => stones(g) - base >= 3,
    implied: benchBuilt,
    hint: {
      ref: 'dryStone',
      levels: [
        'The same kind of small stone as before. You need three more.',
        'Round or blocky stones you can hold in one hand. Wet stones from the stream work for supports too.',
        'Check the clearing, the stream bank (wet stones), the Sunny Meadow and the Split Rock ridge.',
        'Pinch each stone to pick it up. Your satchel keeps them until you build.',
      ],
    },
  },
  {
    id: 'flatStone',
    find: () => ['slab'],
    title: 'Find a flat stone',
    instruction:
      'Look for a broad, flat slab of stone. It will be the top of your workbench. It is heavy: hold it with both hands.',
    doneMessage: 'That looks like a suitable flat stone.',
    teach: 'grab',
    howTo: () => 'The slab is heavy: reach both hands to it and pinch it with both at the same time. Keep both pinches shut and it goes into your satchel.',
    done: (g) => ever(g, 'slab'),
    implied: benchBuilt,
    hint: {
      ref: 'slab',
      levels: [
        'Look for a wide, flat piece of stone, much bigger than the small ones you carry.',
        'A broad slab with a level top. Small rounded stones cannot hold up a work surface.',
        'Slabs lie on the Split Rock ridge and among the old ruins, and a few are scattered through the far forest.',
        'Pinch the slab with one hand, then pinch it with your other hand to lift it. Carry it to your build spot.',
      ],
    },
  },
  {
    id: 'workbench',
    structure: 'workbench',
    title: 'Build your first workbench',
    instruction: (g) => {
      const stage = workbenchStage(g);
      if (stage === 0) return 'Tap the grid icon, then the hammer, then Workbench to put its outline on open, dry ground.';
      if (stage === 1) return 'Place a stone on each glowing mark to make three steady supports.';
      if (stage === 2) return 'Lift the flat stone with both hands and lower it onto the three supports.';
      return 'Your workbench is ready.';
    },
    doneMessage: 'Your first workbench is ready!',
    teach: 'build',
    explains: true,
    howTo: (g) => {
      const stage = workbenchStage(g);
      if (stage === 0) return 'HOW TO START: point a finger and tap the grid icon on your right to open the icons, then tap the hammer icon and tap Workbench. Its glowing outline appears on the ground in front of you.';
      if (stage === 1) return TEACH.place;
      if (stage === 2)
        return 'HOW TO SET THE SLAB: 1. Tap the bag icon and tap the slab. 2. Pinch it with both hands and keep both pinches shut. 3. Hold it just above the three stones. 4. Open both hands wide. It drops into place.';
      return null;
    },
    substeps: (g) => {
      const s = g.structures.find((t) => t.kind === 'workbench');
      const placed = s ? s.spots.filter((v) => v !== null).length : 0;
      const total = BLUEPRINTS.workbench.spots.length;
      return [
        sub('Choose a spot', !!s),
        sub(`Place the supports (${placed} / ${total})`, !!s && placed === total),
        sub('Set the flat stone on top', !!s?.complete),
      ];
    },
    done: benchBuilt,
    hint: {
      ref: 'slab',
      levels: [
        'A workbench is three stones in a triangle with a flat stone resting on top.',
        'The supports must sit on the marks and the slab must rest across all three.',
        'Pick open, dry ground away from trees and the stream bank.',
        'Place the outline from the hammer icon, put a stone on each mark, then lower the slab on top with both hands.',
      ],
    },
  },
  {
    id: 'exploreBench',
    title: 'Explore your workbench',
    instruction: 'Poke your workbench with a finger and look at what you can make there.',
    doneMessage: 'This is where your tools begin.',
    teach: 'bench',
    done: (g) => g.objectives.hasLearned('bench'),
    implied: (g) => litFire(g) || g.flag('hasDrill') || g.hasEvent('tool.knap.flake'),
    hint: {
      ref: 'slab',
      levels: [
        'Your new workbench is the flat table you just built.',
        'It is the stone table with the broad top.',
        'It stands where you built it. Walk back to it.',
        'Reach out and poke the workbench with a finger. A list of recipes opens.',
      ],
    },
  },
  {
    id: 'stoneTools',
    find: (g) => (g.count('flint') + (g.held === 'flint' ? 1 : 0) > 0 ? [] : ['flint']),
    title: 'Make a sharp stone',
    instruction: 'Hold the flint in one hand and hit its edge with a stone in the other, until a sharp flake breaks off.',
    doneMessage: 'You made your first edge. Sharp things cut.',
    teach: 'tool',
    howTo: (g) =>
      g.count('flint') === 0 && g.held !== 'flint'
        ? 'First find flint: a dark, glassy stone (tap the hint bulb to see it). Pinch it to put it in your bag. Keep an ordinary stone in your bag too.'
        : 'HOW TO KNAP: 1. Tap the bag icon and tap Flint. It sits in one hand. 2. A stone appears in your other hand automatically (you only need one in your bag). 3. Swing that hand and hit the edge of the flint firmly, a few times, until a flake breaks off.',
    done: (g) => g.hasEvent('tool.knap.flake'),
    implied: (g) => litFire(g) || g.hasEvent('tool.edge.cut'),
    hint: {
      ref: 'flint',
      levels: [
        'Some stones break into thin, glassy edges.',
        'Dark, fine-grained stone such as flint breaks the sharpest.',
        'Flint is a dark, glassy nodule. You strike it with a harder stone held in your other hand.',
        'Take the flint out of your bag; a hammer stone appears in your other hand. Strike the flint edge firmly with it until a flake breaks off.',
      ],
    },
  },
  {
    id: 'wood',
    find: (g) => (g.gatheredCount('twigs') < 3 ? ['twigs'] : ['logs']),
    title: 'Gather wood',
    instruction: 'Collect 3 twigs and 2 logs. Dead wood lying on the ground is dry and burns well.',
    doneMessage: 'Good wood. Dead wood is dry, living wood is full of water.',
    progress: (g) => ({ have: capped(g.gatheredCount('twigs'), 3) + capped(g.gatheredCount('logs'), 2), need: 5 }),
    substeps: (g) => [
      sub(`Twigs (${capped(g.gatheredCount('twigs'), 3)} / 3)`, g.gatheredCount('twigs') >= 3),
      sub(`Logs (${capped(g.gatheredCount('logs'), 2)} / 2)`, g.gatheredCount('logs') >= 2),
    ],
    done: (g) => g.gatheredCount('twigs') >= 3 && g.gatheredCount('logs') >= 2,
    implied: litFire,
    hint: {
      ref: 'logs',
      levels: [
        'Look for dry wood on the ground: small sticks and heavier logs.',
        'Twigs snap with a crack. Logs are thicker and lie where trees have fallen.',
        'Fallen sticks lie under the trees all through the forest.',
        'Pinch a stick or log to pick it up. A log is heavy, so use both hands.',
      ],
    },
  },
  {
    id: 'cutting',
    find: () => ['cane'],
    title: 'Cut with your edge',
    instruction: 'Hold the flake in one hand and pinch a cane (or a fibre plant, vine or bark) with the other: the flake cuts it free.',
    doneMessage: 'A thin edge cuts where a hand cannot.',
    teach: 'tool',
    howTo: () =>
      'HOW TO CUT: 1. Tap the bag icon and tap Sharp flake. It sits in your hand (nothing appears in the other hand). 2. Walk up to a soft plant: cane by the stream, a stringy fibre plant, a vine or bark on a tree. 3. With your other hand, pinch the plant. The flake cuts it free.',
    done: (g) => g.hasEvent('tool.edge.cut'),
    implied: litFire,
    hint: {
      ref: 'cane',
      levels: [
        'Use the sharp flake you made on something soft.',
        'Hollow cane and plant stems are easy to cut.',
        'Cane stands along the stream, around the Clay Bend.',
        'Take the flake out of your bag, then pinch the cane (or a fibre plant, vine or bark) with your other hand. The flake cuts it.',
      ],
    },
  },
  {
    id: 'tinder',
    find: () => ['dryGrass'],
    title: 'Collect dry tinder',
    instruction: 'Pick up 2 handfuls of dry grass. Fire starts in fine, dry material.',
    doneMessage: 'Dry grass catches a spark. Damp moss would smother it.',
    progress: (g) => ({ have: capped(g.gatheredCount('dryGrass'), 2), need: 2 }),
    done: (g) => g.gatheredCount('dryGrass') >= 2,
    implied: litFire,
    hint: {
      ref: 'dryGrass',
      levels: [
        'Tinder is dry, fine and fluffy.',
        'Pale, dry grass. Green grass and damp moss do not catch.',
        'Dry grass grows in the Sunny Meadow and around the Lightning Glade.',
        'Pinch a tuft of pale grass and pull it free.',
      ],
    },
  },
  {
    id: 'cord',
    find: (g) => (g.gatheredCount('fibers') < 3 && !g.flag('cordMade') ? ['fibers'] : []),
    title: 'Twist some cord',
    instruction: 'Collect stringy fibres, then twist them into cord at your workbench.',
    doneMessage: 'Cord holds things together.',
    substeps: (g) => [
      sub(`Collect fibres (${capped(g.gatheredCount('fibers'), 3)} / 3)`, g.gatheredCount('fibers') >= 3 || g.flag('cordMade')),
      sub('Twist them at the workbench', g.flag('cordMade')),
    ],
    done: (g) => g.flag('cordMade'),
    implied: litFire,
    hint: {
      ref: 'fibers',
      levels: [
        'Some tall plants have long, tough fibres in their stems.',
        'Stringy strands that pull apart lengthways.',
        'They grow in open, sunny ground and along the stream.',
        'Hold the fibres at your workbench and choose Cord.',
      ],
    },
  },
  {
    id: 'frictionParts',
    find: (g) => (['spindle', 'board', 'greenBranch'] as ItemId[]).filter((i) => g.gatheredCount(i) === 0),
    title: 'Find the bow drill parts',
    instruction: 'You need a straight dry stick, a flat board and a springy green branch.',
    doneMessage: 'You have everything for a bow drill.',
    substeps: (g) => [
      sub('Straight dry stick', g.gatheredCount('spindle') > 0),
      sub('Flat board', g.gatheredCount('board') > 0),
      sub('Springy green branch', g.gatheredCount('greenBranch') > 0),
    ],
    done: (g) => (g.gatheredCount('spindle') > 0 && g.gatheredCount('board') > 0 && g.gatheredCount('greenBranch') > 0) || g.flag('hasDrill'),
    implied: litFire,
    hint: {
      ref: 'spindle',
      levels: [
        'A bow drill is made of a stick, a board and a bow.',
        'The bow must bend without snapping, so it comes from a living branch.',
        'Lightning splits trees into dry, flat pieces. Young living trees give the bow.',
        'Pinch each piece to pick it up.',
      ],
    },
  },
  {
    id: 'bowDrill',
    title: 'Make the bow drill',
    instruction: 'Poke your workbench, choose the bow drill and build it step by step with your hands.',
    doneMessage: 'A bow drill. Friction makes heat.',
    teach: 'bench',
    done: (g) => g.flag('hasDrill'),
    implied: litFire,
    hint: {
      ref: 'bowDrill',
      levels: [
        'The bow drill is made on your workbench.',
        'It needs the stick, the board, the bow and your cord.',
        'Walk back to your workbench.',
        'Poke the workbench, choose Bow drill and follow each step.',
      ],
    },
  },
  {
    id: 'firePit',
    structure: 'firePit',
    title: 'Build a fire pit',
    instruction: 'Open the hammer icon, choose Fire pit and put stones on the marks to make a ring on open ground.',
    doneMessage: 'A ring of stones keeps the fire where you want it.',
    teach: 'build',
    explains: true,
    howTo: () =>
      'HOW TO BUILD: 1. Open the grid icon, tap the hammer, tap Fire pit: a ring of glowing marks appears on the ground. 2. With an empty hand, pinch or tap each glowing mark: it takes a stone from your bag and sets it there. (Or carry a stone to a mark and let go: the next stone appears in your hand.)',
    substeps: (g) => {
      const s = g.structures.find((t) => t.kind === 'firePit');
      const placed = s ? s.spots.filter((v) => v !== null).length + (s.keyOpen ? 0 : 1) : 0;
      return [sub('Choose a spot', !!s), sub(`Place the stones (${placed} / 4)`, !!s?.complete)];
    },
    done: (g) => g.hasStructure('firePit'),
    implied: litFire,
    hint: {
      ref: 'dryStone',
      levels: [
        'A fire needs a safe place: a ring of stones.',
        'Dry stones. Never use wet stream stones in a fire: they can burst.',
        'Open ground with nothing overhead.',
        'Choose Fire pit in the build book, then place a stone on each mark.',
      ],
    },
  },
  {
    id: 'fireLay',
    title: 'Lay the fire',
    instruction: 'Put tinder in the pit, then twigs around it, then logs on the outside.',
    doneMessage: 'The finest fuel goes in first and the biggest last.',
    teach: 'fire',
    substeps: (g) => [
      sub('Tinder in the middle', g.fire.tinder >= 1 || g.flag('fireLayBuilt')),
      sub('Twigs around it', g.fire.twigs >= 3 || g.flag('fireLayBuilt')),
      sub('Logs outside', g.fire.logs >= 2 || g.flag('fireLayBuilt')),
    ],
    done: (g) => g.flag('fireLayBuilt') || litFire(g),
    implied: litFire,
    hint: {
      ref: 'dryGrass',
      levels: [
        'Fire climbs a ladder of fuel, the finest first.',
        'Tinder, then twigs, then logs.',
        'Put it all inside your fire pit.',
        'Hold the fuel over the pit and let go, finest first.',
      ],
    },
  },
  {
    id: 'ember',
    title: 'Make an ember',
    instruction: 'Hold the bow drill at your fire pit and saw it back and forth until an ember glows. You do not put it down.',
    doneMessage: 'A glowing ember! Now keep it alive.',
    teach: 'fire',
    howTo: () =>
      'HOW TO MAKE AN EMBER: 1. Take the bow drill out of your bag: it stays in your hand (Menu > Put away to let go). 2. Kneel or reach down to the fire pit so your hand is just above it. 3. Put your other hand near the pit too (it steadies the spindle). 4. Move the bow hand back and forth, steadily, for several seconds until smoke and an ember appear. In the browser: hold it and click the fire pit again and again.',
    done: (g) => g.flag('emberMade') || litFire(g),
    implied: litFire,
    hint: {
      ref: 'bowDrill',
      levels: [
        'Friction makes heat.',
        'Smooth, steady strokes, not wild ones.',
        'Do it over the fire pit you built.',
        'Hold the drill, saw with a rhythm and keep your other hand still near the spindle.',
      ],
    },
  },
  {
    id: 'fireLit',
    title: 'Light the fire',
    instruction: 'Carry the ember to the tinder and wave an open hand over it until flames catch.',
    doneMessage: 'Fire! You made it from nothing but friction.',
    teach: 'fire',
    done: litFire,
    hint: {
      ref: 'dryGrass',
      levels: [
        'An ember needs air.',
        'Wave an open palm over it, steadily.',
        'It sits in the tinder in your fire pit.',
        'Hold your open hand over the ember and wave it back and forth.',
      ],
    },
  },
  {
    id: 'pot',
    find: (g) => (g.gatheredCount('clay') < 2 ? ['clay'] : g.gatheredCount('sand') === 0 ? ['sand'] : []),
    title: 'Make a clay pot',
    instruction: 'Mix clay with sand, shape a pot at the workbench, let it dry, then fire it in your fire.',
    doneMessage: 'Fired clay holds water for good.',
    howTo: (g) =>
      g.flag('potFired')
        ? null
        : g.flag('potDry')
          ? 'HOW TO FIRE IT: the pot is dry. With your fire burning, reach your hand into the flames and hold it there for a moment: the pot goes in. In the browser: stand by the fire and press U. Keep the fire fed until it is fired.'
          : g.count('pot') > 0 || g.held === 'pot'
            ? 'DRYING: you do not need to do anything (the pot stays in your bag). Keep the pot in your bag for about 45 seconds and a message says when it is bone dry. Do not put it in the fire before that: a damp pot bursts.'
            : null,
    substeps: (g) => [
      sub('Clay and sand', g.flag('potFired') || (g.gatheredCount('clay') >= 2 && g.gatheredCount('sand') > 0)),
      sub('Shape it and let it dry', g.flag('potDry') || g.flag('potFired')),
      sub('Fire it in the flames', g.flag('potFired')),
    ],
    done: (g) => g.flag('potFired'),
    implied: cleanWater,
    hint: {
      ref: 'clay',
      levels: [
        'You need something that holds water and can sit in a fire.',
        'Sticky earth for shaping, plus gritty sand so it does not crack.',
        'Streams drop clay and sand where the water slows on a bend.',
        'Make the pot at the workbench, wait for it to dry, then set it in the fire.',
      ],
    },
  },
  {
    id: 'charcoal',
    title: 'Make charcoal',
    instruction: 'Dig a pit, stack wood in it, cover it with earth and watch the smoke.',
    doneMessage: 'Charcoal: wood burned with little air.',
    howTo: (g) => {
      if (!g.flag('moundBuilt'))
        return 'HOW TO DIG: 1. Have 2 logs in your bag and a digging stick (a sturdy pointed stick on the forest floor). 2. Take the digging stick out and hold it. 3. Stand on open, dry ground: at least 6 steps from the stream and not under a tree. 4. Reach your hand down towards the ground and hold it there a moment (browser: press U).';
      return 'NEXT: hold clay and reach to the mound to seal its vents. With your fire burning nearby, reach to the mound again to light it. When the smoke turns thin and blue, reach to it to open it.';
    },
    done: (g) => g.flag('charcoalMade'),
    implied: cleanWater,
    hint: {
      ref: 'logs',
      levels: [
        'Wood burned with very little air turns black and hard.',
        'Cover the burning wood so air cannot get in.',
        'Dig away from the stream where the ground is dry.',
        'Dig, stack, cover, then open the mound when the smoke turns thin and blue.',
      ],
    },
  },
  {
    id: 'cleanWater',
    structure: 'filter',
    title: 'Make safe water',
    instruction: 'Build a filter, pour stream water through it, then boil it on your fire.',
    doneMessage: 'Clear is not the same as safe. Boiling did the real work.',
    teach: 'build',
    explains: true,
    howTo: (g) => {
      const stage = workbenchStage(g);
      if (stage === 0) return 'HOW TO START: point a finger and tap the grid icon on your right to open the icons, then tap the hammer icon and tap Workbench. Its glowing outline appears on the ground in front of you.';
      if (stage === 1) return TEACH.place;
      if (stage === 2)
        return 'HOW TO SET THE SLAB: 1. Tap the bag icon and tap the slab. 2. Pinch it with both hands and keep both pinches shut. 3. Hold it just above the three stones. 4. Open both hands wide. It drops into place.';
      return null;
    },
    done: cleanWater,
    hint: {
      ref: 'gravel',
      levels: [
        'Water must be strained and then boiled.',
        'Filter layers from the bottom: cloth, charcoal, sand, gravel.',
        'Build it beside the stream.',
        'Fill your fired pot, tilt it over the filter, then boil what comes through.',
      ],
    },
  },
  {
    id: 'shelter',
    structure: 'shelter',
    title: 'Build a shelter',
    instruction: 'Choose dry, flat ground, raise a sloped roof, add a bed and turn the opening from the wind.',
    doneMessage: 'A roof, a bed and a wall against the wind.',
    teach: 'build',
    explains: true,
    howTo: (g) => {
      const stage = workbenchStage(g);
      if (stage === 0) return 'HOW TO START: point a finger and tap the grid icon on your right to open the icons, then tap the hammer icon and tap Workbench. Its glowing outline appears on the ground in front of you.';
      if (stage === 1) return TEACH.place;
      if (stage === 2)
        return 'HOW TO SET THE SLAB: 1. Tap the bag icon and tap the slab. 2. Pinch it with both hands and keep both pinches shut. 3. Hold it just above the three stones. 4. Open both hands wide. It drops into place.';
      return null;
    },
    substeps: (g) => [
      sub('A safe, dry spot', g.hasEvent('shelter.site.chosen')),
      sub('A roof that keeps rain off', g.hasEvent('shelter.roof.covered')),
      sub('A bed between you and the ground', g.hasEvent('shelter.bed.insulated')),
      sub('The opening away from the wind', g.hasEvent('shelter.wind.blocked')),
    ],
    done: (g) =>
      g.hasEvent('shelter.site.chosen') &&
      g.hasEvent('shelter.roof.covered') &&
      g.hasEvent('shelter.bed.insulated') &&
      g.hasEvent('shelter.wind.blocked'),
    hint: {
      ref: 'branch',
      levels: [
        'A shelter keeps off rain, cold ground and wind.',
        'It needs a sloped roof, a dry bed and an opening away from the wind.',
        'Raised, flat ground, away from the stream and dead branches.',
        'Choose Shelter in the build book and fill each mark.',
      ],
    },
  },
  {
    id: 'science',
    place: 'ruins',
    title: 'Visit the Science Roadmap',
    instruction: 'Follow the rusted mast to the ruins and touch the Science Roadmap.',
    doneMessage: 'Everything you did was an experiment. You can survive here.',
    done: (g) => g.flag('finale'),
    hint: {
      levels: [
        'Someone carved a map of science into stone. It is a wall covered in carvings.',
        'It stands among old ruins, beside a tall rusted mast that rises above the trees.',
        'Look for the rusted mast above the canopy and walk towards it: the ruins are at its foot.',
        'Walk up to the carved wall and touch it with a fingertip.',
      ],
    },
  },
];

const BY_ID = new Map(OBJECTIVES.map((o) => [o.id, o]));
export const objectiveById = (id: string): Objective | undefined => BY_ID.get(id);

// -------------------------------------------------------------- the card

export interface ObjectiveView {
  id: string;
  title: string;
  instruction: string;
  progress: { have: number; need: number } | null;
  substeps: Array<{ text: string; done: boolean }>;
  /** A control to teach right now (first time only). */
  tip: string | null;
  /** Where to find what you need, from where you stand and face ("about 10 metres ahead to your left, along the stream"). */
  where: string | null;
  /** "You have everything for X: go to your workbench and tap X." once a recipe's parts are all in the bag. */
  next: string | null;
  /** A short contextual message ("Stone collected...", "This stone fits here..."); gone after a few seconds. */
  message: string | null;
  /** Why the last build attempt failed. */
  feedback: string | null;
  /** What to collect, when the objective is about finding things (NPE D): "Look for: dry grass, twigs". */
  parts?: string | null;
  /** The one next action, always phrased as a step (NPE D): the contextual line, a ready-to-build note, the first open substep, or how to collect. */
  nextAction?: string | null;
  /** The just-finished objective's message while it is celebrated. */
  celebrating: { title: string; message: string } | null;
  /** 1-based number in the sequence, and how many there are. */
  step: number;
  total: number;
  hintLevel: number;
}

export interface ObjectivesSave {
  v: 1;
  index: number;
  completed: string[];
  bases: Record<string, number>;
  learned: string[];
  hints: Record<string, number>;
  done: boolean;
  closed: boolean;
}

export class ObjectiveTracker {
  /** Index into OBJECTIVES of the current objective. */
  index = 0;
  readonly completed: string[] = [];
  private bases: Record<string, number> = {};
  private learned = new Set<InteractionId>();
  private hints: Record<string, number> = {};
  done = false;
  /** The player closed the card (kept so a reload does not reopen it). */
  closed = false;
  private celebrate: { id: string; left: number } | null = null;
  private fxOff: string | null = null;
  /** Short, auto-dismissing contextual messages (assist.ts MessageGate): one at a time, not repeated soon. */
  readonly gate = new MessageGate();
  private ctxT = 0;
  private feedback: { text: string; left: number } | null = null;

  constructor(
    private readonly game: Game,
    private readonly emit: (e: GameEvent) => void,
  ) {
    this.begin(0);
  }

  get current(): Objective | null {
    return this.done ? null : (OBJECTIVES[this.index] ?? null);
  }

  /** Close or reopen the card. Only the card changes: nothing is paused, reset or forgotten. */
  setClosed(closed: boolean): void {
    this.closed = closed;
  }

  hasLearned(id: InteractionId): boolean {
    return this.learned.has(id);
  }

  learn(id: InteractionId): void {
    if (this.learned.has(id)) return;
    this.learned.add(id);
    this.game.log.add(`learned interaction: ${id}`);
    this.update();
  }

  /** Called with every game event: learns controls from what the player does. */
  observe(e: GameEvent): void {
    switch (e.type) {
      case 'gather':
        if (e.item === 'dryStone' || e.item === 'wetStone') this.gate.say(this.game.time, 'stoneGot', 'Stone collected. You can use it to build structures.');
        this.learned.add('grab');
        if (e.tool) this.learned.add('tool');
        break;
      case 'held':
        if (e.item) this.learned.add('grab');
        break;
      case 'structure':
        this.learned.add('build');
        if (e.structure.spots.some((v) => v !== null) || e.structure.keyPlaced) this.learned.add('place');
        break;
      case 'bench':
        if (e.state === 'start') this.learned.add('bench');
        break;
      case 'fire':
        if (e.stage !== 'cold') this.learned.add('fire');
        break;
      case 'toast':
        // Why something failed is always worth a line on the card (in VR the old status strip is hidden).
        if (e.kind === 'bad') {
          this.feedback = { text: e.text, left: FEEDBACK_SECONDS };
          this.gate.clear();
        }
        break;
    }
  }

  /** Begin objective `i`: remember where progress counts from. */
  private begin(i: number, legacy = false): void {
    const o = OBJECTIVES[i];
    if (!o) return;
    this.bases[o.id] = legacy ? (o.legacyBase ?? 0) : (o.baseline?.(this.game) ?? 0);
  }

  private isDone(o: Objective): boolean {
    return o.done(this.game, this.bases[o.id] ?? 0) || (o.implied?.(this.game) ?? false);
  }

  /** Check the current objective; advance (and save-worthy state changes) at once. */
  update(): void {
    let celebrated = false;
    while (this.current && this.isDone(this.current)) {
      const o = this.current;
      this.completed.push(o.id);
      this.index++;
      this.feedback = null;
      if (this.index >= OBJECTIVES.length) this.done = true;
      else this.begin(this.index);
      this.game.log.add(`objective complete: ${o.id}`, 'ok');
      // Several finished at once (progress made ahead of time): celebrate the first only.
      if (!celebrated) {
        celebrated = true;
        this.celebrate = { id: o.id, left: CELEBRATE_SECONDS };
        this.emit({ type: 'objectiveDone', id: o.id, message: o.doneMessage });
      }
    }
    if (celebrated) this.emit({ type: 'objective', id: this.current?.id ?? null });
  }

  tick(dt: number): void {
    if (this.feedback && (this.feedback.left -= dt) <= 0) this.feedback = null;
    this.gate.tick(dt);
    if ((this.ctxT -= dt) <= 0) {
      this.ctxT = 0.5;
      this.context();
    }
    if (this.celebrate && (this.celebrate.left -= dt) <= 0) {
      this.celebrate = null;
      this.emit({ type: 'objective', id: this.current?.id ?? null });
    }
    this.update();
  }

  /** Contextual messages from where you are and what you hold (at most one, each only now and then). */
  private context(): void {
    const g = this.game;
    const held = g.held;
    const px = g.player.x;
    const pz = g.player.z;
    if (held === 'slab' && !g.structures.some((s) => s.kind === 'workbench')) {
      this.gate.say(g.time, 'slabHeld', 'Find suitable ground to start building.');
    }
    // Near an unfinished build: what it still needs; with a fitting part in hand: where it goes.
    for (const m of openMarks(g.structures)) {
      const d = Math.hypot(m.x - px, m.z - pz);
      if (d > 4) continue;
      if (held && m.accepts.includes(held) && d < 2.5) {
        this.gate.say(g.time, `fits_${m.structure.id}`, `This ${ITEMS[held].name.toLowerCase()} fits here. Release or move it into position.`);
        return;
      }
      const s = m.structure;
      const open = BLUEPRINTS[s.kind].spots.filter((_, i) => s.spots[i] === null).length;
      if (open > 0 && !held) {
        this.gate.say(g.time, `needs_${s.id}`, `Your ${BLUEPRINTS[s.kind].name.toLowerCase()} needs ${open} more ${open === 1 ? 'part' : 'parts'}.`);
        return;
      }
    }
  }

  /** What the card shows now, or null once the tutorial is over. */
  view(): ObjectiveView | null {
    const g = this.game;
    const total = OBJECTIVES.length;
    if (this.celebrate) {
      const o = objectiveById(this.celebrate.id)!;
      return {
        id: o.id,
        title: o.title,
        instruction: '',
        progress: null,
        substeps: [],
        tip: null,
        where: null,
        next: null,
        message: null,
        feedback: null,
        celebrating: { title: o.title, message: o.doneMessage },
        step: OBJECTIVES.indexOf(o) + 1,
        total,
        hintLevel: this.hintLevel(o.id),
      };
    }
    const o = this.current;
    if (!o) return null;
    const substeps = o.substeps ? o.substeps(g) : [];
    const next = nextStepLine(g) ?? readyToBuild(g);
    const message = this.gate.left > 0 ? this.gate.text : null;
    return {
      id: o.id,
      title: o.title,
      instruction: typeof o.instruction === 'function' ? o.instruction(g) : o.instruction,
      progress: o.progress ? o.progress(g, this.bases[o.id] ?? 0) : null,
      parts: partsLine(o, g),
      nextAction: nextActionLine(o, g, message, next, substeps),
      substeps,
      tip: o.howTo?.(g) ?? (o.teach && !this.learned.has(o.teach) ? TEACH[o.teach] : null),
      where: whereFor(o, g),
      next,
      message,
      feedback: this.feedback?.text ?? null,
      celebrating: null,
      step: this.index + 1,
      total,
      hintLevel: this.hintLevel(o.id),
    };
  }

  // ---------------------------------------------------------------- hints

  hintLevel(id: string): number {
    return this.hints[id] ?? 0;
  }

  /** Unlock the next hint level (1..4) of an objective and return the level now open. */
  unlockHint(id: string): number {
    const level = Math.min(4, this.hintLevel(id) + 1);
    this.hints[id] = level;
    this.fxOff = null; // a new level turns its effects back on
    this.emit({ type: 'hintGiven', level });
    return level;
  }

  /** The hint level whose world effects (pulse, beacon, marker) should be showing now: 0 once dismissed or for another objective. */
  hintFxLevel(): number {
    const o = this.current;
    return o && this.fxOff !== o.id ? this.hintLevel(o.id) : 0;
  }

  /** Switch the current objective's hint effects off (the level stays unlocked). Completing the objective also ends them. */
  dismissHintFx(): void {
    this.fxOff = this.current?.id ?? null;
  }

  // ----------------------------------------------------------- save / load

  snapshot(): ObjectivesSave {
    return {
      v: 1,
      index: this.index,
      completed: [...this.completed],
      bases: { ...this.bases },
      learned: [...this.learned],
      hints: { ...this.hints },
      done: this.done,
      closed: this.closed,
    };
  }

  /**
   * Restore from a save. A save without objectives (made before this layer)
   * is migrated from the state it already has: every objective already
   * satisfied is marked done, silently, so finished tutorials never restart.
   */
  restore(s: ObjectivesSave | undefined): void {
    this.completed.length = 0;
    this.celebrate = null;
    this.feedback = null;
    if (s) {
      this.index = Math.max(0, Math.min(OBJECTIVES.length, s.index));
      this.completed.push(...s.completed);
      this.bases = { ...s.bases };
      this.learned = new Set(s.learned as InteractionId[]);
      this.hints = { ...s.hints };
      this.done = s.done || this.index >= OBJECTIVES.length;
      this.closed = !!s.closed;
      this.update();
      return;
    }
    this.index = 0;
    this.bases = {};
    this.done = false;
    this.begin(0, true);
    while (this.current && this.isDone(this.current)) {
      const o = this.current;
      this.completed.push(o.id);
      if (o.teach) this.learned.add(o.teach);
      this.index++;
      if (this.index >= OBJECTIVES.length) this.done = true;
      else this.begin(this.index, true);
    }
  }
}

/**
 * The card's content once the beginner objectives are over (and for a closed
 * tutorial): the existing quest's current step, in the same compact shape.
 */
export function questView(g: Game): ObjectiveView | null {
  const q = g.quest;
  if (!q) return null;
  const cur = g.currentStep();
  const idx = QUESTS.indexOf(q);
  return {
    id: 'quest',
    title: q.title,
    instruction: cur ? cur.step.text(g).replace(/[✓·]/g, '').trim() : q.desc,
    progress: null,
    substeps: [],
    tip: null,
    where: null,
    next: nextStepLine(g),
    message: null,
    feedback: null,
    celebrating: null,
    step: idx + 1,
    total: QUESTS.length,
    hintLevel: 0,
  };
}

/** What the objective card shows: a beginner objective, then the quest chain. */
export function cardView(g: Game): ObjectiveView | null {
  return g.objectives.view() ?? questView(g);
}
