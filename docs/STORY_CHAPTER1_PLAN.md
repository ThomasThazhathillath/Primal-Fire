# Chapter 1 story — implementation plan

Spec: `docs/STORY_CHAPTER1_SPEC.md`. Theme: *everything we built has gone, the knowledge to build it again remains.*
Arc: Confusion → Curiosity → Discovery → Ingenuity → Achievement → Belonging.

## Narrative structure (acts → existing gameplay)

| Act | Opens on (real state) | Gameplay it frames (existing objectives) | Closes on |
| --- | --- | --- | --- |
| 1 A Strange Place | new game "Wake up" | look around the Waking Clearing, clues | first gather |
| 2 First Signs of Life | first gather | stones, grass, twigs, fibres, stream, meadow | 4 kinds of things gathered → "the light won't last" |
| 3 Something To Build Upon | `flatStone`/`workbench` objective current, or a workbench outline | slab + 3 stones, blueprint | workbench complete |
| 4 First Fire | workbench complete | fire pit, tinder, bow drill, ember, fan | `fireLit` |
| 5 A Place To Return To | fire lit | fire pit + workbench within 8 m, satchel | camp established → camp marker |
| Teaser | camp established + player looks towards the mast | — | "Someone was here before me." |

No objective is added or reordered: the story is a layer over `objectives.ts` / `quests.ts` (their tests and old saves stay valid).

## Technical design

- `src/game/story.ts` — **data + tracker, no rendering**. `STORY_BEATS`: id, act, lines, trigger. Triggers are pure functions of
  `Game` state or of a `GameEvent` (gather, discovered, fire stage, structure, objective), never timers. `StoryTracker`
  lives on `Game` (like `ObjectiveTracker`), fires each beat once, emits `{type:'thought'}` and `{type:'act'}` events, and
  keeps the camp position and Lab Notebook context notes.
- Persistence: `SaveData.story?` (optional → `v:1` key `primal-first-fire.save.v1` unchanged). **Migration**: a save without
  `story` marks as already seen every beat whose state is already true (no replay of the awakening for a player who has a
  workbench, etc.); a camp is inferred from existing fire pit + workbench.
- `src/systems/story-system.ts` — speaks queued thoughts one at a time through the HUD toast line (already in the
  comfortable view, small, auto-fading; no new panel). **Skip**: desktop `T`, VR the existing Story icon (survival only;
  the opening keeps its own), both skip the current line and drop the queue; a second press mutes thoughts (saved).
  Also: awakening fade-in (camera-attached dark shell, 3.5 s), environmental clues, camp marker, mast glint.
- Fire moment (`fire-system.ts`): the first ignition ramps the flame/light/smoke from ember to full over ~10 s instead of
  snapping, with extra sparks; later fires keep the normal behaviour. Night ambience and the darkening sky are already
  driven by the environment clock; the story does **not** force night.
- Lab Notebook (`hud-system.ts`): an optional short context line (where/why) on the card eyebrow; Observation → Principle →
  Real-world limit untouched.

## Environmental storytelling (existing low-poly materials, procedural, no new models/NPCs)

- Old fire remains: a broken ring of grey stones with charcoal bits, east of the waking spot.
- Unnaturally arranged stones: a short straight line of five stones.
- A used branch: a stripped, worn stick leaning on a stone near the remains.
- Distant structure: the existing rusted mast at the Ruins; after the camp a slow, faint glint near its top (no head turn).
Proximity beats fire a thought the first time you walk up to each clue.

## Dependencies / risks

- Reuses: HUD toast, Story icon, `AudioSystem` chimes, fire FX, environment clock, `whereLandmark`.
- No shelter (not supported) — the camp is fire pit + workbench + satchel.
- Not covered: voice narration (text only, by design).
