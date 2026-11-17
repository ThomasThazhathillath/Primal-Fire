// Lesson 03 (Water): the experiment steps and the closing check. The clay pot step itself is the beginner
// objective `pot` in objectives.ts. Each experiment step has the experiment's id, so the objective card's
// Why? button opens its card.

import type { Game } from '../../../game.js';
import type { HintInfo } from '../../../hint-info.js';
import type { ItemId } from '../../../items.js';
import type { Step } from '../../types.js';
import { WATER_EXPERIMENTS, waterSetup } from './experiments.js';
import { filterLayers, filterResult } from './filter.js';

const sub = (text: string, done: boolean) => ({ text, done });
const have = (g: Game, id: ItemId): number => g.count(id) + (g.held === id ? 1 : 0);
const exp = (g: Game, id: string) => g.experiments.state(id);
const predicted = (g: Game, id: string) => exp(g, id).prediction !== null;
const tried = (g: Game, id: string, value: string) => exp(g, id).trials.has(value);

/**
 * A save from before these experiments, with the old water lesson finished (safe water made and no Lesson 03
 * experiment ever opened): the steps count as done, so old players are not sent back.
 */
export const legacyWater = (g: Game): boolean => g.flag('waterSafe') && WATER_EXPERIMENTS.every((d) => g.experiments.phase(d.id) === 'locked');

/** The card's how-to for an experiment's prediction, result and check phases (null while testing). */
function phaseHelp(g: Game, id: string): string | null {
  const p = g.experiments.phase(id);
  if (p === 'predict') return 'Open the experiment card (Why?) and choose what you predict.';
  if (p === 'result' || p === 'check') return 'Open the experiment card (Why?): read the result and answer the question.';
  return null;
}

/** "cloth, charcoal, sand, gravel" for the filter near you, bottom to top. */
function layersLine(g: Game): string | null {
  const f = g.structures.find((s) => s.kind === 'filter');
  if (!f) return null;
  const names = filterLayers(f).map((id) => id ?? 'empty');
  return `Your layers, bottom to top: ${names.join(', ')}.`;
}

const PIECE_NEEDS: ItemId[] = ['clay', 'sand'];

