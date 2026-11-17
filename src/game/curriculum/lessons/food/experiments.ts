// Lesson 05 (Food & Navigation) experiments. Every trial comes from the simulation:
//
//   plantId      food.ts judge(): the real plant behind each judgement (food plant or look-alike).
//   nutrition    survival/body.ts digestion: how long each meal kept feeding you (FieldLesson.onMeal).
//   dryingTest   food.ts spoilage: fresh and dried fish carried for the same time.
//   overharvest  food.ts patch stocks: how a patch picked with care, or stripped bare, grows back.
//   skyTest      environment.ts weather: what the sky looked like, then whether rain came (FieldLesson).
//   sunPath      environment.ts sun path: where the sun stood when you looked at it, morning and afternoon.

import type { Game } from '../../../game.js';
import type { ExperimentDef } from '../../../science/experiments.js';

const at = (id: string) => (g: Game) => g.focusIs(id) || g.lessons.completed.has(id);

export const PLANT_ID: ExperimentDef = {
  id: 'plantId',
  lesson: 'food',
  concept: 'toxicity',
  question: 'Can you trust a plant that looks like food?',
  why: 'A wrong guess about a wild plant can make you very ill.',
  predictions: [
    { id: 'looks', text: 'Yes: if it looks like a food plant, it is safe.' },
    { id: 'all', text: 'Only if every feature matches the field guide.' },
    { id: 'never', text: 'No wild plant is ever safe to eat.' },
  ],
  variable: {
    name: 'How well it matches the field guide',
    values: [
      { id: 'all', text: 'Every feature matches' },
      { id: 'most', text: 'Most match, some do not' },
    ],
  },
  outcomes: [
    { id: 'safe', text: 'safe food' },
    { id: 'sick', text: 'not food: it makes you ill' },
  ],
  howTo: 'Look closely at wild plants and judge each one against the field guide before you eat.',
  conclude: (t) => {
    const all = t.get('all');
    const most = t.get('most');
    if (!all || !most) return null;
    if (all === 'safe' && most === 'sick') return 'all';
    if (all === 'safe') return 'looks';
    return 'never';
  },
  principle: 'A look-alike can match a food plant in most features and still be poisonous. Only a match on every feature, checked together, identifies a plant.',
  apply: 'Foragers learn a few plants completely, check every feature and leave everything else. Many deadly plants have edible look-alikes.',
  limits: 'These plants are made up for the game. Never eat a real wild plant because of a game, a picture or one feature.',
  check: {
    question: 'A plant matches the guide in colour and leaves, but its smell is wrong. Is it food?',
    options: [
      { id: 'no', text: 'No: one wrong feature rules it out.', correct: true, why: 'The guide plant has every feature. One that differs means a different plant.' },
      { id: 'yes', text: 'Yes: most of it matches.', why: 'Look-alikes match most features; that is what makes them dangerous.' },
      { id: 'taste', text: 'Taste a little to find out.', why: 'Some poisons harm in small amounts. Never test by tasting.' },
    ],
  },
  opens: at('plantId'),
};

export const NUTRITION: ExperimentDef = {
  id: 'nutrition',
  lesson: 'food',
  concept: 'nutrition',
  question: 'Which food keeps you going longest?',
  why: 'Out here, food is fuel: what you eat decides how long you can keep working.',
  predictions: [
    { id: 'sugar', text: 'Sweet berries: sugar is the best fuel.' },
    { id: 'slow', text: 'Nuts and fish: fat and protein last longer.' },
    { id: 'same', text: 'All food lasts the same.' },
  ],
  variable: {
    name: 'What you eat',
    values: [
      { id: 'berries', text: 'Berries (mostly sugar)' },
      { id: 'nuts', text: 'Nuts (mostly fat)' },
      { id: 'fish', text: 'Fish (mostly protein)' },
    ],
  },
  outcomes: [
    { id: 'short', text: 'fed you only briefly' },
    { id: 'long', text: 'kept feeding you for minutes' },
  ],
  howTo: 'Eat berries, nuts and fish (one at a time) and watch how long each keeps your food bar topped up.',
  conclude: (t) => {
    const b = t.get('berries');
    const n = t.get('nuts');
    const f = t.get('fish');
    if (!b || !n || !f) return null;
    if (b === 'short' && n === 'long' && f === 'long') return 'slow';
    if (b === 'long' && n === 'short' && f === 'short') return 'sugar';
    return 'same';
  },
  principle: 'Sugar is taken up almost at once: quick energy, soon gone. Fat and protein digest slowly, so their energy keeps coming. Fat holds about twice the energy of sugar per gram, and protein is what muscle is repaired from.',
  apply: 'Hikers carry nuts and dried meat for long days, and save sweets for a quick boost.',
  limits: 'How long food lasts varies from person to person. Bodies need all three nutrients, plus water, vitamins and minerals.',
  check: {
    question: 'You face a long, cold walk. Which snack keeps you going longest?',
    options: [
      { id: 'nuts', text: 'A handful of nuts.', correct: true, why: 'Fat digests slowly and packs the most energy per bite.' },
      { id: 'berries', text: 'A handful of berries.', why: 'Berries are mostly sugar and water: quick, but soon used up.' },
      { id: 'water', text: 'Just water.', why: 'Water matters, but it holds no food energy at all.' },
    ],
  },
  opens: at('nutrition'),
};

