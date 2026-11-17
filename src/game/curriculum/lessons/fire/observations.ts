// Lesson 02 (Fire): Lab Notebook entries the fire's rules unlock (fire.ts, fuel-moisture.ts). Merged into
// OBSERVATIONS in observations.ts; each belongs to a concept in science/concepts.ts. Claims follow
// docs/SCIENCE.md: the fire's numbers are game-scale, the principles are standard physics and chemistry.

import type { Observation } from '../../../observations.js';

export const FIRE_LESSON_OBSERVATIONS: Record<string, Observation> = {
  f_speed: {
    group: 'fire',
    trigger: 'fire.drill.slow',
    title: 'Faster strokes, more heat',
    obs: 'Sawing slowly, the dust grew warm but never smoked, however long you kept at it.',
    pri: 'Friction turns motion into heat: the faster the spindle turns, the more heat each second. The dust also loses heat all the time, faster the hotter it is, so slow sawing levels off below the temperature where wood smoulders.',
    lim: 'Real bow drills also need suitable dry woods and a notch that gathers the hot dust.',
    why: 'Why does slow sawing never make an ember, even if you keep going?',
  },
  f_pressure: {
    group: 'fire',
    trigger: 'fire.drill.light',
    title: 'Press down to grind',
    obs: 'With a light touch the spindle spun fast, but it only polished the board shiny.',
    pri: 'Friction heat depends on how hard two surfaces press together as well as how fast they rub. With too little pressure the spindle glides over a glazed surface instead of grinding off hot dust.',
    lim: 'Too much pressure stalls the bow or makes the cord slip; fire-makers find a middle.',
    why: 'What does pressing down change about the rubbing?',
  },
  f_steam: {
    group: 'fire',
    trigger: 'fire.fuel.wet',
    title: 'Water first, then fire',
    obs: 'The damp fuel hissed and steamed on the fire, and smoked a long time before it caught.',
    pri: 'Water must be heated and boiled away before fuel can reach its ignition temperature. Boiling water soaks up a lot of heat, which cools the fire; the steam and half-burnt gases make thick smoke.',
    lim: 'Wood can look dry outside and still be wet inside. Splitting it shows the drier wood.',
    why: 'Where does the fire\'s heat go while damp fuel steams?',
  },
  f_dried: {
    group: 'fire',
    trigger: 'fire.fuel.dried',
    title: 'Drying fuel',
    obs: 'Fuel that got wet in the rain dried out again beside the fire or under your roof.',
    pri: 'Heat speeds up evaporation, and moving, dry air carries the water vapour away. A fire\'s warmth dries the fuel kept near it, ready for later.',
    lim: 'Fuel kept too close can catch fire itself. Keep it a safe step away from the flames.',
    why: 'Why does wet wood dry faster near a fire than out in the open?',
  },
  f_ladder: {
    group: 'fire',
    trigger: 'fire.fuel.ladder',
    title: 'The fire ladder',
    obs: 'A dry twig caught in seconds. A dry log took far longer, and only caught on a hot fire.',
    pri: 'Burning happens at the surface. A thin twig has a lot of surface for its mass, so it heats to its ignition temperature fast; a thick log soaks heat into its middle. Fires climb a ladder: tinder, kindling, then logs.',
    lim: 'Big logs burn longest once a bed of hot coals keeps them going.',
    why: 'Why do you add kindling before logs?',
  },
  f_wind: {
    group: 'fire',
    trigger: 'fire.air.wind',
    title: 'Wind feeds a fire',
    obs: 'In the wind your open fire roared and burned through its fuel faster.',
    pri: 'Wind brings fresh oxygen to the flames and carries the burnt gases away, so the fuel burns hotter and faster.',
    lim: 'Wind also carries sparks: windy days are when fires spread. Shelter a fire and keep it small.',
    why: 'Why did the fire use up its fuel faster in the wind?',
  },
  f_fanned: {
    group: 'fire',
    trigger: 'fire.air.fanned',
    title: 'Fanning makes it roar',
    obs: 'When you fanned the burning fire, the flames leapt up and glowed brighter.',
    pri: 'Burning is a reaction between fuel and oxygen. Fanning pushes more oxygen-rich air into the fire, so the reaction runs faster and gives off more heat.',
    lim: 'Fanning a weak ember too hard can scatter it or cool it.',
    why: 'Which side of the fire triangle did fanning add to?',
  },
  f_smother: {
    group: 'fire',
    trigger: 'fire.air.smothered',
    title: 'Smothered',
    obs: 'Earth scraped over the fire stopped the flames, and the coals went dark.',
    pri: 'Earth cuts off the oxygen side of the fire triangle. Without oxygen the burning stops, even though the fuel is still there and still hot. This is how a fire is put out safely.',
    lim: 'Buried coals can stay hot for hours. Stir and feel that they are cold before you leave.',
    why: 'The fuel was still there. Why did the fire go out?',
  },
};
