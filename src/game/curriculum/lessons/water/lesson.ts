// Lesson 03: Water - collection and purification. The pot step is the beginner objective in objectives.ts;
// the experiments, their steps and the closing check live here.
import type { LessonModule } from '../../types.js';
import { WATER_EXPERIMENTS } from './experiments.js';
import { WATER_HINTS, WATER_STEPS } from './steps.js';

export const WATER: LessonModule = {
  lesson: {
    id: 'water',
    n: 3,
    name: 'Water',
    title: 'Water: Collection and Purification',
    story: 'You have shelter and fire. Now you need water you can drink, and clear water is not always safe water.',
    goal: 'Make a pot that holds water, collect water, filter it and boil it, and know what each step can and cannot do.',
    science: ['Clay becomes ceramic', 'The water cycle', 'Contamination and microbes', 'Filtration and adsorption', 'Boiling and disinfection'],
    steps: ['clayTemper', 'potFiring', 'pot', 'waterSource', 'filterOrder', 'treatment', 'waterSupply'],
    unlocks: ['Lesson 04: Tools', 'A safe water supply'],
    complete: 'Filtering cleared the water and boiling made it safer. Neither removes dissolved chemicals.',
    legacyQuests: ['Hold Water', 'Clear ≠ Safe'],
  },
  steps: WATER_STEPS,
  hints: WATER_HINTS,
  experiments: WATER_EXPERIMENTS,
};
