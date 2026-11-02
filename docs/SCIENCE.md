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
| Sedimentation | Settling water | Gravity pulls particles down; fine silt takes longer | `water.sediment.settle` | `w_settle` | ✅ |
| Filtration | Layered filter | Coarse first, fine below, cloth support; charcoal adsorbs some chemicals | `water.filter.*` | `w_washout`, `w_clog`, `w_odor`, `w_microbes` | ✅ |
| Disinfection | Boiling | Boiling kills most pathogens but does not remove chemicals | `water.boil.*` | `w_boilmurky`, `w_boil` | ✅ |
| Pyrolysis | Charcoal mound | Heating wood with limited oxygen leaves carbon | `charcoal.*` | `c_ash`, `c_early`, `c_success` | ✅ |
| Clay and ceramics | Pottery | Clay is plastic when wet; grit prevents cracks; steam bursts damp pots; firing fuses minerals | `pottery.*` | `p_temper`, `p_dry`, `p_ceramic` | ✅ |
| Hydration | Thirst meter | Water is essential; thirst is a late signal; bad water can worsen dehydration | `body.thirst.warning`, `body.drink` | `y_thirst`, `y_drink` | ✅ |
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

## Simplifications (say so in the game)

- Ignition: we show fuels catching fire in order of size but do not state ignition
  temperatures in the game.
- Microbes: the lens that lets you see microbes is a game convenience (stated in `w_raw`).
- Calories: rough adult needs are given as "a couple of thousand kcal"; individual needs vary.
- Food chain: the "10%" figure is a rule of thumb, flagged as one.

## Uncertain claims (the game avoids these)

- ⚠️ Exact percentage of arrow energy that reaches the arrow from a bow (varies widely with bow design).
- ⚠️ Precise body-water loss at which thirst begins or performance drops (published figures differ).
- ⚠️ Specific hypothermia or wind-chill temperatures.
- ⚠️ "Red sky at night" and similar sayings. They hold only some of the time, so the notebook says "rule of thumb".
- ⚠️ Whether a given real stone is good for knapping: depends on local geology. The game uses an abstract "fine-grained, dark, glassy" tell.
- ⚠️ Edible plants and wild foods: the game does not teach foraging for specific species.

## Adding a new lesson

1. Add the event id and a one-line description to `science-events.ts`.
2. Add an entry to `observations.ts` (`trigger`, three-part text, `why`). Keep it short.
3. Emit `game.science('<id>')` from the system where it happens.
4. If a quest should wait for it, use `onEvent('<id>')` in `quests.ts`.
5. `npm test`: `tests/science.test.ts` checks events exist, text is non-empty and entries stay short.