export const WATER_STEPS: Step[] = [
  {
    id: 'clayTemper',
    find: (g) => (g.water.clay.pieces.length || g.bench ? [] : PIECE_NEEDS.filter((id) => have(g, id) < (id === 'clay' ? 2 : 1))),
    title: 'Test it: why does clay crack?',
    short: 'Make clay test cups',
    instruction: 'Before you risk a pot, test the clay: make three small cups at your workbench, one of clay only and two with sand, and watch them dry.',
    doneMessage: 'Evidence: sand (temper) lets clay dry without cracking.',
    explains: true,
    howTo: (g) => {
      const help = phaseHelp(g, 'clayTemper');
      if (help) return help;
      const lab = g.water.clay;
      if (!lab.pieces.length) return 'At your workbench, choose "Clay test cups" (2 clay, 1 sand). They dry in your bag: no need to do anything else.';
      return 'The cups are drying in your bag (about half a minute). Meanwhile you can put a damp sand cup in your fire for the next test.';
    },
    substeps: (g) => [
      sub('Predict what will happen', predicted(g, 'clayTemper')),
      sub('Make test cups at the workbench', g.water.clay.pieces.length > 0 || exp(g, 'clayTemper').trials.size > 0),
      sub('Watch the clay-only cup dry', tried(g, 'clayTemper', 'none')),
      sub('Watch a sand cup dry', tried(g, 'clayTemper', 'sand')),
      sub('Check what you learned', g.experiments.done('clayTemper')),
    ],
    done: (g) => g.experiments.done('clayTemper'),
    implied: legacyWater,
    hint: {
      ref: 'clay',
      levels: [
        'A fair test changes one thing: here, what is mixed into the clay.',
        'Make the cups the same size from the same clay; only the sand differs.',
        'Clay and sand lie at the stream bend, where the water slows.',
        'At the workbench choose Clay test cups, then wait about half a minute while they dry.',
      ],
    },
  },
  {
    id: 'potFiring',
    title: 'Test it: damp or dry in the fire?',
    short: 'Fire a damp cup and a dry cup',
    instruction: 'Put one sand test cup in your fire while it is still damp, and the other once it is bone dry. What does the fire do to each?',
    doneMessage: 'Evidence: steam bursts damp clay; dry clay becomes ceramic.',
    howTo: (g) => {
      const help = phaseHelp(g, 'potFiring');
      if (help) return help;
      const lab = g.water.clay;
      if (g.fire.stage !== 'burning') return 'Light your fire first: the test cups go into burning flames.';
      if (!lab.pieces.length || (!lab.nextToFire() && !lab.firing)) return 'Make a new set of clay test cups at your workbench (2 clay, 1 sand).';
      if (lab.firing) return 'Watch the cup in the flames.';
      const next = lab.nextToFire()!;
      return `${next.dry ? 'A sand cup is bone dry.' : 'A sand cup is still damp.'} With an empty hand, reach into the flames and hold it there (browser: stand by the fire and press U).`;
    },
    substeps: (g) => [
      sub('Predict what will happen', predicted(g, 'potFiring')),
      sub('Fire a damp sand cup', tried(g, 'potFiring', 'damp')),
      sub('Fire a bone-dry sand cup', tried(g, 'potFiring', 'dry')),
      sub('Check what you learned', g.experiments.done('potFiring')),
    ],
    done: (g) => g.experiments.done('potFiring'),
    implied: legacyWater,
    hint: {
      ref: 'clay',
      levels: [
        'What happens to water when it is heated far past boiling, trapped inside clay?',
        'Water turns to steam, and steam takes up far more room than water.',
        'Your fire pit, burning well. The test cups are in your bag.',
        'Empty hand into the flames (browser: U at the fire): one damp cup now, one dry cup later.',
      ],
    },
  },
  {
    id: 'waterSource',
    title: 'Test it: stream or rain?',
    short: 'Collect stream water and rain',
    instruction: 'Fill your pot at the stream. Then, when it rains, hold the empty pot at the low back edge of your roof: the overlapping bark and leaves funnel the rain into it.',
    doneMessage: 'Rain is cleaner than the stream, and neither is safe untreated.',
    howTo: (g) => {
      const help = phaseHelp(g, 'waterSource');
      if (help) return help;
      if (!tried(g, 'waterSource', 'stream')) return 'Hold your pot at the stream and reach down (browser: U).';
      if (g.water.potWater !== 'empty' && g.water.potWater !== 'boiledRaw') return 'Tip the pot to pour the stream water out (browser: U at the stream or at the roof edge), then catch rain in the empty pot.';
      if (g.env.rain <= 0.3) return 'Rain is needed. Open the experiment card and press Wait for rain, then go to the low back edge of your roof.';
      return 'It is raining: hold the empty pot at the low back edge of your roof and reach out (browser: U).';
    },
    substeps: (g) => [
      sub('Predict what will happen', predicted(g, 'waterSource')),
      sub('Fill the pot at the stream', tried(g, 'waterSource', 'stream')),
      sub('Catch rain off your roof', tried(g, 'waterSource', 'rain')),
      sub('Check what you learned', g.experiments.done('waterSource')),
    ],
    done: (g) => g.experiments.done('waterSource'),
    implied: legacyWater,
    hint: {
      ref: 'pot',
      levels: [
        'Where did the water in the stream come from before it got there?',
        'Rain falls from clouds made of evaporated water; streams gather water that ran over the ground.',
        'The stream bank for one pot; the low back edge of your lean-to roof for the other.',
        'Fill at the stream, pour it out, then press Wait for rain and hold the pot under the roof edge.',
      ],
    },
  },
  {
    id: 'filterOrder',
    structure: 'filter',
    find: (g) =>
      g.structures.some((s) => s.kind === 'filter')
        ? []
        : (['forkedStick', 'cane', 'cloth', 'charcoal', 'sand', 'gravel'] as ItemId[]).filter((id) => have(g, id) < (id === 'forkedStick' ? 3 : 1)),
    title: 'Test it: which layer order?',
    short: 'Build a filter, test the order',
    instruction: 'Build a filter by the stream: three forked sticks, a hollow cane spout, then cloth, charcoal, sand and gravel in the order you choose. Pour stream water through, then change the order.',
    doneMessage: 'Coarse first, fine below, cloth beneath: clear water. Clear, not safe.',
    teach: 'build',
    explains: true,
    howTo: (g) => {
      const help = phaseHelp(g, 'filterOrder');
      if (help) return help;
      const f = g.structures.find((s) => s.kind === 'filter');
      if (!f) return 'Open Build and choose the water filter, or carry a forked stick to firm ground beside the stream.';
      if (!f.complete) return `Fill the glowing marks. Layers go in from the bottom up: the first one you add is at the bottom. ${layersLine(g) ?? ''}`;
      const last = g.water.lastFilter;
      const line = layersLine(g) ?? '';
      if (last) return `Last pour: ${last.text} ${line} To change the order, pinch layers out (click them) and put them back.`;
      return `${line} Fill your pot at the stream and tip it over the filter (browser: U at the filter).`;
    },
    substeps: (g) => {
      const f = g.structures.find((s) => s.kind === 'filter');
      return [
        sub('Build the filter: legs, spout, four layers', !!f?.complete || exp(g, 'filterOrder').trials.size > 0),
        sub('Predict what will happen', predicted(g, 'filterOrder')),
        sub('Pour through with gravel above sand', tried(g, 'filterOrder', 'coarseFirst')),
        sub('Pour through a different order', tried(g, 'filterOrder', 'fineFirst') || tried(g, 'filterOrder', 'noSupport')),
        sub('Check what you learned', g.experiments.done('filterOrder')),
      ];
    },
    done: (g) => g.experiments.done('filterOrder'),
    implied: legacyWater,
    hint: {
      ref: 'gravel',
      levels: [
        'Water passes the layers from the top down. Which should it meet first, big grains or fine ones?',
        'Coarse gravel catches big bits; fine sand catches silt; cloth holds the grains in; charcoal takes up smells.',
        'Sand and gravel at the stream bend, cloth in the ruins, charcoal from your mound.',
        'Put the layers in bottom first. Pour, then pinch layers out to change the order and pour again.',
      ],
    },
  },
  {
    id: 'treatment',
    title: 'Test it: settle, filter, boil',
    short: 'Compare settle, filter and boil',
    instruction: 'Treat stream water four ways and compare: let it settle, filter it, boil it unfiltered, and filter then boil it.',
    doneMessage: 'Filtering clears water; boiling disinfects it. You need both.',
    howTo: (g) => {
      const help = phaseHelp(g, 'treatment');
      if (help) return help;
      const w = g.water.potWater;
      if (w === 'raw' && !tried(g, 'treatment', 'settle')) return 'To settle it, put the full pot away in your bag (browser: R) or set it down, and wait about 15 seconds.';
      if (w === 'empty' || w === 'boiledRaw' || w === 'safe') return 'Fill your pot at the stream (browser: U).';
      if (!tried(g, 'treatment', 'boil') && (w === 'raw' || w === 'settled')) return 'Boil this unfiltered water: hold the pot at your burning fire (browser: U). Or heat two dry stones in the fire and drop them in.';
      if (w === 'raw' || w === 'settled') return 'Pour it through your filter (tip the pot over it; browser: U at the filter).';
      if (w === 'filtered') return 'Now boil the filtered water at your fire (browser: U).';
      return null;
    },
    substeps: (g) => [
      sub('Predict what will happen', predicted(g, 'treatment')),
      sub('Let stream water settle', tried(g, 'treatment', 'settle')),
      sub('Filter stream water', tried(g, 'treatment', 'filter')),
      sub('Boil unfiltered stream water', tried(g, 'treatment', 'boil')),
      sub('Filter, then boil', tried(g, 'treatment', 'both')),
      sub('Check what you learned', g.experiments.done('treatment')),
    ],
    done: (g) => g.experiments.done('treatment'),
    implied: legacyWater,
    hint: {
      ref: 'pot',
      levels: [
        'Mud and germs are different problems. Does one treatment solve both?',
        'Settling and filtering take out particles; boiling kills germs.',
        'The stream for water, your filter beside it, your fire for boiling.',
        'Settle a pot (put it away, wait), filter one, boil one unfiltered, then filter and boil one.',
      ],
    },
  },
  {
    id: 'waterSupply',
    title: 'A safe water supply',
    short: 'Check your water setup',
    instruction: 'A fired pot, a filter that runs clear and a fire to boil on: show your setup works, then answer what it can and cannot do.',
    doneMessage: 'You can make safer water, and you know where its limits are.',
    howTo: (g) => {
      const s = waterSetup(g);
      if (!s.filter) {
        const f = g.structures.find((t) => t.kind === 'filter');
        const r = f?.complete ? filterResult(filterLayers(f)) : null;
        return r ? `Your filter does not run clear (${r.flow}). Change the layer order.` : 'Finish your filter so it runs clear.';
      }
      if (!s.safe) return 'Filter stream water, then boil it.';
      return phaseHelp(g, 'waterSupply') ?? 'Open the card (Why?) and answer the question.';
    },
    substeps: (g) => {
      const s = waterSetup(g);
      return [
        sub('A fired clay pot', s.pot),
        sub('A filter that runs clear', s.filter),
        sub('Safe water made: filtered, then boiled', s.safe),
        sub('Answer: what can your setup do?', g.experiments.done('waterSupply')),
      ];
    },
    done: (g) => g.experiments.done('waterSupply'),
    implied: legacyWater,
    hint: {
      ref: 'charcoal',
      levels: [
        'Which step removes mud, which deals with germs, and what does neither remove?',
        'Filtering reduces particles; boiling disinfects; dissolved chemicals stay in.',
        'Your filter beside the stream and your fire.',
        'Make sure the filter runs clear and you have boiled filtered water, then answer the card.',
      ],
    },
  },
];

