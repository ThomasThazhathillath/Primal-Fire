// Lesson 01 (Shelter) experiments.
//
// Roof layers: the real rain on the real roof decides. While rain falls on the lean-to, every roof panel
// is one trial: how many layers it has (1, or 2 or more) and whether it leaks (game.ts, rain trials).
// The roof rules (shelter.ts) give each layer a weight and a panel only keeps rain out once it reaches
// PROTECT_NEED, so one layer of anything leaks and two overlapping layers hold.

import type { ExperimentDef } from '../../../science/experiments.js';

export const ROOF_LAYERS: ExperimentDef = {
  id: 'roofLayers',
  lesson: 'shelter',
  concept: 'drainage',
  question: 'How many roof layers keep the rain out?',
  why: 'A roof that leaks soaks you, and wet is cold.',
  predictions: [
    { id: 'one', text: 'One layer of bark, leaves or grass is enough.' },
    { id: 'two', text: 'It takes two or more overlapping layers.' },
    { id: 'none', text: 'No roof of plants can keep rain out.' },
  ],
  variable: {
    name: 'Layers on a roof panel',
    values: [
      { id: '1', text: 'One layer' },
      { id: '2', text: 'Two or more layers' },
    ],
  },
  outcomes: [
    { id: 'leaks', text: 'drips through' },
    { id: 'dry', text: 'stays dry' },
  ],
  howTo: 'Give one roof panel a single layer and another two or more, then watch them in the rain.',
  conclude: (t) => {
    const one = t.get('1');
    const two = t.get('2');
    if (!one || !two) return null;
    if (one === 'dry') return 'one';
    if (two === 'dry') return 'two';
    return 'none';
  },
  principle: 'One layer has gaps that line up, so drops fall straight through. Overlapping layers block the straight paths, and the slope carries each drop down and off the roof.',
  apply: 'Roof tiles and shingles overlap for the same reason. Where your roof drips, add a layer over that spot.',
  limits: 'Heavy, long rain or a flat roof can still get through; the slope matters as much as the layers.',
  check: {
    question: 'Your roof drips in one spot. What is the best fix?',
    options: [
      { id: 'layer', text: 'Add another overlapping layer over the drip.', correct: true, why: 'A second layer covers the gaps the first one left.' },
      { id: 'flat', text: 'Make the roof flatter so it holds the water.', why: 'A flat roof lets water sit and soak through; a slope sheds it.' },
      { id: 'move', text: 'Build a whole new shelter somewhere else.', why: 'The shelter is fine. Fix the thin spot: add a layer above the drip.' },
    ],
  },
  // Offered once the roof is going on (or later, for players who built it before experiments existed).
  opens: (g) => g.focusIs('roof', 'rainTest', 'roofLayers') || g.lessons.completed.has('roof'),
};

export const SHELTER_EXPERIMENTS: ExperimentDef[] = [ROOF_LAYERS];
