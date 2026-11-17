# Primal Fire: science curriculum

Every mechanic should teach one true idea. This page maps mechanics to the science
behind them, how the game shows it, and where it is simplified.

**Confidence.** ✅ = well-established textbook science. 🟡 = true as a rule of thumb or
general trend; the notebook entry says so. ⚠️ = number or claim we are not sure of, so the
game avoids stating it (see "Uncertain claims" at the end).

**How the game teaches it.** Each notebook entry in `src/game/observations.ts` has a
*trigger* event (list in `src/game/science-events.ts`), the three-part text
(Observation → Principle → Real-world limit) and a *why did that work?* prompt. Systems
emit events with `game.science('<event id>')`; the entry is recorded once and unlocks XP.
Quests (`src/game/quests.ts`) wait on events and give recaps when they finish.

## Curriculum map

| Topic | Mechanic | Core idea | Events | Entries | Conf. |
|---|---|---|---|---|---|
| Fire triangle | Fire pit, fire lay | Fuel + heat + oxygen; remove one and fire stops | `fire.lit`, `fire.ember.unfed` | `f_success`, `f_oxygen` | ✅ |
| Tinder, kindling, fuel | Fire lay, gathering | Small, dry pieces have more surface area per mass and reach ignition temperature fastest | `fire.fuel.toobig`, `fire.fuel.none` | `f_bigfuel`, `f_nofuel` | ✅ |
| Moisture | Damp moss, wet wood | Water must boil away first and absorbs heat | `fire.ember.damp`, `gather.deadwood` | `f_damp`, `g_dead`, `g_moss` | ✅ |
| Friction and ignition | Bow drill | Friction turns kinetic energy into heat; dust glows when hot enough | `fire.drill.ember` | `f_drill` | ✅ |
| Bow drill assembly | Spindle, board, bow | Bow bends without breaking because living wood has flexible fibres | `craft.bowdrill`, `gather.greenwood` | `g_bow`, `g_green` | ✅ |
| Cordage | Cord from fibres | Twisting makes fibres press and grip by friction | `craft.cord`, `tool.lash.hold` | `g_cord`, `t_lash` | ✅ |
| Tripod stability | Workbench | Three points always define a plane | `build.workbench.done` | `b_tripod` | ✅ |
| Thermal shock | Wet stones in fire | Trapped water turns to steam and can burst stone | `build.firepit.wetstone`, `fire.hotstones.boil` | `b_wetstone`, `w_hotstones` | ✅ |
| Stone fracture | Knapping | Fine-grained glassy stones fracture conchoidally; coarse ones crumble | `tool.knap.flake`, `tool.knap.fail` | `t_flake`, `t_crumble` | ✅ |
| Pressure | Cutting | Pressure = force / area | `tool.edge.cut` | `t_pressure` | ✅ |
| Simple machines | Lever, wedge, axe | Lever: effort × arm = load × arm. Wedge turns push into sideways force. Longer handle gives a faster head | `tool.lever.used`, `tool.wedge.split`, `tool.axe.made` | `t_lever`, `t_wedge`, `t_axe` | ✅ |
| Wood structure | Splitting, hardening | Fibres run along the grain. Drying makes wood harder | `tool.wedge.split`, `tool.point.hardened` | `t_wedge`, `t_harden` | ✅ |
| Elasticity and stored energy | Bow | Bent limbs store elastic potential energy released as kinetic energy | `hunt.bow.drawn` | `h_bow` | ✅ |
| Projectile motion | Arrows | Constant horizontal motion plus gravity gives a curved path; drag shortens it | `hunt.arrow.fly`, `hunt.arrow.hit` | `h_arc`, `h_hit` | ✅ |
| Stability in flight | Fletching | Drag at the tail keeps the tip pointing forward | `hunt.fletch.made` | `h_fletch` | ✅ |
| Sedimentation | Settling water (a full pot left still) | Gravity pulls particles down; fine silt takes longer; germs do not settle out reliably | `water.sediment.settle` | `w_settle` | ✅ |
| Filtration | Layered filter, any order (Lesson 03 experiment) | Coarse first, fine below, cloth support; charcoal adsorbs some smell and taste compounds; germs pass through | `water.filter.*` | `w_washout`, `w_clog`, `w_odor`, `w_microbes` | ✅ (clog and washout are simplified to certain outcomes) |
| Water cycle | Rain caught off the roof vs stream water | Evaporation leaves mud and salt behind; rain picks up dust and roof dirt; runoff gathers soil and germs | `water.rain.caught` | `w_cycle` | ✅ / 🟡 (roof runoff "much clearer" is a rule of thumb) |
| Disinfection | Boiling | Boiling kills most pathogens but does not remove chemicals | `water.boil.*` | `w_boilmurky`, `w_boil` | ✅ |
| Pyrolysis | Charcoal mound | Heating wood with limited oxygen leaves carbon | `charcoal.*` | `c_ash`, `c_early`, `c_success` | ✅ |
| Clay and ceramics | Pottery, clay test cups (Lesson 03 experiments) | Clay is plastic when wet; grit prevents cracks; steam bursts damp pots; firing fuses minerals; unfired clay can be slaked back into clay | `pottery.*` | `p_temper`, `p_dry`, `p_ceramic`, `p_reclaim` | ✅ (the drying-strain curve is a teaching model, not measured data) |
| Hydration | Water need (survival/body.ts), drinking at the stream or from the pot | Water is essential; thirst is a late signal; untreated water can carry germs | `body.thirst.warning`, `body.drink` | `y_thirst`, `y_drink` | ✅ |
| Energy and nutrition | Hunger, cooking | Calories are energy; cooking kills microbes and aids digestion | `body.eat`, `food.cooked` | `y_eat`, `y_cook` | ✅ |
| Biomechanics | Carrying | Work against gravity = m g h | `body.carry.heavy` | `y_carry` | ✅ |
| Heat loss | Cold, wet, wind | Conduction, convection and evaporation carry heat away; water conducts far faster than air | `body.cold.wet`, `shelter.wind.blocked` | `y_wet`, `s_wind` | ✅ |
| Insulation | Shelter bed | Dry debris traps still air, which conducts poorly | `shelter.bed.insulated` | `s_bed` | ✅ |
| Shelter siting and shape | Shelter | Cold air sinks; water runs downhill; steep layered roofs shed rain | `shelter.site.chosen`, `shelter.roof.covered` | `s_site`, `s_roof` | ✅ |
| Wound care | First aid | Dirt carries bacteria; washing lowers infection risk; inflammation is the body’s response | `body.wound.*` | `y_wound_clean`, `y_wound_dirty` | ✅ (game only; not medical advice) |
| Ecology | Animals | Producers, herbivores and carnivores; energy is lost at each step | `nature.foodchain.seen` | `n_chain` | ✅ / 🟡 (10% rule) |
| Predator and prey senses | Animals | Side-set eyes for wide view, forward eyes for depth | `nature.predator.near` | `n_eyes` | 🟡 |
| Tracking | Hunting | Fresh tracks have sharp edges; size and spacing hint at the animal | `hunt.track.found` | `h_track` | 🟡 |
| Weather | Clouds, rain | Rising moist air cools and condenses; rain cools fuel | `weather.sky.read`, `weather.rain.start` | `x_sky`, `x_rain` | ✅ |
| Radiative cooling | Clear nights | Clear skies let the ground lose heat to space; clouds slow it | `weather.night.clear` | `x_night` | ✅ |
| Smoke | Signal fire | Damp fuel gives steam and unburned particles; thick pale smoke | `fire.signal.smoke` | `f_smoke` | ✅ |

