# PRIMAL: FIRST FIRE
# DEVELOPMENT PROMPT — NEW PLAYER EXPERIENCE (NPE) & ACCESSIBILITY OVERHAUL

Repository: https://github.com/ThomasThazhathillath/Primal-Fire

## PRIMARY OBJECTIVE

Improve PRIMAL's overall playability, onboarding, interaction reliability and progression clarity.

The current game has substantial gameplay systems, including resource gathering, crafting, fire-making, water purification, shelter construction, farming, fishing, hunting and scientific discoveries.

However, the experience is still too difficult and slow for someone playing for the first time.

A newcomer should not have to struggle to understand basic interactions or spend excessive time figuring out what to do next.

The goal is to make PRIMAL intuitive, welcoming and enjoyable without sacrificing its defining feature: hands-first physical VR gameplay.

**Core philosophy: Make the controls easy, the objectives clear and the science rewarding.**

Do not remove interesting physical interactions simply to make the game easier. Instead, improve how players discover and perform them.

---

# 1. FIRST: AUDIT THE EXISTING GAME

Before implementing anything:

1. Read README.md.
2. Read docs/DESIGN.md.
3. Read docs/PROJECT_STATUS.md.
4. Inspect the existing tutorial and First Steps experience.
5. Inspect gaze-and-pinch interaction implementation.
6. Inspect resource gathering and hand-ray targeting.
7. Inspect inventory and satchel interactions.
8. Inspect the quest and hint systems.
9. Inspect blueprint placement and construction interactions.
10. Inspect existing HUD and contextual guidance.

Identify the actual sources of friction.

Pay particular attention to:
- Hand-ray instability during pinching.
- Small collectible objects being difficult to target.
- Unclear interaction feedback.
- Excessive steps required for basic activities.
- Quest objectives that do not clearly explain the next action.
- Long distances between resources and crafting locations.
- Repeated failed interactions.

Do not create duplicate systems.

Extend existing systems and preserve all existing functionality.

# 2. OVERHAUL THE FIRST FIVE MINUTES

The first five minutes should introduce the player to the game gradually.

Do not overwhelm the player with every gameplay mechanic at once.

Create a guided introduction.

## Stage 1 — Wake Up

The player begins in a welcoming forest clearing.

Introduce a short narrative:

"You awaken in an unfamiliar wilderness. Everything you need to survive must be discovered."

Show only essential controls.

Teach:
- Looking around.
- Basic movement.
- How to interact with objects.

Do not immediately display the entire HUD or all quest systems.

## Stage 2 — First Interaction

Place a few clearly visible stones and sticks near the player.

Introduce a simple instruction:

"Look at a stone and pinch to pick it up."

Once the player successfully collects an item:
- Play a satisfying sound.
- Show a brief visual confirmation.
- Update the inventory indicator.
- Explain where collected objects are stored.

Do not advance until the player has successfully demonstrated the interaction, unless they choose to skip the tutorial.

## Stage 3 — Inventory and Satchel

Introduce the existing hip-mounted satchel.

Teach:
- Where it is located.
- How to access it.
- How collected resources are stored.
- How to retrieve an object.

Use a simple visual demonstration.

Avoid lengthy text explanations.

## Stage 4 — First Crafting Activity

Guide the player toward the existing workbench.

Introduce one simple crafting activity.

Explain:
- Required resources.
- Where to find them.
- How to place them.
- How to complete crafting.

## Stage 5 — First Discovery

After completing the first activity, introduce the Lab Notebook.

Explain that PRIMAL is not just about survival. It is about discovering the science behind survival.

Allow the player to explore independently.

IMPORTANT:

The tutorial should be progressive, interactive and skippable.

Once the player demonstrates understanding of a mechanic, do not repeatedly explain it.

Persist tutorial completion in the existing save system.

---

# 3. UNIVERSAL INTERACTION IMPROVEMENTS

This is the highest-priority technical task.

Basic interactions must feel reliable.

