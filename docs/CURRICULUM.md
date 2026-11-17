# Survive through Science: the curriculum

EUREKA is played as five lessons. Each lesson has a survival goal, the science it teaches, steps on the
objective card, experiments the player runs with real variables, and a short check of what they learned.

| # | Lesson | Survival goal | Steps today |
|---|---|---|---|
| 01 | Shelter | protection from wind, rain and the cold ground before night | stones, workbench, explore the bench, cord, start the lean-to (site check), frame, **push test**, roof, rain test, **roof-layer experiment**, bed, **bed test**, **a night in it** |
| 02 | Fire | warmth, cooking, heat for materials | wood, tinder, bow-drill parts, bow drill, fire pit, fire lay, ember, fire, **stroke-speed**, **pressure**, **damp-or-dry**, **twig-or-log**, **dead-or-green-wood** experiments, charcoal, **air-and-charcoal** and **air-on-the-fire** experiments, the **practical** (light and keep your own fire) |
| 03 | Water | a safe water supply | **clay-temper test**, **firing test**, clay pot, **stream or rain**, **filter layer order**, **settle / filter / boil**, **closing check** (limits of filtration) |
| 04 | Tools | make tools, test materials, move a boulder no one could lift | sharp flake, **strike-angle experiment**, cut with it, **cord-strength experiment**, stone axe, split a log, tool kit (knife + hammer), **frame-bracing experiment**, **lever-pivot experiment**, roll the boulder off the flint seam (challenge), tool test |
| 05 | Food & Navigation | self-sufficiency | fishing spear, catch a fish, cook it, **plant judgement**, **nutrition**, grow food, basket, **fresh vs dried**, follow a trail, **overharvest**, **read the sky**, **the sun's path**, the long trek (no compass), closing check |

Fire comes before Water so that pottery firing and boiling use the player's own fire, and the filter uses the
player's own charcoal.

## Lesson 01: Understanding Nature & Building Shelter

The player wakes with nothing and night is coming. Every experiment is decided by the real rules: the
lean-to's filled spots (`shelter.ts`), the body simulation (`survival/body.ts` `heatFlow`) and the weather.
The lesson's own rules live in `lessons/shelter/rules.ts` (`ShelterRules`, run from `Game.tickBody` in the
4 Hz slow step; nothing extra is saved except `PlacedStructure.pushFirst`).

| Step | What the player does | What decides it |
|---|---|---|
| `pole` | carries the first pole to open ground | **site check** (`sites.ts`, `checkPlacement`): a lean-to is turned down in one of the authored low hollows (`site.lowGround`, entry `l1_hollow`) or under a dead tree (`site.deadBranches`); a slight rise is praised (`l1_rise`) |
| `frame` | posts, ridge, **push the bare frame**, ribs, cross-supports, lashings, small branches | on the frame step the ribs wait for one push of the bare frame (`pushFirst`); pressing a post or the ridge (pinch, hand or controller ray, mouse) calls `Game.pushFrame` -> `framePush`. The press targets are double-sided spheres, so a hand pinching right at the pole hits them |
| `framePush` | **experiment**: posts and ridge only vs with ribs and cross-supports | `framePush(s).rack`: the bare box leans right over, the braced frame holds (entry `l1_rack`) |
| `roof`, `rainTest`, `roofLayers` | as in Phase 1; the rain test's card shows the water standing on the floor until the channel is dug | `ShelterTest.flood` |
| `bed` | lays a bed under the roof (dry grass, dry leaves, now also damp moss) | the bed's parts |
| `bedMaterials` | **experiment**: rests still under the roof on bare ground, a whole bed of dry grass or leaves, and a whole bed of damp moss | the body's conduction into the ground (`body.flow.ground`) against bare ground; the bed's material (`survival/materials.ts`: insulation and moisture per material) drives it; a damp bed also wets you |
| `nightShelter` | **experiment + the lesson's practical check**: on a cold night (dark, air 12 C or less) stands still in the open, then rests on a whole dry bed under the roof | heat out over heat made (`heatRatio`) for each place; the step also needs the **proof**: resting on the bed under a roof that does not leak, warmth holds steady (ratio at most 1.3) for 12 s (`shelter.night.warm`) |

Notes:
- **Sites** are data, not terrain: `groundHeight` is shared by trees, tracks and wildlife and structures sit at
  y = 0, so the four authored features (two hollows, two rises in the Waking Clearing) are drawn by
  ShelterSystem as ground patches (hollows shine after rain and fill with low mist on calm nights). The body
  feels a hollow: on calm nights its air is up to `HOLLOW_CHILL` (2.5 C) colder (`climate.ts`).
