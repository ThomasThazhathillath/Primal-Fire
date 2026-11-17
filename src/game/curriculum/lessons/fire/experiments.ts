// Lesson 02 (Fire) experiments. Every trial is reported by the code that runs the mechanic, from what really
// happened (fire.ts, water.ts); nothing here decides an outcome. One thing changes per experiment and the
// rules hold the rest the same: speed is compared at a firm press, pressure at a fast stroke, fuel size and
// wood type with dry fuel.
//
// Each opens when its step is on the card (the drill-speed test opens as you make your first ember), so a
// player who finished the old fire chain before experiments existed is never shown stale cards.

import type { Game } from '../../../game.js';
import type { ExperimentDef } from '../../../science/experiments.js';

type Trials = ReadonlyMap<string, string>;

/** a -> the first prediction when value `x` gave `good` and `y` did not; the reverse -> the second; else the third. */
function compare(t: Trials, x: string, y: string, good: string, ids: [string, string, string]): string | null {
  const a = t.get(x);
  const b = t.get(y);
  if (!a || !b) return null;
  if (a === good && b !== good) return ids[0];
  if (b === good && a !== good) return ids[1];
  return ids[2];
}

export const DRILL_SPEED: ExperimentDef = {
  id: 'drillSpeed',
  lesson: 'fire',
  concept: 'friction_heat',
  question: 'Does it matter how fast you saw?',
  why: 'An ember needs dust hot enough to smoulder. Speed is easy to change: does it help?',
  predictions: [
    { id: 'faster', text: 'Fast strokes make the dust hotter.' },
    { id: 'slower', text: 'Slow, careful strokes make it hotter.' },
    { id: 'same', text: 'Speed makes no difference.' },
  ],
  variable: {
    name: 'Stroke speed (pressing firmly both times)',
    values: [
      { id: 'slow', text: 'Slow strokes' },
      { id: 'fast', text: 'Fast strokes' },
    ],
  },
  outcomes: [
    { id: 'smoke', text: 'the dust smokes' },
    { id: 'nosmoke', text: 'warm, but no smoke' },
  ],
  howTo: 'Press down firmly (browser: hold Shift). Saw slowly for 4 seconds, then fast for 4 seconds, and watch the dust.',
  conclude: (t) => compare(t, 'fast', 'slow', 'smoke', ['faster', 'slower', 'same']),
  principle: 'Friction turns the motion of the bow into heat. Fast strokes rub more each second, so the dust heats faster than it cools. Slow strokes level off before it smokes.',
  apply: 'Rubbing your hands fast warms them more than rubbing slowly. Brakes get hottest stopping a fast car.',
  limits: 'Speed alone is not enough: you also need pressure, dry wood and a notch that gathers the dust.',
  check: {
    question: 'Your board warms but never smokes. What do you change first?',
    options: [
      { id: 'faster', text: 'Saw faster, with steady strokes.', correct: true, why: 'More speed means more friction heat each second, so the dust can outrun its cooling.' },
      { id: 'rest', text: 'Stop and rest so it can heat up.', why: 'Resting lets the dust cool: heat leaks away whenever you stop.' },
      { id: 'slower', text: 'Saw slower so the wood does not wear out.', why: 'Slower strokes make less heat each second, so the dust stays below smouldering.' },
    ],
  },
  opens: (g: Game) => g.focusIs('ember', 'fireLit', 'drillSpeed'),
};

