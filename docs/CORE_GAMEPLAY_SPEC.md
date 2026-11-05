# Priority 1: core gameplay overhaul (owner brief, verbatim)

PRIMAL: FIRST FIRE — PRIORITY 1 COMPLETE CORE GAMEPLAY OVERHAUL
ROLE
Act as a senior VR gameplay engineer, interaction designer, game systems architect and survival-game developer.
You are working directly inside the existing PRIMAL: First Fire repository.
Your responsibility is to significantly improve the core gameplay experience and make the game accessible, intuitive and satisfying for completely new players.
This is a development task. You must implement actual improvements in the repository, not merely produce suggestions or mockups.
The game is built using the existing Three.js, Meta Immersive Web SDK (IWSDK), WebXR and JavaScript architecture.
The target platform is standalone Meta Quest using HAND TRACKING ONLY.
No controllers should be required for any essential gameplay interaction.
Before changing anything, inspect:

* Existing quest and objective systems.
* Quest progression and prerequisite logic.
* Current floating objective card.
* Hint system.
* Inventory and satchel.
* Hand-tracking implementation.
* Pinch and direct-touch interactions.
* Object grabbing and releasing.
* Object physics.
* Tree and resource interaction.
* Existing crafting mechanics.
* Workbench blueprint and snap-point system.
* Save/load functionality.
* Lab Notebook and Science Roadmap.

Run the existing tests, typecheck and production build.
Identify which features are complete, partially implemented or missing.
Do not assume the documentation accurately describes the current implementation.
IMPORTANT:
Do not rewrite the entire game.
Preserve existing working systems.
Extend the current architecture rather than creating duplicate systems.
Do not introduce unnecessary dependencies.
Do not remove existing quests, science discoveries, XP or progression.
The current problem is that new players see several quests simultaneously and do not know what they should do first.
Replace this experience with a clear sequential progression system.
The player should only have ONE primary objective at a time during the initial survival tutorial.
The player should understand:

1. What they need to do.
2. What object they need.
3. What that object looks like.
4. How to interact with it.
5. Why they need it.
6. What happens after completing the task.

INITIAL GAMEPLAY SEQUENCE:
OBJECTIVE 1 — FIND YOUR FIRST STONE
Instruction:
"Look around the forest floor. Find a small stone and pick it up."
Display:

* One reference image of a suitable stone.
* A short explanation.
* Progress: 0/1.

Teach:

* Approaching objects.
* Identifying resources.
* Pinching to grab.

Completion:
Player collects one valid stone.
OBJECTIVE 2 — GATHER THREE MORE STONES
Instruction:
"Find three additional stones. You will need them to build your first workbench."
Display:

* Image showing three suitable stones.
* Progress: 0/3.

Teach:

* Resource collection.
* Satchel storage.
* Resource requirements.

OBJECTIVE 3 — FIND A FLAT STONE
Instruction:
"Look for a broad, relatively flat stone that can serve as the surface of your workbench."
Display:

* A clear reference image.
* A short explanation of what makes it suitable.

Teach:

* Recognising different resource types.
* Identifying useful material characteristics.

OBJECTIVE 4 — BUILD YOUR FIRST WORKBENCH
Instruction:
"Position your supporting stones and place the flat stone on top."
Break this into substeps:

1. Find a suitable building location.
2. Position the supporting stones.
3. Check their stability.
4. Pick up the flat stone.
5. Position it above the supports.
6. Release it into the correct position.

Use the existing construction system.
OBJECTIVE 5 — DISCOVER BASIC CRAFTING
Introduce one appropriate existing crafting activity.
Do not expose every recipe at once.
Continue into the existing First Fire survival storyline.
IMPORTANT PROGRESSION RULES:

* Never show future objectives as active tasks.
* Keep future quests hidden until unlocked.
* Use substeps for complex tasks.
* Update progress immediately.
* Prevent accidental progression skipping.
* Save progression after meaningful completion events.
* Allow optional discoveries without interrupting the main progression.

Make the entire first 15–20 minutes feel like a coherent tutorial chapter.
Replace the large, intrusive quest display with a compact objective card.
POSITION:

* Top of the player's field of view.
* Slightly below the upper edge.
* Must not obstruct the central gameplay view.
* Stable and comfortable to read.
* Must not interfere with natural head movement.

CONTENTS:

* Current objective title.
* One or two short instructions.
* Progress indicator.
* Small hint icon.
* Close control.

Example:
CURRENT OBJECTIVE
Find your first stone.
Look around the forest floor and pick up one suitable stone.
Progress: 0/1
HINT: Tap for help.
CARD BEHAVIOUR:
The player must be able to:

* Close the card.
* Reopen it.
* View the current objective.
* See updated progress.

Closing the card must not pause gameplay or stop objective tracking.
The card must remember its state.
Do not automatically reopen it after every interaction.
Use the existing bottom-screen icon bar or another appropriate hands-only interaction to reopen it.
The card should not dominate the player's visual field.
Improve the existing hint system substantially.
Text-only hints are insufficient for beginners.
Every objective involving a collectible or construction component should have a visual reference.
Examples:

