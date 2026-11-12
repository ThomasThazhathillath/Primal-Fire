# New player experience and accessibility: audit and plan

Spec: `docs/NPE_ACCESSIBILITY_SPEC.md`. Branch: `claude/npe-accessibility` (from main c075728).

## Evidence: the real Quest play-test log

`playtest.log` (main checkout), the `[QUEST]` lines only: 9,418 lines, 45 sessions ("woke up"), all with hand
tracking. Counted with the scripts in this note's history (grep + a small Python pass).

| Signal | Count | What it means |
|---|---:|---|
| `tap rejected` (all reasons) | 513 | Menu and card buttons refused a fingertip. |
| ... `pinching` | 228 | The player **pinched** a button (menu 165, bag 36, book 22, bench 14, objective 2). The tap rules refuse any pinching hand. |
| ... `notPointing` | 142 | Hand at the menu without the index-out pose (menu asks for a pointing hand). |
| ... `miss` / `slide` / `noApproach` | 36 / 32 / 29 | Poke landed beside the target, slid across it, or came in from the side. |
| `interaction failed: bench.wrongMotion` | 279 (+279 guide copies) | Bow-drill bench steps: wrong motion for `saw` (132), `press` (60), `scrape` (42), `twist` (41), `wrap` (4). Repeated, never escalated. |
| `gather ...: out of reach` | 118 | A pinch/ray landed on a spot beyond the 6 m reach (twig piles 33, leaf litter 20, branches 17, bark 16 ...). |
| `grab.tooHeavy` / `drag.tooHeavy` | 23 / 9 | One-hand pinch on a two-hand object. |
| `pockets full` | 20 | Gathering wet stones with full pockets. |
| `knap.*` failures | 51 | tooSoft 15, coreSpent 14, offEdge 12, badAngle 10. |
| `place.tooFar` | 4 | Rare: the snap/release radius is already generous. |
| `gathered` | 660 | Successful gathers: almost all by the **hand ray** (IWSDK `Pressed`) ... |
| `gaze take` / `gaze pickUp` | 4 / 1 | ... and almost none by gaze + pinch. |
| `hint N level M` | 11 | Hints are rarely asked for. |

Time from "woke up" to the first pickup (sessions longer than 30 s): median about 30 s, spread 0 s to 100 s;
several sessions never picked anything up in their first minutes. First workbench built after 139 s, 214 s and
312 s in the three sessions that got there quickly; one took over an hour.

## Section by section

### 1. Audit / friction (spec 1)

The friction the log shows, most frequent first:

1. **Pinching buttons.** Players use the gesture they just learned (pinch) on the menu and cards. 228 refusals.
2. **Bow-drill bench steps.** 279 wrong-motion failures with the same text each time; no escalation, no demo.
3. **Menu pose rule.** 142 refusals because the hand was not in a pointing pose.
4. **Out of reach.** 118 gathers refused because the ray landed on something more than 6 m away.
5. **Gaze + pinch is barely used.** 5 gaze actions against 660 ray gathers: the hand ray is what players actually
   use, so it is where target stability matters.
6. **Two-hand objects.** 32 "too heavy" failures with no visible hint that two hands are needed.

### 2. First five minutes (spec 2)

- **Exists:** "The First Steps" tutorial (`tutorial-lessons.ts`, `tutorial-system.ts`): 13 lessons (hands, look,
  gather, satchel, glide, move, place, build, craft, fire, hints, notebook, final), skippable per lesson or as a
  whole, progress saved under its own key, projected hand signs per lesson (`ghost-hand-system.ts`), a title
  menu with Play / Tutorial / New Game. A new player starts in the tutorial.
- **Missing:** the spec's stage order (wake and move, first pickup, satchel, first crafting, first discovery);
  a gradual reveal (the full HUD, icon bar and objective card are all up from the first second); a confirmation
  that says where a pickup went; skipping explanations of a mechanic already demonstrated.
- **Friction:** two cards at once on wake (the lesson card and the objective card say nearly the same thing);
  the movement lessons come after building; nothing stops the menu from appearing before the bag is taught.

### 3. Interaction reliability (spec 3)

- **Exists:** `GazeTargeter` (cone, per-kind reach, priority, hysteresis, exit grace, occlusion, a lock after a
  gaze action); `GazePinchGate` (debounce, settle after tracking loss); hand-ray aim assist in `ResourceSystem`
  (a missed pinch is resolved from the ray about 150 ms earlier); 0.55 m invisible hit spheres; gaze ring and
  name label; flight to the hip with a material sound.
- **Missing:** the hand-ray **press** itself is not locked: IWSDK fires `Pressed` on whatever the ray is on when
  the fingers close, and the ray swings during the pinch, while overlapping 0.55 m spheres let a neighbour win.
  No angle-first / distance-tie-break rule for the ray. Hit spheres are centred on the ground point (half of each
  sphere is underground). No "can / cannot collect" indicator before the pinch; no haptics; no pinch-press on UI.
