# Phase 3, The Living World: audit and plan

Spec: `docs/PHASE3_LIVING_WORLD_SPEC.md`. Everything below extends existing systems; nothing parallel is built.

## Audit: what exists today
| Area | What is there | What is missing |
| --- | --- | --- |
| Fishing (`food.ts`, `fishing-system.ts`) | 5 fish with a state (heading, scared) in the stream; drawn as dark spheres at the *apparent* (refracted) position; spear thrust test (`spearHit`); catch gives `fish`. | One size, no groups, no reaction to the player except fright after a miss, no handling or preparation. |
| Farming (`food.ts`, `farm-system.ts`, water/food `available`) | Up to 4 plots, dig with the digging stick, plant a `tuber` or `seeds`, water from the pot, growth 0..1 over game time with moisture and canopy shade, harvest; wild tuber plants; saved in `FoodSave`. | Growth is one cone that gets taller; no stages (seed, sprout, young, mature), no seed return on harvest, no germination rule, a single quest. |
| Cooking (`food.ts`) | `cookOver`: hold a fish over a burning fire for 8 s. | No cooking surface, no drying or preservation, no storage, no spoilage. |
| Hunting (`bow-system.ts`, `projectile.ts`, quest "The Hunt") | Bow, arrows, `arrowTargets` (the training mark). | No animals. `hunt.track.found` is defined and a quest step waits for it, but nothing ever emits it, so that step cannot complete today. |
| Wildlife | None. `ambience-system.ts` plays synthesised bird, cricket and owl calls on timers. | Animals, state machines, tracks. |
| Environment (`environment.ts`, `sky-fx.ts`, `environment-system.ts`, `nature-system.ts`) | One clock, weather (rain, fog, wind), sky, flowing stream shader, swaying canopies, drifting leaves, ridge haze, puddle-free ground wetness. | Mist at dawn, grass reacting to movement, puddles, evening/night wildlife timing. |
| Camp (`blueprint.ts` storage basket, `shelter-system.ts`, Chapter 2) | A storage basket (40 slots, `Game.stash/withdraw`), the Chapter 2 lean-to with a leaf bed and rain test. | Rack, firewood stack, food storage, sleeping area as placed objects. |
| Save (`Game.snapshot`) | Structures, food (plots, fish, wild), env, objectives, shelter test, all versioned and optional. | Wildlife (derived, not saved), tracks (seeded per day), camp objects. |
| Resources | Fixed spots plus rule-driven scatter appended last (layout stays stable). | Berries, nuts, roots, identification. |

## Design rules for this phase
- **Few species, cheap.** Deer (3), rabbits (5), birds (6), fish (existing 5, now grouped with sizes). Each animal is a plain data record with a tiny state machine; nothing runs beyond `ACTIVE_RANGE` (distance activation) and animals outside it are parked. No pathfinding: steering is "go toward a goal point, push away from trees, flee along the away vector".
- **Deterministic and unsaved.** Animals are derived from a seed and the game clock (home points are fixed; positions are re-simulated when you come near). Crops and camp objects are saved.
- **Pooled meshes.** One small merged mesh per species, instanced where several share it; budgets: animals add at most ~10 draw calls, tracks one instanced mesh, plants a few pooled meshes.
- **Non-linear quests.** The seven new quests are independent and unlock from state, not from each other.

## Milestones (each ends with typecheck, tests, commit)
- **A Wildlife:** `wildlife.ts` (pure states, steering, reactions), `wildlife-system.ts` (pooled meshes, activation, calls), fish groups and sizes.
- **B Tracking:** `tracks.ts` (footprint shapes, direction, spacing, fade; seeded per day near water and cover), `track-system.ts` (instanced prints), examining a track, notebook comparison, "The Hidden Trail" quest, `hunt.track.found` finally emitted.
- **C Farming:** `crops.ts` growth stages (seed, sprout, young, mature, harvestable), germination needs moisture, harvest returns seeds, stage visuals in `farm-system`, persisted.
- **D Food:** berries, nuts, roots and an identification step; fish handling and preparation; roasting and drying on a rack near the fire; spoilage (fresh vs preserved).
- **E Living camp:** rack, firewood stack with rain cover, food storage, sleeping bed, all placed physically and persisted.
- **F Science and polish:** notebook entries, Roadmap nodes, the seven quests, mist and evening behaviour, README and PROJECT_STATUS.

## Measurement (IWER, headless Mac; not Quest)
Baseline on `main` (3d9c8a3), initial forest, 4 s sample: **512 draw calls (stereo), 474k triangles, CPU 4.78 ms, 2465 scene objects, 1728 meshes (993 visible)**. After-numbers are recorded in `docs/PROJECT_STATUS.md` at the end of each milestone.

## What is and is not claimed
Unit-tested means vitest. Emulator-tested means driven in IWER with screenshots. Nothing in this phase is Quest-tested.

## As built (differences from the plan above)
- Milestones C, D and E went into one commit because they share `food.ts` and the build book. Crop stages live in `food.ts` (no `crops.ts`); tracks render inside `wildlife-system.ts` (no `track-system.ts`).
- Notebook count: 80 to 92 entries. Field tasks do not use the quest chain; they live in `living-quests.ts` and save as `living`.
- Spoilage is not simulated: preservation is the drying rack (fish becomes dried fish).
