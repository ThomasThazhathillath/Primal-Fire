// The Lab Notebook. Every entry follows the accuracy guardrail in
// docs/DESIGN.md: Observation → Principle → Real-world limit.
// Failures are discoveries too: most experiments have several entries.
// Every entry has a `trigger` (see science-events.ts) and a `why` prompt;
// curriculum notes and confidence flags live in docs/SCIENCE.md.

import type { ScienceEventId } from './science-events.js';

export type ObservationGroup =
  | 'gather'
  | 'build'
  | 'fire'
  | 'pottery'
  | 'charcoal'
  | 'water'
  | 'tools'
  | 'shelter'
  | 'hunt'
  | 'body'
  | 'nature';

export interface Observation {
  group: ObservationGroup;
  title: string;
  obs: string;
  pri: string;
  lim: string;
  /** XP for discovering it (default 15). */
  xp?: number;
  /** Science event (src/game/science-events.ts) that records this entry. */
  trigger?: ScienceEventId;
  /** A 'why did that work?' prompt shown after the entry; answer it in your head. */
  why?: string;
}

export const OBSERVATION_GROUPS: Record<ObservationGroup, string> = {
  gather: 'Materials',
  build: 'Building',
  fire: 'Fire',
  pottery: 'Pottery',
  charcoal: 'Charcoal',
  water: 'Water',
  tools: 'Tools',
  shelter: 'Shelter',
  hunt: 'Hunting',
  body: 'Your body',
  nature: 'Nature',
};