export const DRILL_PRESSURE: ExperimentDef = {
  id: 'drillPressure',
  lesson: 'fire',
  concept: 'friction_heat',
  question: 'How hard should you press the spindle?',
  why: 'Your other hand presses down on top of the spindle. Does that matter, or only the sawing?',
  predictions: [
    { id: 'firm', text: 'Pressing down firmly makes the heat.' },
    { id: 'light', text: 'A light touch, so it spins freely.' },
    { id: 'same', text: 'Pressing makes no difference.' },
  ],
  variable: {
    name: 'Press on the spindle (fast strokes both times)',
    values: [
      { id: 'light', text: 'Light touch' },
      { id: 'firm', text: 'Firm press' },
    ],
  },
  outcomes: [
    { id: 'smoke', text: 'the dust smokes' },
    { id: 'nosmoke', text: 'it only polishes the board' },
  ],
  howTo: 'Saw fast both times: once with a light touch (browser: no Shift; VR: other hand off the spindle), once pressing firmly (hold Shift; VR: other hand on top).',
  conclude: (t) => compare(t, 'firm', 'light', 'smoke', ['firm', 'light', 'same']),
  principle: 'Friction heat grows with how hard the surfaces press together as well as how fast they move. A light touch glides over the board; a firm press grinds off hot dust.',
  apply: 'Sandpaper only bites when you press. Brake pads squeeze the disc to turn motion into heat.',
  limits: 'Press too hard and the bow stalls or the cord slips; the best press is somewhere in the middle.',
  check: {
    question: 'The spindle spins fast but the board only goes shiny. Why?',
    options: [
      { id: 'press', text: 'Too little pressure: press down harder.', correct: true, why: 'Without pressure the spindle glazes the wood instead of grinding off hot dust.' },
      { id: 'speed', text: 'It is spinning too fast.', why: 'Speed helps. A shiny board shows the surfaces are not pressed together hard enough.' },
      { id: 'wet', text: 'The board is soaking wet.', why: 'A wet board would not polish shiny. The light touch is the problem.' },
    ],
  },
  opens: (g: Game) => g.focusIs('drillPressure'),
};

export const TINDER_DAMP: ExperimentDef = {
  id: 'tinderDamp',
  lesson: 'fire',
  concept: 'fuel',
  question: 'Does damp fuel catch as fast as dry?',
  why: 'Rain soaks fuel left out, and some fuel holds water by nature. Find out what that does.',
  predictions: [
    { id: 'dry', text: 'Dry fuel catches much faster.' },
    { id: 'damp', text: 'Damp fuel catches faster: it is fresher.' },
    { id: 'same', text: 'Both catch just as fast.' },
  ],
  variable: {
    name: 'How wet the tinder or twigs are',
    values: [
      { id: 'dry', text: 'Dry' },
      { id: 'damp', text: 'Damp or wet' },
    ],
  },
  outcomes: [
    { id: 'quick', text: 'catches in seconds' },
    { id: 'slow', text: 'hisses and smokes, slow to catch' },
  ],
  howTo: 'Feed your fire a dry handful (grass or twigs) and a damp one (damp moss, or grass picked up in the rain). Watch each one catch.',
  conclude: (t) => compare(t, 'dry', 'damp', 'quick', ['dry', 'damp', 'same']),
  principle: 'Water must boil away before fuel reaches its ignition temperature. Boiling soaks up the fire\'s heat, so damp fuel steams and smokes before it burns.',
  apply: 'Firewood is dried (seasoned) for months before it is burned. Fire-makers keep tinder in a dry pouch.',
  limits: 'A big, hot fire can still burn damp wood, slowly and smokily. A small fire may die.',
  check: {
    question: 'It rained and your kindling is wet. What helps most?',
    options: [
      { id: 'dry', text: 'Dry it beside the fire or under your roof first.', correct: true, why: 'Heat and moving air drive the water out, so later it catches quickly.' },
      { id: 'pile', text: 'Pile it all on the fire at once.', why: 'Lots of wet fuel boils off lots of water and can cool a small fire until it dies.' },
      { id: 'blow', text: 'Blow on it hard.', why: 'Air helps burning, but the water still has to boil away first.' },
    ],
  },
  opens: (g: Game) => g.focusIs('tinderDamp'),
};

