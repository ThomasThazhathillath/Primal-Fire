// Lesson 01: Understanding Nature & Building Shelter.
import type { LessonModule } from '../../types.js';
import { SHELTER_HINTS, SHELTER_STEPS } from './steps.js';

export const SHELTER: LessonModule = {
  lesson: {
    id: 'shelter',
    n: 1,
    name: 'Shelter',
    title: 'Understanding Nature & Building Shelter',
    story: 'You wake in an unfamiliar forest with nothing. Night is coming, and nothing here keeps off the wind, the rain or the cold ground.',
    goal: 'Build a shelter that protects you from wind, rain and heat loss into the ground.',
    science: ['Heat transfer: conduction, convection, radiation', 'Insulation', 'Wind and weather', 'Drainage and slope', 'Triangles, tension and load'],
    steps: ['firstStone', 'moreStones', 'flatStone', 'workbench', 'exploreBench', 'cord', 'pole', 'frame', 'roof', 'rainTest', 'bed'],
    strictBuild: true,
    unlocks: ['Lesson 02: Fire', 'Rest in your shelter'],
    complete: 'You built a shelter that keeps off wind, rain and the cold ground. Next: warmth.',
    legacyQuests: ['A Place to Call Home', 'The Foundation', 'Build the Frame', 'Roof Over Your Head', 'Test Your Engineering'],
  },
  steps: SHELTER_STEPS,
  hints: SHELTER_HINTS,
};