- **Roof pitch** is not a variable: the lean-to's spot layout, its drawing (`leanto.ts` roof constants), the
  drips and the interior all assume one slope. Drainage is taught through the rain test's channel and the site
  check instead.
- The experiment card shows up to four trial rows, an optional per-experiment button (`ExperimentDef.testAction`:
  "Wait for rain", "Rest until midnight") and an optional live readout line (`ExperimentDef.readout`).
- The `shelter` guide (`guides.ts`) now follows the lean-to stage by stage (site, posts, push, ribs, lashing, roof,
  rain, bed, night); its id is unchanged so saved guide state still loads.
- Old saves: `framePush` is implied when the shelter was already tested, the roof step was finished, or the ribs
  went on without a push (`pushTooLate`); a finished Lesson 01 stays finished.

## Lesson 03: Water in detail

Every outcome comes from a rule; the experiments only record what the rules produced (`game.experiments.trial`).

| Step (= experiment id) | What the player does | Rule that decides (file) | Notebook |
|---|---|---|---|
| `clayTemper` | Makes clay test cups at the bench (recipe `clayTest`: 2 clay, 1 sand = one clay-only cup, two with sand); they dry in the bag (30 s) | drying strain peaks halfway; clay alone tears, sand keeps it below strength (`lessons/water/clay.ts`) | `p_temper`, `p_reclaim` (the cracked cup soaks back into clay, +1 clay) |
| `potFiring` | Opens right after the clay prediction: puts a damp sand cup in the fire (empty hand into the flames; browser U), then a dry one | steam bursts damp clay, dry clay becomes ceramic (`clay.ts`; the real pot reports the same trials, `water.ts`) | `p_dry` |
| `pot` | The beginner objective: make, dry (45 s) and fire the pot | unchanged | `p_ceramic` |
| `waterSource` | Fills the pot at the stream, pours it out, then catches rain at the low back edge of the lean-to roof (card button "Wait for rain") | stream water is `raw` (muddy); roof runoff is `rain` (clearer) (`water.ts`) | `w_cycle` (the water cycle) |
| `filterOrder` | Builds the filter; each of the four layer marks takes cloth, charcoal, sand or gravel, filled from the bottom up; pours, pinches layers out, reorders, pours again | no cloth at the bottom washes sand out; sand above gravel clogs; gravel above sand runs clear; charcoal only changes the smell (`lessons/water/filter.ts`) | `w_washout`, `w_clog`, `w_odor` |
| `treatment` | Stream water four ways: settle (a full pot left still 15 s, in the bag or set down), filter, boil unfiltered, filter then boil | `water.ts`: settled = clearer, germs; filtered = clear, germs; boiled raw = germs killed, mud in; filtered + boiled = safe | `w_settle`, `w_boilmurky`, `w_boil` |
| `waterSupply` | A closing check (`kind: 'check'`): opens straight to its question once the setup works (fired pot, a filter that runs clear, safe water made) | the limits of filtration | |

**Your own fire:** pot firing, boiling, the test cups and stone heating all need the player's fire pit burning, and
they go at the rate of its heat (`WaterState.fireHeat()`, from `fire.ts` `flame`; full speed at `FULL_HEAT_FLAME`
0.45, which a fed fire is above). A fire burned down to embers barely heats and a note says to feed it; a fire that
goes out takes the pot off. The filter's charcoal is the charcoal from the player's own mound (Lesson 02).

Also: stone boiling (heat two dry stones in the fire, drop them into the pot: `w_hotstones`; wet stream stones are
never offered). In the browser, U tips water out of the pot at the stream or the roof edge (in VR you tip the pot).

**Live check:** `PHASE=start|clay|pot|filter|treatment npx @iwsdk/cli browser run scripts/water-check.mjs --timeout
105000`, run in that order on one game (a browser run is capped at 110 s): Level 3 chosen from the title list, every
card answered by real mouse clicks, water actions by the real U and R keys.

**Pot water** (`water.ts` `PotWater`): `empty`, `raw`, `settled`, `rain`, `filtered`, `boiledRaw`, `safe`. Only stream
water feeds the treatment experiment (`WaterState.source`).

**Old saves:** a save that finished the old water lesson (safe water made, no Lesson 03 experiment ever opened)
counts every Lesson 03 step as done (`legacyWater` in `lessons/water/steps.ts`). Filters saved with the old fixed
layer order read as cloth, charcoal, sand, gravel and run clear.