* Small stone.
* Flat stone.
* Flint nodule.
* Dry grass.
* Small branches.
* Bark.
* Suitable wood.
* Clay.
* Tinder.
* Workbench.

Use actual in-game models where possible.
Otherwise, use appropriate reference illustrations or existing assets.
Never show unrelated generic imagery.
Each hint should explain:

1. What the object looks like.
2. What distinguishes it from similar objects.
3. Where it can generally be found.
4. Why the player needs it.
5. How to interact with it.

INTRODUCE FOUR LEVELS OF HINTS:
LEVEL 1 — Identification.
Show the object and explain what to look for.
LEVEL 2 — Characteristics.
Explain its shape, colour, size or material properties.
LEVEL 3 — Location.
Give a useful environmental clue, provided it is supported by the actual world design.
LEVEL 4 — Action.
Explain the exact interaction required to complete the task.
Do not force players to use hints.
Keep the hint interface separate from the compact objective card.
All hint controls must work through direct fingertip tapping.
All essential interactions must work without controllers.
Establish three consistent interaction methods.
A. DIRECT FINGERTIP TOUCH
Used for:

* Bottom-screen icons.
* Objective card.
* Hint panels.
* Notebook.
* Menus.
* Inventory controls.
* Construction confirmations where required.

The player points their index finger and taps the virtual interface.
Do not require pinching to click UI.
Reuse the existing keypad's direct interaction approach.
B. PINCH
Used for:

* Grabbing objects.
* Picking up tools.
* Holding resources.
* Dragging objects.
* Moving construction components.
* Repositioning items.
* Two-hand object interaction.

Use stable pinch thresholds and hysteresis.
C. NATURAL PHYSICAL MOVEMENT
Used for:

* Placing objects.
* Throwing objects.
* Swinging tools.
* Hammering.
* Cutting.
* Pulling.
* Twisting.
* Pouring.

The game should understand the physical action without requiring a separate button.
MOVEMENT:
Preserve the existing pinch-based locomotion behaviour.
Avoid conflicts between:

* Movement pinch.
* Object grabbing.
* UI tapping.
* Two-hand manipulation.

Do not redesign locomotion unless a specific conflict requires correction.
IMPORTANT:
The player must not accidentally grab an object when trying to tap a UI icon.
The player must not accidentally activate movement while manipulating an object.
Tracking loss must not cause objects to launch or teleport.
Improve the existing grabbing and placing systems.
OBJECT GRABBING:
When the player pinches a valid object:

* Attach it naturally to the hand.
* Preserve a believable grip position.
* Avoid teleportation.
* Smooth out tracking noise.
* Maintain the correct object orientation.

OBJECT PLACEMENT:
When the player lowers an object near a surface and releases it:

* Recognise a gentle placement.
* Reduce excessive release momentum.
* Allow the object to settle.
* Detect surface contact.
* Prevent floating and penetration.

OBJECT THROWING:
When the player moves their hand quickly and releases:

* Estimate hand velocity.
* Transfer appropriate momentum.
* Calculate direction.
* Apply reasonable speed limits.
* Enable natural object physics.

OBJECT WEIGHT:
Small stones should be easy to manipulate.
Large logs should feel heavier.
Support two-handed manipulation for suitable objects.
Do not implement expensive physics for every object in the world.
Prioritise physical accuracy for objects the player can interact with.
The goal is to make crafting feel like actual work rather than selecting recipes.
Preserve the existing crafting and blueprint systems.
Improve their physical interaction.
WORKBENCH:
The player should:

1. Collect the supporting stones.
2. Place them at suitable positions.
3. Pick up the flat stone.
4. Lift and position it.
5. Release it when properly aligned.
6. See the completed workbench.

Do not instantly spawn a finished workbench.
Use the existing snap points.
Allow slight positional adjustment.
Show feedback when a component is incorrectly placed.
Examples:

* Support is too far away.
* Surface is not stable.
* Slab is incorrectly positioned.
* Required component is missing.

CRAFTING:
Introduce physical assembly gradually.
For existing recipes, identify which can be made more interactive without breaking the current crafting architecture.
Examples:

* Hold flint and strike with a hammerstone.
* Position a stone head against a wooden handle.
* Wrap cord around the attachment point.
* Pull fibres to tighten.
* Test whether the finished connection is stable.

Do not implement complicated animations that do not respond to the player's actual hand movements.
The first 15–20 minutes should teach the player the basic mechanics naturally.
The player should learn:

* How to look around.
* How to recognise resources.
* How to grab.
* How to release.
* How to place.
* How to use the satchel.
* How to construct.
* How to open hints.
* How to follow objectives.

