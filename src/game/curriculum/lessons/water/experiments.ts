// Lesson 03 (Water) experiments. Every trial is reported by the rule that runs the mechanic:
//
//   clayTemper   clay.ts      a test cup cracks or dries whole (the drying-strain rule)
//   potFiring    clay.ts and water.ts   a damp cup or pot bursts in the fire, a dry one turns to ceramic
//   waterSource  water.ts     the pot filled at the stream (muddy) or with runoff from your roof (clearer)
//   filterOrder  water.ts + filter.ts   what comes out of the spout for the order of the layers
//   treatment    water.ts     settling, filtering, boiling, or filtering then boiling stream water
//   waterSupply  a closing check question (kind 'check'): what your setup can and cannot do
//
// Never claims that a filter makes water safe: every result and check says germs remain.

import type { Game } from '../../../game.js';
import type { ExperimentDef } from '../../../science/experiments.js';
import { filterWorks } from './filter.js';

/** The lesson's working setup: a fired pot, a filter that runs clear, and safe water made at least once. */
export function waterSetup(g: Game): { pot: boolean; filter: boolean; safe: boolean } {
  return {
    pot: g.flag('potFired'),
    filter: g.structures.some(filterWorks),
    safe: g.flag('waterSafe'),
  };
}
export const setupWorks = (g: Game): boolean => {
  const s = waterSetup(g);
  return s.pot && s.filter && s.safe;
};

/** Experiments that open together with the step before them (so their trials can start early). */
const predicted = (g: Game, id: string) => g.experiments.state(id).prediction !== null;

export const CLAY_TEMPER: ExperimentDef = {
  id: 'clayTemper',
  lesson: 'water',
  concept: 'ceramics',
  question: 'What stops clay cracking as it dries?',
  why: 'A pot that cracks before it is fired wastes your clay and your time.',
  predictions: [
    { id: 'sand', text: 'Kneading sand into the clay stops the cracks.' },
    { id: 'plain', text: 'Pure clay is best: sand only weakens it.' },
    { id: 'same', text: 'Both crack the same: all clay cracks as it dries.' },
  ],
  variable: {
    name: 'What is mixed into the clay',
    values: [
      { id: 'none', text: 'Clay only' },
      { id: 'sand', text: 'Clay with sand (temper)' },
    ],
  },
  outcomes: [
    { id: 'cracked', text: 'cracked as it dried' },
    { id: 'whole', text: 'dried whole' },
  ],
  howTo: 'Make clay test cups at your workbench (2 clay, 1 sand): one clay only, two with sand. Then wait while they dry.',
  conclude: (t) => {
    const none = t.get('none');
    const sand = t.get('sand');
    if (!none || !sand) return null;
    if (none === 'cracked' && sand === 'whole') return 'sand';
    if (none === 'whole' && sand === 'cracked') return 'plain';
    return 'same';
  },
  principle: 'Clay shrinks as its water leaves, the surface before the inside, and the strain tears it. Sand grains do not shrink and open paths for the water, so tempered clay dries evenly.',
  apply: 'Potters knead sand, grit or crushed old pottery into clay; bricks and tiles are made the same way.',
  limits: 'Too much sand makes clay crumbly, and thick or uneven walls can crack even with temper.',
  check: {
    question: 'Your clay keeps cracking as it dries. What do you change?',
    options: [
      { id: 'temper', text: 'Knead some sand or grit into it.', correct: true, why: 'Temper lets the water escape evenly and resists shrinking, so the clay dries without tearing.' },
      { id: 'fire', text: 'Put it in the fire sooner, while it is damp.', why: 'A damp pot bursts in the fire: the water inside turns to steam.' },
      { id: 'water', text: 'Add more water so it stays soft.', why: 'More water means more shrinking as it dries, and more cracks.' },
    ],
  },
  opens: (g) => g.focusIs('clayTemper'),
};