## A. Stabilize gaze-and-pinch interactions

Investigate the existing hand-ray instability during pinching.

When the player begins a pinch:

- Capture the last stable interaction target.
- Avoid recalculating the target from unstable hand positions during the initial grab.
- Maintain a stable interaction reference until the action is resolved.
- Prevent sudden target switching.
- Release the target cleanly when the gesture ends.

Do not allow the ray to jump between nearby objects during a pinch.

## B. Increase interaction forgiveness

Introduce configurable interaction tolerances.

Examples:

- Larger hitboxes for small stones.
- More forgiving pickup radii.
- Improved targeting for thin branches.
- Slightly expanded snap zones.
- Better detection of objects close to the ground.

The visual size of an object and its interaction collider do not need to be identical.

However, colliders must remain consistent with the visible object.

## C. Nearest-target assistance

When multiple collectible objects overlap or are close together:

- Identify valid interaction targets.
- Prioritize the object closest to the gaze direction.
- Use distance as a secondary selection factor.
- Avoid selecting objects behind the intended target.
- Keep selection stable during the gesture.

Never randomly select an object.

## D. Clear interaction feedback

When looking at a collectible object:

- Show a subtle outline.
- Display its name.
- Show a pickup indicator.
- Indicate whether it can be collected.

When the player successfully picks it up:

- Play a contextual sound.
- Show a small collection animation.
- Update the inventory immediately.
- Provide subtle haptic feedback if supported by the existing platform implementation.

Do not use excessive visual effects.

---

# 4. CONTEXTUAL ASSISTANCE SYSTEM

The existing hint system should become more proactive.

Introduce an intelligent contextual assistance layer.

The system should recognize when the player is struggling.

Examples:

### Resource collection

If the player repeatedly looks at a stone without successfully collecting it:

Display:

"Pinch to pick up."

### Construction

If the player holds a branch near an incorrect location:

Display a subtle placement indicator showing the correct direction.

### Crafting

If the player has all required materials but has not discovered the workbench:

Highlight the workbench subtly.

### Quest progression

If the player remains inactive or makes no progress for a reasonable period:

Offer a short suggestion.

### Scientific discoveries

If the player encounters a new experiment:

Explain what can be investigated without immediately revealing the answer.

## Assistance behaviour

Implement progressive assistance:

1. First attempt: subtle visual cue.
2. Repeated failure: short contextual instruction.
3. Continued difficulty: more explicit guidance.
4. Successful interaction: remove the guidance.

Avoid constantly displaying tutorials.

Assistance should be helpful, not intrusive.

Use configurable delays rather than hardcoding every situation.

---

# 5. REDUCE UNNECESSARY INTERACTION COMPLEXITY

Classify gameplay interactions into three categories.

## Category A — Simple interactions

Examples:
- Collecting stones.
- Picking up sticks.
- Collecting berries.
- Gathering leaves.
- Collecting seeds.

These should generally require one reliable pinch interaction.

Avoid unnecessary secondary confirmations.

## Category B — Intermediate interactions

Examples:
- Placing branches.
- Positioning construction materials.
- Retrieving crafting ingredients.
- Organizing resources.

Use simple physical placement with generous snap assistance.

## Category C — Advanced interactions

Examples:
- Bow-drill fire making.
- Rope lashing.
- Shelter construction.
- Scientific experiments.
- Tool manufacturing.

Preserve the physical interaction mechanics.

However:
- Provide clear visual instructions.
- Improve tolerance.
- Show progress.
- Prevent repeated failure caused by overly precise gestures.

The player should spend time learning meaningful mechanics rather than fighting the controls.

---

# 6. IMPROVE QUEST AND OBJECTIVE PRESENTATION

The player must always understand their current objective.

Improve the existing quest HUD.

Every active objective should communicate:

1. What needs to be done.
2. What resources are required.
3. How much progress has been made.
4. What the next action is.

For example:

OBJECTIVE: Collect stones

Progress: 2/5

Instruction: Look at a stone and pinch to collect.

When the objective is completed:
- Show a small completion animation.
- Play a success sound.
- Update the quest automatically.
- Introduce the next objective.

Avoid making the player repeatedly open the quest menu.

## Visual guidance

Extend the existing light-pillar and ground-glow systems.

Use them selectively to indicate:
- Nearby resource locations.
- Quest destinations.
- Workbench locations.
- Construction areas.
- Important discoveries.

Do not turn the entire environment into a collection of glowing markers.

Preserve environmental immersion.

---

# 7. CONSTRUCTION GUIDANCE IMPROVEMENTS

Shelter construction and other blueprint-based activities should be easier to understand.

Improve the existing construction system.

When the player holds a construction component:

- Highlight valid placement locations.
- Display a ghost preview.
- Show the correct orientation.
- Indicate when the component is correctly aligned.
- Assist with snap placement.
- Display a clear error explanation when placement is invalid.

For rope lashing:

- Highlight the two poles that need connecting.
- Show the rope's intended wrapping area.
- Provide a simple gesture illustration.
- Display tightening progress.
- Communicate successful completion.

Allow the player to recover from incorrect placements without restarting the entire construction stage.

Preserve the physical nature of construction.

---

# 8. ADAPTIVE ASSISTANCE MODES

Introduce three optional assistance settings.

## GUIDED MODE

Default for first-time players.

- More visible interaction indicators.
- Generous pickup and snap tolerances.
- Automatic contextual hints.
- More visible objective guidance.
- Additional construction assistance.
- Shorter resource-gathering distances in early objectives.

## STANDARD MODE

- Existing intended gameplay.
- Moderate assistance.
- Normal interaction tolerances.
- Contextual hints when needed.

## EXPLORER MODE

- Minimal visual guidance.
- Fewer automatic hints.
- More independent exploration.
- Less construction assistance.

Important:

These modes should change assistance, not remove scientific learning or automatically complete quests.

Allow players to change the mode through settings.

Do not force players to restart the game when changing modes.

---

# 9. IMPROVE WORLD NAVIGATION

The player should not become lost or spend excessive time travelling between basic objectives.

Introduce:

- A subtle compass.
- Campsite direction indicator.
- Clear environmental landmarks.
- More forgiving teleport destination selection.
- Better early-game resource placement.
- Clearer quest destination guidance.

For early chapters, keep important resource locations reasonably close to the campsite.

Avoid unnecessary backtracking.

The player should still be able to explore freely.

Do not place markers on every collectible resource.

---

# 10. MAKE PROGRESS FEEL FASTER AND MORE REWARDING

The early game currently risks feeling slow.

Introduce more frequent small rewards.

Examples:

- First successful pickup.
- First completed crafting activity.
- First successful fire.
- First scientific discovery.
- First completed shelter component.
- First completed shelter.

Use brief feedback:
- Sound.
- Animation.
- Small XP notification.
- Lab Notebook discovery.
- Quest completion indicator.

Avoid long animations and excessive congratulatory messages.

The player should feel continuous progress.

Review the number of resources required for early crafting activities.

Common survival resources should be abundant enough to avoid repetitive searching.

Do not remove resource requirements altogether.

---

# 11. ACCESSIBILITY AND COMFORT

PRIMAL must remain comfortable for different types of VR players.

Review:

- Seated interaction reach.
- UI positioning.
- Text readability.
- Interaction distances.
- Teleportation comfort.
- Hand-tracking reliability.
- Visual clutter.
- Audio feedback.

Add configurable options where appropriate:

- Text size.
- Hint frequency.
- Guidance visibility.
- Interaction sensitivity.
- Seated interaction assistance.

Avoid requiring excessive stretching or awkward wrist positions.

Preserve hands-only interaction.

Maintain desktop mouse and keyboard support for development and testing.

---

# 12. TESTING AND MEASUREMENT

