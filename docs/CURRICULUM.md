# Survive through Science: the curriculum

PRIMAL is played as five lessons. Each lesson has a survival goal, the science it teaches, steps on the
objective card, experiments the player runs with real variables, and a short check of what they learned.

| # | Lesson | Survival goal | Steps today |
|---|---|---|---|
| 01 | Shelter | protection from wind, rain and the cold ground before night | stones, workbench, explore the bench, cord, start the lean-to, frame, roof, rain test, **roof-layer experiment**, bed |
| 02 | Fire | warmth, cooking, heat for materials | wood, tinder, bow-drill parts, bow drill, fire pit, fire lay, ember, fire, charcoal |
| 03 | Water | a safe water supply | **clay-temper test**, **firing test**, clay pot, **stream or rain**, **filter layer order**, **settle / filter / boil**, **closing check** (limits of filtration) |
| 04 | Tools | make tools | sharp flake, cut with it, stone axe, split a log |
| 05 | Food & Navigation | self-sufficiency | fishing spear, catch a fish, cook it, grow food, follow a trail, reach the Science Roadmap |

Fire comes before Water so that pottery firing and boiling use the player's own fire, and the filter uses the
player's own charcoal.

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

Also: stone boiling (heat two dry stones in the fire, drop them into the pot: `w_hotstones`; wet stream stones are
never offered). In the browser, U tips water out of the pot when nothing else applies (in VR you tip the pot).

**Pot water** (`water.ts` `PotWater`): `empty`, `raw`, `settled`, `rain`, `filtered`, `boiledRaw`, `safe`. Only stream
water feeds the treatment experiment (`WaterState.source`).

**Old saves:** a save that finished the old water lesson (safe water made, no Lesson 03 experiment ever opened)
counts every Lesson 03 step as done (`legacyWater` in `lessons/water/steps.ts`). Filters saved with the old fixed
layer order read as cloth, charcoal, sand, gravel and run clear.

**Experiment card:** four trial rows (`exp-trial-0..3`); an experiment may give its own testing button
(`ExperimentDef.testAction`, e.g. "Wait for rain"); `kind: 'check'` makes a lesson's closing question.

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

`tests/curriculum-e2e.test.ts` plays a fresh game through all five lessons (Lessons 01 and 03 by real actions);
`tests/lesson-water.test.ts` covers every Lesson 03 rule and experiment.
In the running game (`npx @iwsdk/cli dev up --headless --allow-browser-automation`):

- `scripts/playtest.mjs`: the survival opening, 20 checks.
- `FIXTURE=<name> ... scripts/save-smoke.mjs`: load a frozen save and report the lesson and card.
- `CODE='...' ... scripts/eval.mjs`: run a snippet in the game (`p` = `window.__primal`, `g` = the Game).
- `PANEL=<object name> EL=<element id> ... scripts/click-element.mjs`: a real mouse click on a UI element.

Debug handles: `window.__experiment`, `window.__notebook`, `window.__body`, `window.__lessonCard`.
