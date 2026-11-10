# Tutorial level and player-friendly gameplay overhaul (owner brief, verbatim)

PRIMAL: First Fire — Complete Tutorial & Player-Friendly Gameplay Overhaul
I want to make PRIMAL: First Fire significantly easier to understand, learn and play, particularly for someone who has never played a VR survival game before.
The game already has a substantial gameplay foundation. However, a new player should not have to guess how to gather resources, interact with objects, construct structures, use tools, craft items or progress through quests.
I want two major improvements:

1. A fully interactive tutorial/training level that teaches the player every important gameplay mechanic.
2. A comprehensive usability and interaction improvement system that makes the entire game more intuitive, forgiving and discoverable.

This is not just about adding instructions. I want the actual gameplay interactions to become easier and more natural.
PHASE 1 — INSPECT THE EXISTING PROJECT
Before making changes, thoroughly inspect the existing codebase.
Read:

* CLAUDE.md and AGENTS.md.
* docs/DESIGN.md.
* docs/PROJECT_STATUS.md.
* Existing gameplay systems in src/game/ and src/systems/.
* Existing gathering, building, satchel, HUD, hint, quest, crafting and world systems.
* Existing scene composition and assets.
* Current tests and playtest scripts.

Understand exactly:

* Which interactions are already implemented.
* Which hand gestures and input methods are supported.
* How objects are gathered, held, released and placed.
* How blueprints and snap points work.
* How hints currently escalate.
* How the quest system tracks progression.
* How the game handles desktop, hand tracking and controllers.

Do not assume an interaction exists simply because it is described in the design document.
Preserve existing working mechanics and architecture. Extend existing systems instead of creating competing implementations.
First produce an implementation plan covering both features, the files that need modification, technical dependencies and testing requirements. Then proceed with implementation in manageable phases.
PART A — CREATE A COMPLETE INTERACTIVE TUTORIAL LEVEL
1. Tutorial concept
Create a dedicated tutorial environment called:
THE FIRST STEPS — Learning to Survive
This should be a small, beautiful, immersive forest clearing that acts as a training environment separate from the main survival progression.
The player wakes up in this environment and learns through interaction rather than reading lengthy instructions.
The tutorial should feel like an actual part of the PRIMAL universe.
A short contextual narrator or in-world guide can introduce each new mechanic.
Avoid overwhelming the player with instructions. Introduce one mechanic at a time, let the player experiment, and proceed once they understand it.
The tutorial should have:

* A controlled environment with clearly arranged objects.
* A small training camp.
* Interactive objects for practicing every important mechanic.
* Contextual instructions.
* Visual indicators showing what can be interacted with.
* A progress tracker.
* An option to repeat individual lessons.
* An option to skip the tutorial.

The tutorial must not permanently give the player resources or complete quests in their actual survival save.
2. Tutorial lesson sequence
Design the tutorial as a sequence of interactive lessons.
Lesson 1: Understanding your hands
Teach the player:

* How to use their hands to interact with objects.
* Pointing at objects.
* Pinching and grabbing.
* Releasing objects.
* Moving objects between hands.
* Using both hands when appropriate.
* Understanding when an object is interactable.

Place a few objects in front of the player.
For example:

* A small stone.
* A stick.
* A piece of wood.
* A piece of grass.

Ask the player to pick each one up and put it down.
Show a subtle visual indication when an object is within interaction range.
Explain the available interaction without constantly displaying large UI panels.
Lesson 2: Gathering resources
Teach the player how to gather materials.
Create a small collection of resources:

* Dry grass.
* Twigs.
* Stones.
* Plant fibres.
* Logs.

Let the player discover that different materials can be collected.
Teach:

* Point and pinch to gather.
* How gathering range works.
* What happens when an item is successfully collected.
* How collected objects enter the satchel.

Do not simply collect the item automatically. Let the player perform the interaction.
Lesson 3: Satchel and inventory
Teach the player how to access and use the satchel.
Demonstrate:

* Locating the pouch on the hip.
* Opening the satchel.
* Viewing collected items.
* Taking an item out.
* Putting an item back.
* Understanding available inventory space, if applicable.

Make it visually obvious which items are inside the satchel.
The player should practice retrieving a stone and placing it back.
Lesson 4: Movement and teleportation
Teach VR locomotion.
Demonstrate:

* Teleporting using the supported hand micro-gesture.
* Teleporting using the controller where available.
* Understanding the teleport destination indicator.
* Looking around.
* Turning and orienting themselves.