**Experiment card:** Lesson 03 adds `ExperimentDef.kind = 'check'`: a lesson's closing question with no prediction or
variable. It opens straight to its check question (label "CHECK"), waits behind another open card like a prediction
does, and comes back up once per session while it waits.

## Lesson 04: Tools, Materials & Primitive Engineering

The player can survive; now they manufacture. Knapping and the bench crafts happen at the player's own camp;
the physical experiments and the engineering challenge happen at the **Tool Yard**, on the north side of Split
Rock (`lessons/tools/yard.ts`, drawn and driven by `src/systems/tool-yard-system.ts`).

| Experiment | Variable (values) | What decides the outcome | Where the trial is reported |
|---|---|---|---|
| `strikeAngle` | angle of the blow (angled, straight down) | `knap()` in `interact.ts`: above `KNAP_ANGLE[1]` (80 deg) the edge crushes | `CraftGestureSystem.resolveKnap` -> `yard.knapStrike` (only fair blows: firm, near the edge) |
| `cordStrength` | the strand (loose fibres, twisted cord) | `tensileTest()`: strand strength vs the 20 N test stone | `yard.liftTestStone` (lifting the stone under the test bough) |
| `frameBracing` | bracing (square, diagonal brace) | `rackTest()`: hinge-like joints let a square fold; a triangle holds | `yard.pushFrame` (pushing the frame top sideways) |
| `leverPivot` | pivot position (close to the boulder, in the middle, close to your hands) | `leverPush()`: effort x effort arm = load x load arm vs a 250 N best push | `yard.push` (pushing the pole end down) |

Each card's testing phase shows a live readout from the simulation (`ExperimentDef.readout`): the last blow's angle and
speed, the strands' strengths against the stone's 20 N, the frame's bracing, and the push the current pivot needs.

- **The lever** (`engineering.ts`): a 2 m pole, the pivot stone on one of three marks (load arm 0.3 / 1.0 /
  1.6 m), 700 N to tip the boulder. Only the near pivot (about 124 N) is within a person; the pole end
  then travels about 0.34 m to lift the edge 6 cm, and the boulder rolls 0.7 m away from the lever. Two rolls
  uncover the flint seam (`boulder` step, the challenge). Hands alone, or a short stick, say why they fail.
- **Improved tools** make new jobs possible: the axe splits logs (wedge, grain), and the seam's nodules can only
  be broken out with a hammer. A digging stick turned over a burning fire hardens (`t_harden`).
- **Assessment**: each experiment ends with its check question; the lesson ends with a practical tool test
  (`toolCheck`: the knife cuts fibres, the axe chops wood, the hammer breaks flint from the seam).
