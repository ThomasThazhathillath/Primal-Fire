// Lesson 02: Fire - the science of combustion. Its steps are the beginner objectives in objectives.ts.
import type { LessonModule } from '../../types.js';

export const FIRE: LessonModule = {
  lesson: {
    id: 'fire',
    n: 2,
    name: 'Fire',
    title: 'Fire: The Science of Combustion',
    story: 'Your shelter keeps the rain off, but the night is cold. Fire would give warmth, a way to cook, and heat to change materials.',
    goal: 'Start a fire with your own hands, keep it going, and make charcoal.',
    science: ['Friction turns motion into heat', 'The fire triangle', 'Ignition temperature', 'Oxygen and airflow', 'Fuel moisture and surface area', 'Pyrolysis'],
    steps: ['wood', 'tinder', 'frictionParts', 'bowDrill', 'firePit', 'fireLay', 'ember', 'fireLit', 'charcoal'],
    unlocks: ['Lesson 03: Water', 'Cook food', 'Fire clay'],
    complete: 'You made fire from friction and turned wood into charcoal by starving it of air.',
    // Not 'Scavenger': a player at the very first quest simply follows the new order (shelter first).
    legacyQuests: ['First Fire', 'Black Gold'],
  },
};