Do not force the player to walk large distances.
The tutorial must support seated gameplay and remain comfortable for VR users.
Also teach desktop movement if the tutorial is being played outside XR.
Lesson 5: Understanding object interactions
This is particularly important.
Teach the player that objects can have different interaction types.
Examples:

* Picking up a stone.
* Holding a stick.
* Moving a log.
* Placing an object on the ground.
* Using an object on another object.
* Interacting with a designated construction point.

Create a small practice area where the player can experiment with these actions.
Introduce the difference between holding, releasing, placing and throwing.
Lesson 6: Building structures
Teach the complete blueprint construction system.
Use a simple workbench as the first example.
Walk the player through:

1. Picking up a flat stone slab.
2. Holding it over suitable ground.
3. Seeing the ghost blueprint appear.
4. Understanding valid and invalid placement locations.
5. Placing the blueprint.
6. Identifying the glowing snap points.
7. Picking up the required stones.
8. Filling each snap point.
9. Completing the workbench.

Show a clear visual indication when the correct component is near the correct snap point.
Also demonstrate what happens when:

* The player tries to build on unsuitable ground.
* The player has the wrong component.
* The player tries to place something too far away.
* The blueprint is already complete.

Never leave the player wondering why an action failed. Provide a short contextual explanation.
Lesson 7: Crafting
Teach crafting using the workbench.
Demonstrate:

* Approaching the workbench.
* Identifying craftable items.
* Gathering the required ingredients.
* Taking ingredients out of the satchel.
* Combining ingredients.
* Crafting cord from fibres.
* Crafting the bow drill.

The crafting process should involve physical interaction wherever appropriate rather than relying exclusively on menus.
Lesson 8: Fire-making
Teach the player the complete fire-making process.
Include:

* Building a fire pit.
* Gathering tinder.
* Gathering twigs and logs.
* Understanding the fire lay.
* Using the bow drill.
* Creating an ember.
* Moving the ember into the tinder.
* Fanning or blowing to provide airflow.

Allow the player to make mistakes and see the consequences.
For example:

* Damp moss produces smoke instead of catching fire.
* Too much fuel too early prevents ignition.
* Insufficient airflow causes the ember to fade.

Explain why the action failed through brief contextual feedback.
Lesson 9: Hints and quests
Teach the player how to use the quest system.
Demonstrate:

* Reading the current objective.
* Understanding resource requirements.
* Requesting a hint.
* Requesting increasingly detailed hints.
* Following a directional beacon.
* Understanding quest completion.
* Receiving XP or other progression feedback.

Make it clear that hints are optional.
Lesson 10: Lab Notebook and Science Roadmap
Introduce the scientific learning system.
Teach:

* Opening the notebook.
* Reading observations.
* Understanding Observation → Principle → Real-world limit.
* Reviewing discovered science.
* Understanding the Science Roadmap.
* Seeing how discoveries unlock new progression.

Let the player interact with at least one example entry.
Lesson 11: Final practical challenge
Finish the tutorial with a small survival challenge.
Ask the player to independently:

1. Gather the required resources.
2. Retrieve materials from the satchel.
3. Build a small structure.
4. Craft a basic item.
5. Complete a simple objective.
6. Use a hint if they need help.

Do not tell them exactly how to complete every step.
The purpose is to establish whether they can apply what they learned.
When completed, display a satisfying completion sequence and unlock the main survival experience.
PART B — MAKE THE ENTIRE GAME EASIER TO PLAY
This is equally important.
I want to improve the actual interaction system throughout the game, not just the tutorial.
1. Universal interaction system
Currently, a player may need to understand a specific interaction gesture to perform an action.
I want to make interactions more forgiving.
Where physically and logically appropriate, multiple natural gestures should achieve the same intended action.
For example, consider placing a stone into a fire pit.
If the player is holding a valid stone and moves it near a valid snap point, allow placement through:

* Releasing the stone near the snap point.
* Gently dropping it into the snap point.
* Touching or tapping the snap point with the held stone.
* Moving the held stone into the snap point.
* Throwing the stone gently towards the correct placement area.
* A deliberate hand interaction near the snap point.

If the player performs a punching or striking motion with a held item, consider treating it as an interaction attempt when the target is a compatible construction point.
The objective is that players should not need to discover one exact gesture for every action.
However, do not make every gesture trigger every action indiscriminately.
Implement sensible interaction rules based on:

* What item is held.
* What object is targeted.
* Distance from the target.
* Whether the target accepts that item.
* Whether the action makes physical sense.
* The player's interaction intent.

