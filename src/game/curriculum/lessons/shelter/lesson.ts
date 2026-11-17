// Lesson 01: Understanding Nature & Building Shelter.
import type { LessonModule } from '../../types.js';
import { SHELTER_EXPERIMENTS } from './experiments.js';
import { SHELTER_HINTS, SHELTER_STEPS } from './steps.js';

export const SHELTER: LessonModule = {
  lesson: {
    id: 'shelter',
    n: 1,
    name: 'Shelter',
    title: 'Understanding Nature & Building Shelter',
    story: 'You wake in an unfamiliar forest with nothing. Night is coming, and nothing here keeps off the wind, the rain or the cold ground.',
    goal: 'Build a shelter that protects you from wind, rain and heat loss into the ground.',
    science: ['Heat transfer: conduction, convection, radiation', 'Insulation', 'Wind and weather', 'Terrain and drainage', 'Plant materials', 'Triangles, tension and load'],
    steps: ['firstStone', 'moreStones', 'flatStone', 'workbench', 'exploreBench', 'cord', 'pole', 'frame', 'framePush', 'roof', 'rainTest', 'roofLayers', 'bed', 'bedMaterials', 'nightShelter'],
    strictBuild: true,
    unlocks: ['Lesson 02: Fire', 'Rest in your shelter'],
    complete: 'Your shelter keeps off wind, rain and the cold ground, and you tested every part of it. Next: warmth.',
    legacyQuests: ['A Place to Call Home', 'The Foundation', 'Build the Frame', 'Roof Over Your Head', 'Test Your Engineering'],
  },
  steps: SHELTER_STEPS,
  hints: SHELTER_HINTS,
  experiments: SHELTER_EXPERIMENTS,
};
