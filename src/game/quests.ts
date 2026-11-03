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
import type { ScienceEventId } from './science-events.js';

export type HintTarget =
  | { items: ItemId[] }
  | { structure: StructureKind; items: ItemId[] };

export interface QuestStep {
  text: (g: Game) => string;
  done: (g: Game) => boolean;
  hints: [string, string];
  target: HintTarget;
  /** Guide (src/game/guides.ts) that walks the player through this step. */
  guide?: string;
}

export interface Quest {
  title: string;
  desc: string;
  /** Roadmap node this quest lights up when complete. */
  roadmapNode: string | null;
  /** One or two sentences recapping the science, shown when the quest ends. */
  recap?: string;
  steps: QuestStep[];
}

/** A step that is done once a science event (science-events.ts) has fired. */
const onEvent = (id: ScienceEventId): ((g: Game) => boolean) => (g) => g.hasEvent(id);

const mark = (ok: boolean): string => (ok ? '✓' : '·');
const count = (g: Game, id: ItemId, n: number): string =>
  `${Math.min(n, g.gatheredCount(id))}/${n}`;

const survivalQuests: Quest[] = [
  {
    title: 'A Roof for the Night',
    roadmapNode: null,
    recap:
      'Cold air sinks, water runs downhill, still air insulates and wind steals heat. A good shelter handles all four.',
    desc: 'The nights are cold. Before dark you need somewhere that keeps you dry and holds in your warmth.',
    steps: [
      {
        text: (g) => `A safe, dry place to sleep ${mark(g.hasEvent('shelter.site.chosen'))}`,
        done: onEvent('shelter.site.chosen'),
        hints: [
          'Where does cold air and rainwater collect? Where could something fall on you?',
          'Slightly raised, flat ground, away from the stream and from dead branches overhead.',
        ],
        target: { items: [] },
      },
      {
        text: (g) => `Shelter to keep rain off ${mark(g.hasEvent('shelter.roof.covered'))}`,
        done: onEvent('shelter.roof.covered'),
        guide: 'shelter',
        hints: [
          'A roof needs a slope so water has somewhere to go. What can hold a sloped ridge up?',
          'Long sticks leaned on a branch or rock, then many layers of leaves, bark or branches.',
        ],
        target: { items: ['spindle', 'greenBranch'] },
      },
      {
        text: (g) => `Something between you and the cold ground ${mark(g.hasEvent('shelter.bed.insulated'))}`,
        done: onEvent('shelter.bed.insulated'),
        hints: [
          'Heat leaks into the ground. What traps still air?',
          'A thick, fluffy pile of dry leaves, grass or pine needles.',
        ],
        target: { items: ['dryGrass'] },
      },
      {
        text: (g) => `Turn the opening away from the wind ${mark(g.hasEvent('shelter.wind.blocked'))}`,
        done: onEvent('shelter.wind.blocked'),
        hints: [
          'Moving air steals warmth. Which way does the wind come from?',
          'Face the opening away from it, and put your back to the long wall.',
        ],
        target: { items: [] },
      },
    ],
  },
  {
    title: 'Edge and Lever',
    roadmapNode: null,
    recap:
      'A thin edge concentrates force. Handles and levers trade distance for force or speed. Wedges and the grain of wood help you split.',
    desc: 'Bare hands will not cut, chop or lift enough. Make tools that multiply what you can do.',
    steps: [
      {
        text: (g) => `Something sharp, made by breaking a stone ${mark(g.hasEvent('tool.knap.flake'))}`,
        done: onEvent('tool.knap.flake'),
        guide: 'knap',
        hints: [
          'Some stones break into thin, glassy edges. Which ones, and how do you strike them?',
          'Look for dark, fine-grained stone near water or cliffs. Strike it with a harder stone.',
        ],
        target: { items: ['dryStone'] },
      },
      {
        text: (g) => `Use your edge to cut something ${mark(g.hasEvent('tool.edge.cut'))}`,
        done: onEvent('tool.edge.cut'),
        hints: [
          'Pressure is force over area. What gets more pressure from the same push?',
          'Press the sharp edge on cane, cord or soft wood.',
        ],
        target: { items: ['cane', 'fibers'] },
      },
      {
        text: (g) => `Make a tool for chopping: head, handle and a firm lashing ${mark(g.hasEvent('tool.axe.made'))}`,
        done: onEvent('tool.axe.made'),
        guide: 'axe',
        hints: [
          'A tool swung from a distance moves faster at the tip. What holds the head on?',
          'A stout stick, your stone edge and cord wrapped many times.',
        ],
        target: { structure: 'workbench', items: ['cord'] },
      },
      {
        text: (g) => `Move something heavy with a stick ${mark(g.hasEvent('tool.lever.used'))}`,
        done: onEvent('tool.lever.used'),
        hints: [
          'A long arm on one side of a pivot lets a small push beat a big weight.',
          'Slide a strong stick under a heavy rock, with a smaller rock as the pivot near the load.',
        ],
        target: { items: ['forkedStick'] },
      },
      {
        text: (g) => `Split a log ${mark(g.hasEvent('tool.wedge.split'))}`,
        done: onEvent('tool.wedge.split'),
        hints: [
          'Wood is stringy in one direction. Which way is it easiest to pull apart?',
          'Strike the log end-on, along the grain, using your axe as a wedge.',
        ],
        target: { items: ['logs'] },
      },
    ],
  },
  {
    title: 'The Hunt',
    roadmapNode: null,
    recap:
      'A bow stores energy and releases it as speed; gravity bends the arrow’s path; hunters read tracks and use the way predator and prey are built.',
    desc: 'Berries and plants will not keep you going. Learn to find and take an animal, and to cook it safely.',
    steps: [
      {
        text: (g) => `Find where animals pass ${mark(g.hasEvent('hunt.track.found'))}`,
        done: onEvent('hunt.track.found'),
        hints: [
          'Animals leave marks where ground is soft. Where do they go to drink?',
          'Check muddy ground near the stream and along game trails in the forest.',
        ],
        target: { items: [] },
      },
      {
        text: (g) => `A projectile that flies straight ${mark(g.hasEvent('hunt.fletch.made'))}`,
        done: onEvent('hunt.fletch.made'),
        hints: [
          'A shaft alone tumbles. What at the back would steady it?',
          'Straight dry shafts with feathers or stiff leaves tied to the tail.',
        ],
        target: { items: ['spindle', 'cord'] },
      },
      {
        text: (g) => `Shoot, and watch where the arrow falls ${mark(g.hasEvent('hunt.arrow.fly'))}`,
        done: onEvent('hunt.arrow.fly'),
        hints: [
          'Gravity acts the whole flight. Where should you aim at long range?',
          'Aim a little above the target and try a few shots at the training mark.',
        ],
        target: { items: ['bowDrill'] },
      },
      {
        text: (g) => `Bring down an animal ${mark(g.hasEvent('hunt.arrow.hit'))}`,
        done: onEvent('hunt.arrow.hit'),
        hints: [
          'The target moves while the arrow flies. Where will it be?',
          'Stay downwind and low, wait for a clear side shot, and aim ahead.',
        ],
        target: { items: [] },
      },
      {
        text: (g) => `Make the meat safe to eat ${mark(g.hasEvent('food.cooked'))}`,
        done: onEvent('food.cooked'),
        hints: [
          'Raw meat can carry microbes. What kills them?',
          'Cook it through over your fire. A pale centre is not done.',
        ],
        target: { structure: 'firePit', items: [] },
      },
    ],
  },
  {
    title: 'Staying Well',
    roadmapNode: null,
    recap:
      'Water, food and warmth are energy and balance. Cleaning wounds and drying off prevent the problems that quietly cause the most trouble.',
    desc: 'Your body is a machine with needs. Keep water, food, warmth and wounds under control.',
    steps: [
      {
        text: (g) => `Let muddy water clear before you filter it ${mark(g.hasEvent('water.sediment.settle'))}`,
        done: onEvent('water.sediment.settle'),
        hints: [
          'Heavy particles sink if the water is still. What do you need to leave it in?',
          'Fill your pot with stream water and leave it undisturbed for a while.',
        ],
        target: { items: ['pot'] },
      },
      {
        text: (g) => `Drink water that is actually safe ${mark(g.hasEvent('body.drink'))}`,
        done: onEvent('body.drink'),
        hints: [
          'Bad water can leave you more dehydrated. What did you learn that makes water safe?',
          'Filter it, boil it, let it cool, then drink.',
        ],
        target: { structure: 'firePit', items: ['pot'] },
      },
      {
        text: (g) => `Eat something; your body burns calories to work and stay warm ${mark(g.hasEvent('body.eat'))}`,
        done: onEvent('body.eat'),
        hints: [
          'Work and cold both cost energy. What can you eat safely?',
          'Cooked meat from the hunt, or plants you are sure of.',
        ],
        target: { items: [] },
      },
      {
        text: (g) => `Treat a cut properly ${mark(g.hasEvent('body.wound.cleaned'))}`,
        done: onEvent('body.wound.cleaned'),
        hints: [
          'Dirt carries the microbes that cause infection. What flushes them out?',
          'Wash it with safe water and keep it clean.',
        ],
        target: { items: [] },
      },
    ],
  },
  {
    title: 'Camp for the Night',
    roadmapNode: null,
    recap:
      'Clear skies mean colder nights, so plan for them. Fuel, air and heat decide how long a fire lasts, and thick white smoke is visible from far away.',
    desc: 'Night is coming and the sky is clearing. Prepare, then keep your camp running until dawn.',
    steps: [
      {
        text: (g) => `Look at the sky before dark ${mark(g.hasEvent('weather.sky.read'))}`,
        done: onEvent('weather.sky.read'),
        hints: [
          'Clouds tell you about rising air. What do you expect from tonight’s sky?',
          'Stop at dusk and look up.',
        ],
        target: { items: [] },
      },
      {
        text: (g) => `Heat water without putting a pot on the flames ${mark(g.hasEvent('fire.hotstones.boil'))}`,
        done: onEvent('fire.hotstones.boil'),
        hints: [
          'What carries heat from fire to water? Think of what holds heat well.',
          'Heat dry stones in the fire and drop them in. Not wet ones from the stream.',
        ],
        target: { structure: 'firePit', items: ['dryStone', 'pot'] },
      },
      {
        text: (g) => `A signal anyone could see ${mark(g.hasEvent('fire.signal.smoke'))}`,
        done: onEvent('fire.signal.smoke'),
        hints: [
          'What kind of smoke stands out against the trees by day?',
          'Add green leaves to a good fire to make it thick and pale.',
        ],
        target: { structure: 'firePit', items: [] },
      },
      {
        text: (g) => `Keep the fire alive until morning ${mark(g.hasEvent('fire.night.kept'))}`,
        done: onEvent('fire.night.kept'),
        hints: [
          'A fire only lasts as long as its fuel. Which fuel burns slowest?',
          'Gather dense logs before dark and add them as it burns down.',
        ],
        target: { items: ['logs'] },
      },
    ],
  },
];

