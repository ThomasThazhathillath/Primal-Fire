# Fresh-save walkthrough (NPE milestone F)

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
