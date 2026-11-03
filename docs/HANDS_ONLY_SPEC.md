# Hands-only VR gameplay and interaction overhaul (spec)

Owner's brief for PRIMAL: First Fire on Meta Quest standalone, **hand tracking only**: no controllers,
no controller buttons/triggers, no keyboard-dependent gameplay. Preserve the existing architecture,
quests, inventory, crafting, science systems and progression. Don't redesign terrain, graphics,
lighting or weather. Don't rewrite the game or replace working systems without justification.

## Three interaction methods
- **A. Direct touch / tap** for all UI: icons, inventory, quest, notebook, menus, confirmations.
  The player taps an icon with the index fingertip. **UI clicks never use the pinch recogniser.**
- **B. Pinch** to pick up, grab tools, move, drag, position and hold objects.
- **C. Natural physical gestures**: release, throw, place, swing, hammer, chop, pull, twist, push,
  pour, fan, operate primitive tools. Hand movement is read as physical action, not a UI command.

## Bottom icon bar (replaces the large HUD buttons)
Small horizontal row along the bottom of the view; it must not block the centre. Small round icons,
consistent spacing, subtle/transparent background, no big text labels, clear symbols, a small active
indicator and hover feedback. Suggested: hand/interaction, satchel, build, craft, journal, quest,
map/navigation, settings. Show only actions relevant to the current state; don't duplicate interfaces.
Reachable with either hand without stretching (seated).

**Fingertip tap**: track the index tip, test its intersection with the icon's region, require an
intentional forward tap (fingertip position, finger direction, distance to the UI surface, forward
movement, touch/release state; passing near an icon must not click). After activation: short
cooldown, and the fingertip must leave the region before another activation. Visual states: normal,
approaching, touched, activated, disabled; brief animation on success; subtle click sound.

## Unified pinch
Thumb-index distance with **separate start/release thresholds (hysteresis)**; configurable; no
flicker. Grab: closest valid object near the pinch, natural grip offset, keep relative orientation,
no teleporting; follows the hand smoothly. Release on opening the pinch: restore physics, keep
velocity, fall naturally, detect ground contact. No release button.

**Two-handed grab** for large objects (logs, big branches, heavy stones, long tools): combined hand
positions, natural rotation, stable grip, no rotation jumps; releasing one hand leaves the other holding.

## Placement by lowering
Lower a held object onto a surface and open the pinch: a gentle release near a surface reduces
momentum, the object settles, plays a placement sound and keeps its world position. A fast release is
a throw/drop. Surfaces: ground, rocks, workbenches, construction surfaces, other objects. No floating,
no penetration. Construction parts keep the existing snap points, but snap naturally when brought near.

## Throwing
Velocity from a short rolling history of hand positions; on release transfer a controlled share,
scaled by mass; normal gravity and collision. Gentle release = drop; fast forward release = throw.
Clamp extreme velocities from tracking jumps or tracking loss.

## Tools (never "click to use")
- **Axe**: pinch the handle, correct grip, follows the hand, collides with wood; evaluate swing
  velocity, direction, impact point, tool orientation and suitability. A gentle touch does nothing;
  repeated good swings fell the tree.
- **Hammer**: swing down onto wedges, knapping stones, construction parts; impact from velocity/direction.
- **Knife**: slicing, drawing across material, scraping bark, cutting fibres (not tapping).
- **Bow drill**: one hand drives the bow, the other steadies the spindle; back-and-forth motion
  rotates it; pressure and continuous motion build heat. Not a held button.

## Movement
Keep the current pinch-and-hold teleport and thumb micro-gestures. Context-separate them from grabbing:
no accidental grab while moving, no accidental move while grabbing or holding, UI taps never trigger
locomotion, movement stops predictably when the gesture ends. Seated-first.

## Central hand-input interpretation (one place, once per frame)
- **Tracking**: palm, wrist, thumb/index/middle/ring/little tips, hand orientation (WebXR hand joints).
- **Pinch** with hysteresis. **Tap** for UI, distinct from pointing.
- **Velocity**: rolling history, linear velocity, acceleration, direction, swing strength, filtered.
- **Priority**: 1 object already held, 2 direct UI tap, 3 valid object grab, 4 movement gesture,
  5 other contextual gestures.