For example, punching a tree with an empty hand should not automatically collect a log unless that is an intentional harvesting mechanic.
Interaction priority
When multiple objects or snap points are nearby, prioritize:

1. The object directly targeted by the player.
2. The nearest valid interaction target.
3. The target that matches the held item.
4. Other valid nearby targets.

Avoid accidental interactions with unrelated objects.
2. Improved building and placement
Building is one of the most important mechanics in PRIMAL.
Make it significantly easier.
Implement:

* Stronger visual feedback for valid placement.
* More obvious green/red blueprint states.
* Glowing snap points.
* Larger forgiving snap radii.
* Automatic snapping when the correct item approaches a compatible location.
* A small magnetic attraction effect towards valid snap points.
* Clear feedback when the wrong material is used.
* Clear feedback when the player is too far away.
* Visual confirmation when a component is successfully placed.

If the player throws a correct stone towards an open snap point, allow the stone to be caught and snapped into place when it enters a reasonable placement radius.
Avoid requiring pixel-perfect precision.
The placement should still feel physical and satisfying.
Preserve the existing snap-to-blueprint architecture.
3. Visual hint system — Make objects easy to find
I want to significantly improve the existing hint system.
The current escalating hint concept should remain, but visual assistance should become much more useful.
Hint level 1 — Contextual clue
Give a small textual or narrated clue.
Example:
"Something dry and fine would be useful for starting a fire."
Hint level 2 — Highlight nearby resources
Highlight suitable resources in the environment.
Possible visual treatments:

* Subtle glowing outline.
* Pulsating highlight.
* Small floating indicator.
* Brief particle effect.

The effect should be visible but not ruin the realistic appearance of the forest.
Hint level 3 — Directional beacon
If the player still cannot find the resource, create a visible beacon of light extending into the sky above the target.
I specifically want something like a vertical pillar of light.
Requirements:

* Visible from a distance.
* Extends high enough into the sky to be noticeable.
* Uses a distinct but natural-looking colour.
* Has a subtle pulsing or animated effect.
* Points to the relevant gathering location or object.
* Disappears when the objective is completed or the hint is dismissed.

The beacon must be attached to the actual target's position, not an approximate location.
If there are several valid resources, choose a suitable target based on quest requirements and proximity.
Hint level 4 — Direct assistance
If appropriate, show a more direct indication of what the player needs to do.
Examples:

* Highlight the specific object.
* Highlight the exact snap point.
* Show an animated arrow or short demonstration.
* Highlight the correct interaction area.

Do not automatically complete the objective.
The player must still perform the action.
4. Contextual object highlighting
Create a consistent interaction feedback system.
Whenever a player looks at or points towards an interactable object:

* Show a subtle outline.
* Indicate whether the object can be picked up.
* Display its name when appropriate.
* Show a small interaction icon.
* Indicate whether the player is within reach.

When the player is holding an item:

* Highlight compatible targets.
* Make incompatible targets visually distinguishable.
* Show where the item can be placed.

When hovering over a construction snap point:

* Make the snap point brighter.
* Show the required material.
* Show whether the currently held material is compatible.

Avoid displaying labels for every object simultaneously.
Only show relevant information when the player is looking at, pointing at or approaching something.
5. Contextual instructions
Add a lightweight contextual guidance system.
Examples:
When the player picks up a stone:
"Stone collected. You can use it to build structures."
When the player approaches an unfinished workbench:
"Your workbench needs three more stones."
When the player holds a flat slab:
"Find suitable ground to start building."
When the player holds the correct material near a snap point:
"This stone fits here. Release or move it into position."
When an action fails:
"Too close to the stream. Find firmer ground."
These messages should be brief, useful and disappear automatically.
Do not constantly interrupt gameplay.
6. Improved quest guidance
Make objectives easier to understand.
Every quest should communicate:

* What the player needs.
* How many items are required, where relevant.
* What the item is used for.
* What the next step is after gathering it.

For multi-step tasks, display progress clearly.
For example:
BUILD WORKBENCH

* Flat stone slab: 1/1
* Stones: 2/3

Once the player has collected the required materials, indicate that they can proceed to construction.
Do not reveal the exact location of every resource by default. Preserve the exploration aspect of the game.
Use the hint system when players need assistance.
7. Improve object physics and environmental interactions
Make the environment more understandable.

* Objects should not pass through trees, rocks or structures.
* Held objects should interact naturally with surfaces.
* Logs and stones should have believable weight.
* Objects should not become permanently stuck.
* Placed construction components should remain stable.
* Throwing should have predictable behaviour.
* Objects should return to a valid physical state if placement fails.

