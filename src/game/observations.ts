// The Lab Notebook. Every entry follows the accuracy guardrail in
// docs/DESIGN.md: Observation → Principle → Real-world limit.
// Failures are discoveries too: most experiments have several entries.

export type ObservationGroup =
  | 'gather'
  | 'build'
  | 'fire'
  | 'pottery'
  | 'charcoal'
  | 'water';

export interface Observation {
  group: ObservationGroup;
  title: string;
  obs: string;
  pri: string;
  lim: string;
  /** XP for discovering it (default 15). */
  xp?: number;
}

export const OBSERVATION_GROUPS: Record<ObservationGroup, string> = {
  gather: 'Materials',
  build: 'Building',
  fire: 'Fire',
  pottery: 'Pottery',
  charcoal: 'Charcoal',
  water: 'Water',
};

export const OBSERVATIONS: Record<string, Observation> = {
  // ------------------------------------------------------------ materials
  g_dead: {
    group: 'gather',
    title: 'Dead wood snaps',
    obs: 'The grey, fallen wood snapped cleanly with a dry crack.',
    pri: 'As wood dies, the water in its cells evaporates. Dry wood is light, brittle and burns readily — less of the fire’s heat is wasted boiling water away.',
    lim: 'Wood lying on wet ground can rot and soak water up again — dead and dry are not the same thing.',
  },
  g_green: {
    group: 'gather',
    xp: 20,
    title: 'Green wood bends',
    obs: 'The sapling’s branch bent double instead of snapping — and sap beaded where it tore.',
    pri: 'Living wood is full of water held in its cells, which keeps its fibres flexible. That makes it poor fuel, but perfect for something that must bend without breaking — like a bow.',
    lim: 'Freshly cut wood can be roughly half water by weight.',
  },
  g_moss: {
    group: 'gather',
    title: 'Moss is a sponge',
    obs: 'Squeezed, the moss from the shaded rock dripped cold water.',
    pri: 'Mosses have no roots; they absorb and hold water across their leaves like a sponge. Great at staying damp — terrible as tinder.',
    lim: 'Some mosses, like sphagnum, can hold many times their own weight in water.',
  },
  g_clay: {
    group: 'gather',
    title: 'Clay is plastic',
    obs: 'The red earth by the stream squished, held your fingerprint and kept its shape.',
    pri: 'Clay is made of microscopic flat mineral plates. With water between them they slide (it’s plastic); dried, they stick; fired hot enough, they fuse into ceramic.',
    lim: '',
  },
  g_cord: {
    group: 'gather',
    xp: 20,
    title: 'Twist makes strength',
    obs: 'One fibre snapped with a tug. Three twisted together held your full pull.',
    pri: 'Twisting presses fibres against each other; friction locks them so a pull is shared along the whole cord instead of breaking the weakest strand.',
    lim: '',
  },
  g_bow: {
    group: 'gather',
    xp: 20,
    title: 'The bow drill is a machine',
    obs: 'With the cord looped around the spindle, each push of the bow spun it several turns.',
    pri: 'The bow turns a long back-and-forth arm stroke into fast rotation — a simple machine trading distance for speed. Faster spinning means more friction, and more heat.',
    lim: '',
  },
  g_hollow: {
    group: 'gather',
    title: 'Hollow is strong',
    obs: 'The hollow cane weighed almost nothing, yet barely flexed when you tried to bend it.',
    pri: 'When a rod bends, the material far from its centre does most of the work. A tube keeps its material at the edge, so it is nearly as stiff as a solid rod for far less weight — the same reason bones and bicycle frames are hollow.',
    lim: 'Thin-walled tubes can still buckle or crush if squeezed from the side.',
  },

  // ------------------------------------------------------------- building
  b_tripod: {
    group: 'build',
    xp: 20,
    title: 'Three legs never wobble',
    obs: 'On three stones the slab sat firm, even on bumpy ground.',
    pri: 'Any three points that aren’t in a line define exactly one plane, so a three-legged support always rests on all its feet. A fourth leg is one too many: on uneven ground one foot lifts and the table rocks.',
    lim: 'A tripod still tips over if the weight sits outside the triangle between its feet.',
  },
  b_wetstone: {
    group: 'build',
    title: 'Wet stones burst',
    obs: 'A stone from the stream bed cracked with a sharp pop once the fire took hold.',
    pri: 'Water trapped in a rock’s pores and cracks flashes to steam when heated. Steam takes up over a thousand times the volume of the water, and the pressure splits the stone.',
    lim: 'Porous and layered rocks are the main risk; dense rock is safer — but never heat stones straight from water.',
  },
  b_litter: {
    group: 'build',
    title: 'Clear the ground',
    obs: 'Sparks landed in the dry leaves around the pit, and they began to smoke.',
    pri: 'Dry leaf litter is fine fuel with lots of surface area, so a single spark can light it. Bare earth around a fire removes the fuel side of the fire triangle.',
    lim: 'Many wildfires start exactly like this. Clear a ring around any fire and never leave it unattended.',
  },

  // ----------------------------------------------------------------- fire
  f_drill: {
    group: 'fire',
    xp: 20,
    title: 'Friction makes heat',
    obs: 'Sawing the bow spun the spindle against the board. Dark dust gathered in the notch, smoked — and began to glow.',
    pri: 'Friction converts kinetic energy (motion) into thermal energy (heat). The fine wood dust heats up until it smoulders into an ember.',
    lim: 'Real bow drills take practice: the right dry woods, steady pressure and a well-cut notch.',
  },
  f_damp: {
    group: 'fire',
    title: 'Water steals heat',
    obs: 'The ember hissed in the damp moss and died in a puff of white steam.',
    pri: 'Water absorbs a lot of heat as it warms — and even more as it evaporates. While tinder is wet, it can’t reach its ignition temperature.',
    lim: 'Material that looks dry can still hold moisture. Fire-makers keep tinder in a dry pouch.',
  },
  f_oxygen: {
    group: 'fire',
    title: 'Fire breathes',
    obs: 'Left alone, the ember glowed, dimmed and went dark.',
    pri: 'Burning is rapid oxidation — fuel reacting with oxygen. Gentle airflow delivers fresh O₂ to the glowing ember.',
    lim: 'Blow too hard on a weak ember and you can cool it or scatter it.',
  },
  f_bigfuel: {
    group: 'fire',
    title: 'Surface area matters',
    obs: 'The tinder flared beneath the heavy logs — then the flame starved and died.',
    pri: 'Thin sticks have far more surface area for their mass, so they heat to ignition quickly. Thick fuel soaks up heat faster than a small flame can supply it.',
    lim: 'Big logs do burn — once a bed of hot coals and kindling is established.',
  },
  f_nofuel: {
    group: 'fire',
    title: 'Tinder is only the spark',
    obs: 'The flame blazed for a few seconds and burned out — nothing bigger caught.',
    pri: 'Tinder has little mass, so it releases its energy fast. A fire needs a ladder of fuel: tinder → kindling → larger fuel.',
    lim: '',
  },
  f_success: {
    group: 'fire',
    xp: 25,
    title: 'The fire triangle',
    obs: 'Ember, tinder, kindling and logs — with air — became a steady fire.',
    pri: 'Combustion needs three things at once: heat, fuel and oxygen. Remove any side of the triangle and the fire goes out — which is exactly how fire extinguishers work.',
    lim: 'Always clear the ground around a fire and never leave it unattended.',
  },
  f_charcoal: {
    group: 'fire',
    xp: 20,
    title: 'Charcoal burns hotter',
    obs: 'Charcoal on the fire glowed brighter and almost without smoke.',
    pri: 'Charcoal is mostly carbon: its water and volatile gases are already gone, so its energy becomes heat instead of smoke. That intense heat is the key to future metalworking.',
    lim: 'Burning charcoal releases carbon monoxide — deadly in enclosed spaces.',
  },

  // -------------------------------------------------------------- pottery
  p_temper: {
    group: 'pottery',
    title: 'Temper prevents cracking',
    obs: 'Made from clay alone, the pot cracked as it dried.',
    pri: 'Clay shrinks as its water leaves. If it shrinks unevenly, stress builds up until it cracks. Grit such as sand (called temper) opens paths for the water to escape and resists the shrinking.',
    lim: 'Too much temper makes the clay crumbly; potters tune the mix.',
  },
  p_dry: {
    group: 'pottery',
    title: 'Fire it dry',
    obs: 'The damp pot burst in the fire with a crack.',
    pri: 'Water still inside the clay turns to steam faster than it can escape, and the pressure blows the wall apart. Pots are dried slowly before they are fired.',
    lim: 'Real pots are often dried for days, and heated gently at first.',
  },
  p_ceramic: {
    group: 'pottery',
    xp: 25,
    title: 'Clay becomes ceramic',
    obs: 'After the fire, the pot rang when tapped and no longer softened in water.',
    pri: 'Above about 550 °C, the water bound inside the clay minerals leaves for good and the grains begin to fuse (sintering). The change can’t be undone: it is now ceramic.',
    lim: 'Open-fire pottery stays porous, unlike glazed, kiln-fired ware.',
  },

  // ------------------------------------------------------------- charcoal
  c_watertable: {
    group: 'charcoal',
    title: 'The water table',
    obs: 'The pit you dug near the stream slowly filled with seeping water.',
    pri: 'Below the surface, the soil is saturated with groundwater. Near a stream that saturated zone — the water table — sits close to the surface, so a hole fills from below.',
    lim: 'The water table rises after rain and falls in dry seasons.',
  },
  c_ash: {
    group: 'charcoal',
    title: 'Too much oxygen → ash',
    obs: 'With the vents open, flames roared out and the log burned away to grey ash.',
    pri: 'With plenty of oxygen, wood burns completely: its carbon leaves as CO₂ and its hydrogen as water vapour. Only the minerals remain, as ash.',
    lim: '',
  },
  c_early: {
    group: 'charcoal',
    title: 'Not finished yet',
    obs: 'Opened early, the log was black outside but brown and damp inside.',
    pri: 'Pyrolysis works from the outside in. White smoke is mostly water vapour; yellowish smoke carries volatile gases and tars still leaving the wood.',
    lim: '',
  },
  c_success: {
    group: 'charcoal',
    xp: 25,
    title: 'Pyrolysis',
    obs: 'Sealed from the air, the log smoked white, then yellow, then thin blue — and came out as light, black charcoal.',
    pri: 'Heat without enough oxygen breaks wood down instead of burning it. Water leaves first, then gases and tars, leaving mostly carbon. Same wood + less oxygen = a different product.',
    lim: 'Real charcoal burns take hours to days, and smoke colour is only a rule of thumb.',
  },

  // ---------------------------------------------------------------- water
  w_raw: {
    group: 'water',
    title: 'Life in a drop',
    obs: 'Under the lens, stream water swarms with particles and tiny moving organisms.',
    pri: 'Natural water carries sediment and microorganisms — bacteria, protozoa and viruses. Some of them cause disease.',
    lim: 'Seeing bacteria really needs a microscope; the lens is a game simplification.',
  },
  w_washout: {
    group: 'water',
    title: 'Layers need support',
    obs: 'Without cloth at the bottom, sand and grit washed straight into the pot.',
    pri: 'Each filter layer needs something beneath it that holds it in place. Cloth acts as the support screen.',
    lim: '',
  },
  w_clog: {
    group: 'water',
    title: 'Coarse before fine',
    obs: 'With fine sand on top, the filter clogged and the water barely trickled through.',
    pri: 'Water should meet coarse layers first. Gravel catches big debris, so the fine sand below can trap small particles without clogging straight away.',
    lim: 'Real sand filters still clog over time and need cleaning.',
  },
  w_odor: {
    group: 'water',
    title: 'Clear, but not clean',
    obs: 'The water looked clear, yet the lens still shows dissolved compounds tinting it.',
    pri: 'Sand only strains particles. Charcoal is extremely porous: its huge internal surface adsorbs (binds) some odour- and taste-causing compounds.',
    lim: 'Homemade charcoal is far weaker than activated charcoal — and neither reliably removes pathogens.',
  },
  w_microbes: {
    group: 'water',
    xp: 20,
    title: 'Clear ≠ safe',
    obs: 'The filtered water looked clean — but under the lens, microbes are still swimming.',
    pri: 'Many pathogens are far smaller than the gaps between sand grains. A filter reduces particles; it does not make water reliably safe.',
    lim: 'Never trust a homemade filter alone to make water safe to drink.',
  },
  w_boilmurky: {
    group: 'water',
    title: 'Boiled, but still dirty',
    obs: 'Boiling stopped the microbes — but every particle is still there.',
    pri: 'Heat inactivates microbes; it doesn’t remove sediment. Filtering first also helps, because particles can shield microbes from treatment.',
    lim: '',
  },
  w_boil: {
    group: 'water',
    xp: 25,
    title: 'Heat disinfects',
    obs: 'After a rolling boil, the microbes under the lens no longer move.',
    pri: 'A rolling boil denatures the proteins and structures many pathogens need to survive.',
    lim: 'Boil about 1 minute (3 at high altitude). Boiling does NOT remove chemicals like heavy metals — it can even concentrate them.',
  },
};

export const OBSERVATION_COUNT = Object.keys(OBSERVATIONS).length;
