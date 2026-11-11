// Phase 3 quests (docs/PHASE3_LIVING_WORLD_SPEC.md). Unlike the chain in quests.ts these are NOT
// sequential: each one is judged from state (science events, flags, farm and camp state) all the
// time, and you can be partway through several. Done-ness is stored in game.living, which is saved, and every step is derived from saved state so old saves line up.

import type { Game } from './game.js';
import type { Quest } from './quests.js';
import type { ScienceEventId } from './science-events.js';

export interface LivingQuest extends Quest {
  id: string;
}

const mark = (done: boolean): string => (done ? '[x]' : '[ ]');
const ev =
  (id: ScienceEventId) =>
  (g: Game): boolean =>
    g.hasEvent(id);

export const LIVING_QUESTS: LivingQuest[] = [
  {
    id: 'hiddenTrail',
    title: 'The Hidden Trail',
    roadmapNode: null,
    desc: 'The forest is not empty. Something passes through it, and it leaves a story on the ground.',
    recap: 'Every animal writes a trail: the shape of the print says who, the sharpness says how long ago, and the line of them says where.',
    steps: [
      {
        text: (g) => `Find an animal track ${mark(g.hasEvent('hunt.track.found'))}`,
        done: ev('hunt.track.found'),
        hints: ['Soft, bare ground keeps a footprint. Where do animals walk to?', 'Look between the open meadow and the stream, with your eyes low and slow.'],
        target: { items: [] },
      },
      {
        text: (g) => `Work out whose it is ${mark(g.hasEvent('hunt.track.deer') || g.hasEvent('hunt.track.rabbit'))}`,
        done: (g) => g.hasEvent('hunt.track.deer') || g.hasEvent('hunt.track.rabbit'),
        hints: ['Size and shape tell you who. Two long toes, or small and round?', 'Stand beside a print and look at it.'],
        target: { items: [] },
      },
      {
        text: (g) => `Tell a fresh track from an old one ${mark(g.hasEvent('hunt.track.fresh'))}`,
        done: ev('hunt.track.fresh'),
        hints: ['Sharp edges and dark soil are new; blurred and pale are old.', 'Compare two prints from different places.'],
        target: { items: [] },
      },
      {
        text: (g) => `Follow the trail ${mark(g.hasEvent('hunt.track.followed'))}`,
        done: ev('hunt.track.followed'),
        hints: ['One print points to the next.', 'Walk along the line of prints, one by one, in the direction they point.'],
        target: { items: [] },
      },
      {
        text: (g) => `See the one who made it, without frightening it ${mark(g.hasEvent('wild.quiet.approach'))}`,
        done: ev('wild.quiet.approach'),
        hints: ['Animals notice noise and quick movement from far away.', 'Move slowly and stop often as you come near.'],
        target: { items: [] },
      },
    ],
  },
];


const step = (
  text: string,
  done: (g: Game) => boolean,
  hints: [string, string],
): Quest['steps'][number] => ({
  text: (g) => `${text} ${mark(done(g))}`,
  done,
  hints,
  target: { items: [] },
});
const any = (...ids: ScienceEventId[]) => (g: Game) => ids.some((i) => g.hasEvent(i));