export const POT_FIRING: ExperimentDef = {
  id: 'potFiring',
  lesson: 'water',
  concept: 'ceramics',
  question: 'Can damp clay go into the fire?',
  why: 'Firing turns clay into ceramic, but only if the piece survives the fire.',
  predictions: [
    { id: 'dry', text: 'Only bone-dry clay survives the fire.' },
    { id: 'any', text: 'Damp or dry, the fire hardens it.' },
    { id: 'damp', text: 'Damp is better: the water stops it burning.' },
  ],
  variable: {
    name: 'How dry it is when it goes in',
    values: [
      { id: 'damp', text: 'Still damp' },
      { id: 'dry', text: 'Bone dry' },
    ],
  },
  outcomes: [
    { id: 'burst', text: 'burst with a crack' },
    { id: 'ceramic', text: 'turned to ceramic' },
  ],
  howTo: 'Set one sand test cup in your fire while it is still damp (empty hand, reach in; browser: U). Fire the other once it is bone dry.',
  conclude: (t) => {
    const damp = t.get('damp');
    const dry = t.get('dry');
    if (!damp || !dry) return null;
    if (damp === 'ceramic') return dry === 'ceramic' ? 'any' : 'damp';
    return 'dry';
  },
  principle: 'Water left in clay turns to steam in the fire, swells to over a thousand times its volume and blows the wall apart. Dry clay heated hot enough changes for good: its minerals fuse into ceramic.',
  apply: 'Potters dry pots for days, then warm them slowly at the edge of the fire before firing.',
  limits: 'Even a dry pot can crack if it heats too fast or unevenly, and an open fire heats unevenly.',
  check: {
    question: 'Your new pot still feels cool and a little soft. What do you do?',
    options: [
      { id: 'wait', text: 'Wait until it is pale, light and dry.', correct: true, why: 'Cool and soft means water is still inside. Fired now, it would turn to steam and burst the pot.' },
      { id: 'fire', text: 'Fire it now, while the fire is hot.', why: 'The water inside would turn to steam and burst it.' },
      { id: 'wet', text: 'Wet it first so it does not burn.', why: 'More water only means more steam: wet clay bursts.' },
    ],
  },
  // Opens right after the clay-temper prediction: the same test cups serve both tests.
  opens: (g) => g.focusIs('potFiring', 'pot') || (g.focusIs('clayTemper') && predicted(g, 'clayTemper')),
};

export const WATER_SOURCE: ExperimentDef = {
  id: 'waterSource',
  lesson: 'water',
  concept: 'water_cycle',
  question: 'Which water is cleaner: the stream, or rain?',
  why: 'The cleaner the water you start with, the less work it takes to make it safe.',
  predictions: [
    { id: 'rain', text: 'Rain caught off your roof.' },
    { id: 'stream', text: 'The stream: running water is clean water.' },
    { id: 'same', text: 'They are the same: water is water.' },
  ],
  variable: {
    name: 'Where the water comes from',
    values: [
      { id: 'stream', text: 'Filled at the stream' },
      { id: 'rain', text: 'Rain off your roof' },
    ],
  },
  outcomes: [
    { id: 'muddy', text: 'cloudy with mud and silt' },
    { id: 'clearer', text: 'much clearer' },
  ],
  howTo: 'Fill your pot at the stream. Empty it, and while it rains hold it at the low back edge of your roof.',
  conclude: (t) => {
    const stream = t.get('stream');
    const rain = t.get('rain');
    if (!stream || !rain) return null;
    if (rain === 'clearer' && stream === 'muddy') return 'rain';
    if (stream === 'clearer' && rain === 'muddy') return 'stream';
    return 'same';
  },
  principle: 'Sunshine evaporates water and the vapour leaves mud and salt behind; it cools into clouds and falls as rain. On its way into the stream, water picks up soil, rotting leaves and germs.',
  apply: 'Many homes collect rain off their roofs in barrels and tanks, and still treat it before drinking it.',
  limits: 'Rain picks up dust, and dirt and germs from the roof it runs over. Clearer is not safe: treat it too.',
  check: {
    question: 'Rainwater off your roof looks clear. What do you do with it?',
    options: [
      { id: 'boil', text: 'Boil it before drinking.', correct: true, why: 'It ran over bark, leaves and bird droppings. Boiling deals with germs it picked up.' },
      { id: 'drink', text: 'Drink it: rain is pure.', why: 'Rain starts fairly clean, but the roof adds dirt and germs.' },
      { id: 'filter', text: 'Filter it, then drink it.', why: 'A filter takes out particles, not germs. Boil it.' },
    ],
  },
  testAction: {
    label: (g) => (g.leanTo() && g.env.rain <= 0.3 ? 'Wait for rain' : 'Keep testing'),
    run: (g) => (g.waitForRain() ? 'Clouds gather. Take your empty pot to the low back edge of your roof.' : null),
  },
  readout: (g) => {
    const w = g.water.potWater;
    if (w === 'empty') return g.env.rain > 0.3 ? 'It is raining. Your pot is empty.' : 'Your pot is empty.';
    return `In your pot: ${w === 'rain' ? 'rainwater, much clearer' : w === 'raw' ? 'stream water, cloudy with mud' : w}.`;
  },
  opens: (g) => g.focusIs('waterSource'),
};