Where appropriate, use forgiving collision and placement tolerances instead of requiring physically perfect interactions.
Do not sacrifice performance on Quest hardware.
8. Interaction feedback and audio
Add appropriate feedback for important actions:

* Picking up an object.
* Gathering a resource.
* Placing a stone.
* Completing a blueprint.
* Crafting an item.
* Completing a quest.
* Receiving a hint.
* Discovering a scientific observation.

Use short, subtle sound effects and visual feedback.
Important actions should feel rewarding.
PART C — DESIGN AND TECHNICAL REQUIREMENTS
1. Input consistency
All interaction improvements must work across:

* Quest hand tracking.
* Quest controllers.
* Desktop keyboard and mouse.

Do not build a tutorial that only works with controllers.
Hand tracking is the primary experience.
Maintain the seated-play requirement. Essential tutorial interactions should be reachable within a comfortable area around the player.
2. Performance
PRIMAL must remain performant on Quest hardware.
Avoid:

* Excessive particle effects.
* Unnecessary real-time lighting.
* Too many simultaneous animated highlights.
* Expensive physics calculations.
* Unnecessary scene duplication.

Reuse existing meshes, materials and systems wherever possible.
3. Architecture
Prefer reusable systems rather than individually hardcoding every interaction.
Consider reusable modules for:

* Tutorial progression and lesson states.
* Contextual guidance.
* Interaction target resolution.
* Object highlighting.
* Hint beacons.
* Placement assistance.
* Interaction feedback.

Keep gameplay rules separate from visual rendering wherever the current architecture supports that separation.
The tutorial should use the same actual gameplay mechanics as the main game. Do not create fake tutorial-only versions of gathering, crafting or building.
4. Persistence
The tutorial should have its own progression state.
Support:

* Starting the tutorial.
* Resuming or restarting it.
* Skipping it.
* Replaying individual lessons.
* Entering the main game without corrupting the survival save.

Ensure that tutorial actions do not accidentally modify the player's main survival progression.
5. Testing
Add tests for the new mechanics.
Specifically verify:

* Every tutorial lesson can be completed.
* The player cannot become permanently stuck in a lesson.
* All input modes work.
* Valid items snap into compatible placement points.
* Invalid items are rejected.
* Forgiving placement works without accidental placement elsewhere.
* Hint levels escalate correctly.
* Beacons point to the correct targets.
* Highlights disappear when no longer needed.
* Quest progress updates correctly.
* Tutorial and main-game save states remain separate.

Run:

* npm run typecheck
* npm test
* npm run build

Also update the existing browser playtest scripts where appropriate.
PART D — IMPLEMENTATION ORDER
Implement in the following priority order:
Priority 1 — Core usability

1. Universal interaction improvements.
2. Forgiving object placement and snapping.
3. Contextual highlighting.
4. Improved hints and sky beacons.
5. Clear interaction feedback.

Priority 2 — Tutorial

1. Tutorial environment.
2. Hand interaction lesson.
3. Gathering and satchel lessons.
4. Movement and interaction lessons.
5. Construction lesson.
6. Crafting and fire-making lessons.
7. Quest, hints and notebook lessons.
8. Final practical challenge.

Priority 3 — Polish

1. Contextual audio.
2. Better animations.
3. Visual feedback improvements.
4. Tutorial progression and replay options.
5. Performance optimization.

Do not stop after creating documentation or mockups. Implement the actual gameplay features.
If a feature requires substantial architectural changes, explain the issue and propose the safest implementation before making disruptive changes.
Do not remove existing gameplay features or simplify the science-survival mechanics to make the tutorial easier.
The goal is to make PRIMAL approachable to someone who has never played VR before, while retaining the immersive, physical and experimental nature of the game.
FINAL ACCEPTANCE CRITERIA
I should be able to launch the game as a completely new player and:

1. Understand how to use my hands.
2. Gather resources without guessing the controls.
3. Understand and use my satchel.
4. Move around comfortably.
5. Interact with objects naturally.
6. Build structures without struggling with precision.
7. Craft items.
8. Make fire.
9. Understand quests and hints.
10. Explore the scientific progression.

Most importantly, if I get stuck, the game should help me understand what to do and where to do it.
Design philosophy: Never make the player guess the controls. Never make the player guess why an action failed. Never make the player search endlessly when they explicitly ask for a hint. Let the player discover the world, but make the gameplay itself intuitive.