LIVING_QUESTS.push(
  {
    id: 'livingForest',
    title: 'The Living Forest',
    roadmapNode: null,
    desc: 'Sit still and watch. The forest is full of animals that live by their own clocks.',
    recap: 'Animals live by habit: they graze, drink and rest on a daily round, and they read your noise and movement long before they see you.',
    steps: [
      step('Watch a deer', ev('wild.deer.seen'), ['Deer graze in open ground.', 'Look in the meadow, with the wind in your face.']),
      step('Spot a rabbit near its burrow', ev('wild.rabbit.seen'), ['Small animals stay close to cover.', 'Look along the edge of the trees; stand still.']),
      step('Listen for a bird, then find it', ev('wild.bird.seen'), ['Birds sing from branches.', 'Follow the song up into the trees.']),
      step('Watch a deer drink at the stream', ev('wild.deer.drank'), ['Every animal needs water.', 'Wait quietly near the stream, in the morning or evening.']),
    ],
  },
  {
    id: 'seedsOfTomorrow',
    title: 'Seeds of Tomorrow',
    roadmapNode: null,
    desc: 'A plant can be saved and grown again. Learn to start a field.',
    recap: 'A seed holds a whole plant folded small. Loose soil, light and water let it unfold.',
    steps: [
      step('Collect seeds from a wild plant', (g) => g.gatheredCount('seeds') > 0 || g.count('seeds') > 0 || g.hasEvent('farm.planted'), ['Plants make seeds in their flower heads.', 'Dig up a wild tuber plant and take the seeds.']),
      step('Prepare the soil', ev('farm.plot.dug'), ['Roots need loose soil with air in it.', 'Dig a plot with your digging stick in open, sunny ground.']),
      step('Plant a seed', ev('farm.planted'), ['A seed needs soil over it.', 'Hold the seeds over your plot.']),
      step('Water the plot', ev('farm.watered'), ['Seeds start with water.', 'Carry water from the stream in your pot.']),
    ],
  },
  {
    id: 'growingFuture',
    title: 'A Growing Future',
    roadmapNode: null,
    desc: 'Tend what you planted and watch it grow into food and into more seeds.',
    recap: 'A farm is patience: water, light and time, and part of every harvest returns to the soil as next year’s seed.',
    steps: [
      step('See your seed sprout', ev('farm.stage.sprout'), ['Keep the soil moist.', 'Water the plot and come back in a little while.']),
      step('See it grow tall', ev('farm.stage.mature'), ['Light matters: a shaded plant grows slowly.', 'Keep watering; the stem thickens.']),
      step('Harvest it', ev('farm.harvested'), ['It must be full-grown.', 'Pinch the ripe plant.']),
      step('Keep seeds for the next planting', ev('farm.seeds.saved'), ['Never eat all the seed.', 'Every harvest returns seeds: plant them again.']),
    ],
  },
  {
    id: 'streamToFire',
    title: 'From Stream to Fire',
    roadmapNode: null,
    desc: 'Food from the water is food at risk. Take it from the stream to the fire safely.',
    recap: 'Cleaning removes what spoils first; heat kills what makes you ill: raw is a risk, cooked is food.',
    steps: [
      step('Catch a fish', ev('food.fish.caught'), ['Fish are not where they appear.', 'Spear one in the stream, aiming below the image.']),
      step('Clean it with a sharp edge at the water', ev('food.fish.cleaned'), ['A sharp stone does the cutting.', 'Hold the fish at the stream with a knife or flake in your bag.']),
      step('Cook it through', ev('food.fish.opaque'), ['Heat changes the flesh.', 'Hold the fish over a burning fire.']),
      step('Eat', ev('body.eat'), ['Safe to eat now.', 'Use it from your hand.']),
    ],
  },
  {
    id: 'preservingHarvest',
    title: 'Preserving the Harvest',
    roadmapNode: null,
    desc: 'Good days end. Learn to make food last.',
    recap: 'Food spoils because water lets germs grow. Take the water out, by air, sun or smoke, and it keeps.',
    steps: [
      step('Tell an edible plant from a poisonous look-alike', ev('food.forage.identified'), ['Never eat what you cannot name.', 'Look closely at a berry bush, nut shrub or root plant.']),
      step('Pick something you identified', ev('food.forage.picked'), ['Only take what is safe.', 'Pick from a patch you have looked at closely.']),
      step('Hang food on a drying rack', ev('food.rack.loaded'), ['Air carries moisture away.', 'Build a rack of sticks and cord, then hang fish or berries.']),
      step('Dry something until it keeps', any('food.fish.dried', 'food.berries.dried'), ['Drying takes a while in dry air; rain stops it.', 'Leave the food on the rack through a fair day.']),
      step('Put food away in camp storage', ev('camp.food.stored'), ['Keep it off the ground and away from animals.', 'Store it in your basket.']),
    ],
  },
  {
    id: 'homeProvides',
    title: 'A Home That Provides',
    roadmapNode: null,
    desc: 'A camp is more than a roof: somewhere to sleep, dry fuel, and food kept ready.',
    recap: 'A good camp provides what the day will need: warmth that is dry, rest off the cold ground, and food at hand.',
    steps: [
      step('Make a bed and rest on it', ev('camp.bed.rested'), ['Ground steals heat.', 'Layer leaves and grass thick, then lie down.']),
      step('Stack firewood out of the weather', ev('camp.wood.stored'), ['Wet wood will not light.', 'Build a woodstack with a bark cover.']),
      step('See your wood stay dry in the rain', ev('camp.wood.kept.dry'), ['A cover sheds rain.', 'Keep the bark cover on and wait out a shower.']),
      step('Keep food in camp', ev('camp.food.stored'), ['Keep food in one place.', 'Put food in your storage basket.']),
    ],
  },
);

/** Done quests are remembered in game.living (saved); call after any state change. Returns the ones that just finished. */
export function livingProgress(g: Game): LivingQuest[] {
  const finished: LivingQuest[] = [];
  for (const q of LIVING_QUESTS) {
    if (g.living.has(q.id)) continue;
    if (q.steps.every((s) => s.done(g))) {
      g.living.add(q.id);
      finished.push(q);
    }
  }
  return finished;
}

export const livingDone = (g: Game, id: string): boolean => g.living.has(id);