const item = (id: ItemId, x = 0, z = 0) => ({ kind: 'item' as const, id, x, z });

export const WATER_HINTS: Record<string, HintInfo> = {
  clayTemper: {
    name: 'Clay test cups',
    look: 'Three small cups from the same clay: one plain, two with sand kneaded in.',
    why: 'Comparing them side by side shows what the sand does while clay dries.',
    avoid: 'Making the cups different sizes: then you cannot tell what caused a crack.',
    views: [{ pieces: [item('clay', -0.3, 0), item('sand', 0.3, 0)], caption: 'Clay, and sand for temper' }],
  },
  potFiring: {
    name: 'Firing test',
    look: 'A damp sand cup and a bone-dry one, each set in burning flames.',
    why: 'The only difference is the water left in the clay.',
    avoid: 'Waiting until both cups are dry before you fire the first one.',
    views: [{ pieces: [item('clay', 0, 0)], caption: 'A small test cup' }],
  },
  waterSource: {
    name: 'Stream or rain',
    look: 'One pot filled at the stream, one caught at the low back edge of your roof in the rain.',
    why: 'Rain is evaporated water; the stream gathers what ran over the ground.',
    avoid: 'Drinking either untreated: both can carry germs.',
    views: [{ pieces: [item('pot', -0.3, 0), item('bark', 0.3, 0)], caption: 'Your pot and a bark roof' }],
  },
  filterOrder: {
    name: 'Filter layers',
    look: 'A tripod of forked sticks, a cane spout, and four layers: cloth, charcoal, sand and gravel.',
    why: 'The order decides whether water runs clear, clogs or washes sand out.',
    avoid: 'Trusting clear water: a filter does not remove germs.',
    views: [{ pieces: [item('cloth', -0.45, 0), item('charcoal', -0.15, 0), item('sand', 0.15, 0), item('gravel', 0.45, 0)], caption: 'The four layers' }],
  },
  treatment: {
    name: 'Settle, filter, boil',
    look: 'Your pot of stream water: left still, poured through the filter, boiled on the fire.',
    why: 'Each step deals with something different: mud or germs.',
    avoid: 'Boiling muddy water and calling it clean: the mud is still in it.',
    views: [{ pieces: [item('pot', -0.3, 0), item('logs', 0.3, 0)], caption: 'Pot and fire' }],
  },
  waterSupply: {
    name: 'Your water supply',
    look: 'A fired pot, a filter that runs clear, and a fire for boiling.',
    why: 'Filter, then boil: clearer and disinfected water you made yourself.',
    avoid: 'Water that may be polluted by chemicals: boiling does not fix that.',
    views: [{ pieces: [item('pot', -0.3, 0), item('charcoal', 0.3, 0)], caption: 'Pot and filter' }],
  },
};