- **Friction:** 118 out-of-reach gathers (the ray picks far things, the pinch then fails); 228 pinch refusals on
  buttons.

### 4. Contextual assistance (spec 4)

- **Exists:** four hint levels per objective (text, resource pulse, sky pillar, exact ring + arrow); `Adaptive`
  strain per channel (placement snap, tap size, knap edge) that grows with misses; `MessageGate` contextual card
  lines; failure toasts explained on the objective card.
- **Missing:** detection of struggling across situations (looking at a stone without collecting it, the same
  failure repeated, idle with no progress, materials ready but the bench not found), a configurable delay, and the
  cue, instruction, explicit ladder that ends on success.
- **Friction:** the bench wrong-motion loop (279) and too-heavy loop (32) repeat the same line forever.

### 5. Interaction complexity (spec 5)

Category A (pickups) is one pinch already. Category B (placement) has generous snap and a magnet. Category C
(bow drill, lashing, knapping) is where the failures are: they need progressive help, not easier rules.

### 6. Objectives (spec 6)

- **Exists:** the objective card shows title, instruction, progress "n / m", substeps, where to look, next step
  ("You have everything for ..."), feedback on failure, a celebration with sound; light pillar and ground glow
  via hint levels.
- **Missing:** an always-present "Next:" action line, a parts list for every objective that needs items, and a
  quiet "camp is that way" indicator.

### 7. Construction (spec 7)

- **Exists:** ghost outlines, glowing marks, a magnet, snap verdicts with reasons, an adaptive indicator (pulse,
  then arrow), lashing gesture and progress.
- **Missing:** the arrow only appears from adaptive strain level 3; the struggle ladder should bring it earlier
  in Guided mode.

### 8. Modes (spec 8) and 11. Accessibility (spec 11)

- **Exists:** nothing selectable. Tolerances are constants; text size is fixed; hints are on demand only.
- **Missing:** Guided / Standard / Explorer, text size, hint frequency, guidance visibility, interaction
  sensitivity, seated assist, a Settings card, persistence, switching without restart.

### 9. Navigation (spec 9)

- **Exists:** `directions.ts` ("about 10 metres ahead to your left"), story camp marker, pillar.
- **Missing:** a compass and a camp direction indicator.

### 10. Rewards (spec 10)

Celebrations, XP toasts, notebook entries and story beats exist. First-time moments (first pickup, first craft,
first fire) get a small confirmation in milestone B.

### 12. Testing (spec 12)

719 unit tests exist (63 files). New tests per milestone below; a scripted fresh-save walkthrough with timings in F.

## Plan

Each milestone is committed with typecheck and tests passing before the next.

### A. Interaction reliability

1. `gaze.ts`: one pure picker for both gaze and the hand ray, `pickByRay`: angle to the ray first, distance as the
   tie-break when two targets are within a few degrees, and a target directly behind a nearer one never wins.
   `GazeTargeter` uses the same rule for challengers.
2. `PinchLock` (pure, in `gaze.ts`): remembers the last **stable** target (held at least 80 ms) and, at pinch
   start, returns that one instead of whatever the swinging ray is on. Held until release.
3. `ResourceSystem`: a hand-ray `Pressed` is redirected to the locked target; out-of-reach targets are not
   offered when an in-reach one is in the cone; hit spheres sit above the ground and shrink where spots crowd
   together, so neighbours never swallow each other.
4. `TOLERANCE` config (sensitivity, pickup radius, gaze cone) read by both systems, set by milestone E.
5. Feedback: the gaze label shows the verb ("Pinch to pick up", "Step closer", "Pockets full", "Needs two
   hands"), a short "+1 Dry stone, in your pouch" after a pickup, and a haptic pulse where the platform has one.
6. `PanelTouch` pinch-press: a pinch that starts **on** a button presses it (the 228 refusals), still never
   from a resting hand.

### B. First five minutes

Reorder the lessons into the spec's five stages (wake and move, first pickup, satchel, first crafting at the
workbench, first discovery in the notebook), keep the rest as later lessons, migrate saved progress by lesson
id, reveal the HUD gradually (lesson card only, then the bag icon at the satchel stage, then the objective
card), the spec's opening line, a pickup confirmation that says where things went, and skip a lesson's
explanation when the player has already done all of its tasks.

### C. Progressive assistance

`StruggleTracker` in `adaptive.ts` (no second hint system): situations (gaze dwell without a pickup, a repeated
failure code, idle without progress, materials ready but no bench), a configurable delay, levels cue,
instruction, explicit (with the matching hand sign), cleared on success. An `AssistanceSystem` at 4 Hz feeds it
and shows the result through the existing channels (gaze ring, objective card line, hand sign, hint glow).

