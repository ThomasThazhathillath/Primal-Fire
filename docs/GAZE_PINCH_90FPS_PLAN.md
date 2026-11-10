# Gaze + Pinch and 90 fps — implementation plan

Spec: `docs/GAZE_PINCH_90FPS_SPEC.md`. Engine: Three.js/WebXR on IWSDK (no Unity).

## What already exists (kept, not replaced)

- `HandInputSystem` (-6): joint pinch with hysteresis, release hold and tracking-loss freeze (`game/pinch.ts`).
- `PinchGrabSystem` (-5.5): near direct grab within 16 cm of the pinch point. Highest priority after "held".
- IWSDK pointer rays (hand/controller/mouse) give `Hovered`/`Pressed` on `RayInteractable` resources, drops,
  snap spots and structure parts; `ResourceSystem`, `DropSystem`, `BuildSystem`, `InteractionSystem` react to them.
- `HighlightSystem` (ray-hover ring + label, 5 Hz), `handClaims` + `game/priority.ts` (held > UI > grab > move).

## Gaze infrastructure (priority 1)

- `src/game/gaze.ts` (pure, tested): `GazeTargeter` — cone scoring over a short candidate list
  (angular distance minus angular size, distance and kind priority), max distance per kind, an occlusion callback
  run only for the winner/challenger, and hysteresis (keep cone wider than the enter cone, a challenger must beat
  the current target by a margin for a dwell time, a short exit grace). `GazePinchGate` — per-hand start/hold/
  release with debounce, one activation per pinch, a settle time after tracking returns. `gazeAction()` — the one
  decision table: what a pinch on the gaze target does given held item, target kind and who owns the pinch.
- `src/systems/gaze-target-system.ts` (-5.2, after the near grab, before IWSDK input):
  - Gaze source: WebXR `targetRayMode: "gaze"` input source (eye gaze, requested as the optional IWSDK
    `gazeTracking` feature) → head pose fallback → desktop mouse ray.
  - Candidates rebuilt at 10 Hz within 8 m (resources, drops, open marks, finished workbench, fire pit with a
    useful held item); per frame only the short list is scored. Occlusion: XZ segment sampled against the static
    collision grid (trees, boulders, ruins walls), only for the winner.
  - Feedback: one pooled ring sized to the target, eased in/out, plus a small label after a short dwell
    (marks: needed material + whether the held item fits, green/red).

## Gameplay integration (priority 2)

Pinch start on either hand, when nothing above it owns the pinch:
held object hand → UI tap → near direct grab (PinchGrab) → **ray hover owns it** (IWSDK path) → gaze.
Actions reuse game APIs: `tryGather` + pouch take-out (resource), `pickUpDrop`, `fillFromBag` (mark, empty hand),
`fillSpot`/`placeKey` (mark accepting the held part), `openBench` (finished workbench), `runIntent` (fire pit).
The grabbed thing then follows the existing carry/hand attachment; release goes through CarrySystem unchanged.

## Compatibility (priority 3)

Head-gaze fallback when no eye gaze; direct hand grab unchanged and first; controller rays untouched (they own the
pinch when hovering); desktop: mouse ray as gaze source, a click (press+release, <6 px) acts only when no ray
target is hovered and no hand interaction captures the pointer.

## Tutorial

One short LOOK AND PINCH lesson inserted after `hands`, in an isolated block of `tutorial-lessons.ts`
(the story branch edits the same area; keep the diff small).

## Performance (priority 4)

Measure first (`docs/PERF_REPORT.md`): draw calls, triangles, CPU frame time, GPU timer query where available,
JS heap, spikes, per scenario. Then fix the measured bottlenecks only. Fixed foveation via
`renderer.xr.setFoveation`, `updateTargetFrameRate(90)` only when `supportedFrameRates` includes 90.
Dev-only overlay (`?perf` or `window.__perf.overlay()`), never shown to players by default.

## Validation (priority 5)

Unit tests for targeter/pinch gate/action table; IWER runs with the Quest 3 profile (head gaze) and the
Meta VR Glasses profile (eye gaze); typecheck, `npm test`, `npm run build`. Quest 90 fps verification is the
user's step: desktop numbers are reported as desktop numbers.
