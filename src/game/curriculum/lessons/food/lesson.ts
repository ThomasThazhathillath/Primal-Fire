// Lesson 05: Food, Navigation & Long-Term Survival.
import type { LessonModule } from '../../types.js';
import { FOOD_EXPERIMENTS } from './experiments.js';
import { FOOD_HINTS, FOOD_STEPS } from './steps.js';

export const FOOD: LessonModule = {
  lesson: {
    id: 'food',
    n: 5,
    name: 'Food & Navigation',
    title: 'Food, Navigation & Long-Term Survival',
    story: 'Your camp works. To stay, you must become self-sufficient: feed yourself, keep food, read the land and find your way.',
    goal: 'Gather, judge, grow and preserve food, read the weather and the sun, and cross the forest and back without a compass.',
    science: ['Nutrition: sugar, fat, protein', 'Plant toxicity and photosynthesis', 'Preserving food', 'Food chains and ecosystems', 'Weather', 'Navigation by the sun'],
    steps: ['spear', 'fish', 'cook', 'plantId', 'nutrition', 'grow', 'basket', 'dryingTest', 'trail', 'overharvest', 'skyTest', 'sunPath', 'trek', 'finalCheck'],
    unlocks: ['Life at your camp', 'The whole forest, compass or not'],
    complete: 'You can feed yourself, read the land and find your way. Every step was an experiment.',
    legacyQuests: ['Make Camp', 'Catch a Fish', 'Cook Your Catch', 'Grow Food', 'First Lab'],
  },
  steps: FOOD_STEPS,
  hints: FOOD_HINTS,
  experiments: FOOD_EXPERIMENTS,
};
