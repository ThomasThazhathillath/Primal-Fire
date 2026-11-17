// Lesson 05: Food, Navigation & Long-Term Survival.
import type { LessonModule } from '../../types.js';
import { FOOD_HINTS, FOOD_STEPS } from './steps.js';

export const FOOD: LessonModule = {
  lesson: {
    id: 'food',
    n: 5,
    name: 'Food & Navigation',
    title: 'Food, Navigation & Long-Term Survival',
    story: 'Your camp works. To stay, you must feed yourself, find your way and read the land.',
    goal: 'Gather and grow food, prepare it safely, and find your way across the forest and back.',
    science: ['Nutrition and energy', 'Refraction', 'Cooking and food safety', 'Plant needs and photosynthesis', 'Tracks and ecology', 'Navigation'],
    steps: ['spear', 'fish', 'cook', 'grow', 'trail', 'science'],
    unlocks: ['The Science Roadmap', 'Life at your camp'],
    complete: 'You can feed yourself, read the land and find your way. Every step was an experiment.',
    legacyQuests: ['Make Camp', 'Catch a Fish', 'Cook Your Catch', 'Grow Food', 'First Lab'],
  },
  steps: FOOD_STEPS,
  hints: FOOD_HINTS,
};
