# Chapter 2, The Living Camp: plan

Spec: `docs/CHAPTER2_SHELTER_SPEC.md`. This plan says what already exists (and is reused), what is added, and in which order.

## What already exists (reused, not rebuilt)
- `blueprint.ts` snap spots, `Game.fillSpot / placeKey / seatNear / fillFromBag`, `assist.ts` marks, magnet, catch, auto-refill and `build-system.ts` (outlines, glowing marks, placement pop and sound).
- `carry-system` two-hand carry (a long pole is `twoHand`), `pinch-grab-system`, intent resolver, adaptive assistance.
- `interact.ts` machines: `TwistState` (wrists roll in opposite directions while the strands are taut) is reused for lashing; the desktop wheel already drives it.
- `environment.ts` weather: `forceWeather = 'heavyRain'` gives the rain test its rain, wetness, rain sound and the fire-exposure rule. The stream stays the only water source.
- Quests (`quests.ts`, levels, hints with the three-level science / material / direction ladder), objectives card, `story.ts` beats, `observations.ts` (Observation, Principle, Real-world limit) and `science-events.ts`.
- The old Chapter 1 "Lean-to shelter" blueprint (`shelter`, four spots) and its quests stay untouched. Chapter 2 adds its own kind (`leanTo`) on the same machinery, because the old one is a four-spot toy that Chapter 1 tests depend on.

## What is added
- **A. Resources.** One new item, `pole` (long straight dead sapling, two-hand carry, scattered through the forest). Flexible branches, bark, dry leaves (`leafLitter`), dry grass, twigs and cord already exist and are reused.
- **B. Frame.** `leanTo` blueprint with staged snap spots (`stage`): 1 uprights, 2 ridge, 3 ribs (the triangle), 4 cross-supports, 5 lashings (gesture spots), 6 small-branch lattice. Marks of a stage only open when the earlier stage is done; frame-complete event unlocks roofing. Lashing: tighten a cord at each joint with the Twist machine (two hands) or the mouse wheel; the wraps grow on the joint as you work.
- **C. Roof.** Stage 7: three roof panels, each with bark, dry leaves and grass layers. The mesh changes from bare frame to a layered shelter with an entrance and an interior.
- **D. Rain test.** `ShelterTest` (pure, saved) forces heavy rain for a limited time. A panel leaks when its layers protect less than the threshold (bark 0.45, leaves 0.35, grass 0.3, needs 0.8). Leaks show as drips and wet patches inside; placing the missing layer repairs it. Water runs downhill into the floor unless a drainage channel (stage 8, three dig marks touched with the digging stick, not consumed) is dug on the uphill side.
- **E. Progression.** Quests "A Place to Call Home", "The Foundation", "Build the Frame", "Roof Over Your Head", "Test Your Engineering" (level 4), hints, six Lab Notebook entries, new Science Roadmap nodes, completion XP, story beats for the evening.
- **F. Polish.** Interior (rest inside, darker light, muffled rain), drips and puddles, sounds, construction pop, tests, IWER screenshots.

## Persistence
Everything is derived from the structure's filled spots, `PlacedStructure.work` (lashing and digging progress) and a small saved `shelterTest` block, so leaving and returning never loses a stage. Old saves load without them.

## Budget
Shelter parts share geometries and materials (about 30 meshes at full build); drips and puddles are pooled; nothing allocates per frame.
