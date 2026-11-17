// Lesson 03: Water - collection and purification. Its steps are the beginner objectives in objectives.ts.
import type { LessonModule } from '../../types.js';

export const WATER: LessonModule = {
  lesson: {
    id: 'water',
    n: 3,
    name: 'Water',
    title: 'Water: Collection and Purification',
    story: 'You have shelter and fire. Now you need water you can drink, and clear water is not always safe water.',
    goal: 'Make a pot that holds water, filter stream water and boil it, and know what each step can and cannot do.',
    science: ['The water cycle', 'Contamination and microbes', 'Filtration and adsorption', 'Boiling and disinfection', 'Clay becomes ceramic'],
    steps: ['pot', 'cleanWater'],
    unlocks: ['Lesson 04: Tools', 'A safe water supply'],
    complete: 'Filtering cleared the water and boiling made it safer. Neither removes dissolved chemicals.',
    legacyQuests: ['Hold Water', 'Clear ≠ Safe'],
  },
};