export const FUEL_SIZE: ExperimentDef = {
  id: 'fuelSize',
  lesson: 'fire',
  concept: 'ignition',
  question: 'What catches faster: a twig or a log?',
  why: 'A fire needs bigger fuel to last. Which goes on first, and why?',
  predictions: [
    { id: 'thin', text: 'The thin twig catches first.' },
    { id: 'thick', text: 'The thick log catches first: it has more wood.' },
    { id: 'same', text: 'They catch at the same time.' },
  ],
  variable: {
    name: 'Fuel size (both dry)',
    values: [
      { id: 'kindling', text: 'A twig (kindling)' },
      { id: 'log', text: 'A log' },
    ],
  },
  outcomes: [
    { id: 'fast', text: 'catches within seconds' },
    { id: 'slow', text: 'takes a long time' },
  ],
  howTo: 'Feed the fire a dry twig and a dry log, and see which catches first.',
  conclude: (t) => compare(t, 'kindling', 'log', 'fast', ['thin', 'thick', 'same']),
  principle: 'Burning happens at the surface. A twig has lots of surface for its mass, so it heats to ignition fast; a log soaks the heat into its middle. Fires climb a ladder: tinder, kindling, logs.',
  apply: 'Kindling starts a wood stove and logs go on once it is hot. Fine dust burns so fast it can even explode.',
  limits: 'Big logs burn longest once a bed of hot coals keeps them going.',
  check: {
    question: 'Your tinder has just caught. What do you add next?',
    options: [
      { id: 'kindling', text: 'Thin twigs, then thicker sticks.', correct: true, why: 'Each size lights the next: thin fuel catches from a small flame and makes it bigger.' },
      { id: 'log', text: 'Your biggest log, so it lasts.', why: 'A log takes the small flame\'s heat and smothers it before it can catch.' },
      { id: 'nothing', text: 'Nothing: tinder burns for a long time.', why: 'Tinder burns out in seconds. It is only the spark for bigger fuel.' },
    ],
  },
  opens: (g: Game) => g.focusIs('fuelSize'),
};

export const WOOD_TYPE: ExperimentDef = {
  id: 'woodType',
  lesson: 'fire',
  concept: 'fuel',
  question: 'Dead wood or living wood: which burns better?',
  why: 'Green branches are everywhere; dead ones take finding. Is the search worth it?',
  predictions: [
    { id: 'dead', text: 'Dead, dry wood burns better.' },
    { id: 'green', text: 'Green, living wood burns better.' },
    { id: 'same', text: 'All wood burns the same.' },
  ],
  variable: {
    name: 'Kind of branch',
    values: [
      { id: 'dead', text: 'Dead branch' },
      { id: 'green', text: 'Green branch' },
    ],
  },
  outcomes: [
    { id: 'bright', text: 'catches and burns bright' },
    { id: 'smoky', text: 'smoulders in thick smoke' },
  ],
  howTo: 'Feed your fire a dry dead branch and a green branch from a living sapling. Compare how each burns.',
  conclude: (t) => compare(t, 'dead', 'green', 'bright', ['dead', 'green', 'same']),
  principle: 'Living wood is full of sap, which is mostly water. The fire must boil it out first, so green wood smoulders, smokes and gives less heat. Dead wood has already dried.',
  apply: 'People burn seasoned, dead wood at home; green wood smokes and clogs chimneys with tar.',
  limits: 'Dead wood lying on wet ground can be soaked too. Snap it: dry wood cracks sharply.',
  check: {
    question: 'You need a fire fast. Which wood do you gather?',
    options: [
      { id: 'dead', text: 'Dead branches that snap with a crack.', correct: true, why: 'They are already dry, so the fire spends no heat boiling out water.' },
      { id: 'green', text: 'Fresh green branches: they are full of life.', why: 'That life is sap, mostly water. Green wood smoulders.' },
      { id: 'bark', text: 'Bark from logs lying in the stream.', why: 'Anything wet has to dry before it burns.' },
    ],
  },
  opens: (g: Game) => g.focusIs('woodType'),
};