export const DRYING_TEST: ExperimentDef = {
  id: 'dryingTest',
  lesson: 'food',
  concept: 'preservation',
  question: 'Does drying make food keep longer?',
  why: 'Food that spoils is food you worked for and lost.',
  predictions: [
    { id: 'dry', text: 'Dried food keeps longer: microbes need water.' },
    { id: 'fresh', text: 'Fresh food keeps longer: drying spoils it.' },
    { id: 'same', text: 'Both spoil just as fast.' },
  ],
  variable: {
    name: 'The food you carry',
    values: [
      { id: 'fresh', text: 'Fresh fish' },
      { id: 'dried', text: 'Dried fish' },
    ],
  },
  outcomes: [
    { id: 'off', text: 'going off' },
    { id: 'keeps', text: 'still good' },
  ],
  howTo: 'Dry a fish on a rack, then carry a dried fish and a fresh fish for the same time and compare.',
  conclude: (t) => {
    const fresh = t.get('fresh');
    const dried = t.get('dried');
    if (!fresh || !dried) return null;
    if (fresh === 'off' && dried === 'keeps') return 'dry';
    if (fresh === 'keeps' && dried === 'off') return 'fresh';
    return 'same';
  },
  principle: 'Microbes that rot food need water to grow. Drying takes the water out, so they can hardly grow; in wet, fresh flesh they multiply fast.',
  apply: 'Dried fruit, jerky, pasta and milk powder keep for months; a fridge slows microbes in another way, by cold.',
  limits: 'Rain or damp air stops drying, and dried food that gets wet spoils again. Spoiling here takes minutes, not days.',
  check: {
    question: 'Why does your rack stop drying the fish when it rains?',
    options: [
      { id: 'wet', text: 'Rain keeps the fish wet, and microbes grow in wet food.', correct: true, why: 'Drying works only while water leaves the food faster than it arrives.' },
      { id: 'cold', text: 'Rain is cold, and cold food rots.', why: 'Cold actually slows microbes. It is the water that matters.' },
      { id: 'light', text: 'Fish only dries in sunlight.', why: 'Moving dry air does most of the drying; the sun helps by warming it.' },
    ],
  },
  opens: at('dryingTest'),
};

export const OVERHARVEST: ExperimentDef = {
  id: 'overharvest',
  lesson: 'food',
  concept: 'ecology',
  question: 'What happens if you strip a patch bare?',
  why: 'Wild food near camp has to feed you for a long time.',
  predictions: [
    { id: 'less', text: 'A stripped patch grows back slower and thinner.' },
    { id: 'same', text: 'It grows back the same either way.' },
    { id: 'more', text: 'Picking everything makes it grow back faster.' },
  ],
  variable: {
    name: 'How you picked the patch',
    values: [
      { id: 'some', text: 'Picked some, left some' },
      { id: 'all', text: 'Stripped it bare' },
    ],
  },
  outcomes: [
    { id: 'full', text: 'grew back full' },
    { id: 'thin', text: 'came back slowly, and thin' },
  ],
  howTo: 'Pick part of one food patch and strip another bare, then come back later and see how each has regrown.',
  conclude: (t) => {
    const some = t.get('some');
    const all = t.get('all');
    if (!some || !all) return null;
    if (some === 'full' && all === 'thin') return 'less';
    if (some === 'thin' && all === 'full') return 'more';
    return 'same';
  },
  principle: 'What you leave keeps fruiting and spreading seed, so the patch recovers. Strip it and nothing is left to rebuild from: it comes back slowly and weaker.',
  apply: 'Fishing limits, picking rules and crop rotation all leave enough behind for next year.',
  limits: 'Real plants and animals recover at very different rates, and weather and grazing animals matter too.',
  check: {
    question: 'A full berry patch grows near camp. How do you pick it?',
    options: [
      { id: 'some', text: 'Take some and leave plenty to grow back.', correct: true, why: 'What you leave rebuilds the patch, so it keeps feeding you.' },
      { id: 'all', text: 'Take everything before animals do.', why: 'A stripped patch comes back slowly and thin.' },
      { id: 'none', text: 'Never pick wild food at all.', why: 'Careful picking is fine: the patch recovers if you leave enough.' },
    ],
  },
  opens: at('overharvest'),
};

