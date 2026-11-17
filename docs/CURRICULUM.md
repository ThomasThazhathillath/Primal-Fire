# Survive through Science: the curriculum

EUREKA is played as five lessons. Each lesson has a survival goal, the science it teaches, steps on the
objective card, experiments the player runs with real variables, and a short check of what they learned.

| # | Lesson | Survival goal | Steps today |
|---|---|---|---|
| 01 | Shelter | protection from wind, rain and the cold ground before night | stones, workbench, explore the bench, cord, start the lean-to, frame, roof, rain test, **roof-layer experiment**, bed |
| 02 | Fire | warmth, cooking, heat for materials | wood, tinder, bow-drill parts, bow drill, fire pit, fire lay, ember, fire, charcoal |
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

`tests/curriculum-e2e.test.ts` plays a fresh game through all five lessons (Lesson 01 by real actions).
In the running game (`npx @iwsdk/cli dev up --headless --allow-browser-automation`):

- `scripts/playtest.mjs`: the survival opening, 20 checks.
- `FIXTURE=<name> ... scripts/save-smoke.mjs`: load a frozen save and report the lesson and card.
- `CODE='...' ... scripts/eval.mjs`: run a snippet in the game (`p` = `window.__primal`, `g` = the Game).
- `PANEL=<object name> EL=<element id> ... scripts/click-element.mjs`: a real mouse click on a UI element.

Debug handles: `window.__experiment`, `window.__notebook`, `window.__body`, `window.__lessonCard`.