## Lessons

The game is played as five lessons (see [CURRICULUM.md](CURRICULUM.md)): 01 Shelter, 02 Fire, 03 Water,
04 Tools, 05 Food & Navigation. Every notebook entry belongs to one science concept
(`src/game/science/concepts.ts`), and the Lab Notebook is organised lesson -> concept -> entries.

**Experiments** (`src/game/science/experiments.ts`) are fed by the real simulation. The first is Lesson 01's
"How many roof layers keep the rain out?": each roof panel under rain is a trial, with the shelter rules
deciding whether it leaks (one layer of bark, leaves or grass leaks; two or more overlapping layers hold).

**The body** (`src/game/survival/`) is a simplified teaching model: heat in (metabolism, a fire) minus heat out
(cold air, faster in wind, much faster when wet, and into the ground when resting without a bed). The game shows
"warmth", never a body temperature, so it states no hypothermia figures. Water conducts heat "more than twenty
times" better than air (about 0.6 vs 0.026 W/m K) ✅.

| Topic | Mechanic | Core idea | Events | Entries | Conf. |
|---|---|---|---|---|---|
| Refraction | Spear fishing | A fish appears shallower than it is (≈ depth / 1.33 looking straight down), so a straight spear aimed at the image passes over it | `food.fish.miss.refraction`, `food.fish.caught` | `fd_refraction`, `fd_catch` | ✅ (game uses the paraxial approximation) |
| Cooking | Fish over the fire | Heat denatures proteins (flesh turns opaque) and kills bacteria and parasites | `food.fish.opaque`, `food.cooked`, `food.raw.refused` | `fd_opaque`, `y_cook`, `fd_raw` | ✅ (63 °C figure is the US FDA guidance) |
| Plant needs | Farm plots | Loose soil, water and light; wilting is loss of water pressure in cells; shade slows photosynthesis | `farm.plot.dug`, `farm.watered`, `farm.dry`, `farm.shade` | `fm_dig`, `fm_water`, `fm_dry`, `fm_shade` | ✅ |
| Propagation | Harvesting tubers | Tubers store starch made from sunlight; a piece can grow a new plant | `farm.harvested` | `fm_harvest` | ✅ |