const inCamp = (g: Game, kind: StructureKind): boolean => g.camp().some((s) => s.kind === kind);
const everHad = (g: Game, id: ItemId): boolean => g.gatheredCount(id) > 0 || g.count(id) > 0 || g.held === id;

/** Level 3 "Camp": a base by your fire, and food from the stream and the soil. */
const campQuests: Quest[] = [
  {
    title: 'Make Camp',
    roadmapNode: null,
    recap: 'A camp clusters what you need around the fire: warmth, shelter and dry storage, close enough to tend all of them.',
    desc: 'Wandering wastes energy. Build a base around your fire pit: somewhere to sleep and somewhere to keep things dry.',
    steps: [
      {
        text: (g) => `A fire pit at the heart of camp ${mark(g.hasStructure('firePit'))}`,
        done: (g) => g.hasStructure('firePit'),
        hints: ['Everything in camp should be close to warmth and light.', 'Your fire pit is the centre. Build one if it is gone.'],
        target: { structure: 'firePit', items: ['dryStone'] },
        guide: 'firePit',
      },
      {
        text: (g) => `A shelter near the fire ${mark(inCamp(g, 'shelter'))}`,
        done: (g) => inCamp(g, 'shelter'),
        hints: [
          'Cold air sinks and rain runs downhill. Where would you sleep dry and warm?',
          'Raised, open ground within a short walk of your fire. Lean branches on a ridge pole.',
        ],
        target: { structure: 'shelter', items: ['branch'] },
        guide: 'shelter',
      },
      {
        text: (g) => `Dry storage in camp ${mark(inCamp(g, 'storage'))}`,
        done: (g) => inCamp(g, 'storage'),
        hints: [
          'Food and tinder spoil when damp. What could you weave to keep them off the ground?',
          'Hollow canes grow by the stream. Weave them into a basket near the fire.',
        ],
        target: { structure: 'storage', items: ['cane'] },
      },
    ],
  },
  {
    title: 'Catch a Fish',
    roadmapNode: null,
    recap: 'Light bends at the water’s surface, so fish are deeper and nearer than they look. Aim below what you see.',
    desc: 'There are fish in the stream. You need something long and sharp, and a good eye.',
    steps: [
      {
        text: (g) => `Something long and sharp to strike with ${mark(everHad(g, 'fishingSpear'))}`,
        done: (g) => everHad(g, 'fishingSpear'),
        hints: [
          'Hands are too slow underwater. What reaches and pierces?',
          'A straight stick with a split, sharpened tip, made at your workbench.',
        ],
        target: { structure: 'workbench', items: ['spindle', 'flake'] },
      },
      {
        text: (g) => `Spear a fish ${mark(g.hasEvent('food.fish.caught'))}`,
        done: onEvent('food.fish.caught'),
        hints: [
          'Water bends light. Is the fish really where you see it?',
          'Stand on the bank where shadows move in the stream. Thrust below where the fish appears.',
        ],
        target: { items: [] },
      },
    ],
  },
  {
    title: 'Cook Your Catch',
    roadmapNode: null,
    recap: 'Heat denatures proteins, turning flesh opaque, and kills bacteria and parasites. Food is energy for work and warmth.',
    desc: 'Raw fish is risky. Make it safe, then eat.',
    steps: [
      {
        text: (g) => `Cook the fish through ${mark(g.hasEvent('food.fish.opaque'))}`,
        done: onEvent('food.fish.opaque'),
        hints: [
          'What kills the microbes and parasites in raw flesh?',
          'Hold it over your burning fire until it turns opaque.',
        ],
        target: { structure: 'firePit', items: [] },
      },
      {
        text: (g) => `Eat ${mark(g.hasEvent('body.eat'))}`,
        done: onEvent('body.eat'),
        hints: ['Your body runs on food energy.', 'Hold the cooked fish and eat it.'],
        target: { items: [] },
      },
    ],
  },
  {
    title: 'Grow Food',
    roadmapNode: null,
    recap: 'Plants turn water, air and sunlight into stored food. Loose soil, water and light make them grow; a tuber can grow a whole new plant.',
    desc: 'Hunting and fishing are uncertain. Grow food you can count on.',
    steps: [
      {
        text: (g) => `Something that grows: a tuber or seeds ${mark(everHad(g, 'tuber') || everHad(g, 'seeds'))}`,
        done: (g) => everHad(g, 'tuber') || everHad(g, 'seeds'),
        hints: [
          'Some plants store food underground; others make seeds. Both can grow again.',
          'Look for leafy wild tuber plants at the edges of sunny clearings.',
        ],
        target: { items: [] },
      },
      {
        text: (g) => `Dig a plot ${mark(g.hasEvent('farm.plot.dug'))}`,
        done: onEvent('farm.plot.dug'),
        hints: ['Roots need loose soil with air in it.', 'Hold your digging stick over open, sunny ground away from the stream.'],
        target: { items: ['diggingStick'] },
      },
      {
        text: (g) => `Plant it ${mark(g.hasEvent('farm.planted'))}`,
        done: onEvent('farm.planted'),
        hints: ['A plant needs light. Is your plot under trees?', 'Hold the tuber or seeds over your plot.'],
        target: { items: [] },
      },
      {
        text: (g) => `Water it ${mark(g.hasEvent('farm.watered'))}`,
        done: onEvent('farm.watered'),
        hints: ['Roots drink. How can you carry water to them?', 'Fill your pot at the stream and pour it on the plot.'],
        target: { items: ['pot'] },
      },
      {
        text: (g) => `Harvest what you grew ${mark(g.hasEvent('farm.harvested'))}`,
        done: onEvent('farm.harvested'),
        hints: ['Growth takes time, water and light.', 'Keep the soil moist; come back when the plant is full-grown.'],
        target: { items: [] },
      },
    ],
  },
];

