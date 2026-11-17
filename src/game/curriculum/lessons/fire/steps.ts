// Lesson 02 (Fire): the new steps. The first steps (wood, tinder, bow drill, pit, lay, ember, fire, charcoal)
// are the beginner objectives in objectives.ts; these add the experiments and the closing practical.
//
// An experiment step is done when its experiment is (prediction, real trials, result, check question). A
// player who finished the old fire chain before these steps existed (charcoal made, no fire experiment ever
// offered: an old save) has them recognised as done, so old saves keep the lesson they finished.

import type { Game } from '../../../game.js';
import type { HintInfo } from '../../../hint-info.js';
import type { ItemId } from '../../../items.js';
import type { HintData } from '../../../objectives.js';
import type { ExperimentDef } from '../../../science/experiments.js';
import { KEEP_FEEDS, KEEP_SECONDS } from '../../../fire.js';
import type { Step } from '../../types.js';
import { AIRFLOW, CHARCOAL_AIR, DRILL_PRESSURE, DRILL_SPEED, FIRE_EXPERIMENTS, FUEL_SIZE, TINDER_DAMP, WOOD_TYPE } from './experiments.js';

const sub = (text: string, done: boolean) => ({ text, done });
const have = (g: Game, id: ItemId): number => g.count(id) + (g.held === id ? 1 : 0);
const burning = (g: Game): boolean => g.fire.stage === 'burning';

/** The old fire chain was finished before Lesson 02 had experiments (an old save): its new steps count as done. */
export const legacyFireDone = (g: Game): boolean => g.flag('charcoalMade') && FIRE_EXPERIMENTS.every((e) => g.experiments.phase(e.id) === 'locked');

const relight = 'Your fire is out: lay tinder, twigs and logs and light it again first.';

/** A step that runs one experiment: the card tracks the prediction, each value tried, and the check. */
function experimentStep(
  def: ExperimentDef,
  o: {
    title: string;
    short: string;
    instruction: string;
    doneMessage: string;
    hint: HintData;
    /** What to do while testing, given which values are still missing (null = the experiment's own how-to). */
    testing?: (g: Game, missing: string[]) => string | null;
    find?: (g: Game) => ItemId[];
  },
): Step {
  return {
    id: def.id,
    title: o.title,
    short: o.short,
    instruction: o.instruction,
    doneMessage: o.doneMessage,
    hint: o.hint,
    find: o.find,
    howTo: (g) => {
      const s = g.experiments.state(def.id);
      if (s.phase === 'locked' || s.phase === 'predict') return 'Open the experiment card (Why?) and choose what you predict.';
      if (s.phase === 'result') return 'Read the result on the experiment card (Why?).';
      if (s.phase === 'check') return 'Answer the check question on the experiment card (Why?).';
      if (s.phase !== 'testing') return null;
      const missing = def.variable.values.filter((v) => !s.trials.has(v.id)).map((v) => v.id);
      return o.testing?.(g, missing) ?? def.howTo;
    },
    substeps: (g) => {
      const s = g.experiments.state(def.id);
      return [
        sub('Predict what will happen', !!s.prediction),
        ...def.variable.values.map((v) => sub(`Try it: ${v.text.toLowerCase()}`, s.trials.has(v.id))),
        sub('Check what you learned', s.phase === 'done'),
      ];
    },
    done: (g) => g.experiments.done(def.id),
    implied: legacyFireDone,
  };
}

