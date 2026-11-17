# Survive through Science: the curriculum

PRIMAL is played as five lessons. Each lesson has a survival goal, the science it teaches, steps on the
objective card, experiments the player runs with real variables, and a short check of what they learned.

| # | Lesson | Survival goal | Steps today |
|---|---|---|---|
| 01 | Shelter | protection from wind, rain and the cold ground before night | stones, workbench, explore the bench, cord, start the lean-to, frame, roof, rain test, **roof-layer experiment**, bed |
| 02 | Fire | warmth, cooking, heat for materials | wood, tinder, bow-drill parts, bow drill, fire pit, fire lay, ember, fire, **stroke-speed**, **pressure**, **damp-or-dry**, **twig-or-log**, **dead-or-green-wood** experiments, charcoal, **air-and-charcoal** and **air-on-the-fire** experiments, the **practical** (light and keep your own fire) |
| 03 | Water | a safe water supply | clay pot, filter + boil ("clear is not safe") |
| 04 | Tools | make tools | sharp flake, cut with it, stone axe, split a log |
| 05 | Food & Navigation | self-sufficiency | fishing spear, catch a fish, cook it, grow food, follow a trail, reach the Science Roadmap |

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

## Lesson 02: Fire

The fire is simulated, so every experiment is a real outcome of the rules (`src/game/combustion.ts`,
`src/game/fire.ts`, `src/game/fuel-moisture.ts`; the experiments are in `lessons/fire/experiments.ts`).

- **The bow drill.** Friction heat per second = gain x stroke speed x downward pressure (x stroke rhythm); the dust
  cools all the time, faster the hotter it is. So slow strokes (< 0.5 m/s) and a light touch both level off below
  smoking, and fast, firm strokes make an ember in a few seconds. VR: the bow hand's motion is the stroke, the other
  hand held still on top of the spindle is the firm press. Browser: hold the mouse button at the pit and drag left
  and right (drag speed = stroke speed, 700 px/s = 1 m/s), hold Shift to press down. A click alone does not saw.
  The drill also saws beside a burning fire (no second ember), so its experiments can be finished any time.
- **Fuel.** The pit holds up to 16 pieces (tinder, twigs, branch, logs, charcoal). Each piece first dries (water must
  boil off, which takes the fire's heat and makes smoke), then needs the fire hot enough for its size (thin fuel
  catches from a small flame, a log only on a hot fire), then burns and leaves coals. Damp moss and green wood hold
  water by nature; green wood dries three times slower and gives less heat; charcoal is hot and nearly smokeless.
- **Moisture.** Fuel picked up out in the open is as wet as the world (`env.wet`, which rain raises); under a roof it
  is dry. Carried fuel soaks in rain with no roof over you and dries beside a burning fire (fast), under your roof
  (slow) or in the open (slowest). Kept per item type, saved in `fuelWet`.
- **Air.** Wind on an open pit and fanning add air (more heat, faster burning); unlit logs crowding a small fire take
  air away; earth scraped over the fire with the digging stick smothers it (`smotherFire`). The ember needs air too:
  fanning, or wind across an open pit; damp tinder needs up to three times the air, wet tinder kills the ember.
- **Rain** on an exposed pit wets the fuel; burning pieces that get too wet go out.
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

`tests/curriculum-e2e.test.ts` plays a fresh game through all five lessons (Lessons 01 and 02 by real actions).
`tests/fire-lesson.test.ts` covers the Lesson 02 rules and runs every fire experiment through the real fire.
In the running game (`npx @iwsdk/cli dev up --headless --allow-browser-automation`):

- `scripts/playtest.mjs`: the survival opening, 20 checks.
- `FIXTURE=<name> ... scripts/save-smoke.mjs`: load a frozen save and report the lesson and card.
- `CODE='...' ... scripts/eval.mjs`: run a snippet in the game (`p` = `window.__primal`, `g` = the Game).
- `PANEL=<object name> EL=<element id> ... scripts/click-element.mjs`: a real mouse click on a UI element.

Debug handles: `window.__experiment`, `window.__notebook`, `window.__body`, `window.__lessonCard`.
