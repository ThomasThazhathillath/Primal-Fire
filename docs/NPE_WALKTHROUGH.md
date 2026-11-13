# Fresh-save walkthrough

## Simplicity round (Nov 13): the seven first steps

`scripts/npe-walkthrough.sh` on a wiped save (tutorial, Guided). The emulated right hand does the real thing for
every step but the walk: it aims the hand ray at the step's target (where the game's arrow is) and pinches, and it
pinches the Menu and Bag buttons where they hang. The walk into the ring uses the teleport hook. Times are from
pressing Play and include the script's own CLI latency (each ray aim takes a few correction moves, about 3 to 6 s).

| Step (the whole instruction on the card) | Done at | Took | Actions |
|---|---:|---:|---|
| 1 Pinch the glowing stone | 7.4 s | 7.4 s | aim, pinch |
| 2 Walk into the glowing ring | 10.4 s | 3.0 s | one teleport |
| 3 Pinch each glowing mark | 27.8 s | 17.4 s | three aims, three pinches (a stone from the bag on each) |
| 4 Pinch the flat stone | 35.2 s | 7.4 s | aim, pinch |
| 5 Put it on top | 45.0 s | 9.8 s | aim at the glowing top, pinch |
| 6 Tap the bag | 60.7 s | 15.7 s | pinch Menu, pinch Bag (the menu appears at this step) |
| 7 Pinch your workbench | 71.1 s | 10.4 s | aim, pinch |

Every step with a place showed its arrow and ring on the exact target (the bag step has none: the menu appears for it). The menu was
hidden until step 6. No objective card, no paragraphs: one line on one card, "Why?" for the how-to.

## Earlier run (NPE milestone F, the five-stage version)

Script: `scripts/npe-walkthrough.sh` (run against this checkout's own dev server and its managed IWER browser).
It wipes that browser's PRIMAL storage, starts a brand-new game (the tutorial, Guided mode) and plays the first
five stages. The first two pickups use the emulated right hand for real: hand-ray aim, then a pinch through the
whole input path (pick, lock, pickup). Teleport, turning, the pouch, gathering, building and crafting use the
debug hooks. Times are measured in the page from pressing Play.

**These are scripted timings.** They prove the flow runs end to end and show how few steps each stage needs.
They do not measure how long a first-time human takes; that needs a real player on a Quest.

## Result (Nov 12, branch `claude/npe-accessibility`)

| Spec task | Target | Scripted run | What the run shows |
|---|---|---:|---|
| Understand movement | under 1 min | 5.3 s | Stage 1 (look, teleport, turn) completes on the two moves it asks for. |
| First successful pickup | under 30 s | 10.7 s | Hand ray on a stone, one pinch: the aimed stone, once ("+1 Dry stone, in your pouch"). |
| Understand inventory | under 1 min | 19.6 s | Stage 3 (take out, put back) done; the menu appeared with it at 14.6 s. |
| Find workbench | under 2 min | 29.5 s | Workbench built in the build stage (scripted placement). |
| First crafting activity | under 5 min | 32.9 s | Cord and bow drill made at the bench (scripted, standing at it). |
| First discovery | (stage 5) | 35.6 s | Notebook opened; the objective card appears at 38.3 s once it is closed. |
| Understand next objective | immediately | yes, 3 of 3 | Every quest update leaves the card with an instruction and a next action, where or progress line. |

Order of reveal seen in the run: only the lesson card and hand sign at first, the menu once the pouch is
taught, the objective card after the first discovery.

## Help seen during scripted mistakes

While the script was being written it made real mistakes. The new assistance answered them:

- Stones dropped 26 cm off the workbench marks (`support.tooFar`): help rose to level 2 and level 3.
- All recipe parts in the bag but standing away from the bench: "bench" help level 1 (the bench pulses).
- Five "too heavy" failures in a row: the CARRY hand sign and the two-hands line (screenshot `shots-npe/c-help.jpg`).

## Regression

`scripts/story-check.mjs` (Chapter 1 story on a fresh survival save) runs through awake, clues, gathering, the
stream, the workbench, fire, camp and the teaser with no console errors. Chapter 2 and Phase 3 were not replayed
in the emulator; their unit tests pass.