### D. Objective card and navigation

An always-present "Next:" line and a parts list on the card, and a slim compass tape above the card with the
camp and the current destination marked, redrawn only when the heading changes.

### E. Modes and accessibility

`settings.ts`: mode (Guided default for a new save, Standard for an existing one, Explorer), text size, hint
frequency, guidance visibility, interaction sensitivity, seated assist; saved in localStorage under its own key
(never inside the game save, so old saves load unchanged). A Settings card from the pause card and the title
menu. Every option applies at once.

### F. Tests, walkthrough, docs

Unit tests for every item in spec 12, a scripted fresh-save walkthrough in IWER with timings against the spec's
targets, README and PROJECT_STATUS updates, and a list of what needs a real Quest.

## Status (Nov 12)

| Milestone | Commit | Done | Not done / limits |
|---|---|---|---|
| A Interaction reliability | 70741f7 | `pickByRay` (angle first, distance tie-break, nothing behind a nearer target, in reach first), `PinchLock` per hand (stable target locked when the fingers close, one pinch one pickup), gaze tie-break and no switching to a target behind, pickup label with can/cannot ("pinch to take", "step closer", "pockets full", "hands full"), "+1 Dry stone, in your pouch", controller haptics, pinch-press on buttons (commits on release, never during a scroll), a menu pinch never also gathers | Hit spheres left at their size (the lock and picker stop them from swallowing neighbours); teleport destination forgiveness not changed |
| B First five minutes | c5d534d | Lessons in the spec's stage order, the spec's opening line, gradual reveal (lesson card, then menu at the pouch, then the objective card after the first discovery), first-pickup confirmation, lessons already shown are passed, progress saved by lesson id with skills, old saves migrated | The workbench stage still builds the bench in the tutorial camp (no walk to a separate bench) |
| C Progressive assistance | b9921f5 | `StruggleTracker` (looking without taking, repeated failures, idle, unused bench), cue / instruction / explicit with the hand sign and the pillar over an unused bench, cleared on success, configurable delay; bench near-miss tolerance after repeated wrong motions | Science-experiment hints ("what can be investigated") were not added beyond the existing objective hints |
| D Objective card and navigation | 0e0e4c7 | "Next:" line and "Look for:" line on the card; the card's contextual lines now render (they never did before); compass tape with camp and goal, edge arrows; desktop strip | No new landmarks; resource placement unchanged |
| E Modes and accessibility | bf7bbe4 | Guided / Standard / Explorer, text size, hint frequency, guidance markers, sensitivity, seated assist; Settings card from pause and title; persisted; applied live | Text size scales whole anchored cards, not fonts inside them |
| F Tests, walkthrough, docs | this commit | 38 new unit tests (npe-*.test.ts), `scripts/npe-walkthrough.sh` with timings (docs/NPE_WALKTHROUGH.md), Chapter 1 story regression, README and PROJECT_STATUS | Human first-time timings need a real player |

### Performance

New per-frame work: the hand-ray pick and lock for both hands, about 22 microseconds per frame on the dev Mac
with 160 candidates (a micro-benchmark of `pickByRay` + `PinchLock`); the Quest's CPU is several times slower, so
expect roughly 0.1 ms. Pinch-press is a handful of comparisons per open panel. The assistance check runs four
times a second, the compass redraws only when the heading moves 3 degrees or you move half a metre, and the
candidate list is rebuilt four times a second. The compass adds one draw call in VR; the assistance pulse uses
the existing highlight pool. Not measured on a Quest.

### Needs checking on a real Quest

1. Hand-ray pickups: does the lock pick the stone you meant when pinching fast at clustered stones? Watch the
   log for `gather lock: a -> b` lines (the redirects) and for any wrong pickups.
2. Pinch-press on buttons: presses on purpose, no presses while resting a pinching hand near the menu, and pinch
   scrolling of the bag and book still scrolls (the press must cancel after 3 cm of travel).
3. The pickup label and "+1 ... in your pouch" note: readable, not in the way.
4. The gradual reveal: is the menu missed before the pouch stage? Is the lesson card enough on its own?
5. Struggle help timings (Guided defaults): does help come too soon or too late? `assist ... level N` lines in
   the log show when it fired.
6. Bench near-miss forgiveness: does a struggling player finish the bow-drill steps (the Quest log had 279
   wrong-motion refusals)?
7. Compass tape: visible but not distracting, above the cards and below the Pause button.
8. Settings card: every button reachable and pressable by fingertip and pinch; Large text keeps cards on screen.
9. Seated assist: the 25% longer reach feels right from a chair.
10. Controller haptics (hands have none).
11. Frame time with all of the above on (the Quest perf overlay).