## Simplifications (say so in the game)

- Ignition: we show fuels catching fire in order of size but do not state ignition
  temperatures in the game.
- Microbes: the lens that lets you see microbes is a game convenience (stated in `w_raw`).
- Calories: rough adult needs are given as "a couple of thousand kcal"; individual needs vary.
- Food chain: the "10%" figure is a rule of thumb, flagged as one.
- Refraction: fish images use the straight-down approximation (apparent depth = depth / 1.33); at slanted views the real shift is larger.
- Growth and drying times are compressed to minutes of game time.
- Lesson 03: pots dry in 45 s and test cups in 30 s (real pots take days); boiling takes 12 s; rain runoff is caught
  in one go. The filter's result depends only on the order of its layers, and a clear result always says germs remain.

## Uncertain claims (the game avoids these)

- ⚠️ Exact percentage of arrow energy that reaches the arrow from a bow (varies widely with bow design).
- ⚠️ Precise body-water loss at which thirst begins or performance drops (published figures differ).
- ⚠️ Specific hypothermia or wind-chill temperatures.
- ⚠️ "Red sky at night" and similar sayings. They hold only some of the time, so the notebook says "rule of thumb".
- ⚠️ Whether a given real stone is good for knapping: depends on local geology. The game uses an abstract "fine-grained, dark, glassy" tell.
- ⚠️ Edible plants and wild foods: the game does not teach foraging for specific species.

## Adding science

1. Add the event id and a one-line description to `science-events.ts`.
2. Add an entry to `observations.ts` (`trigger`, three-part text, `why`). Keep it short.
3. Put the entry in a concept in `src/game/science/concepts.ts` (every entry belongs to exactly one).
4. Emit `game.science('<id>')` from the system where it happens.
5. For a lesson step, an experiment or a check question, see [CURRICULUM.md](CURRICULUM.md).
6. `npm test`: `science.test.ts`, `concepts.test.ts` and `reachability.test.ts` check events exist, text is short,
   every entry has a concept and an emitter.