export const FILTER_ORDER: ExperimentDef = {
  id: 'filterOrder',
  lesson: 'water',
  concept: 'filtration',
  question: 'Which order of layers cleans water best?',
  why: 'A filter that clogs or leaks mud is no use, even with the right materials.',
  predictions: [
    { id: 'coarse', text: 'Coarse gravel on top, fine sand below, cloth at the bottom.' },
    { id: 'fine', text: 'Fine sand on top, so it catches the dirt first.' },
    { id: 'any', text: 'The order does not matter, only the materials.' },
  ],
  variable: {
    name: 'Order of the layers',
    values: [
      { id: 'coarseFirst', text: 'Gravel above sand, cloth at the bottom' },
      { id: 'fineFirst', text: 'Sand above the gravel' },
      { id: 'noSupport', text: 'No cloth at the bottom' },
    ],
  },
  outcomes: [
    { id: 'clear', text: 'runs clear, germs remain' },
    { id: 'clogged', text: 'clogs: only a trickle' },
    { id: 'washout', text: 'sand washes out: muddy' },
  ],
  howTo: 'Layers go in from the bottom up. Pour stream water through, then pinch layers out, change the order and pour again.',
  conclude: (t) => {
    const ok = t.get('coarseFirst');
    const fine = t.get('fineFirst');
    const loose = t.get('noSupport');
    if (!ok || (!fine && !loose)) return null;
    const wrongFailed = (!fine || fine !== 'clear') && (!loose || loose !== 'clear');
    if (ok === 'clear' && wrongFailed) return 'coarse';
    if (fine === 'clear' && ok !== 'clear') return 'fine';
    return 'any';
  },
  principle: 'Water should meet coarse layers first: gravel stops the big bits, so the fine sand below catches silt without clogging. Cloth at the bottom holds the grains in. Charcoal takes up some smells.',
  apply: 'Water works pass water through beds of gravel and sand before they disinfect it.',
  limits: 'Clear is not safe: germs are far smaller than the gaps between sand grains. A homemade filter reduces mud, not germs.',
  check: {
    question: 'Your filtered water runs crystal clear. Is it safe to drink?',
    options: [
      { id: 'boil', text: 'Not yet: boil it first.', correct: true, why: 'Germs pass between sand grains. Filtering clears water; boiling disinfects it.' },
      { id: 'clear', text: 'Yes: clear water is clean water.', why: 'Clear only means the mud is gone. Germs you cannot see pass straight through.' },
      { id: 'charcoal', text: 'Yes, if it ran through charcoal.', why: 'Charcoal takes up some smells and tastes, not germs.' },
    ],
  },
  opens: (g) => g.focusIs('filterOrder'),
};

