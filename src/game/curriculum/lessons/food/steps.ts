// Lesson 05 (Food & Navigation): new steps on today's fishing, cooking, farming and tracking.
// Reaching the Science Roadmap ('science') reuses the beginner objective in objectives.ts.
import type { Game } from '../../../game.js';
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
    done: (g) => g.living.has('hiddenTrail'),
    hint: {
      levels: [
        'Animals leave signs where the ground is soft.',
        'Fresh prints have sharp edges; old ones are blurred by rain and wind.',
        'Look on soft ground near water and along the edges of clearings.',
        'Stand on a track to read it, then follow the prints in the direction they point.',
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
};