export const FIRE_STEPS: Step[] = [
  experimentStep(DRILL_SPEED, {
    title: 'Test: stroke speed',
    short: 'Saw slowly, then fast',
    instruction: 'Does sawing speed matter? Press down firmly and saw slowly for a few seconds, then fast. Watch the dust.',
    doneMessage: 'Speed matters: fast strokes make heat faster than the dust can lose it.',
    testing: (g, missing) =>
      g.held !== 'bowDrill'
        ? 'Take the bow drill out of your bag and go to your fire pit.'
        : missing.includes('slow')
          ? 'Press firmly (browser: hold Shift and drag left and right slowly) and saw SLOWLY for 4 seconds.'
          : 'Now press firmly and saw FAST for 4 seconds (browser: hold Shift and drag quickly left and right).',
    hint: {
      ref: 'bowDrill',
      levels: [
        'Friction turns motion into heat.',
        'Change one thing only: the speed. Press firmly both times.',
        'Saw at your fire pit with the bow drill in your hand.',
        'Browser: hold Shift and drag the mouse left and right, slowly for 4 seconds, then fast. VR: keep your other hand on top of the spindle.',
      ],
    },
  }),
  experimentStep(DRILL_PRESSURE, {
    title: 'Test: how hard to press',
    short: 'Saw light, then firm',
    instruction: 'Does pressing down matter? Saw fast with a light touch, then saw fast pressing firmly. Watch the dust.',
    doneMessage: 'Pressure matters: a firm press grinds hot dust, a light touch only polishes.',
    testing: (g, missing) =>
      g.held !== 'bowDrill'
        ? 'Take the bow drill out of your bag and go to your fire pit.'
        : missing.includes('light')
          ? 'Saw FAST with a LIGHT touch for 4 seconds (browser: drag quickly without Shift; VR: other hand off the spindle).'
          : 'Now saw FAST pressing FIRMLY for 4 seconds (browser: hold Shift; VR: other hand on top of the spindle).',
    hint: {
      ref: 'bowDrill',
      levels: [
        'Friction depends on how hard two surfaces press together.',
        'Keep the speed fast both times; change only the press.',
        'At your fire pit, with the bow drill.',
        'Browser: drag fast without Shift, then drag fast holding Shift. VR: saw fast with your other hand away, then with it pressing on the spindle.',
      ],
    },
  }),
  experimentStep(TINDER_DAMP, {
    title: 'Test: damp or dry fuel',
    short: 'Feed damp, then dry fuel',
    instruction: 'Does water in fuel matter? Feed your fire a damp handful and a dry one, and watch how each catches.',
    doneMessage: 'Water must boil away first: damp fuel steams, smokes and catches late.',
    find: (g) => (g.fuelWet.isDamp('dryGrass') || g.fuelWet.isDamp('twigs') || have(g, 'dampMoss') > 0 ? [] : ['dampMoss']),
    testing: (g, missing) => {
      if (!burning(g)) return relight;
      if (missing.includes('damp'))
        return have(g, 'dampMoss') > 0 || g.fuelWet.isDamp('dryGrass') || g.fuelWet.isDamp('twigs')
          ? 'Take the damp fuel out of your bag and put it on the fire. Watch it.'
          : 'Find damp fuel: moss on shaded rocks, or grass and twigs picked up out in the rain.';
      return 'Now put a dry handful (dry grass or twigs) on the fire.';
    },
    hint: {
      ref: 'dampMoss',
      levels: [
        'Water and fire fight over heat.',
        'Compare the same kind of fuel, damp and dry.',
        'Moss grows on shaded rocks. Anything picked up out in the rain is wet.',
        'Take a damp handful out of your bag and drop it on the fire, then a dry one.',
      ],
    },
  }),
  experimentStep(FUEL_SIZE, {
    title: 'Test: twig or log',
    short: 'Feed a twig and a log',
    instruction: 'What catches faster? Feed your fire a dry twig and a dry log, and see which one catches first.',
    doneMessage: 'Thin fuel has more surface for its mass, so it catches first: the fire ladder.',
    find: (g) => (['twigs', 'logs'] as ItemId[]).filter((i) => have(g, i) === 0),
    testing: (g, missing) => {
      if (!burning(g)) return relight;
      if (missing.includes('kindling')) return 'Put a dry twig on the fire (take twigs out of your bag) and watch it catch.';
      return 'Now carry a dry log to the fire and put it on. Count how long it takes to catch.';
    },
    hint: {
      ref: 'twigs',
      levels: [
        'Fire works on the surface of fuel.',
        'Same dry wood, different thickness: a twig and a log.',
        'Twigs and logs lie under the trees.',
        'Hold a twig over the fire and let go; then hold a log over it and let go.',
      ],
    },
  }),
  experimentStep(WOOD_TYPE, {
    title: 'Test: dead or green wood',
    short: 'Feed dead and green wood',
    instruction: 'Which burns better? Feed your fire a dry dead branch and a green branch from a living sapling.',
    doneMessage: 'Green wood is full of sap: it smoulders and smokes. Dead wood is already dry.',
    find: (g) => (['dryBranch', 'greenBranch'] as ItemId[]).filter((i) => have(g, i) === 0),
    testing: (g, missing) => {
      if (!burning(g)) return relight;
      if (missing.includes('dead')) return have(g, 'dryBranch') > 0 ? 'Put the dry dead branch on the fire.' : 'Find a dry, dead branch lying in the forest and put it on the fire.';
      return have(g, 'greenBranch') > 0 ? 'Now put the green branch on the fire.' : 'Find a green, living branch (a young sapling) and put it on the fire.';
    },
    hint: {
      ref: 'greenBranch',
      levels: [
        'Living wood is full of sap, and sap is mostly water.',
        'Compare a dead branch and a living one, both on the same fire.',
        'Dead branches lie on the forest floor; young saplings give green ones.',
        'Hold each branch over the fire and let go. Watch the flames and the smoke.',
      ],
    },
  }),
  experimentStep(CHARCOAL_AIR, {
    title: 'Test: air and charcoal',
    short: 'Compare open fire and mound',
    instruction: 'What makes charcoal? Compare a log burned in your open fire with logs heated in a sealed mound.',
    doneMessage: 'Little air: the gases leave as smoke and the carbon stays. That is charcoal.',
    testing: (_g, missing) =>
      missing.includes('open')
        ? 'Put a log on your open fire and let it burn away completely.'
        : 'Make charcoal in a sealed mound and open it when the smoke turns thin and blue.',
    hint: {
      ref: 'charcoal',
      levels: [
        'Wood heated without air does not burn away.',
        'Compare plenty of air (the open fire) with little air (a sealed mound).',
        'Your fire pit, and a mound dug on dry ground.',
        'Let a log burn out in the fire; seal a mound with clay, light it, and open it at thin blue smoke.',
      ],
    },
  }),
  experimentStep(AIRFLOW, {
    title: 'Test: air on the fire',
    short: 'Fan the fire, then smother it',
    instruction: 'What does air do to a burning fire? Fan it, then cover it with earth using your digging stick.',
    doneMessage: 'No oxygen, no fire. That is also how you put a fire out safely.',
    find: (g) => (have(g, 'diggingStick') > 0 ? [] : ['diggingStick']),
    testing: (g, missing) => {
      if (!burning(g)) return relight;
      if (missing.includes('fanned')) return 'Fan the burning fire with an open palm (browser: click the fire with an empty hand, several times).';
      return have(g, 'diggingStick') > 0
        ? 'Hold the digging stick and scrape earth over the fire (browser: click the fire with it).'
        : 'Find a digging stick (a sturdy pointed stick), then scrape earth over the fire with it.';
    },
    hint: {
      ref: 'diggingStick',
      levels: [
        'Burning is fuel joining with oxygen.',
        'Give it more air, then none.',
        'At your burning fire, with a digging stick.',
        'Wave an open palm over the flames; then hold the digging stick and push earth over the fire.',
      ],
    },
  }),
  {
    id: 'fireOnOwn',
    title: 'Practical: your own fire',
    short: 'Light and keep your own fire',
    instruction: `On your own now: light a new fire from a cold pit, then keep it burning for ${KEEP_SECONDS / 60} minutes by feeding it before it dies down.`,
    doneMessage: 'You can make fire and keep it. Warmth, cooking and heat for materials are yours.',
    howTo: (g) => {
      const f = g.fire;
      if (f.stage === 'burning' && f.run < 2) return 'This is your first, guided fire. Let it burn out (or smother it with earth), then lay and light a new one yourself.';
      if (f.stage === 'burning') return f.feeds < KEEP_FEEDS ? 'Keep it fed: add twigs or a log before the flames die down.' : 'Keep it going: watch the flames and feed it again when they shrink.';
      return 'Lay the fire (tinder, twigs, logs), saw an ember and fan it into flame, on your own.';
    },
    // Seconds your own fire has kept burning: the bar on the card fills as you keep it fed.
    progress: (g) => {
      const f = g.fire;
      const have = f.kept ? KEEP_SECONDS : f.stage === 'burning' && f.run >= 2 ? Math.min(KEEP_SECONDS, Math.floor(f.keepT)) : 0;
      return { have, need: KEEP_SECONDS };
    },
    substeps: (g) => {
      const f = g.fire;
      const mine = f.stage === 'burning' && f.run >= 2;
      return [
        sub('Light a new fire yourself', f.lights >= 2),
        sub(`Keep it burning (${Math.min(KEEP_SECONDS, Math.floor(mine ? f.keepT : f.kept ? KEEP_SECONDS : 0))} / ${KEEP_SECONDS} s)`, f.kept),
        sub(`Feed it (${Math.min(KEEP_FEEDS, mine ? f.feeds : f.kept ? KEEP_FEEDS : 0)} / ${KEEP_FEEDS})`, f.kept),
      ];
    },
    done: (g) => g.fire.kept,
    implied: legacyFireDone,
    hint: {
      ref: 'logs',
      levels: [
        'A fire needs fuel, heat and air, all the time.',
        'Feed it before the flames shrink: twigs first if it is small, logs once it is hot.',
        'At your own fire pit.',
        'Lay tinder, twigs and logs, saw an ember, fan it, then add fuel every minute or so.',
      ],
    },
  },
];