export const CHARCOAL_AIR: ExperimentDef = {
  id: 'charcoalAir',
  lesson: 'fire',
  concept: 'pyrolysis',
  question: 'What turns wood into charcoal instead of ash?',
  why: 'Charcoal burns hot and cleans water. The same wood can end as ash or as charcoal. What decides?',
  predictions: [
    { id: 'less', text: 'Little air: wood heated without air becomes charcoal.' },
    { id: 'more', text: 'Lots of air makes the best charcoal.' },
    { id: 'none', text: 'Heated wood always ends as ash.' },
  ],
  variable: {
    name: 'Air while the wood is heated',
    values: [
      { id: 'open', text: 'Open fire (plenty of air)' },
      { id: 'sealed', text: 'Sealed mound (little air)' },
    ],
  },
  outcomes: [
    { id: 'ash', text: 'burns away to ash' },
    { id: 'charcoal', text: 'black charcoal' },
    { id: 'part', text: 'half-done brown wood' },
  ],
  howTo: 'Watch a log burn away in your open fire. Heat logs in a mound sealed with clay, and open it when the smoke turns thin and blue.',
  conclude: (t) => {
    const open = t.get('open');
    const sealed = t.get('sealed');
    // A mound opened too early has not finished: no evidence yet about what little air does.
    if (!open || !sealed || sealed === 'part') return null;
    if (sealed === 'charcoal' && open !== 'charcoal') return 'less';
    if (open === 'charcoal') return 'more';
    return 'none';
  },
  principle: 'Heat drives water and gases out of wood (pyrolysis). With plenty of air the gases and then the carbon burn, leaving ash. With little air the gases escape as smoke and the carbon stays: charcoal.',
  apply: 'Barbecue charcoal is still made in sealed kilns. Its hot, clean heat let people smelt metal.',
  limits: 'Burning charcoal gives off carbon monoxide: never burn it in a closed space.',
  check: {
    question: 'The mound\'s smoke is still thick and white. What do you do?',
    options: [
      { id: 'wait', text: 'Wait until it turns thin and blue.', correct: true, why: 'White smoke is water and gases still leaving. Thin blue smoke means it is nearly all carbon.' },
      { id: 'open', text: 'Open it now.', why: 'Too early: the inside is still brown, damp wood.' },
      { id: 'air', text: 'Open the vents to speed it up.', why: 'Air lets the wood burn away: you would get ash.' },
    ],
  },
  opens: (g: Game) => g.focusIs('charcoal', 'charcoalAir'),
};

export const AIRFLOW: ExperimentDef = {
  id: 'airflow',
  lesson: 'fire',
  concept: 'oxygen',
  question: 'What does air do to a burning fire?',
  why: 'You fanned an ember into flame. Does air still matter once the fire burns?',
  predictions: [
    { id: 'air', text: 'Air feeds it: fanning grows it, covering kills it.' },
    { id: 'cover', text: 'Covering keeps the heat in, so it burns hotter.' },
    { id: 'none', text: 'Air makes no difference to a fire.' },
  ],
  variable: {
    name: 'Air reaching the fire',
    values: [
      { id: 'fanned', text: 'Fanned (more air)' },
      { id: 'smothered', text: 'Covered with earth (no air)' },
    ],
  },
  outcomes: [
    { id: 'grows', text: 'the flames grow' },
    { id: 'same', text: 'no change' },
    { id: 'dies', text: 'it goes out' },
  ],
  howTo: 'First fan the burning fire with an open palm (browser: click it with an empty hand). Then hold the digging stick and scrape earth over it (click the fire).',
  conclude: (t) => {
    const fanned = t.get('fanned');
    const smothered = t.get('smothered');
    if (!fanned || !smothered) return null;
    if (smothered === 'dies') return 'air';
    if (smothered === 'grows') return 'cover';
    return 'none';
  },
  principle: 'Burning is fast oxidation: fuel joining with oxygen. More air brings more oxygen and a hotter fire; cut the air off and it dies, even with fuel left. That is the oxygen side of the fire triangle.',
  apply: 'Blacksmiths pump bellows to make a forge hotter. A lid or a fire blanket puts out a fire by cutting off its air.',
  limits: 'Buried coals can stay hot for hours. Always check that a smothered fire is cold before you leave it.',
  check: {
    question: 'You have to leave camp. How do you put your fire out?',
    options: [
      { id: 'earth', text: 'Cover it with earth, then check it is cold.', correct: true, why: 'Earth cuts off the oxygen. Checking matters because buried coals stay hot.' },
      { id: 'fan', text: 'Fan it hard to blow it out.', why: 'Fanning adds oxygen: the fire grows.' },
      { id: 'leave', text: 'Leave it: it will burn out by itself.', why: 'An unattended fire can spread. Put it out yourself.' },
    ],
  },
  opens: (g: Game) => g.focusIs('airflow'),
};

export const FIRE_EXPERIMENTS: ExperimentDef[] = [DRILL_SPEED, DRILL_PRESSURE, TINDER_DAMP, FUEL_SIZE, WOOD_TYPE, CHARCOAL_AIR, AIRFLOW];