Introduce a first-time-player evaluation checklist.

Use a fresh save and verify the following:

| Task | Proposed target |
|---|---|
| Understand movement | Under 1 minute |
| First successful pickup | Under 30 seconds |
| Understand inventory | Under 1 minute |
| Find workbench | Under 2 minutes |
| Complete first crafting activity | Under 5 minutes |
| Understand next objective | Immediately after quest update |

These are design targets, not guaranteed results.

Add automated tests for:

- Stable target selection.
- Pinch interaction state.
- Pickup tolerance.
- Inventory updates.
- Contextual assistance triggers.
- Quest progression.
- Tutorial persistence.
- Assistance mode switching.
- Construction placement.
- Save and reload.

Run the existing test suite.

Do not introduce regressions in Chapter 1 or Chapter 2.

---

# 13. DEVELOPMENT MILESTONES

Implement in this order.

MILESTONE A — Interaction Reliability
- Stabilize gaze-and-pinch.
- Improve pickup hitboxes.
- Implement nearest-target assistance.
- Improve feedback.
- Fix failed collection interactions.

MILESTONE B — First-Time Tutorial
- Rework first five minutes.
- Introduce gradual mechanic discovery.
- Teach inventory and crafting.
- Persist tutorial completion.

MILESTONE C — Contextual Assistance
- Detect repeated failed interactions.
- Introduce progressive guidance.
- Add construction assistance.
- Remove hints after successful learning.

MILESTONE D — Objective and Navigation
- Improve quest HUD.
- Improve progress indicators.
- Extend existing visual guidance.
- Improve navigation.

MILESTONE E — Adaptive Assistance
- Guided mode.
- Standard mode.
- Explorer mode.
- Accessibility settings.

MILESTONE F — Testing and Polish
- Automated tests.
- Fresh-save walkthrough.
- Desktop validation.
- Emulator validation.
- Performance review.
- Documentation updates.

Do not attempt all milestones as one enormous implementation.

Complete and validate each milestone before proceeding.

---

# 14. IMPORTANT DEVELOPMENT CONSTRAINTS

- Do not rewrite the existing game architecture.
- Do not remove existing gameplay mechanics.
- Do not simplify the game by removing physical interactions.
- Do not create duplicate tutorial, hint or interaction systems.
- Do not introduce unnecessary HUD elements.
- Do not make every object glow.
- Do not make every action automatic.
- Do not automatically complete quests for the player.
- Do not make scientific discoveries trivial.
- Do not sacrifice performance for visual effects.
- Preserve the existing save format and support older saves.
- Preserve all existing Chapter 1 and Chapter 2 functionality.

Prioritize usability improvements over adding new content.

Since physical Quest testing is not currently available, clearly document all features that require real-device verification.

---

# 15. DEFINITION OF DONE

The overhaul is complete when:

1. A new player can understand basic movement and interactions.
2. Small resources can be picked up reliably.
3. Gaze-and-pinch interactions no longer suffer from frequent target instability.
4. The satchel is easy to understand and use.
5. The first crafting activity is straightforward.
6. The player always understands their active objective.
7. Repeated interaction failures trigger useful assistance.
8. Construction is easier to understand without losing physical gameplay.
9. Players can select their preferred assistance level.
10. The early game feels faster and more rewarding.
11. Existing scientific learning remains intact.
12. All previous chapters continue functioning.
13. Save and reload preserve tutorial and assistance settings.
14. The game works correctly in desktop development mode.
15. New systems are tested and documented.

# FINAL DESIGN DIRECTION

PRIMAL should be a game that someone with absolutely no VR experience can pick up and start enjoying.

The first-time player should feel guided, not confused.

The experienced player should feel free, not restricted.

The scientific experiments should remain interesting and challenging.

The physical interactions should feel natural and satisfying.

Remember:

**Difficulty should come from understanding nature and solving engineering problems, not from struggling to operate the game.**

Build the experience around that principle.