/**
 * Extra survival quests (shelter, tools, hunting, wellbeing, night camp).
 * Not in the main chain until their interactions emit the events they wait on.
 */
export const EXTRA_QUESTS: Quest[] = survivalQuests;

export const QUESTS: Quest[] = [
  {
    title: 'Scavenger',
    recap: 'Dry, thin, dead material catches fire first; friction turns motion into heat; a twisted cord and three legs are strong for geometric reasons.',
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
        guide: 'workbench',
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
        guide: 'cord',
        hints: [
          'Some tall plants have long, tough fibres in their stems.',
          'They grow in open, sunny ground and along the stream.',
        ],
        target: { items: ['fibers'] },
      },
      {
        text: () => 'Build the friction tool at your workbench',
        done: (g) => g.flag('hasDrill'),
        guide: 'bowDrill',
        hints: [
          'Click (or pinch) your workbench, choose the bow drill, then make it with your hands step by step.',
          'A spindle, a board, a bow and a cord make a bow drill.',
        ],
        target: { structure: 'workbench', items: ['slab'] },
      },
    ],
  },
  {
    title: 'First Fire',
    recap: 'A fire needs fuel, heat and oxygen. You climb a ladder from tinder to kindling to logs, because small pieces heat up faster.',
    roadmapNode: 'fire',
    desc: 'Night will come. No lighters, no matches — only physics.',
    steps: [
      {
        text: (g) => `A safe place for a fire ${mark(g.hasStructure('firePit'))}`,
        done: (g) => g.hasStructure('firePit'),
        guide: 'firePit',
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
    recap: 'Clay is plastic when wet. Grit stops cracks, drying removes water before firing, and firing fuses it into ceramic.',
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
    recap: 'Heating wood with little oxygen drives off water and gases and leaves carbon. More oxygen only makes ash.',
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
    recap: 'Filters strain particles, charcoal adsorbs some chemicals, and boiling is what kills microbes. Clear water can still be unsafe.',
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
        text: () => 'Build the filter, pour stream water through it, then boil it on your fire',
        done: (g) => g.flag('waterSafe'),
        hints: [
          'Water flows top to bottom. What should it meet first — and what holds everything in at the bottom?',
          'Particles aren’t the only danger in water.',
        ],
        target: { structure: 'firePit', items: [] },
      },
    ],
  },
  ...campQuests,
  {
    title: 'First Lab',
    recap: 'Every step you took was an experiment: observe, test, and explain why it worked.',
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