const BASE_OBSERVATIONS: Record<string, Observation> = {
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



/** Trigger events and 'why' prompts for the first-chapter entries above. */
const BASE_META: Record<string, { trigger: ScienceEventId; why: string }> = {
  g_dead: { trigger: 'gather.deadwood', why: 'Why does dead wood burn better than a living branch?' },
  g_green: { trigger: 'gather.greenwood', why: 'What makes a branch bend instead of snap?' },
  g_moss: { trigger: 'gather.moss', why: 'Would you want moss at the heart of a fire? Why not?' },
  g_clay: { trigger: 'gather.clay', why: 'What changes between wet clay and a fired pot?' },
  g_cord: { trigger: 'craft.cord', why: 'Where does the extra strength of a twisted cord come from?' },
  g_bow: { trigger: 'craft.bowdrill', why: 'Why must the bow bend without breaking?' },
  g_hollow: { trigger: 'gather.cane', why: 'Why is a tube stiffer than a solid rod of the same weight?' },
  b_tripod: { trigger: 'build.workbench.done', why: 'Why can three points always touch a flat surface, but four may not?' },
  b_wetstone: { trigger: 'build.firepit.wetstone', why: 'What happens to water trapped in a stone when it heats up?' },
  b_litter: { trigger: 'build.firepit.litter', why: 'What else near the fire could burn, and how far away should it be?' },
  f_drill: { trigger: 'fire.drill.ember', why: 'Where did the energy that made the dust glow come from?' },
  f_damp: { trigger: 'fire.ember.damp', why: 'Where did the ember’s heat go?' },
  f_oxygen: { trigger: 'fire.ember.unfed', why: 'Which side of the fire triangle was missing?' },
  f_bigfuel: { trigger: 'fire.fuel.toobig', why: 'Why does a thin splinter light more easily than a log?' },
  f_nofuel: { trigger: 'fire.fuel.none', why: 'What should come between tinder and logs?' },
  f_success: { trigger: 'fire.lit', why: 'Name the three things a fire needs. Which can you take away to put it out?' },
  f_charcoal: { trigger: 'fire.charcoal.burn', why: 'Why does charcoal burn with less smoke than wood?' },
  p_temper: { trigger: 'pottery.untempered.crack', why: 'What does the gritty temper do while clay shrinks?' },
  p_dry: { trigger: 'pottery.wet.burst', why: 'What does water do when it turns to steam inside a solid?' },
  p_ceramic: { trigger: 'pottery.fired', why: 'Can you turn a ceramic pot back into wet clay?' },
  c_watertable: { trigger: 'charcoal.pit.water', why: 'Why does water fill a hole dug close to a stream?' },
  c_ash: { trigger: 'charcoal.ash', why: 'What leaves the wood when it burns with plenty of air?' },
  c_early: { trigger: 'charcoal.early', why: 'What does the colour of the smoke tell you?' },
  c_success: { trigger: 'charcoal.done', why: 'Same wood, less air: what was different about the result?' },
  w_raw: { trigger: 'water.raw.inspected', why: 'Why can clear-looking water still be unsafe?' },
  w_washout: { trigger: 'water.filter.washout', why: 'What holds the sand in place at the bottom of a filter?' },
  w_clog: { trigger: 'water.filter.clog', why: 'Which layer should the water meet first, coarse or fine?' },
  w_odor: { trigger: 'water.filter.odour', why: 'What does charcoal remove that sand cannot?' },
  w_microbes: { trigger: 'water.filter.microbes', why: 'Why can microbes pass between sand grains?' },
  w_boilmurky: { trigger: 'water.boil.murky', why: 'Does boiling take dirt out of water?' },
  w_boil: { trigger: 'water.boil.done', why: 'Why does a rolling boil, not just hot water, matter?' },
};

/** Survival-chapter entries: tools, shelter, hunting, body, nature. */
const SURVIVAL_OBSERVATIONS: Record<string, Observation> = {
  // ------------------------------------------------- Level 3: food and farming
  fd_refraction: {
    group: 'hunt',
    trigger: 'food.fish.miss.refraction',
    xp: 20,
    title: 'The fish is not where it looks',
    obs: 'You thrust right at the fish, and the spear struck the streambed just beyond it.',
    pri: 'Light bends (refracts) as it leaves water for air. A fish looks shallower than it really is: looking straight down, it appears at about 3/4 of its real depth. A straight spear aimed at the image passes over the fish.',
    lim: 'The error grows the more slanted your view; looking more steeply down makes it smaller.',
    why: 'Which way should you aim: at the fish, above it, or below it?',
  },
  fd_catch: {
    group: 'hunt',
    trigger: 'food.fish.caught',
    title: 'Aim low, strike fast',
    obs: 'Aiming a little below and nearer than the fish appeared, the spear went home.',
    pri: 'Correcting for refraction puts the spear where the fish really is. Fish also sense pressure waves through their lateral line, so a slow approach gives them time to flee.',
    lim: '',
    why: 'Why did aiming at a point that looked wrong actually work?',
  },
  fd_opaque: {
    group: 'body',
    trigger: 'food.fish.opaque',
    title: 'Cooked fish turns opaque',
    obs: 'Over the fire the glassy flesh turned white and flaky.',
    pri: 'Heat makes proteins unfold and tangle together (denature). The tangled proteins scatter light, so the flesh turns opaque, and the same heat kills bacteria and parasites.',
    lim: 'Colour is only a guide. Food-safety agencies such as the US FDA advise cooking fish to about 63 °C inside.',
    why: 'Why does clear raw flesh turn white when it cooks?',
  },
  fd_raw: {
    group: 'body',
    trigger: 'food.raw.refused',
    title: 'Raw food carries risks',
    obs: 'You thought twice about biting into the raw fish.',
    pri: 'Raw fish and meat can carry parasites and bacteria. Thorough cooking kills them.',
    lim: 'Some raw fish is eaten safely after deep freezing, which kills parasites; that is not possible in the wild.',
    why: 'What does the fire do that makes food safer?',
  },
  fm_dig: {
    group: 'nature',
    trigger: 'farm.plot.dug',
    title: 'Loose soil for roots',
    obs: 'The digging stick broke the packed earth into dark, crumbly soil.',
    pri: 'Loosened soil holds air and lets water soak in, so roots can grow and breathe.',
    lim: '',
    why: 'Why is it easier for a root to grow in dug soil than in a trodden path?',
  },
  fm_water: {
    group: 'nature',
    trigger: 'farm.watered',
    title: 'Plants drink through roots',
    obs: 'After watering, the drooping leaves stood up again.',
    pri: 'Roots take up water, which carries dissolved nutrients and keeps the plant’s cells firm. Leaves use water, carbon dioxide and sunlight to make sugar (photosynthesis).',
    lim: 'Too much water drowns roots: they need oxygen from air in the soil too.',
    why: 'What three things does a leaf need to make food?',
  },
  fm_dry: {
    group: 'nature',
    trigger: 'farm.dry',
    title: 'Wilting',
    obs: 'Without water, the plant’s leaves went limp and growth stopped.',
    pri: 'Plant cells are held firm by water pressure inside them. When water runs short, they go slack and the plant wilts.',
    lim: '',
    why: 'Why does a thirsty plant droop?',
  },
  fm_shade: {
    group: 'nature',
    trigger: 'farm.shade',
    title: 'Light is food for plants',
    obs: 'The plant under the trees grew far slower than the one in the open.',
    pri: 'Photosynthesis is powered by light. In shade a plant makes less sugar, so it grows more slowly.',
    lim: 'Some forest plants are adapted to shade; most crops need full sun.',
    why: 'Where should you dig your next plot?',
  },
  fm_harvest: {
    group: 'nature',
    trigger: 'farm.harvested',
    xp: 25,
    title: 'Tubers store sunlight',
    obs: 'Under the leaves were fat tubers, more than you planted.',
    pri: 'Tubers are underground stores of starch the plant made from sunlight. Replanting a piece of tuber grows a new plant: vegetative propagation.',
    lim: 'Many wild tubers are toxic raw. Only eat plants you are sure of, and cook them.',
    why: 'Where did the energy stored in the tuber come from?',
  },

  // ---------------------------------------------------------------- tools
  t_flake: {
    group: 'tools',
    trigger: 'tool.knap.flake',
    title: 'Stone that chips like glass',
    obs: 'A sharp strike sent a thin flake off the dark, fine-grained stone. Its edge was sharper than anything you can make from wood.',
    pri: 'Fine-grained, glassy stones such as flint, chert and obsidian break with smooth, curved (conchoidal) surfaces, leaving very thin edges.',
    lim: 'Fresh edges are razor-sharp but brittle, and flakes can fly off in unexpected directions — real knappers wear eye protection.',
    why: 'Why does glass-like stone make a sharper edge than granite?',
  },
  t_crumble: {
    group: 'tools',
    trigger: 'tool.knap.fail',
    title: 'Not every rock will do',
    obs: 'The coarse, speckled stone crumbled into gritty pieces instead of flaking.',
    pri: 'Coarse-grained rocks are made of separate mineral crystals that break apart at their boundaries, so they do not give clean sharp edges.',
    lim: '',
    why: 'What would you look for in a stone before you hit it?',
  },
  t_pressure: {
    group: 'tools',
    trigger: 'tool.edge.cut',
    title: 'Thin edges cut',
    obs: 'The sharp flake sliced the cane. The blunt stone only squashed it.',
    pri: 'Pressure is force divided by area. The same push on a thinner edge gives much higher pressure, enough to part the material.',
    lim: 'A thin edge also dulls and chips faster.',
    why: 'If you push equally hard, which presses harder: a point or a flat face?',
  },
  t_lash: {
    group: 'tools',
    trigger: 'tool.lash.hold',
    title: 'Every wrap helps',
    obs: 'One loop of cord slipped. Several tight wraps held the head firmly.',
    pri: 'Each wrap adds friction between cord and wood, so more wraps let the cord hold a larger pull. Wetting some plant cords as you tie shrinks them tight when they dry.',
    lim: '',
    why: 'What would happen if the cord were slippery?',
  },
  t_axe: {
    group: 'tools',
    trigger: 'tool.axe.made',
    xp: 25,
    title: 'A longer handle swings faster',
    obs: 'The stone head on a handle bit into wood far deeper than the same stone held in your fist.',
    pri: 'A hand moving through a swing turns the head faster the farther it sits from your shoulder. A fast head carries more kinetic energy (½mv²) into a small, sharp area.',
    lim: 'Too long a handle is hard to control, and a stone head can crack on a poor hit.',
    why: 'Which gives more energy: doubling the head’s mass or doubling its speed?',
  },
  t_lever: {
    group: 'tools',
    trigger: 'tool.lever.used',
    title: 'A lever trades distance for force',
    obs: 'The heavy rock barely shifted by hand but rolled over when you pried with a long stick.',
    pri: 'A lever turns around a pivot. Effort × its distance from the pivot equals load × its distance. A longer effort arm means less force for the same load.',
    lim: 'You push through a longer distance to move the load a short way. Nothing is for free.',
    why: 'Where should you put the pivot to lift a heavy rock with the least effort?',
  },
  t_wedge: {
    group: 'tools',
    trigger: 'tool.wedge.split',
    title: 'Split along the grain',
    obs: 'The log split cleanly along its length, but fought you when you chopped across it.',
    pri: 'A wedge turns a forward push into sideways force. Wood fibres run lengthwise, and they separate more easily than they break.',
    lim: 'Knotty or twisted wood resists splitting and can send an axe glancing off.',
    why: 'Why is it easier to split a log than to chop it in half?',
  },
  t_harden: {
    group: 'tools',
    trigger: 'tool.point.hardened',
    title: 'Fire-hardened points',
    obs: 'After turning over embers, the wooden point felt harder and stiffer.',
    pri: 'Gentle heat drives water out of the wood, making it harder and stiffer. Good for digging sticks and spear points.',
    lim: 'Too much heat chars the wood and weakens it.',
    why: 'What did the fire take out of the wood?',
  },

  // -------------------------------------------------------------- shelter
  s_site: {
    group: 'shelter',
    trigger: 'shelter.site.chosen',
    title: 'Where you sleep matters',
    obs: 'The hollow was damp and cold. The slightly raised ground under the trees stayed drier.',
    pri: 'Cold air is denser and sinks into low spots, and water runs downhill. Dry, slightly raised ground is warmer and safer. Never sleep under dead branches.',
    lim: 'Nearness to water is useful, but too near brings flooding and insects.',
    why: 'Where would cold air and rainwater collect at night?',
  },
  s_roof: {
    group: 'shelter',
    trigger: 'shelter.roof.covered',
    title: 'A slope sheds rain',
    obs: 'Water ran off the steep layered cover but dripped through the flat part.',
    pri: 'A steep roof lets water drain away before it soaks in, and layers overlapped like roof tiles keep each drop moving downhill.',
    lim: '',
    why: 'Which way should leaf layers overlap so that rain runs off?',
  },
  s_bed: {
    group: 'shelter',
    trigger: 'shelter.bed.insulated',
    title: 'The ground steals warmth',
    obs: 'Lying on bare earth was far colder than lying on a thick pile of dry leaves.',
    pri: 'Heat flows from warm to cold by conduction. Dry debris traps pockets of still air, and still air is a poor conductor, so it slows heat loss to the ground.',
    lim: 'Wet leaves lose most of this effect.',
    why: 'Why does a thick, fluffy pile insulate better than a thin, packed one?',
  },
  s_wind: {
    group: 'shelter',
    trigger: 'shelter.wind.blocked',
    title: 'Wind makes cold feel colder',
    obs: 'Turned away from the wind, the shelter felt noticeably warmer at the same temperature.',
    pri: 'Moving air sweeps away the thin warm layer next to your skin, so you lose heat faster. Wind-chill is how cold it feels, not the real air temperature.',
    lim: '',
    why: 'Which way should the opening face?',
  },

  // ------------------------------------------------ chapter 2: the living camp
  c2_triangle: {
    group: 'shelter',
    trigger: 'shelter.frame.braced',
    title: 'Triangles do not fold',
    obs: 'Two posts and a ridge swayed when you pushed. Once the ribs leaned in and met the post, the frame stood firm.',
    pri: 'A triangle cannot change shape without changing the length of one of its sides, so a triangle of rigid poles holds a frame rigid. A four-sided frame can fold flat.',
    lim: 'Loose joints let even a triangle rack. The poles also have to be strong enough not to bend or snap.',
    why: 'Which shape keeps its form when you push on a corner?',
  },
  c2_tension: {
    group: 'shelter',
    trigger: 'shelter.lashing.tight',
    title: 'Cord pulls, poles push',
    obs: 'Loose cord let the poles slide apart; wrapped tight, the joint held.',
    pri: 'Poles carry compression (they are squeezed) while cord carries tension (it is pulled). A lashing turns a pole trying to slip into a cord being stretched, and a stretched cord resists strongly.',
    lim: 'Cord stretches, and wet cord of plant fibre loses strength and rots.',
    why: 'Which part of the joint is being pulled, and which is being pushed?',
  },
  c2_load: {
    group: 'shelter',
    trigger: 'shelter.load.shared',
    title: 'Share the load',
    obs: 'With a second cross-support, the ribs bent less when you pressed on the middle of the frame.',
    pri: 'A load spread over several members gives each one less to carry, so no single piece is pushed to its limit. Supports spaced along a span shorten the span that has to bear the load.',
    lim: 'Every extra piece adds weight and takes more material. Past a point it only wastes wood.',
    why: 'What happens to one pole when two share the same weight?',
  },
  c2_slope: {
    group: 'shelter',
    trigger: 'shelter.roof.sheds',
    title: 'A slope sheds rain',
    obs: 'Rain ran down the sloping roof and fell off the low edge instead of pooling.',
    pri: 'Gravity pulls water down the steepest path. On a slope each drop keeps moving before it can soak in; on a flat roof it lingers and finds every gap.',
    lim: 'Too steep a roof needs a taller frame and catches more wind.',
    why: 'Where does a drop go when the surface under it is tilted?',
  },
  c2_layers: {
    group: 'shelter',
    trigger: 'shelter.layers.sealed',
    title: 'Layers beat gaps',
    obs: 'One layer let drips through at the joins. Overlapping a second and third layer stopped them.',
    pri: 'Each natural layer has small gaps, but the gaps in different layers do not line up. Overlapped like tiles, they leave water no straight path, and each upper layer drains onto the next.',
    lim: 'Layers rot and flatten over weeks; the cover must be renewed.',
    why: 'Why do the gaps in one layer not matter once another lies on top?',
  },
  c2_drain: {
    group: 'shelter',
    trigger: 'shelter.drain.dug',
    title: 'Water takes the easy way',
    obs: 'Water ran across the ground toward the shelter floor until you cut a channel; then it flowed around.',
    pri: 'Flowing water follows the lowest, easiest path. A shallow channel cut across its way gives it a lower path, so it can be steered away from where you want to stay dry.',
    lim: 'A channel silts up and overflows in heavy rain unless it keeps sloping away.',
    why: 'Why does the water choose the channel over the floor?',
  },

  // -------------------------------------------------------------- hunting
  h_track: {
    group: 'hunt',
    trigger: 'hunt.track.found',
    title: 'Tracks tell a story',
    obs: 'Prints in the soft mud showed size, direction and how fresh they were.',
    pri: 'Animals leave evidence. Sharp edges and damp soil mean fresh tracks; blurred, dry edges mean old ones. Print size and spacing hint at the animal’s size and speed.',
    lim: '',
    why: 'How can you tell if a track is old or fresh?',
  },
  h_bow: {
    group: 'hunt',
    trigger: 'hunt.bow.drawn',
    title: 'A bent bow stores energy',
    obs: 'The farther you pulled the string, the harder it was to hold.',
    pri: 'Bending the limbs stores elastic potential energy. On release, that energy becomes the arrow’s kinetic energy.',
    lim: 'Some of the stored energy goes into moving the bow and string themselves. A longer draw stores more energy, up to what the wood can stand.',
    why: 'What do you give the bow that it gives back to the arrow?',
  },
  h_fletch: {
    group: 'hunt',
    trigger: 'hunt.fletch.made',
    title: 'Feathers keep it straight',
    obs: 'The arrow with feathers flew straight. The bare shaft tumbled.',
    pri: 'Feathers add air drag at the back, so the arrow’s tail trails behind its tip like the fins of a dart.',
    lim: '',
    why: 'Why must the drag be at the back, not the front?',
  },
  h_arc: {
    group: 'hunt',
    trigger: 'hunt.arrow.fly',
    title: 'Gravity pulls arrows down',
    obs: 'Your arrow fell short of the target at long range. Aiming a little high worked better.',
    pri: 'A flying arrow follows a curve (a parabola, in a vacuum) because gravity keeps pulling it down while it moves sideways. Air drag shortens the curve further.',
    lim: 'Wind also pushes arrows off course.',
    why: 'If you aim straight at a far target, where does the arrow land?',
  },
  h_hit: {
    group: 'hunt',
    trigger: 'hunt.arrow.hit',
    title: 'Moving targets',
    obs: 'You hit the animal only after leading it, aiming ahead of where it was.',
    pri: 'Arrows take time to arrive, and the target moves in that time, so you aim where it will be.',
    lim: '',
    why: 'How long does the arrow take, and how far does the animal go in that time?',
  },

  // --------------------------------------------------------------- nature
  n_chain: {
    group: 'nature',
    trigger: 'nature.foodchain.seen',
    title: 'Who eats whom',
    obs: 'The fox hunted the rabbit, and the rabbit ate the grass.',
    pri: 'Plants make food from sunlight. Herbivores eat plants and carnivores eat herbivores. Each step passes on only a fraction of the energy, which is why there are far fewer predators than prey.',
    lim: 'A common rule of thumb is that about a tenth of the energy passes up each step; real values vary.',
    why: 'Why are there fewer foxes than rabbits?',
  },
  n_eyes: {
    group: 'nature',
    trigger: 'nature.predator.near',
    title: 'Eyes tell you the job',
    obs: 'The deer saw you coming from the side. The wolf watched you with both eyes forward.',
    pri: 'Many prey animals have eyes on the sides of the head for a wide view that spots danger. Many predators have forward-facing eyes for depth perception to judge a pounce.',
    lim: 'This is a general trend, not a rule for every species.',
    why: 'What does each kind of eye placement help the animal do?',
  },

  // --------------------------------------------------------------- body
  y_thirst: {
    group: 'body',
    trigger: 'body.thirst.warning',
    title: 'Thirst comes late',
    obs: 'By the time your mouth felt dry, you were already running low.',
    pri: 'Your body is mostly water, which carries heat and nutrients and takes part in nearly every reaction in your cells. Thirst is a late signal that you are already losing too much.',
    lim: 'Needs vary with heat, effort and body size. There is no single number of litres for everyone.',
    why: 'Why drink before you feel very thirsty?',
  },
  y_drink: {
    group: 'body',
    trigger: 'body.drink',
    title: 'Safe water first',
    obs: 'You drank only after the water was filtered and boiled.',
    pri: 'Drinking untreated water risks diarrhoea, which makes dehydration worse, so unsafe water can cost you more than it gives.',
    lim: 'Boiling kills microbes but does not remove chemical pollution.',
    why: 'How could drinking the wrong water make thirst worse?',
  },
  y_eat: {
    group: 'body',
    trigger: 'body.eat',
    title: 'Food is stored energy',
    obs: 'After eating, your strength came back.',
    pri: 'Food energy is measured in calories. Your body burns it to move, stay warm and think; more work and colder weather mean more calories.',
    lim: 'Adults need on the order of a couple of thousand kilocalories a day. Exact needs vary a lot.',
    why: 'Why do you feel hungrier in the cold?',
  },
  y_cook: {
    group: 'body',
    trigger: 'food.cooked',
    title: 'Cooking is safer and gives more',
    obs: 'The meat tasted better and the sickness risk fell once it was cooked through.',
    pri: 'Heat kills many bacteria and parasites and breaks down tough proteins and starches, so food is safer and easier to digest.',
    lim: 'Undercooked centres can still carry microbes. Burnt food is not healthier.',
    why: 'What does heat do to the microbes in raw meat?',
  },
  y_carry: {
    group: 'body',
    trigger: 'body.carry.heavy',
    title: 'Lifting costs energy',
    obs: 'Carrying a heavy load uphill tired you out much faster.',
    pri: 'Raising a mass against gravity takes work (W = m × g × h). Heavier loads and steeper climbs cost more energy.',
    lim: 'Walking on the flat also costs energy, so this is only part of the story.',
    why: 'What two things made the climb more tiring?',
  },
  y_wet: {
    group: 'body',
    trigger: 'body.cold.wet',
    title: 'Wet is cold',
    obs: 'Wet and in the wind, you chilled fast, even though it wasn’t freezing.',
    pri: 'Water carries heat away from your body much faster than air does, and evaporation cools you further. Hypothermia can happen in cool, wet weather above freezing.',
    lim: '',
    why: 'Why does dry clothing keep you warmer than wet clothing?',
  },
  y_wound_clean: {
    group: 'body',
    trigger: 'body.wound.cleaned',
    title: 'Clean wounds heal',
    obs: 'The washed cut stayed clean. The dirty one grew red and sore.',
    pri: 'Dirt carries bacteria that can multiply in a wound. Washing with clean water flushes them out, which lowers the chance of infection.',
    lim: 'This is a game. Deep, dirty or bleeding wounds need real medical care.',
    why: 'What does washing remove from a wound?',
  },
  y_wound_dirty: {
    group: 'body',
    trigger: 'body.wound.dirty',
    title: 'Infection spreads',
    obs: 'The unwashed cut swelled, turned red and felt warm.',
    pri: 'Bacteria multiply in a wound. The body responds with inflammation (redness, heat and swelling) to fight them.',
    lim: 'Red streaks, fever or pus mean you need real medical help.',
    why: 'Why is a red, warm cut a warning sign?',
  },

  // -------------------------------------------------------------- weather
  x_sky: {
    group: 'nature',
    trigger: 'weather.sky.read',
    title: 'Reading the sky',
    obs: 'Towering dark clouds built up in the afternoon and rain followed.',
    pri: 'Warm, moist air rises, cools and its water vapour condenses into clouds. Tall, dark clouds mean strong rising air and often heavy rain.',
    lim: 'Old sayings like "red sky at night" are only rules of thumb, true only some of the time.',
    why: 'Why do rising clouds mean water is coming?',
  },
  x_rain: {
    group: 'nature',
    trigger: 'weather.rain.start',
    title: 'Rain puts out fires',
    obs: 'The first rain hissed on the fire and the unsheltered wood got soaked.',
    pri: 'Water absorbs heat as it warms and boils, cooling fuel below its ignition temperature. Keep dry fuel under cover before rain.',
    lim: '',
    why: 'What should you store under the shelter before the rain starts?',
  },
  x_night: {
    group: 'nature',
    trigger: 'weather.night.clear',
    title: 'Clear nights are colder',
    obs: 'On the clear night the temperature dropped far lower than on the cloudy one.',
    pri: 'The ground radiates heat out into space after sunset. Clouds send some heat back down like a blanket, so clear skies cool faster.',
    lim: '',
    why: 'Why would a cloudy night stay warmer?',
  },

  // ---------------------------------------------------------------- camp
  w_settle: {
    group: 'water',
    trigger: 'water.sediment.settle',
    title: 'Let it settle',
    obs: 'After standing quietly, the muddy water cleared from the top down.',
    pri: 'Gravity pulls heavier particles down. Larger grains settle fast and fine silt slowly, which is why waiting before filtering helps.',
    lim: 'Settling does not remove microbes or dissolved chemicals.',
    why: 'Why settle water before you filter it?',
  },
  w_hotstones: {
    group: 'water',
    trigger: 'fire.hotstones.boil',
    title: 'Stones carry heat',
    obs: 'Hot stones dropped into the pot made the water boil without putting the pot on the fire.',
    pri: 'Heat moves from hot stones into the cooler water by conduction until they match. Stones hold a lot of heat for their size.',
    lim: 'Never use wet river stones from the stream. Trapped water can turn to steam and make them burst.',
    why: 'Why is a dry stone safer than a wet one?',
  },
  f_smoke: {
    group: 'fire',
    trigger: 'fire.signal.smoke',
    title: 'Green leaves make white smoke',
    obs: 'Adding green leaves to the fire sent up a thick, pale column of smoke.',
    pri: 'Damp fuel makes steam and unburned particles. The thick, pale smoke is easy to see against dark trees.',
    lim: 'It also smells and stings your eyes, and a signal fire can spread. Keep it small and watched.',
    why: 'Why is thick white smoke easier to see than clear heat?',
  },
  f_night: {
    group: 'fire',
    trigger: 'fire.night.kept',
    title: 'A fire is a chore',
    obs: 'Through the night the fire needed fuel and attention several times.',
    pri: 'Fire keeps burning only while it has fuel, air and heat. Large, dense logs burn slowly and keep going far longer than twigs.',
    lim: '',
    why: 'Which fuel would last the night, twigs or thick logs?',
  },
};

export const OBSERVATIONS: Record<string, Observation> = {};
for (const [id, o] of Object.entries(BASE_OBSERVATIONS)) {
  OBSERVATIONS[id] = { ...o, ...BASE_META[id] };
}
Object.assign(OBSERVATIONS, SURVIVAL_OBSERVATIONS);

export const OBSERVATION_COUNT = Object.keys(OBSERVATIONS).length;

/** Observations recorded when a science event fires. */
export function observationsForEvent(event: string): string[] {
  return Object.entries(OBSERVATIONS)
    .filter(([, o]) => o.trigger === event)
    .map(([id]) => id);
}
