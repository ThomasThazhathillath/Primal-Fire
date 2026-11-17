# Survive through Science: the curriculum

PRIMAL is played as five lessons. Each lesson has a survival goal, the science it teaches, steps on the
objective card, experiments the player runs with real variables, and a short check of what they learned.

| # | Lesson | Survival goal | Steps today |
|---|---|---|---|
| 01 | Shelter | protection from wind, rain and the cold ground before night | stones, workbench, explore the bench, cord, start the lean-to, frame, roof, rain test, **roof-layer experiment**, bed |
| 02 | Fire | warmth, cooking, heat for materials | wood, tinder, bow-drill parts, bow drill, fire pit, fire lay, ember, fire, charcoal |
| 03 | Water | a safe water supply | clay pot, filter + boil ("clear is not safe") |
| 04 | Tools | make tools | sharp flake, cut with it, stone axe, split a log |
| 05 | Food & Navigation | self-sufficiency | fishing spear, catch a fish, cook it, **plant judgement**, **nutrition**, grow food, basket, **fresh vs dried**, follow a trail, **overharvest**, **read the sky**, **the sun's path**, the long trek (no compass), closing check |

Fire comes before Water so that pottery firing and boiling use the player's own fire, and the filter uses the
player's own charcoal.

## How it is built

```
src/game/curriculum/
  types.ts            LessonDef, LessonModule, Step (= the objective card's Objective shape)
  registry.ts         LESSONS in play order, the step library, EXPERIMENTS, picture hints
  tracker.ts          LessonTracker: the one progression driver (card, hints, build focus, lesson events)
  migrate.ts          version-1 saves -> lesson progress, worked out from their state
  lessons/<id>/       one folder per lesson: lesson.ts, steps.ts, experiments.ts (add more files here)
src/game/science/
  concepts.ts         36 concepts; every notebook entry belongs to exactly one
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
- **Every 4 Hz, inside `Game.tick`:** shelter rain test, body, experiments opening, lesson progress.
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
3. **Science:** new notebook entries go in `observations.ts` with a trigger event in `science-events.ts`; add the
   entry to a concept in `science/concepts.ts`. `tests/reachability.test.ts` fails if an entry has no emitter.
4. **Text:** short (the cards are read in a headset), ASCII punctuation, and the confidence rules in
   [SCIENCE.md](SCIENCE.md). Never claim filtering makes water safe; no specific hypothermia or edible-plant
   claims.

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

`tests/curriculum-e2e.test.ts` plays a fresh game through all five lessons (Lesson 01, and Lesson 05's new steps, by
real actions). `tests/lesson5.test.ts` covers each Lesson 05 rule and experiment.
In the running game (`npx @iwsdk/cli dev up --headless --allow-browser-automation`):

- `scripts/playtest.mjs`: the survival opening, 20 checks.
- `FIXTURE=<name> ... scripts/save-smoke.mjs`: load a frozen save and report the lesson and card.
- `CODE='...' ... scripts/eval.mjs`: run a snippet in the game (`p` = `window.__primal`, `g` = the Game).
- `PANEL=<object name> EL=<element id> ... scripts/click-element.mjs`: a real mouse click on a UI element.

Debug handles: `window.__experiment`, `window.__notebook`, `window.__body`, `window.__lessonCard`, `window.__choice`.