Do not introduce every control at the beginning.
Introduce each mechanic at the exact moment it becomes necessary.
For example:
FIRST STONE:
Teach grabbing.
FIRST PLACEMENT:
Teach releasing.
FIRST WORKBENCH:
Teach positioning and snapping.
FIRST TOOL:
Teach physical tool usage.
FIRST FIRE:
Teach bow-drill movement.
Use small instructional illustrations where appropriate.
Never interrupt gameplay with long tutorials unless absolutely necessary.
Once the player demonstrates that they understand a mechanic, mark it as learned.
Preserve PRIMAL's science-first identity.
Every important gameplay mechanic should teach something meaningful.
Examples:
Stone collection:

* Material properties.
* Hardness.
* Shape.

Workbench:

* Stability.
* Centre of mass.
* Weight distribution.

Knapping:

* Brittle fracture.
* Impact angle.

Woodworking:

* Grain direction.
* Mechanical advantage.

Fire:

* Combustion.
* Friction.
* Oxygen.

Add discoveries to the existing Lab Notebook.
Use the existing Observation → Principle → Real-world limit format.
Do not overload the player with science explanations during the first interaction.
First let them experience the mechanic.
Then introduce a concise scientific explanation.
Ensure that all important progress is saved.
Persist:

* Current objective.
* Completed objectives.
* Resource quantities.
* Collected materials.
* Workbench construction.
* Learned interactions.
* Hint progression.
* Science discoveries.
* Existing quest progress.

When the player reloads:

* Restore the current objective.
* Restore progress.
* Restore collected items.
* Restore constructed objects.
* Do not repeat completed tutorials.

Use stable object IDs and versioned save data.
Ensure existing saves migrate safely.
Performance must remain suitable for standalone Quest.
Requirements:

* Stable 60 FPS target.
* Efficient hand tracking.
* No unnecessary per-frame allocations.
* Lightweight interaction calculations.
* Limited active physics bodies.
* Efficient object collision.
* No expensive UI updates every frame.
* Reliable seated gameplay.

Do not sacrifice interaction responsiveness for unnecessary visual effects.
Maintain browser development mode and actual Quest compatibility.
Work in the following order.
MILESTONE 1 — QUEST CLARITY

* Sequential objective progression.
* One active primary objective.
* Compact top-screen card.
* Close and reopen functionality.
* Progress tracking.
* Completion feedback.

MILESTONE 2 — VISUAL GUIDANCE

* Image-based hints.
* Contextual instructions.
* Progressive hint levels.
* Construction references.

MILESTONE 3 — HAND INTERACTION

* Direct UI tapping.
* Reliable pinch grabbing.
* Natural release.
* Placement.
* Throwing.
* Input conflict resolution.

MILESTONE 4 — PHYSICAL CRAFTING

* Workbench construction.
* Physical component positioning.
* Better snapping.
* Placement feedback.
* Improved crafting interactions.

MILESTONE 5 — ONBOARDING POLISH

* Teach mechanics contextually.
* Improve first-time experience.
* Add short completion feedback.
* Integrate science discoveries.

MILESTONE 6 — PERSISTENCE AND VALIDATION

* Save migration.
* Reload testing.
* Unit tests.
* Browser tests.
* Quest hardware testing.

Do not attempt to implement every milestone in one unstructured code change.
Complete and validate each milestone before moving on.
The following scenarios must work.

1. Start a new game and see only the first objective.
2. Pick up one stone and unlock the next objective.
3. Collect the required additional stones and see correct progress.
4. Open a hint and see the correct visual reference.
5. Close the objective card without losing progress.
6. Reopen the card and see the current objective.
7. Pick up and position a flat stone.
8. Complete the workbench using physical placement.
9. Receive contextual feedback when placement is incorrect.
10. Save and reload without losing progress.
11. Complete all initial interactions without a controller.
12. Use direct fingertip tapping without triggering pinch grabbing.
13. Use pinch grabbing without triggering UI clicks.
14. Release objects naturally.
15. Throw objects with hand movement.
16. Continue gameplay without unnecessary tutorial interruptions.

Run:

* Typecheck.
* Unit tests.
* Production build.
* Existing browser play-tests.

Test the actual hand-tracking experience on Quest.
Do not claim hardware validation if only browser testing was performed.
The finished experience should feel like this:
A completely new player enters PRIMAL.
They see one simple objective.
They find a stone.
They learn how to pick it up.
They collect additional stones.
They discover a flat stone.
They learn how to construct their first workbench.
They physically assemble it.
They discover their first crafting technique.
They gradually understand how the world works.
At no point should the player feel overwhelmed by multiple simultaneous quests or unclear instructions.
The objective system should guide without controlling.
The hand interactions should feel natural.
The crafting should feel physical.
The science should emerge naturally from gameplay.
The first 15–20 minutes should make someone genuinely want to continue exploring.
THE GUIDING PRINCIPLE:
Make the game easy to understand, satisfying to interact with and rewarding to learn.
Do not add complexity before the fundamentals are excellent.
