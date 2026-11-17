# Survive through Science: the curriculum

PRIMAL is played as five lessons. Each lesson has a survival goal, the science it teaches, steps on the
objective card, experiments the player runs with real variables, and a short check of what they learned.

| # | Lesson | Survival goal | Steps today |
|---|---|---|---|
| 01 | Shelter | protection from wind, rain and the cold ground before night | stones, workbench, explore the bench, cord, start the lean-to, frame, roof, rain test, **roof-layer experiment**, bed |
| 02 | Fire | warmth, cooking, heat for materials | wood, tinder, bow-drill parts, bow drill, fire pit, fire lay, ember, fire, charcoal |
| 03 | Water | a safe water supply | clay pot, filter + boil ("clear is not safe") |
| 04 | Tools | make tools, test materials, move a boulder no one could lift | sharp flake, **strike-angle experiment**, cut with it, **cord-strength experiment**, stone axe, split a log, tool kit (knife + hammer), **frame-bracing experiment**, **lever-pivot experiment**, roll the boulder off the flint seam (challenge), tool test |
| 05 | Food & Navigation | self-sufficiency | fishing spear, catch a fish, cook it, grow food, follow a trail, reach the Science Roadmap |

Fire comes before Water so that pottery firing and boiling use the player's own fire, and the filter uses the
player's own charcoal.

## Lesson 04: Tools, Materials & Primitive Engineering

The player can survive; now they manufacture. Knapping and the bench crafts happen at the player's own camp;
the physical experiments and the engineering challenge happen at the **Tool Yard**, on the north side of Split
Rock (`lessons/tools/yard.ts`, drawn and driven by `src/systems/tool-yard-system.ts`).

| Experiment | Variable (values) | What decides the outcome | Where the trial is reported |
|---|---|---|---|
| `strikeAngle` | angle of the blow (angled, straight down) | `knap()` in `interact.ts`: above `KNAP_ANGLE[1]` (80 deg) the edge crushes | `CraftGestureSystem.resolveKnap` -> `yard.knapStrike` (only fair blows: firm, near the edge) |
| `cordStrength` | the strand (loose fibres, twisted cord) | `tensileTest()`: strand strength vs the 20 N test stone | `yard.liftTestStone` (lifting the stone under the test bough) |
| `frameBracing` | bracing (square, diagonal brace) | `rackTest()`: hinge-like joints let a square fold; a triangle holds | `yard.pushFrame` (pushing the frame top sideways) |
| `leverPivot` | pivot position (close to the boulder, close to your hands) | `leverPush()`: effort x effort arm = load x load arm vs a 250 N best push | `yard.push` (pushing the pole end down) |

- **The lever** (`engineering.ts`): a 2 m pole, the pivot stone on one of three marks (load arm 0.3 / 1.0 /
  1.6 m), 700 N to tip the boulder. Only the near pivot (about 124 N) is within a person; the pole end
  then travels about 0.34 m to lift the edge 6 cm, and the boulder rolls 0.7 m away from the lever. Two rolls
  uncover the flint seam (`boulder` step, the challenge). Hands alone, or a short stick, say why they fail.
- **Improved tools** make new jobs possible: the axe splits logs (wedge, grain), and the seam's nodules can only
  be broken out with a hammer. A digging stick turned over a burning fire hardens (`t_harden`).
- **Assessment**: each experiment ends with its check question; the lesson ends with a practical tool test
  (`toolCheck`: the knife cuts fibres, the axe chops wood, the hammer breaks flint from the seam).
- **Controls**: VR touches a yard object by looking at it and pinching (or pinching right at it), and keeps
  pinching to move it (push the pole end down, pull the stone up, push the frame sideways). Desktop clicks, and
  presses and drags the same objects. `yardPointer` keeps those presses from also turning the camera or starting
  a cord twist.
- **Saves**: `SaveData.yard` (optional). Older saves load with the yard as the world made it.
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
The Tool Yard's state is `g.yard` (in `scripts/eval.mjs` snippets).