- **Controls**: VR points the hand or controller ray at a yard object and pinches (each target offers the gaze
  system a viewer-facing rectangle; head gaze no longer presses 'ui' targets), or pinches right at it with the hand
  (a direct pinch wins over that hand's ray). Keep pinching and move the hand: push the pole end down, pull the
  stone up, push the frame sideways. Desktop clicks, and presses and drags the same objects. `yardPointer` keeps
  those presses from also turning the camera or starting a cord twist. Decorative yard meshes ignore raycasts so they
  never hide a target; the hit shapes stay `visible` (IWSDK's pointer skips hidden meshes).
- **Layout**: boulder at (-5.6, 22.3) with the lever pointing east, the test bough at (-5.5, 20), the frame ground at
  (-3.6, 20.6). `tests/tools-lesson.test.ts` fails if a resource spot, tree, rock or log ever lands on the boulder's
  roll path, the lever line, the bough or the frame (a loose stone there takes the clicks meant for the yard).
- **Level 4** is in `setPlayableLessons` (src/index.ts) and follows Level 3 in the same game. Chosen from the title in
  a fresh game, the steps say how to build a workbench and twist cord when the player has none (`find` lists the parts).
- **Saves**: `SaveData.yard` (optional). Older saves load with the yard as the world made it.
- **Live check**: `PHASE=knap|cord|frame|lever npx @iwsdk/cli browser run scripts/tools-yard-playtest.mjs --timeout
  110000` (one phase per run: a browser run is capped at 110 s). `knap` starts a fresh game and picks Level 4 from
  the title list; every mechanic is driven by real mouse input on the canvas. Debug handle: `window.__yard`.
- **Crafting paths**: Lesson 04 adds no new crafting path (the tool kit is made at the workbench). The four
  existing paths (`Game.craft`/`RECIPES`, `HAND_RECIPES`, `BENCH_RECIPES`, `ACTIONS`) are left as they are; see
  the note in the coordinating session's notes folder for a proposed unification after the lesson merge.

## How it is built

```
src/game/curriculum/
  types.ts            LessonDef, LessonModule, Step (= the objective card's Objective shape)
  registry.ts         LESSONS in play order, the step library, EXPERIMENTS, picture hints
  tracker.ts          LessonTracker: the one progression driver (card, hints, build focus, lesson events)
  migrate.ts          version-1 saves -> lesson progress, worked out from their state
  lessons/<id>/       one folder per lesson: lesson.ts, steps.ts, experiments.ts (add more files here)
src/game/science/
  concepts.ts         the science concepts; every notebook entry belongs to exactly one
  experiments.ts      ExperimentTracker: question -> prediction -> trials -> result -> check
  assessments.ts      one short check question with an explanation for every option
  notebook-view.ts    the Lab Notebook's pages (pure)
src/game/survival/
  climate.ts          the weather where the player stands
  body.ts             warmth, water, food, rest, wetness (gentle: nothing kills you)
src/systems/          experiment-system, notebook-system, body-system, level-system (lesson cards)
```

- **Systems never reach into the tracker.** They call the Game focus API: `focus()`, `focusIs()`,
  `guiding()`, `learn()`, `hasLearned()`, `wantedStructure()`, and `game.steps` for hints and messages.
- **Steps are state predicates.** A step is done when the game's state shows it (gathered counts, structures,
  flags, science events, `g.experiments.done(id)`), so old saves and steps done early are recognised.
- **Experiments are fed by the simulation.** The code that runs a mechanic reports what actually happened:
  `game.experiments.trial(id, value, outcome)`. The tracker never invents an outcome. One variable per
  experiment; it concludes once every needed value has been tried.
- **Every 4 Hz, inside `Game.tick`:** shelter rain test, body (and Lesson 01's bed and night readings), experiments
  opening, lesson progress.
- **Saves:** version 2 (`src/game/save.ts`). Lessons, body, experiments and the notebook's read count are saved;
  a version-1 save is backed up once and migrated. `tests/fixtures/saves/` holds frozen version-1 saves.

## Lesson 05: Food, Navigation & Long-Term Survival

Story: the camp works; now the player must become self-sufficient. Content lives in `lessons/food/`:
`steps.ts`, `experiments.ts` (six), `nutrition.ts` (what each food is made of), `field.ts` (`FieldLesson`, on
`game.field`: plant-judgement and trek cards, sky and sun reading, the trek, the closing check, food-chain hooks).
Food rules stay in `src/game/food.ts` and `src/game/forage.ts`; digestion is in `survival/body.ts`.

| Experiment | Variable (values) | Trials come from |
|---|---|---|
| `plantId` Can you trust a plant that looks like food? | match with the field guide (all / most) | `food.judge`: what the judged plant really was |
| `nutrition` Which food keeps you going longest? | food (berries / nuts / fish) | `Body.digest` -> `onMeal`: how long the meal kept feeding you |
| `dryingTest` Does drying make food keep longer? | food carried (fresh / dried fish) | spoilage: both carried for fresh fish's "going off" age |
| `overharvest` What happens if you strip a patch bare? | picking (some / all) | patch stocks: how each patch actually grew back |
| `skyTest` Do dark, building clouds warn of rain? | sky when you looked up (dark building / clear) | `Environment`: cloud cover when read, then rain within 90 s or not |
| `sunPath` Where does the sun rise and set? | time of day (morning / afternoon) | the sun path (`sunDirection`) when you faced the sun |

- **Plant judgement:** looking closely at a patch opens the choice card (`choice-system.ts`, `public/ui/choice.uikitml`):
  the plant's fruit, stem, leaves and smell next to the field guide's food plant. The player decides safe / not safe /
  not sure; the truth is shown after. Calling a look-alike or an unlisted plant safe means tasting it: `Body.poison()`
  (queasy for 90 s, a little food lost), never worse. The plants are made up (docs/SCIENCE.md); look-alikes share the
  colour and differ in two features, and two plants are not in the guide at all (right answer: not sure).
- **Nutrition:** `nutrition.ts` keeps the old food points (fish 40, dried fish 35, nuts 25, berries 15) and adds the
  main nutrient and how fast it arrives: sugar almost at once, fat and protein over two minutes or so; protein also
  speeds rest recovery for a while.
- **Patches** carry 3 handfuls; a handful grows back every 80 s while some is left. Stripped bare, a patch waits 240 s
  and comes back with 1 handful and a lower maximum, which recovers as it regrows. The basket (pack upgrade) picks two.
- **Weather:** clouds now build during the last 75 s before every scheduled rain spell (rain timing unchanged), and
  the cloud experiment's "Watch the sky" button brews a shower (`Environment.brewRain`: 60 s of building cloud, 120 s
  of light rain). Reading the sky = looking up (pitch above about 35 degrees) for 1.5 s outdoors by day.
- **Sun:** facing within about 25 degrees of the sun for 1 s reads its direction for the hour; "Rest until afternoon" /
  "Rest until morning" skip the clock. Resting on a bed at night sleeps until 6:30.
- **The long trek** (`trek`): leaving camp (10 m) in daylight starts it and covers the compass. Goals: reach the Ruins,
  gather 4 food on the way, eat on the way, be back at camp (6 m) before dark. Nightfall or coming home unfinished
  uncovers the compass and lets you try again. Then `finalCheck`: four questions on the choice card.
- **Desktop:** U looks closely / eats as before; the choice card is clicked or answered with 1-3 and Enter; mouse-look up
  reads the sky; turning to the sun reads it. VR: reach out to act, press card buttons by fingertip, ray or gaze + pinch.
- Debug handle: `window.__choice` (`state()`, `choose(i)`, `act()`); `__primal.game.field` holds the lesson state.
- Saves: `FoodSave` gains optional `stock`, `cap`, `regrow`, `stripped`, `judged`; `BodySave` optional `repair`,
  `meals`; `SaveData.field` (trek, check, judgement counts). All absent in older saves and defaulted safely.

## Adding to a lesson

1. **A step:** add it to `lessons/<id>/steps.ts` (with four hint levels and a `HintInfo` picture) and to the
   lesson's `steps` list. Use stable ids; never reuse an id for something else.
2. **An experiment:** add an `ExperimentDef` to `lessons/<id>/experiments.ts` (predictions, the variable and its
   values, outcomes, `conclude`, principle, real life, limits, a check question, `opens`). Report trials from the
   system or rule that runs the mechanic. If the experiment is a step, give the step the experiment's id and
   `done: (g) => g.experiments.done(id)`; the objective card's Why? button then opens the experiment card.
   At most four values (the card has four trial rows). Give `testAction` for a testing button that helps (Lesson
   03's "Wait for rain"). A lesson's closing question is an `ExperimentDef` with `kind: 'check'` (empty predictions
   and variable): it opens straight to its check question.
3. **Science:** new notebook entries go in `observations.ts` with a trigger event in `science-events.ts`; add the
   entry to a concept in `science/concepts.ts`. `tests/reachability.test.ts` fails if an entry has no emitter.
4. **Text:** short (the cards are read in a headset), ASCII punctuation, and the confidence rules in
   [SCIENCE.md](SCIENCE.md). Never claim filtering makes water safe; no specific hypothermia or edible-plant
   claims.

## Lesson 02: Fire

The fire is simulated, so every experiment is a real outcome of the rules (`src/game/combustion.ts`,
`src/game/fire.ts`, `src/game/fuel-moisture.ts`; the experiments are in `lessons/fire/experiments.ts`).

- **The bow drill.** Friction heat per second = gain x stroke speed x downward pressure (x stroke rhythm); the dust
  cools all the time, faster the hotter it is. So slow strokes (< 0.5 m/s) and a light touch both level off below
  smoking, and fast, firm strokes make an ember in a few seconds. VR: the bow hand's motion is the stroke, the other
  hand held still on top of the spindle is the firm press. Browser: hold the mouse button at the pit and drag left
  and right (drag speed = stroke speed, 700 px/s = 1 m/s, measured from the pointer's travel each frame), hold Shift
  to press down. A click alone does not saw. Clicking the pit with fuel in hand feeds the fire (it never starts a bed
  or snaps the branch there); with an empty hand it fans a burning fire; with the digging stick it smothers it.
  The drill also saws beside a burning fire (no second ember), so its experiments can be finished any time.
- **Fuel.** The pit holds up to 16 pieces (tinder, twigs, branch, logs, charcoal). Each piece first dries (water must
  boil off, which takes the fire's heat and makes smoke), then needs the fire hot enough for its size (thin fuel
  catches from a small flame, a log only on a hot fire), then burns and leaves coals. Damp moss and green wood hold
  water by nature; green wood dries three times slower and gives less heat; charcoal is hot and nearly smokeless.
- **Moisture.** Fuel picked up out in the open is as wet as the world (`env.wet`, which rain raises); under a roof it
  is dry. Carried fuel soaks in rain with no roof over you and dries beside a burning fire (fast), under your roof
  (slow) or in the open (slowest). Kept per item type, saved in `fuelWet`.
- **Air.** Wind on an open pit and fanning add air (more heat, faster burning; a fanning run is judged against the
  same fire in still air at that moment); unlit logs crowding a small fire take
  air away; earth scraped over the fire with the digging stick smothers it (`smotherFire`). The ember needs air too:
  fanning, or wind across an open pit; damp tinder needs up to three times the air, wet tinder kills the ember.
  The ember has no time limit: carried, it glows until it goes into the tinder (and survives a reload); in the
  tinder without air it only smoulders and dims, and after 12 s the game says it needs air (the `f_oxygen` entry).
- **Rain** on an exposed pit wets the fuel: light rain only slows a fire that has caught; heavy rain can put an
  unsheltered fire out. A roof over the pit keeps it dry.
- **Experiment cards** show live readouts (dust heat and stroke, the last piece fed, the fire's air, the mound's
  smoke). A card waiting for a prediction comes up by itself once per session when nothing else is open.
- **Keeping a fire.** Unfed, the standard lay burns about two minutes, then coals, then nothing. The practical
  (`fireOnOwn`) asks for a fire lit from a new ember (not the first, guided one) kept burning 150 s with at least two
  pieces fed. Fire rules run at the 4 Hz slow step and cost a few microseconds a frame.

| Experiment (step) | Variable (held constant) | Reported from |
|---|---|---|
| `drillSpeed` | slow / fast strokes (firm press) | the end of each 4 s stroke run, `fire.ts` |
| `drillPressure` | light / firm press (fast strokes) | same |
| `tinderDamp` | dry / damp fine fuel fed to the fire | when the piece catches, or is still unlit after 15 s |
| `fuelSize` | dry twig / dry log | same |
| `woodType` | dry dead branch / green branch | same |
| `charcoalAir` | open fire (a log burns through) / sealed mound | `fire.ts` and the mound in `water.ts` |
| `airflow` | fanned / covered with earth | a fanning run, the fire going out |

Experiments open when their step is on the card (the stroke-speed test at the ember step), one card at a time: a
new one waits until the card in view is closed. An old save that finished the old fire chain (charcoal made, no
fire experiment ever offered) has the new steps recognised as done (`legacyFireDone`).

## Checks

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

`tests/curriculum-e2e.test.ts` plays a fresh game through all five lessons (Lessons 01, 02 and 03 by real actions).
`tests/fire-lesson.test.ts` covers the Lesson 02 rules and runs every fire experiment through the real fire;
`tests/lesson-water.test.ts` covers every Lesson 03 rule and experiment.
`tests/lesson5.test.ts` covers every Lesson 05 rule and experiment; the e2e test plays Lesson 05's new steps by real actions.
In the running game (`npx @iwsdk/cli dev up --headless --allow-browser-automation`):

- `scripts/playtest.mjs`: the survival opening, 20 checks.
- `FIXTURE=<name> ... scripts/save-smoke.mjs`: load a frozen save and report the lesson and card.
- `CODE='...' ... scripts/eval.mjs`: run a snippet in the game (`p` = `window.__primal`, `g` = the Game).
- `PANEL=<object name> EL=<element id> ... scripts/click-element.mjs`: a real mouse click on a UI element.
- `OBJ=<object name> ... scripts/click-object.mjs`: a real mouse click on a 3D object (it turns the view to face it
  first), e.g. `OBJ=FramePush_1_0` pushes the lean-to frame. In emulated XR, `xr look-at` targets are in the
  headset's reference space (relative to the player rig), not world coordinates.

Debug handles: `window.__experiment`, `window.__notebook`, `window.__body`, `window.__lessonCard`, `window.__choice`.
The Tool Yard's state is `g.yard` (in `scripts/eval.mjs` snippets).
Lesson 01 in the running game: `g.shelterRules` (`lastPush`, `lastBed`, `lastNight`, `nightAdvice(g)`), `g.pushFrame(id)`,
`g.waitForNight()`. Unit tests: `tests/lesson01.test.ts`.