export const TREATMENT: ExperimentDef = {
  id: 'treatment',
  lesson: 'water',
  concept: 'disinfection',
  question: 'What do settling, filtering and boiling each do?',
  why: 'Stream water carries mud and germs. Which step deals with which?',
  predictions: [
    { id: 'each', text: 'Each does a different job: you need both filtering and boiling.' },
    { id: 'filter', text: 'Filtering alone makes the water safe.' },
    { id: 'boil', text: 'Boiling alone makes it clean and safe.' },
  ],
  variable: {
    name: 'What you did to stream water',
    values: [
      { id: 'settle', text: 'Left it to settle' },
      { id: 'filter', text: 'Filtered it' },
      { id: 'boil', text: 'Boiled it, unfiltered' },
      { id: 'both', text: 'Filtered, then boiled' },
    ],
  },
  outcomes: [
    { id: 'clearerGerms', text: 'clearer, germs still alive' },
    { id: 'clearGerms', text: 'clear, germs still alive' },
    { id: 'muddyKilled', text: 'germs killed, mud still in' },
    { id: 'clearKilled', text: 'clear, germs killed' },
  ],
  howTo: 'With stream water: let a full pot stand (bag or ground) to settle; filter one; boil one unfiltered; filter one, then boil it.',
  conclude: (t) => {
    if (!['settle', 'filter', 'boil', 'both'].every((v) => t.has(v))) return null;
    const killed = (v: string) => t.get(v) === 'clearKilled' || t.get(v) === 'muddyKilled';
    if (killed('filter')) return 'filter';
    if (t.get('boil') === 'clearKilled') return 'boil';
    return 'each';
  },
  principle: 'Settling lets heavy mud sink, and filtering strains out finer particles, but neither stops germs. A rolling boil kills or inactivates germs and leaves mud and chemicals in. Settle, filter, then boil.',
  apply: 'Water works let water settle, filter it through sand, then disinfect it. In the wild, boil for a minute.',
  limits: 'Boiling does not remove dissolved chemicals such as salt or heavy metals, and can even concentrate them.',
  check: {
    question: 'Muddy stream water has been boiled hard for a minute. What is still in it?',
    options: [
      { id: 'mud', text: 'The mud and any dissolved chemicals.', correct: true, why: 'Heat kills germs; it does not take anything out of the water.' },
      { id: 'nothing', text: 'Nothing: boiling purifies it completely.', why: 'Boiling deals with germs only; mud and chemicals stay in.' },
      { id: 'germs', text: 'Live germs.', why: 'A rolling boil kills or inactivates most germs. The mud is what stays.' },
    ],
  },
  opens: (g) => g.focusIs('treatment'),
};

/** The lesson's closing question: the limits of a homemade setup. Opens once the setup works. */
export const WATER_SUPPLY: ExperimentDef = {
  id: 'waterSupply',
  lesson: 'water',
  kind: 'check',
  concept: 'microbes',
  question: 'Your water supply: what can it do, and what not?',
  why: 'Knowing the limits of your setup keeps you from trusting it too far.',
  predictions: [],
  variable: { name: '', values: [] },
  outcomes: [],
  howTo: 'Answer the question about your own setup: pot, filter and fire.',
  conclude: () => null,
  principle: 'Filtering reduces particles, boiling disinfects, and neither removes dissolved chemicals.',
  apply: 'Even with good filters, people boil or disinfect stream and lake water before drinking it.',
  limits: 'If water may be polluted by chemicals (near mines, farms or factories), boiling and a homemade filter do not make it safe.',
  check: {
    question: 'A friend says your filter makes stream water safe to drink. What do you tell them?',
    options: [
      { id: 'limits', text: 'It clears the water; boiling kills the germs; neither removes chemicals.', correct: true, why: 'Right: filtering reduces particles, boiling disinfects, and chemicals need other treatment or a cleaner source.' },
      { id: 'clear', text: 'Yes: if it runs clear, it is safe.', why: 'Clear only means the particles are gone. Germs pass between the sand grains.' },
      { id: 'charcoal', text: 'Yes, as long as it has charcoal in it.', why: 'Homemade charcoal takes up some smells and tastes. It does not reliably remove germs.' },
    ],
  },
  opens: (g) => g.focusIs('waterSupply') && setupWorks(g),
};

export const WATER_EXPERIMENTS: ExperimentDef[] = [CLAY_TEMPER, POT_FIRING, WATER_SOURCE, FILTER_ORDER, TREATMENT, WATER_SUPPLY];
