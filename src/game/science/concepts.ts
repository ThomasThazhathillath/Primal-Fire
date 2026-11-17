// Science concepts: the ideas each lesson teaches, and the Lab Notebook entries that show them.
//
// A concept is discovered as soon as the player records any of its entries (observations.ts). The new
// Lab Notebook is organised lesson -> concept -> entries, shows undiscovered concepts with a clue instead
// of a blank, and gives each concept one real-world application. Every notebook entry belongs to exactly
// one concept (tests/concepts.test.ts). Claims follow docs/SCIENCE.md: rule-of-thumb ideas say so.

import type { LessonId } from '../curriculum/types.js';

export interface Concept {
  id: string;
  lesson: LessonId;
  name: string;
  /** The principle in one plain sentence. */
  idea: string;
  /** Where the same science shows up in everyday life. */
  apply: string;
  /** A clue shown while the concept is undiscovered: what to try, never the answer. */
  discover: string;
  /** Lab Notebook entries (observations.ts ids) that show this concept. */
  entries: string[];
}

export const CONCEPTS: Concept[] = [
  // ------------------------------------------------------------ Lesson 01: Shelter
  {
    id: 'heat_conduction',
    lesson: 'shelter',
    name: 'Conduction',
    idea: 'Heat flows from a warm thing into a colder thing it touches; still air is a poor conductor.',
    apply: 'Camping mats, wool and a layer of dry leaves under a sleeping bag stop the cold ground drawing heat out of you.',
    discover: 'Rest in your shelter with and without a bed under you.',
    entries: ['s_bed', 'l_bed'],
  },
  {
    id: 'heat_convection',
    lesson: 'shelter',
    name: 'Convection and wind',
    idea: 'Moving air carries body heat away much faster than still air, so wind makes cold feel colder.',
    apply: 'Windbreaks and wind-proof jackets cut heat loss; it is why a breezy day feels colder than a still one.',
    discover: 'Notice how it feels behind a wall that blocks the wind.',
    entries: ['s_wind'],
  },
  {
    id: 'heat_radiation',
    lesson: 'shelter',
    name: 'Radiation',
    idea: 'Warm things give off heat as invisible light; on clear nights the ground radiates its heat to the sky.',
    apply: 'Clouds act like a blanket at night, so frost forms first on clear nights and in open ground.',
    discover: 'Compare a cloudy night with a clear one.',
    entries: ['x_night'],
  },
  {
    id: 'wet_cold',
    lesson: 'shelter',
    name: 'Water and heat loss',
    idea: 'Water conducts heat more than twenty times better than air, and evaporating water cools you.',
    apply: 'Wet clothes chill you fast; staying dry matters more than adding layers.',
    discover: 'Get caught in the rain away from your roof.',
    entries: ['y_wet'],
  },
  {
    id: 'weather',
    lesson: 'shelter',
    name: 'Reading the weather',
    idea: 'Rising moist air cools and its water condenses into clouds; thick, darkening clouds often bring rain.',
    apply: 'Farmers and sailors read the sky; a rule of thumb, not a forecast.',
    discover: 'Watch the sky change before the rain comes.',
    entries: ['x_sky', 'x_rain'],
  },
  {
    id: 'drainage',
    lesson: 'shelter',
    name: 'Slope and drainage',
    idea: 'Water always runs downhill by the easiest path: slopes, overlapping layers and channels guide it away.',
    apply: 'Pitched, tiled roofs, gutters and drains give rain an easier way than through your walls.',
    discover: 'Choose where to build, roof it and wait for rain.',
    entries: ['s_site', 's_roof', 'c2_slope', 'c2_layers', 'c2_drain'],
  },
  {
    id: 'structures',
    lesson: 'shelter',
    name: 'Triangles, tension and load',
    idea: 'A triangle cannot change shape without a side changing length; poles take the push, cord takes the pull.',
    apply: 'Bridges, cranes, roof trusses and camera tripods are built from triangles.',
    discover: 'Build a frame and push on it.',
    entries: ['b_tripod', 'c2_triangle', 'c2_tension', 'c2_load', 'g_hollow'],
  },
  {
    id: 'plant_materials',
    lesson: 'shelter',
    name: 'Living and dead wood',
    idea: 'Dead wood is dry and brittle; living wood is full of water and its fibres bend without breaking.',
    apply: 'Timber is dried before building; fresh, flexible wood is used for bows and baskets.',
    discover: 'Pick up dead sticks and living branches.',
    entries: ['g_dead', 'g_green'],
  },
  // ------------------------------------------------------------ Lesson 02: Fire
  {
    id: 'friction_heat',
    lesson: 'fire',
    name: 'Friction makes heat',
    idea: 'Rubbing surfaces together turns motion into heat; fast, steady friction can heat wood dust until it glows.',
    apply: 'Rubbing your hands warms them, and a car’s brakes turn its motion into heat.',
    discover: 'Make and use a bow drill.',
    entries: ['f_drill', 'g_bow'],
  },
  {
    id: 'fire_triangle',
    lesson: 'fire',
    name: 'The fire triangle',
    idea: 'Fire needs fuel, heat and oxygen at once; take any one away and it goes out.',
    apply: 'Extinguishers cool, smother or starve a fire: each removes one side of the triangle.',
    discover: 'Light a fire, then try it without enough air or fuel.',
    entries: ['f_success', 'f_oxygen', 'f_nofuel'],
  },
  {
    id: 'fuel',
    lesson: 'fire',
    name: 'Fuel size and moisture',
    idea: 'Thin, dry fuel heats to ignition fastest; water in fuel must boil away first and soaks up the heat.',
    apply: 'Firewood is split and seasoned (dried) before burning; damp wood smokes and barely burns.',
    discover: 'Try damp moss and dry grass, small twigs and big logs.',
    entries: ['f_bigfuel', 'f_damp', 'g_moss', 'f_smoke', 'l_woodrain'],
  },
  {
    id: 'pyrolysis',
    lesson: 'fire',
    name: 'Pyrolysis: wood to charcoal',
    idea: 'Heated with little oxygen, wood loses its water and gases instead of burning, leaving mostly carbon.',
    apply: 'Barbecue charcoal is made this way; early metalworkers needed its hotter, cleaner heat.',
    discover: 'Heat wood under earth, with the vents open and with them sealed.',
    entries: ['c_ash', 'c_early', 'c_success', 'f_charcoal', 'c_watertable'],
  },
  {
    id: 'fire_safety',
    lesson: 'fire',
    name: 'Fire safety',
    idea: 'Heat spreads to anything flammable nearby, and water trapped in stone can turn to steam and crack it.',
    apply: 'Fire rings, cleared ground and never leaving a fire unattended prevent wildfires.',
    discover: 'Build a fire pit and keep a fire through the night.',
    entries: ['b_litter', 'b_wetstone', 'f_night'],
  },
  // ------------------------------------------------------------ Lesson 03: Water
  {
    id: 'microbes',
    lesson: 'water',
    name: 'Clear is not safe',
    idea: 'Water can look clear and still carry bacteria and parasites far too small to see.',
    apply: 'Drinking water is tested for germs, not just looked at.',
    discover: 'Look closely at stream water and at filtered water.',
    entries: ['w_raw', 'w_microbes'],
  },
  {
    id: 'filtration',
    lesson: 'water',
    name: 'Settling and filtering',
    idea: 'Gravity settles heavy particles; layers from coarse to fine strain out the rest, held up by a support.',
    apply: 'Water works let mud settle and pass water through sand beds before they disinfect it.',
    discover: 'Build a filter and pour water through it.',
    entries: ['w_washout', 'w_clog', 'w_settle'],
  },
  {
    id: 'adsorption',
    lesson: 'water',
    name: 'Adsorption',
    idea: 'Charcoal has a huge surface where some taste and smell molecules stick, but it does not remove germs.',
    apply: 'Jug filters use carbon for taste and smell, not to make unsafe water safe.',
    discover: 'Put your charcoal in the filter.',
    entries: ['w_odor'],
  },
  {
    id: 'disinfection',
    lesson: 'water',
    name: 'Boiling disinfects',
    idea: 'A rolling boil kills or inactivates most germs; it does not remove mud or dissolved chemicals.',
    apply: 'Boiling for a minute is a standard emergency treatment; filter first, then boil.',
    discover: 'Boil water: muddy water, and water you filtered.',
    entries: ['w_boil', 'w_boilmurky', 'w_hotstones'],
  },
  {
    id: 'ceramics',
    lesson: 'water',
    name: 'Clay becomes ceramic',
    idea: 'Wet clay is soft and plastic; dried, then fired hot, its particles fuse into hard ceramic.',
    apply: 'Bricks, tiles and mugs are fired clay; potters add grit (temper) so pots do not crack.',
    discover: 'Shape a pot, let it dry and fire it.',
    entries: ['g_clay', 'p_temper', 'p_dry', 'p_ceramic'],
  },
  {
    id: 'hydration',
    lesson: 'water',
    name: 'Hydration',
    idea: 'Your body needs water all the time; thirst is a late signal.',
    apply: 'Drink regularly in heat and hard work, before you feel thirsty.',
    discover: 'Notice what happens when you go a long time without drinking.',
    entries: ['y_thirst', 'y_drink'],
  },
  // ------------------------------------------------------------ Lesson 04: Tools
  {
    id: 'fracture',
    lesson: 'tools',
    name: 'How stone breaks',
    idea: 'Fine-grained, glassy stone breaks in smooth curves with sharp edges; coarse stone crumbles.',
    apply: 'Broken glass is sharp for the same reason.',
    discover: 'Strike different stones with a hammerstone.',
    entries: ['t_flake', 't_crumble'],
  },
  {
    id: 'pressure',
    lesson: 'tools',
    name: 'Pressure',
    idea: 'Pressure is force divided by area: the same push on a thin edge cuts.',
    apply: 'Knives, needles and nails all concentrate force on a tiny area.',
    discover: 'Cut something soft with a sharp flake.',
    entries: ['t_pressure'],
  },
  {
    id: 'levers',
    lesson: 'tools',
    name: 'Levers',
    idea: 'A lever trades distance for force: effort times its arm equals load times its arm.',
    apply: 'Crowbars, scissors, wheelbarrows and oars are levers.',
    discover: 'Make an axe; use a long pole on a heavy rock.',
    entries: ['t_lever', 't_axe', 't_pivot'],
  },
  {
    id: 'wedges_grain',
    lesson: 'tools',
    name: 'Wedges and wood grain',
    idea: 'A wedge turns a downward blow into a sideways push, and wood splits easily along its grain.',
    apply: 'Axes, chisels and doorstops are wedges.',
    discover: 'Split a log with your axe.',
    entries: ['t_wedge', 't_harden'],
  },
  {
    id: 'cordage',
    lesson: 'tools',
    name: 'Twisted fibres',
    idea: 'Twisting presses fibres together so friction makes them act as one strong strand.',
    apply: 'Rope and yarn are twisted fibres; every wrap of a lashing shares the load.',
    discover: 'Twist fibres into cord and lash a joint.',
    entries: ['g_cord', 't_lash'],
  },
  {
    id: 'tension',
    lesson: 'tools',
    name: 'Tensile strength',
    idea: 'How hard a strand can be pulled before it breaks; twisted fibres share the pull, loose ones snap one by one.',
    apply: 'Ropes, climbing lines and bridge cables are rated by the pull they hold.',
    discover: 'Lift the test stone at the Tool Yard with loose fibres, then with cord.',
    entries: ['t_strand', 't_twist'],
  },
  {
    id: 'bracing',
    lesson: 'tools',
    name: 'Bracing a frame',
    idea: 'A square frame with hinge-like joints folds under a sideways push; a diagonal brace makes triangles that hold.',
    apply: 'Gates, scaffolds and shelves have a diagonal brace so they do not lean over.',
    discover: 'Build a square stick frame at the Tool Yard and push it, then brace it.',
    entries: ['b_rack', 'b_triangle'],
  },
  {
    id: 'materials',
    lesson: 'tools',
    name: 'Choosing materials',
    idea: 'Every material is picked for one property: hardness, toughness, stiffness or strength in tension.',
    apply: 'A steel axe head, a wooden handle and a nylon rope are chosen the same way today.',
    discover: 'Haft a knife, an axe and a hammer.',
    entries: ['t_kit'],
  },
  {
    id: 'stored_energy',
    lesson: 'tools',
    name: 'Stored energy',
    idea: 'A bent bow stores elastic energy and releases it as motion.',
    apply: 'Springs, catapults and trampolines store and release energy the same way.',
    discover: 'Make a bow and draw it back.',
    entries: ['h_bow'],
  },
  {
    id: 'projectiles',
    lesson: 'tools',
    name: 'Flight',
    idea: 'A thrown object keeps moving forward while gravity pulls it down, so it flies in a curve.',
    apply: 'Every ball, arrow and water jet follows the same curved path.',
    discover: 'Shoot arrows at different angles.',
    entries: ['h_arc', 'h_hit', 'h_fletch'],
  },
  {
    id: 'biomechanics',
    lesson: 'tools',
    name: 'Work against gravity',
    idea: 'Lifting something takes energy in proportion to its weight and how high you lift it.',
    apply: 'Carry loads close to your body and lift with your legs.',
    discover: 'Carry a heavy load for a while.',
    entries: ['y_carry'],
  },
  // ------------------------------------------------------------ Lesson 05: Food & Navigation
  {
    id: 'nutrition',
    lesson: 'food',
    name: 'Food is energy',
    idea: 'Food stores energy (calories) as carbohydrate, fat and protein; your body burns it to move and keep warm.',
    apply: 'Food labels list energy in kcal and the nutrients that supply it.',
    discover: 'Eat something you gathered or caught.',
    entries: ['y_eat'],
  },
  {
    id: 'cooking',
    lesson: 'food',
    name: 'Cooking and food safety',
    idea: 'Heat changes proteins (flesh turns opaque) and kills most bacteria and parasites.',
    apply: 'Food safety guides give safe cooking temperatures for meat and fish.',
    discover: 'Clean and cook a fish.',
    entries: ['y_cook', 'fd_opaque', 'fd_raw', 'l_clean'],
  },
  {
    id: 'refraction',
    lesson: 'food',
    name: 'Refraction',
    idea: 'Light bends where it leaves water, so things under water look shallower than they are.',
    apply: 'A straw in a glass looks bent, and pools are deeper than they look.',
    discover: 'Try to spear a fish.',
    entries: ['fd_refraction', 'fd_catch'],
  },
  {
    id: 'plants',
    lesson: 'food',
    name: 'How plants grow',
    idea: 'Plants make food from light, water and air (photosynthesis) and store it, for example as starch in tubers.',
    apply: 'Gardeners loosen soil, water roots and give plants sun; a potato can grow a new plant.',
    discover: 'Plant seeds and look after them.',
    entries: ['fm_dig', 'fm_water', 'fm_dry', 'fm_shade', 'fm_harvest', 'l_sprout', 'l_seeds'],
  },
  {
    id: 'toxicity',
    lesson: 'food',
    name: 'Poisonous look-alikes',
    idea: 'Some poisonous plants look like edible ones: only eat what you can identify for certain.',
    apply: 'Foragers learn a few plants thoroughly and leave everything else alone.',
    discover: 'Look very closely at wild berries and roots before picking.',
    entries: ['l_lookalike'],
  },
  {
    id: 'preservation',
    lesson: 'food',
    name: 'Drying preserves food',
    idea: 'Microbes need water to grow, so drying food slows spoiling.',
    apply: 'Dried fruit, jerky and pasta keep for months.',
    discover: 'Hang food on a drying rack.',
    entries: ['l_dry'],
  },
  {
    id: 'ecology',
    lesson: 'food',
    name: 'Food chains and behaviour',
    idea: 'Plants feed plant-eaters, which feed predators; animals keep daily rhythms and flee what seems dangerous.',
    apply: 'Wildlife watchers move slowly and quietly; removing one species affects the others.',
    discover: 'Watch the animals around you, quietly.',
    entries: ['n_chain', 'n_eyes', 'l_mist', 'l_dusk', 'l_alert', 'l_quiet'],
  },
  {
    id: 'tracking',
    lesson: 'food',
    name: 'Reading tracks',
    idea: 'Prints show who passed and roughly when: fresh edges are sharp, old ones blurred by weather.',
    apply: 'Rangers and biologists read tracks to count animals they rarely see.',
    discover: 'Find tracks near water and follow them.',
    entries: ['h_track', 'l_age'],
  },
  {
    id: 'wound_care',
    lesson: 'food',
    name: 'Keeping wounds clean',
    idea: 'Dirt carries bacteria; washing a cut lowers the chance of infection. (Game knowledge, not medical advice.)',
    apply: 'Clean small cuts with clean water and cover them; get medical help for deep or infected wounds.',
    discover: 'Look after a cut.',
    entries: ['y_wound_clean', 'y_wound_dirty'],
  },
];

const BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]));
export const conceptById = (id: string): Concept | undefined => BY_ID.get(id);

const OF_ENTRY = new Map<string, Concept>(CONCEPTS.flatMap((c) => c.entries.map((e) => [e, c] as const)));
/** The concept a notebook entry belongs to. */
export const conceptOfEntry = (entryId: string): Concept | undefined => OF_ENTRY.get(entryId);

/** The concepts a lesson teaches, in order. */
export const conceptsOf = (lesson: LessonId): Concept[] => CONCEPTS.filter((c) => c.lesson === lesson);

/** Has the player discovered this concept (recorded any of its entries)? */
export function discovered(c: Concept, notebook: readonly string[] | ReadonlySet<string>): boolean {
  const has = (id: string) => (notebook instanceof Set ? notebook.has(id) : (notebook as readonly string[]).includes(id));
  return c.entries.some(has);
}
