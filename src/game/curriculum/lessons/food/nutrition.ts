// Lesson 05 nutrition: what each food is made of and how the body takes its energy in.
//
// A teaching model, not dietetics. Each portion has its energy in food points (the same numbers the game
// always used: cooked fish 40, dried fish 35, nuts 25, berries 15) and its main nutrient. How fast the body
// gets at that energy depends on the nutrient (survival/body.ts digests it):
//   sugar (berries)      absorbed almost at once: quick energy, soon used up;
//   fat (nuts)           digested slowly: the energy keeps coming for minutes, and fat holds the most per gram;
//   protein (fish)       digested slowly, and it is what the body repairs muscle with: you recover faster.
// Claims follow docs/SCIENCE.md: about 9 kcal per gram of fat and 4 per gram of sugar or protein is textbook;
// "sugar fills you for a short time, fat and protein for longer" is a rule of thumb and the notebook says so.

import type { ItemId } from '../../../items.js';

export type Nutrient = 'sugar' | 'fat' | 'protein';

export interface FoodProfile {
  /** Energy in food points (body.food is 0..100). */
  points: number;
  /** The nutrient most of its energy comes from. */
  main: Nutrient;
  /** Share of the energy that arrives at once; the rest is released over `release` seconds. */
  quick: number;
  release: number;
  /** Seconds of faster recovery (protein: building blocks for repair). */
  repair: number;
  /** Shown when you eat it or look it up: what it is made of, in one short line. */
  label: string;
}

export const FOOD_PROFILES: Partial<Record<ItemId, FoodProfile>> = {
  berries: { points: 15, main: 'sugar', quick: 0.8, release: 12, repair: 0, label: 'Berries: mostly sugar and water. Quick energy, soon used up.' },
  nuts: { points: 25, main: 'fat', quick: 0.2, release: 150, repair: 30, label: 'Nuts: mostly fat, some protein. Fat holds the most energy per bite.' },
  cookedFish: { points: 40, main: 'protein', quick: 0.25, release: 120, repair: 150, label: 'Fish: mostly protein, some fat. Slow energy, and it helps you recover.' },
  driedFish: { points: 35, main: 'protein', quick: 0.25, release: 120, repair: 150, label: 'Dried fish: protein with the water taken out. Light, and it keeps.' },
};

/** A meal that keeps you fed this long (s) or more counts as lasting in the nutrition experiment. */
export const LASTING_SECONDS = 60;

/** The nutrition experiment's food groups: which value of its variable a food is. */
export function nutritionValue(id: ItemId): 'berries' | 'nuts' | 'fish' | null {
  if (id === 'berries') return 'berries';
  if (id === 'nuts') return 'nuts';
  if (id === 'cookedFish' || id === 'driedFish') return 'fish';
  return null;
}
