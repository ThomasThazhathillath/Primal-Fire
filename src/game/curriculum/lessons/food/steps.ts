// Lesson 05 (Food & Navigation): steps on fishing, cooking, judging wild plants, nutrition, farming,
// preserving, tracking, ecology, the weather and the sun, then the long trek without a compass and a check.
// Experiment steps share their experiment's id (experiments.ts); the trek and the check are in field.ts.
import type { Game } from '../../../game.js';
import { describePlace } from '../../../directions.js';
import { FORAGE_PATCHES, type ForagePatch } from '../../../forage.js';
import { TREK_FOOD } from './field.js';

/** Where the nearest wild plant you could look at (or pick from) is, in words, or '' if none. */
function nearestPlant(g: Game, want: (p: ForagePatch) => boolean): string {
  let best: ForagePatch | null = null;
  let bd = Infinity;
  for (const p of FORAGE_PATCHES) {
    if (g.food.stock[p.id] <= 0 || !want(p)) continue;
    const d = Math.hypot(p.x - g.player.x, p.z - g.player.z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best ? ` ${describePlace(best.x, best.z, g.player, g.facingYaw)}` : '';
}
import type { HintInfo } from '../../../hint-info.js';
import type { ItemId } from '../../../items.js';
import type { Step } from '../../types.js';

const everHad = (g: Game, id: ItemId): boolean => g.gatheredCount(id) > 0 || g.count(id) > 0 || g.held === id;

export const FOOD_STEPS: Step[] = [
  {
    id: 'spear',
    find: (g) => (everHad(g, 'fishingSpear') ? [] : (['spindle', 'flake'] as ItemId[]).filter((id) => g.count(id) === 0)),
    title: 'Make a fishing spear',
    short: 'Make a spear at the bench',
    instruction: 'At your workbench, make a long, sharp fishing spear.',
    doneMessage: 'A spear: long reach and a sharp point.',
    teach: 'bench',
    done: (g) => everHad(g, 'fishingSpear'),
    hint: {
      ref: 'fishingSpear',
      levels: [
        'Fish are fast and slippery. You need reach and a point.',
        'A long straight shaft with a sharp tip.',
        'Make it at your workbench.',
        'Poke the workbench and choose the fishing spear.',
      ],
    },
  },
  {
    id: 'fish',
    find: () => [],
    place: 'bend',
    title: 'Catch a fish',
    short: 'Spear a fish below its image',
    instruction: 'Stand still at the stream, hold the spear and thrust down. Aim below where the fish appears.',
    doneMessage: 'Light bends at the surface, so a fish is deeper than it looks.',
    done: (g) => g.hasEvent('food.fish.caught'),
    hint: {
      ref: 'fish',
      levels: [
        'Fish are not quite where they appear.',
        'Light bends as it leaves the water, so the fish looks shallower than it is.',
        'Fish gather in the slow pools of the stream.',
        'Hold the spear over the water, aim a little below the fish and thrust down fast.',
      ],
    },
  },
  {
    id: 'cook',
    title: 'Cook your catch',
    short: 'Cook the fish over the fire',
    instruction: 'Clean the fish with a sharp edge at the water, then hold it over a burning fire until the flesh turns opaque.',
    doneMessage: 'Heat changes proteins (the flesh turns opaque) and kills most germs.',
    done: (g) => g.hasEvent('food.fish.opaque') || g.hasEvent('food.cooked'),
    hint: {
      ref: 'cookedFish',
      levels: [
        'Raw food can carry germs and parasites.',
        'Heat changes proteins: clear flesh turns white and firm.',
        'Over your fire.',
        'Hold the fish over the flames until it is opaque all the way through.',
      ],
    },
  },
  {
    id: 'grow',
    find: (g) => (g.gatheredCount('seeds') > 0 || g.hasEvent('farm.planted') ? [] : ['tuber']),
    title: 'Grow food',
    short: 'Plant, water and harvest',
    instruction: 'Dig a plot in sunny ground, plant seeds, keep the soil moist and harvest when the plant is ripe.',
    doneMessage: 'Plants turn sunlight, water and air into food you can store. Keep some seed.',
    done: (g) => g.hasEvent('farm.harvested'),
    hint: {
      ref: 'seeds',
      levels: [
        'A plant needs loose soil, water and light.',
        'Seeds come from a wild tuber plant; shade slows growth, dry soil wilts it.',
        'Open, sunny ground near the stream.',
        'Dig a plot with the digging stick, hold seeds over it, water it and come back to harvest.',
      ],
    },
  },
  {
    id: 'trail',
    title: 'Follow a hidden trail',
    short: 'Read and follow tracks',
    instruction: 'Find animal tracks, read whose they are and how fresh, and follow the trail.',
    doneMessage: 'Sharp-edged prints are fresh; size and spacing tell you who made them.',
    // Reading whose prints they are and following five of them is the step; seeing the animal itself is a bonus.
    done: (g) => g.living.has('hiddenTrail') || g.hasEvent('hunt.track.followed'),
    hint: {
      levels: [
        'Animals leave signs where the ground is soft.',
        'Fresh prints have sharp edges; old ones are blurred by rain and wind.',
        'Look on soft ground near water and along the edges of clearings.',
        'Stand on a track to read it, then follow the prints in the direction they point.',
      ],
    },
  },
  {
    id: 'plantId',
    title: 'Judge a wild plant',
    short: 'Judge plants before eating',
    instruction: (g) =>
      `Look closely at wild berry, nut and root plants. Compare every feature with the field guide, then decide: safe, not safe or not sure.${nearestPlant(g, (p) => !g.food.judged.has(p.id))}`,
    doneMessage: 'A look-alike can match most features and still make you ill. Every feature must match.',
    done: (g) => g.experiments.done('plantId'),
    hint: {
      levels: [
        'Some poisonous plants look almost exactly like food plants.',
        'Fruit, stem, leaves and smell: a food plant matches the guide in every one.',
        'Berry, nut and root plants grow at the forest edges, near the trees.',
        'Stand by a plant with empty hands, look closely (U, or reach out), then choose on the card.',
      ],
    },
  },
  {
    id: 'nutrition',
    title: 'Test what keeps you going',
    short: 'Eat berries, nuts and fish',
    instruction: (g) =>
      `Eat berries, nuts and some fish, one at a time, and see how long each keeps feeding you.${nearestPlant(g, (p) => p.edible && (p.yield === 'berries' || p.yield === 'nuts'))}`,
    doneMessage: 'Sugar is quick energy; fat and protein keep coming for longer.',
    done: (g) => g.experiments.done('nutrition'),
    find: (g) => (['berries', 'nuts'] as ItemId[]).filter((id) => g.count(id) === 0 && g.held !== id),
    hint: {
      levels: [
        'Food is made of sugar, fat and protein, and the body takes them in at different speeds.',
        'Berries are mostly sugar, nuts mostly fat, fish mostly protein.',
        'Berries and nuts grow at the forest edges; fish swim in the stream.',
        'Hold a food and eat it (U, or bring it to your mouth). Wait a while before the next.',
      ],
    },
  },
  {
    id: 'basket',
    title: 'Weave a gathering basket',
    short: 'Weave a basket',
    instruction: 'Weave a basket from 3 canes and 2 cords (open your satchel and choose Make). It carries far more food.',
    doneMessage: 'A basket carries more food home, and makes it easy to take too much.',
    done: (g) => g.packUpgrades.has('basket'),
    find: (g) => (g.count('cane') < 3 ? ['cane'] : g.count('cord') < 2 ? ['fibers'] : []),
    hint: {
      ref: 'cane',
      levels: [
        'Hands carry little. Woven plant stems hold a lot.',
        'Hollow canes, woven together and bound with cord.',
        'Canes grow along the stream banks.',
        'Carry 3 canes and 2 cords, open the satchel and choose Make: Woven basket.',
      ],
    },
  },
  {
    id: 'dryingTest',
    title: 'Fresh or dried?',
    short: 'Compare fresh and dried fish',
    instruction: 'Dry a fish on a drying rack, then carry a dried fish and a fresh fish for the same time and compare them.',
    doneMessage: 'Microbes need water. Dried food keeps; fresh food goes off.',
    done: (g) => g.experiments.done('dryingTest'),
    hint: {
      levels: [
        'Food rots because tiny living things grow in it.',
        'They need water to grow. Take the water out and they can hardly grow.',
        'A drying rack in the open air, in dry daylight, near camp.',
        'Hang a fish on the rack and wait for it to dry, then carry it with a fresh fish.',
      ],
    },
  },
  {
    id: 'overharvest',
    title: 'Pick with care',
    short: 'Pick some, strip some',
    instruction: 'Pick part of one food patch and strip another bare. Come back later and compare how they grow back.',
    doneMessage: 'What you leave rebuilds the patch. Take too much and it comes back thin.',
    done: (g) => g.experiments.done('overharvest'),
    hint: {
      levels: [
        'A plant regrows from what is left of it.',
        'Fruit and seed left behind make the next harvest.',
        'Any food patch you have judged safe.',
        'Pick once from one patch and leave the rest; pick another until nothing is left. Wait a few minutes.',
      ],
    },
  },
  {
    id: 'skyTest',
    title: 'Read the sky',
    short: 'Look up, then watch',
    instruction: 'Look up at the open sky when it is clear and again when dark clouds are building, and watch what the weather does.',
    doneMessage: 'Dark, building clouds often bring rain: a warning, not a promise.',
    done: (g) => g.experiments.done('skyTest'),
    hint: {
      levels: [
        'Rain comes from clouds, and clouds change before rain.',
        'Thickening, darkening clouds hold more and more water.',
        'Anywhere under the open sky, away from your roof.',
        'Look straight up for a moment (drag the mouse up on a computer). Then wait and watch.',
      ],
    },
  },
  {
    id: 'sunPath',
    title: 'Follow the sun',
    short: 'Face the sun, morning and afternoon',
    instruction: 'Face the sun for a moment in the morning and again in the afternoon. Note where it is each time.',
    doneMessage: 'The sun rises in the east and sets in the west: a compass in the sky.',
    done: (g) => g.experiments.done('sunPath'),
    hint: {
      levels: [
        'The sun moves across the sky in the same way every day.',
        'Your compass tape shows which way you face while you look at it.',
        'Out in the open, where the trees do not hide it.',
        'Turn until the sun is straight ahead and hold still for a moment.',
      ],
    },
  },
  {
    id: 'trek',
    title: 'The long trek',
    short: 'To the Ruins and back, no compass',
    instruction: (g) => `Walk to the Ruins (${g.field.trekBearing()} of camp) and back with your compass covered. Steer by the sun and landmarks, gather ${TREK_FOOD} food, eat on the way, and be home before dark.`,
    doneMessage: 'You found your way, fed yourself and came home safe. You can survive out here.',
    substeps: (g) => g.field.trekGoals(),
    done: (g) => g.field.trek.phase === 'done',
    hint: {
      levels: [
        'The sun tells direction: east in the morning, south at midday, west in the afternoon.',
        'The Ruins lie under a tall rusted mast that rises above the trees.',
        'Look for the mast above the canopy, and keep the sun on the side that matches the time of day.',
        'Leave camp in daylight. To head north-west in the morning, keep the sun behind you, over your right shoulder.',
      ],
    },
  },
  {
    id: 'finalCheck',
    title: 'What did you learn?',
    short: 'Answer four questions',
    instruction: 'Four short questions about food, plants, the sun and preserving. Wrong answers explain themselves.',
    doneMessage: 'You can feed yourself, read the land and find your way. Every step was an experiment.',
    done: (g) => g.field.checkDone,
    hint: {
      levels: [
        'Think back over what your experiments showed.',
        'Every answer is something you saw happen.',
        'The question card opens by itself; Why? on this card opens it again.',
        'Pick an answer; if it is wrong, read why and try again.',
      ],
    },
  },
];


const item = (id: ItemId, x = 0, z = 0) => ({ kind: 'item' as const, id, x, z });

export const FOOD_HINTS: Record<string, HintInfo> = {
  spear: {
    name: 'Fishing spear',
    look: 'A long straight shaft with a sharp point.',
    why: 'Reach and a point let you strike a fish before it darts away.',
    avoid: 'A short stick: you would have to put your hand in the water.',
    views: [{ pieces: [item('fishingSpear')], caption: 'A fishing spear' }],
  },
  fish: {
    name: 'Fish in the stream',
    look: 'Dark shapes in the slow pools; they look closer to the surface than they are.',
    why: 'Fish are protein and fat: lasting energy.',
    avoid: 'Rushing the bank: fish bolt from footsteps and shadows.',
    views: [{ pieces: [item('fish')], caption: 'A fish' }],
  },
  cook: {
    name: 'Cooked fish',
    look: 'Flesh that has turned from clear to white and firm all the way through.',
    why: 'Cooking kills most germs and parasites and makes food easier to digest.',
    avoid: 'Eating it raw or half-cooked.',
    views: [{ pieces: [item('cookedFish')], caption: 'Cooked through' }],
  },
  grow: {
    name: 'Food plants',
    look: 'Seeds from a wild tuber plant, planted in loose, sunny soil.',
    why: 'Growing food turns one find into a supply.',
    avoid: 'Shade and dry soil: growth slows or stops.',
    views: [{ pieces: [item('seeds', -0.2, 0), item('tuber', 0.2, 0)], caption: 'Seeds and a tuber' }],
  },
  trail: {
    name: 'Animal tracks',
    look: 'Prints pressed into soft ground, in a line.',
    why: 'Tracks tell you which animals live here, how recently they passed and where they go.',
    avoid: 'Blurred, old prints: the animal is long gone.',
    views: [{ pieces: [{ kind: 'look', id: 'mossRock', x: 0, z: 0 }], caption: 'Soft ground near water' }],
  },
  plantId: {
    name: 'Judge before you eat',
    look: 'Fruit, stem, leaves and smell, each compared with the field guide.',
    why: 'Look-alikes match most features. Only a full match identifies a plant.',
    avoid: 'Trusting colour alone, or tasting to find out.',
    views: [{ pieces: [item('berries', -0.2, 0), item('nuts', 0.2, 0)], caption: 'Berries and nuts' }],
  },
  nutrition: {
    name: 'Sugar, fat, protein',
    look: 'Berries (sugar), nuts (fat), fish (protein).',
    why: 'Each gives energy at a different speed; fat holds the most per bite.',
    avoid: 'Eating everything at once: you cannot tell what lasted.',
    views: [{ pieces: [item('berries', -0.25, 0), item('nuts', 0, 0), item('cookedFish', 0.3, 0)], caption: 'Three kinds of food' }],
  },
  basket: {
    name: 'Woven basket',
    look: 'Canes woven together and bound with cord.',
    why: 'You carry far more food home in one trip.',
    avoid: 'Filling it from one patch until nothing is left.',
    views: [{ pieces: [item('cane', -0.2, 0), item('cord', 0.2, 0)], caption: 'Canes and cord' }],
  },
  dryingTest: {
    name: 'Dried fish',
    look: 'Hard, light strips with the water dried out.',
    why: 'Without water, microbes can hardly grow, so it keeps.',
    avoid: 'Drying in rain or at night: it stays wet.',
    views: [{ pieces: [item('fish', -0.2, 0), item('driedFish', 0.2, 0)], caption: 'Fresh and dried' }],
  },
  overharvest: {
    name: 'A food patch',
    look: 'A bush with fruit left on it after picking.',
    why: 'What you leave fruits again and spreads seed.',
    avoid: 'Stripping it bare: it comes back slowly and thin.',
    views: [{ pieces: [item('berries')], caption: 'Leave some' }],
  },
  skyTest: {
    name: 'Building clouds',
    look: 'Clouds that thicken and darken, piling up.',
    why: 'Rising moist air cools and its water forms clouds, then rain.',
    avoid: 'Waiting for the first drops before you act.',
    views: [{ pieces: [{ kind: 'look', id: 'mossRock', x: 0, z: 0 }], caption: 'Look up, under the open sky' }],
  },
  sunPath: {
    name: 'The sun',
    look: 'Low in the east in the morning, high in the south at midday, west in the afternoon.',
    why: 'With the time of day, the sun tells you direction.',
    avoid: 'Staring at it: a glance is enough, never look straight into the sun.',
    views: [{ pieces: [{ kind: 'look', id: 'mossRock', x: 0, z: 0 }], caption: 'Out in the open' }],
  },
  trek: {
    name: 'The Ruins',
    look: 'Old stone walls under a tall rusted mast above the trees.',
    why: 'A landmark you can see from far away, and the sun, guide you there and back.',
    avoid: 'Setting out late: be home before dark.',
    views: [{ pieces: [{ kind: 'look', id: 'mossRock', x: 0, z: 0 }], caption: 'Landmarks and the sun' }],
  },
  finalCheck: {
    name: 'Lesson 05 check',
    look: 'Four short questions.',
    why: 'Saying what you learned makes it stick.',
    avoid: 'Guessing: think of what you saw happen.',
    views: [{ pieces: [item('driedFish')], caption: 'What did you learn?' }],
  },
};