- **Tracking loss**: never launch held objects, no accidental release, no teleporting objects, pause
  gesture interpretation, recover smoothly.
Distribute the interpreted state to systems; don't compute complex gestures per object.

## Per object
Stone (grab, place, throw, strike another stone) · Branch (grab, rotate, drag, break by force or tool,
put in fire, attach in construction) · Log (two hands, lift, rotate, drag, place, position for
splitting) · Flint (hold one hand, strike with hammerstone in the other, flakes by impact) · Cord (grab
an end, bring round a part, pull to tighten, release to secure) · Fire (place tinder, add fuel, fan
with hand movement, carry embers) · Water container (grab, tilt, pour; angle and amount).
Forgiving thresholds and contextual recognition.

## Feedback
Grabbable highlight; smooth attach; settle + sound on placement; velocity-true throws; impact sound
and response on strikes; icon state change on tap; a short reason when an action is invalid.
No large floating instruction panels.

## Watch for
Pinch jitter, accidental grabs, accidental UI activation, teleporting objects, clipping through hands,
wrong hand orientation, rotation jumps, tracking loss, occlusion, two-hand conflicts, bad throw
velocity, UI taps triggering gameplay, gameplay gestures triggering UI. All thresholds configurable.

## Performance
Standalone Quest; hand data read once per frame; minimal per-frame allocation; no unnecessary physics.

## Acceptance tests (desktop IWER emulator with hands; Quest via the play-test log; never claim Quest
validation that wasn't done)
1. Direct UI: tap a bottom icon with the index tip, it activates, no pinch, no repeats.
2. Grab: pinch a stone, it follows, open fingers, it releases.
3. Place: lower a stone to the ground, open fingers, it settles; no place button.
4. Throw: back then forward swing, release, it flies the right way.
5. Axe: swings at a tree damage it; repeated good strikes chop it.
6. Hammer: strike a wedge; it responds to the impact.
7. Construction: carry a branch near a valid point, release, it snaps.
8. Two hands: grab a log with one, then the other, rotate, release one, still held.
9. Conflict: a tap activates UI without grabbing; a pinch on an object doesn't activate UI; no
   movement while holding.
10. Tracking loss: holding an object, lose tracking; no extreme velocity; safe recovery.

## Phases (each built, tested, fixed, then the next)
1. Fingertip UI tapping, bottom icon bar, visual feedback, cooldown.
2. Unified pinch, stable grab, natural release, placement.
3. Hand velocity, throwing, controlled momentum, collision-aware release.
4. Tool swinging, chopping, hammering, knapping.
5. Two-handed grabbing, physical construction, bow drill, pouring, fanning, contextual gestures.
6. Tracking-loss recovery, conflict resolution, performance, Quest testing.

After each phase: typecheck, unit tests, production build, browser tests, fix regressions, list the
remaining Quest hardware tests.

## Working notes for sessions
- Play-test log: the dev server writes `playtest.log` (git-ignored) with lines from the Quest and
  desktop, including a heartbeat with fps; `curl -sk -X POST "https://localhost:8081/__primal-cmd?c=reload"`
  reloads every open game page (dev only). The user plays on a Quest over Wi-Fi at the dev server.
- Play-test switches: `setEasyCarry(true)` in `src/index.ts` (no carry limits). Keep it on.
- Existing pieces to reuse: `src/systems/hand-input-system.ts` (hands[] with grip/velocity; grip
  comes from WebXR select/squeeze today, so joint-based pinch is new), `interaction-system.ts`,
  `carry-system.ts`, `craft-gesture-system.ts`, `bench-system.ts`, `hand-locomotion-system.ts`
  (pinch-hold teleport + micro-gestures), `hud-system.ts` + `public/ui/hud.uikitml` (current icon HUD),
  `shared.ts` StaticAnchor (non-drifting VR panels), `src/game/interact.ts` and `carry.ts` (pure rules).