const item = (id: ItemId, x = 0, z = 0) => ({ kind: 'item' as const, id, x, z });

export const FIRE_HINTS: Record<string, HintInfo> = {
  drillSpeed: {
    name: 'Stroke speed test',
    look: 'The bow drill at your fire pit, and the dust in the notch of the board.',
    why: 'Friction turns motion into heat. Testing slow and fast strokes shows what speed does.',
    avoid: 'Changing two things at once: press firmly in both tries so only the speed changes.',
    views: [{ pieces: [item('bowDrill')], caption: 'Saw slowly, then fast' }],
  },
  drillPressure: {
    name: 'Pressure test',
    look: 'The bow drill at your pit. Your other hand presses down on top of the spindle.',
    why: 'Friction heat depends on how hard the surfaces press together, not only on speed.',
    avoid: 'Sawing slowly in one try: keep both tries fast so only the pressure changes.',
    views: [{ pieces: [item('bowDrill', -0.2, 0), item('spindle', 0.25, 0)], caption: 'Light touch, then firm press' }],
  },
  tinderDamp: {
    name: 'Damp or dry fuel',
    look: 'Damp moss or rain-soaked grass, and dry, pale grass or twigs.',
    why: 'Water has to boil away before fuel can burn, and boiling takes the fire\'s heat.',
    avoid: 'Piling lots of wet fuel on a small fire: it can cool it until it dies.',
    views: [{ pieces: [item('dampMoss', -0.25, 0), item('dryGrass', 0.25, 0)], caption: 'Damp moss and dry grass' }],
  },
  fuelSize: {
    name: 'Twig or log',
    look: 'A thin dry twig and a thick dry log.',
    why: 'Thin fuel has much more surface for its mass, so it reaches ignition temperature first.',
    avoid: 'Damp fuel for this test: then you would be testing water, not size.',
    views: [{ pieces: [item('twigs', -0.35, 0), item('logs', 0.25, 0)], caption: 'A twig and a log' }],
  },
  woodType: {
    name: 'Dead or green wood',
    look: 'A grey, dry dead branch that snaps, and a springy green branch from a living sapling.',
    why: 'Living wood is full of sap, mostly water; dead wood has dried out.',
    avoid: 'A dead branch soaked by rain: test dry dead wood against green wood.',
    views: [{ pieces: [item('dryBranch', -0.3, 0), item('greenBranch', 0.3, 0)], caption: 'Dead branch, green branch' }],
  },
  charcoalAir: {
    name: 'Air and charcoal',
    look: 'A log burning away in the open fire, and a mound of earth sealed with clay.',
    why: 'The same wood ends as ash with plenty of air and as charcoal with little air.',
    avoid: 'Opening the mound while the smoke is still thick and white.',
    views: [{ pieces: [item('logs', -0.3, 0), item('clay', 0.1, 0), item('charcoal', 0.4, 0)], caption: 'Log, clay seal, charcoal' }],
  },
  airflow: {
    name: 'Air on the fire',
    look: 'Your burning fire, an open palm to fan it, and a digging stick to push earth over it.',
    why: 'Burning is fuel joining with oxygen: more air feeds it, no air stops it.',
    avoid: 'Leaving a smothered fire before checking it is cold: buried coals stay hot.',
    views: [{ pieces: [item('diggingStick')], caption: 'Fan it, then smother it' }],
  },
  fireOnOwn: {
    name: 'Your own fire',
    look: 'Your fire pit with tinder, twigs and logs, and spare fuel close by.',
    why: 'Fire burns its fuel away. Keeping one alive means feeding it before it dies down.',
    avoid: 'Big logs on a small fire, and wet fuel: feed thin, dry fuel first.',
    views: [{ pieces: [item('dryGrass', -0.4, 0), item('twigs', 0, 0), item('logs', 0.4, 0)], caption: 'Tinder, twigs, logs' }],
  },
};
