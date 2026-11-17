// Lesson 01 (Shelter) experiments.
//
// Roof layers: the real rain on the real roof decides. While rain falls on the lean-to, every roof panel
// is one trial: how many layers it has (1, or 2 or more) and whether it leaks (game.ts, rain trials).
// The roof rules (shelter.ts) give each layer a weight and a panel only keeps rain out once it reaches
// PROTECT_NEED, so one layer of anything leaks and two overlapping layers hold.

import type { ExperimentDef } from '../../../science/experiments.js';
import { framePush } from '../../../shelter.js';

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
  testAction: {
    label: (g) => (g.leanTo() && !g.shelterTest.raining ? 'Wait for rain' : 'Keep testing'),
    run: (g) => (g.waitForRain() ? 'Clouds gather. Stand under your roof and watch each panel.' : null),
  },
};

// Frame stability: the real lean-to, pushed (Game.pushFrame -> shelter.ts framePush). With only two posts and
// the ridge, the frame is a box and leans right over; with all three ribs and both cross-supports it holds.
// The bare frame is pushed during the frame step: its ribs wait for that push (PlacedStructure.pushFirst).
export const FRAME_PUSH: ExperimentDef = {
  id: 'framePush',
  lesson: 'shelter',
  concept: 'structures',
  question: 'What stops a frame from folding over?',
  why: 'A frame that folds in the wind drops the roof on you.',
  predictions: [
    { id: 'posts', text: 'Two strong posts and a ridge pole are enough.' },
    { id: 'triangles', text: 'Leaning ribs and cross-supports: triangles hold it.' },
    { id: 'cord', text: 'Only tight cord holds it; the shape does not matter.' },
  ],
  variable: {
    name: 'The frame you push',
    values: [
      { id: 'unbraced', text: 'Posts and ridge only' },
      { id: 'braced', text: 'With ribs and cross-supports' },
    ],
  },
  outcomes: [
    { id: 'folds', text: 'leans right over' },
    { id: 'holds', text: 'holds its shape' },
  ],
  howTo: 'Push a post or the ridge pole (pinch or click it) before the ribs go on, then again once every rib and cross-support is in.',
  conclude: (t) => {
    const bare = t.get('unbraced');
    const braced = t.get('braced');
    if (!bare || !braced) return null;
    if (bare === 'holds') return 'posts';
    return braced === 'holds' ? 'triangles' : 'cord';
  },
  principle: 'Posts and a ridge make a box with the ground, and a box can fold without any pole changing length. A triangle cannot change shape unless a side changes length, so ribs and braces make the frame rigid.',
  apply: 'Roof trusses, bridges, cranes and bike frames are built from triangles. A gate gets a diagonal brace for the same reason.',
  limits: 'Loose joints let even triangles wobble, and poles can still bend or snap if they are too thin.',
  check: {
    question: 'A friend\'s lean-to sways sideways in the wind. What fixes it best?',
    options: [
      { id: 'diagonal', text: 'Tie a pole across it diagonally, making triangles.', correct: true, why: 'A diagonal turns the box into triangles, and triangles cannot fold.' },
      { id: 'thicker', text: 'Use thicker posts.', why: 'Thick posts still turn at the joints: the box shape still folds.' },
      { id: 'roof', text: 'Pile more roof on top to weigh it down.', why: 'More weight on top makes a wobbly frame fold sooner.' },
    ],
  },
  // Offered while the frame is going up, before any rib or cross-support is in (it can still be compared).
  opens: (g) => {
    const s = g.leanTo();
    if (!s || !g.focusIs('frame', 'framePush')) return false;
    const r = framePush(s);
    return r.ribs === 0 && r.crosses === 0;
  },
  readout: (g) => g.shelterRules.pushReadout(),
};