export const SKY_TEST: ExperimentDef = {
  id: 'skyTest',
  lesson: 'food',
  concept: 'weather',
  question: 'Do dark, building clouds warn of rain?',
  why: 'Knowing rain is coming gives you time to get food, fuel and yourself under cover.',
  predictions: [
    { id: 'clouds', text: 'Yes: dark clouds piling up often come before rain.' },
    { id: 'none', text: 'No: the sky gives no warning.' },
    { id: 'clear', text: 'Rain usually comes out of a clear sky.' },
  ],
  variable: {
    name: 'The sky when you looked up',
    values: [
      { id: 'dark', text: 'Dark clouds building' },
      { id: 'clear', text: 'Clear, thin clouds' },
    ],
  },
  outcomes: [
    { id: 'rain', text: 'rain soon after' },
    { id: 'dry', text: 'stayed dry' },
  ],
  howTo: 'Look up at the open sky for a moment, once when it is clear and once when dark clouds are building, then watch.',
  conclude: (t) => {
    const dark = t.get('dark');
    const clear = t.get('clear');
    if (!dark || !clear) return null;
    if (dark === 'rain' && clear === 'dry') return 'clouds';
    if (dark === 'dry' && clear === 'rain') return 'clear';
    return 'none';
  },
  principle: 'Warm, moist air rises and cools, and its water vapour condenses into cloud. Clouds that keep thickening and darkening are holding more water, and often bring rain.',
  apply: 'Farmers, sailors and hikers watch the sky; weather forecasts measure the same rising, cooling air.',
  limits: 'A rule of thumb, not a forecast: dark clouds can pass without rain, and sayings like "red sky at night" hold only some of the time.',
  check: {
    question: 'The afternoon sky is darkening and clouds are piling up. What do you do?',
    options: [
      { id: 'cover', text: 'Get firewood and food under cover now.', correct: true, why: 'Building dark clouds often bring rain soon; dry fuel is hard to find after.' },
      { id: 'ignore', text: 'Nothing: you cannot tell anything from clouds.', why: 'Clouds give a useful warning, even if it is not certain.' },
      { id: 'wait', text: 'Wait until it rains, then act.', why: 'By then your fuel and food are already wet.' },
    ],
  },
  opens: at('skyTest'),
  testAction: {
    label: (g) => (g.env.brew === null && !g.env.isRaining() ? 'Watch the sky' : 'Keep watching'),
    run: (g) => (g.env.brewRain(g.time) ? 'The air feels heavy and still. Look up at the sky now and then.' : null),
  },
};

export const SUN_PATH: ExperimentDef = {
  id: 'sunPath',
  lesson: 'food',
  concept: 'navigation',
  question: 'Where does the sun rise and set?',
  why: 'Without a compass, the sun is a direction you can always find by day.',
  predictions: [
    { id: 'eastWest', text: 'It rises in the east and sets in the west.' },
    { id: 'westEast', text: 'It rises in the west and sets in the east.' },
    { id: 'still', text: 'It stays in the same part of the sky all day.' },
  ],
  variable: {
    name: 'Time of day',
    values: [
      { id: 'morning', text: 'Morning' },
      { id: 'afternoon', text: 'Afternoon' },
    ],
  },
  outcomes: [
    { id: 'east', text: 'in the east' },
    { id: 'south', text: 'in the south' },
    { id: 'west', text: 'in the west' },
  ],
  howTo: 'Turn to face the sun for a moment in the morning and again in the afternoon; your compass shows the direction.',
  conclude: (t) => {
    const m = t.get('morning');
    const a = t.get('afternoon');
    if (!m || !a) return null;
    if (m === 'east' && a === 'west') return 'eastWest';
    if (m === 'west' && a === 'east') return 'westEast';
    return 'still';
  },
  principle: 'The Earth turns from west to east, so the sun appears to rise in the east, cross the sky (through the south, here) and set in the west.',
  apply: 'With the time of day you can tell direction from the sun: east in the morning, west in the evening.',
  limits: 'Exactly where it rises shifts with the seasons, and at midday it is in the south only in the northern half of the world.',
  check: {
    question: 'It is early morning. You face the sun. Which way are you facing?',
    options: [
      { id: 'east', text: 'Roughly east.', correct: true, why: 'The sun rises in the east, so in the morning it is in the east.' },
      { id: 'west', text: 'Roughly west.', why: 'The sun sets in the west, in the evening, not the morning.' },
      { id: 'north', text: 'Roughly north.', why: 'Here the sun is never in the north; in the morning it is in the east.' },
    ],
  },
  opens: at('sunPath'),
  testAction: {
    label: (g) => (g.env.hour >= 6 && g.env.hour < 14 ? 'Rest until afternoon' : g.env.hour >= 17.5 || g.env.hour < 6 ? 'Rest until morning' : 'Keep testing'),
    run: (g) => {
      const h = g.env.hour;
      if (h >= 6 && h < 14) {
        g.env.skipTo(g.time, 14.5);
        return 'You rest in the shade. It is afternoon now: find the sun.';
      }
      if (h >= 17.5 || h < 6) {
        g.env.skipTo(g.time, 7.5);
        return 'You sleep until morning. Find the sun.';
      }
      return null;
    },
  },
};

export const FOOD_EXPERIMENTS: ExperimentDef[] = [PLANT_ID, NUTRITION, DRYING_TEST, OVERHARVEST, SKY_TEST, SUN_PATH];