// Insulation: resting still under the roof, the body's conduction into the ground (survival/body.ts) is measured
// against bare ground, with the bed under you as the variable (survival/materials.ts gives each material its
// insulation and dampness). A fair test compares whole beds of one material (same thickness).
export const BED_TEST: ExperimentDef = {
  id: 'bedMaterials',
  lesson: 'shelter',
  concept: 'insulation',
  question: 'What makes a warm bed?',
  why: 'All night long, the cold ground draws heat out of anything lying on it.',
  predictions: [
    { id: 'dry', text: 'Dry grass or leaves: fluffy and dry keeps the most warmth in.' },
    { id: 'any', text: 'Any thick pile works the same, damp or dry.' },
    { id: 'ground', text: 'Bare ground is fine; a bed is only for comfort.' },
  ],
  variable: {
    name: 'What you rest on',
    values: [
      { id: 'bare', text: 'Bare ground' },
      { id: 'dryGrass', text: 'A bed of dry grass' },
      { id: 'leafLitter', text: 'A bed of dry leaves' },
      { id: 'dampMoss', text: 'A bed of damp moss' },
    ],
  },
  outcomes: [
    { id: 'most', text: 'most of your heat flows into the ground' },
    { id: 'some', text: 'a lot of heat still gets through' },
    { id: 'little', text: 'very little heat gets through' },
  ],
  howTo: 'Stand still under your roof on bare ground, on a whole bed of dry grass or leaves, and on a whole bed of damp moss. Pinch bed layers to take them back.',
  // Bare ground, damp moss and one dry material are enough to decide; the other dry material is a bonus.
  conclude: (t) => {
    const bare = t.get('bare');
    const damp = t.get('dampMoss');
    const dry = t.get('dryGrass') ?? t.get('leafLitter');
    if (!bare || !damp || !dry) return null;
    if (bare === 'little') return 'ground';
    if (dry === 'little' && damp !== 'little') return 'dry';
    return 'any';
  },
  principle: 'Still air is a poor conductor of heat. Dry grass and leaves trap it in many small pockets. In damp moss, water fills those pockets, and water carries heat away more than twenty times faster than air.',
  apply: 'Camping mats, wool, down jackets and a pile of dry leaves under a sleeping bag all work by trapping still air.',
  limits: 'Packed flat, a bed loses its air pockets. Even dry bedding draws damp from the ground over days.',
  check: {
    question: 'You only have damp moss and a pile of dry leaves. What do you sleep on?',
    options: [
      { id: 'leaves', text: 'The dry leaves, piled thick and fluffed up.', correct: true, why: 'Dry, fluffy leaves trap still air, which stops the ground drawing your heat.' },
      { id: 'moss', text: 'The damp moss: it is soft and thick.', why: 'Its water fills the air spaces and carries heat away, and it soaks you too.' },
      { id: 'ground', text: 'The bare ground: a bed is only for comfort.', why: 'Bare earth draws heat out of you all night.' },
    ],
  },
  opens: (g) => g.focusIs('bed', 'bedMaterials', 'nightShelter') || g.lessons.completed.has('bed'),
  readout: (g) => g.shelterRules.bedReadout(),
};

// Exposed vs sheltered, and the lesson's practical check: on a cold night, the body model's heat balance
// standing in the open against resting on your bed under the roof (lessons/shelter/rules.ts).
export const NIGHT_SHELTER: ExperimentDef = {
  id: 'nightShelter',
  lesson: 'shelter',
  concept: 'insulation',
  question: 'How much warmth does your shelter save at night?',
  why: 'Night is when the cold comes. A shelter has to keep your own body heat in.',
  predictions: [
    { id: 'less', text: 'Much less warmth is lost inside, on the bed.' },
    { id: 'same', text: 'About the same: it is just as cold inside.' },
    { id: 'more', text: 'More: shelters trap the cold air.' },
  ],
  variable: {
    name: 'Where you spend the night',
    values: [
      { id: 'open', text: 'Out in the open' },
      { id: 'shelter', text: 'In your shelter, on a dry bed' },
    ],
  },
  outcomes: [
    { id: 'fast', text: 'loses warmth fast' },
    { id: 'slow', text: 'loses warmth slowly' },
    { id: 'steady', text: 'warmth holds steady' },
  ],
  howTo: 'On a cold night, stand still out in the open for a few seconds, then rest on a whole, dry bed under the roof.',
  conclude: (t) => {
    const open = t.get('open');
    const shelter = t.get('shelter');
    if (!open || !shelter) return null;
    const rank = { fast: 0, slow: 1, steady: 2 } as Record<string, number>;
    const d = rank[shelter] - rank[open];
    return d > 0 ? 'less' : d === 0 ? 'same' : 'more';
  },
  principle: 'A shelter makes no heat. It cuts the losses: the roof stops rain and most of the wind, and the dry bed stops the ground drawing heat, until your own body heat is enough.',
  apply: 'Houses, tents and sleeping bags work the same way: they slow heat loss so the heat you make is enough.',
  limits: 'This is a simplified heat budget. On very cold nights a shelter alone is not enough: that is what fire is for.',
  check: {
    question: 'A cold, windy, rainy night is coming. Where do you spend it?',
    options: [
      { id: 'shelter', text: 'Under your roof, on a thick dry bed, on raised ground.', correct: true, why: 'The roof stops rain and wind, the dry bed stops the ground, and raised ground stays out of pooling cold air and water.' },
      { id: 'hollow', text: 'Down in the hollow, where the wind cannot reach.', why: 'Cold air and rainwater collect in hollows, so it gets colder and wetter there.' },
      { id: 'stream', text: 'Out by the stream, on soft damp moss.', why: 'Wind, rain and a damp bed all carry your heat away.' },
    ],
  },
  opens: (g) => g.focusIs('nightShelter') || g.lessons.completed.has('bedMaterials'),
  testAction: {
    label: (g) => (g.shelterRules.lastNight?.cold ? 'Keep testing' : 'Rest until midnight'),
    run: (g) => g.waitForNight(),
  },
  readout: (g) => g.shelterRules.nightReadout(g),
};

// In play order (the card offers the first one waiting for the player).
export const SHELTER_EXPERIMENTS: ExperimentDef[] = [FRAME_PUSH, ROOF_LAYERS, BED_TEST, NIGHT_SHELTER];
