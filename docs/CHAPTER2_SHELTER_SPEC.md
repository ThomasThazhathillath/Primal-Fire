DEVELOPMENT PROMPT — PRIMAL: FIRST FIRE
Chapter 2: THE LIVING CAMP — The First Shelter
You are continuing development of PRIMAL: First Fire, a hands-first VR science-survival game built using Meta's Immersive Web SDK (IWSDK), Three.js and WebXR.
Repository: https://github.com/ThomasThazhathillath/Primal-Fire
Your task is to develop the next major gameplay phase: Chapter 2 — The Living Camp.
This chapter transitions the player from basic survival and scientific experimentation into primitive engineering and settlement construction.
The central objective is to make the player construct their first functional shelter entirely with their own hands.
1. IMPORTANT: UNDERSTAND THE EXISTING PROJECT FIRST
Before implementing anything:

1. Inspect the existing source code and project structure.
2. Read `docs/DESIGN.md`, `docs/PROJECT_STATUS.md` and `README.md`.
3. Understand the current quest progression and save system.
4. Inspect the existing gathering, crafting, blueprint, snap-point and interaction systems.
5. Understand how hand tracking, grabbing, pinching and teleportation work.
6. Inspect existing assets, environment composition and visual effects.

Do not recreate systems that already exist.
Reuse existing implementations wherever possible. Extend the existing architecture instead of introducing parallel systems.
Preserve all completed Chapter 1 functionality.
The existing game already features:

* A forest environment and stream.
* Resource gathering.
* A hip-mounted satchel.
* Crafting at the workbench.
* Fire pit construction and fire experiments.
* Charcoal production.
* Clay pottery.
* Water filtration and boiling.
* Quest progression, hints, XP and Lab Notebook.
* The Science Roadmap.

Do not introduce duplicate versions of these features.
2. CHAPTER 2 STORY
The player has successfully established fire, produced charcoal and learned to purify water.
However, their campsite is still exposed to the environment.
As night approaches, the player realizes that fire alone is insufficient for survival.
They need shelter.
Introduce Chapter 2 through a short environmental storytelling sequence.
The player should notice:

* Wind blowing through the clearing.
* Falling branches and leaves.
* Changing sunlight as evening approaches.
* The absence of any proper sleeping or resting area.

Introduce the quest:
A PLACE TO CALL HOME
"You have learned to control fire. Now learn to build something that can protect you."
The quest should guide the player toward constructing a shelter without immediately revealing every required resource or construction step.
Maintain the existing hint system:

* First hint: Scientific clue.
* Second hint: Material or resource clue.
* Third hint: Direction or location guidance.

3. QUEST 1 — THE FOUNDATION
Objective: Collect the materials needed to construct a primitive shelter.
Required resources:

* Long, straight wooden poles.
* Flexible branches.
* Plant fibres or existing crafted cord.
* Dry grass.
* Large leaves or suitable bark.

Use the existing gathering system.
Add new resources only where necessary.
Resource gathering should feel physical:

* Grab a branch.
* Pull or break it free where appropriate.
* Pick up fallen branches.
* Collect bundles of grass.
* Gather leaves.

Do not simply make every resource disappear into the inventory through proximity.
Where practical, show the player physically collecting and handling resources.
4. QUEST 2 — BUILD THE FRAME
This is the main feature of the chapter.
The player must construct a primitive lean-to shelter.
The shelter should be built entirely from individual components.
Do not spawn a completed shelter.
Construction sequence
Step 1: Position the main supporting poles.
The player picks up long poles and positions them at designated structural points.
Step 2: Establish the support structure.
The player positions and secures the main supports.
Step 3: Add cross-supports.
The player places horizontal branches across the frame.
Step 4: Secure the structure.
Introduce physical rope-lashing interactions.
Step 5: Add smaller branches.
These create a supporting framework for the roof.
Step 6: Complete the frame.
Show a construction-complete animation and unlock the roofing stage.
VR interaction requirements
This must feel like physically building something.
Implement:

* Natural grabbing of wooden poles.
* Two-handed interaction for longer objects where supported.
* Rotation and alignment while holding objects.
* Snap points that help position structural components.
* Physical placement rather than instant spawning.
* Rope wrapping and tightening gestures.
* Visual and audio feedback when components are secured.

The player should understand why each piece is being placed.
Do not turn this into a menu-based crafting activity.
5. QUEST 3 — ROOF OVER YOUR HEAD
Once the frame is complete, the player must construct the roof.
Use:

* Large leaves.
* Dry grass.
* Bark.
* Smaller branches.

The player should physically place and attach roofing materials.
Implement progressive visual construction.
The shelter should gradually change from an exposed wooden frame into a recognizable primitive shelter.
The finished shelter should feature:

* A sloping roof.
* Visible wooden support beams.
* Layered natural roofing.
* An entrance.
* An interior area.
* Natural material variation.

Make the result visually impressive.
Avoid a low-poly placeholder appearance. Match the existing art direction while improving the material quality, geometry and environmental detail.
6. QUEST 4 — TEST YOUR ENGINEERING
Do not end the chapter immediately after construction.
Make the player test their creation.
Introduce a short weather event.
Rain begins falling.
The player must observe:

* Where water enters the shelter.
* Which roof sections leak.
* Whether the shelter provides adequate protection.

The player can collect additional leaves and bark to reinforce weak sections.
Introduce a simple drainage channel around the shelter if appropriate.
Environmental interaction
Rain should:

* Produce visible droplets and splashes.
* Wet exposed surfaces.
* Create puddles in suitable low areas.
* Affect exposed firewood.
* Interact with the shelter roof.
* Produce a distinct sound on leaves, wood and the ground.

Do not implement an unnecessarily complicated weather simulation. Prioritize convincing visual and gameplay feedback.
The existing stream must remain part of the environment. Do not create another water source.
7. SCIENCE LEARNING
Science is the identity of PRIMAL.
Every major construction activity must teach something.
Add new Lab Notebook discoveries using the existing format:
Observation → Principle → Real-world limit
Suggested discoveries:

1. Triangular structures provide stability.
2. Compression and tension help structures remain upright.
3. Load distribution affects structural strength.
4. Roof slope helps water run off.
5. Layered natural materials provide weather protection.
6. Drainage channels redirect flowing water.

Every discovery should be based on something the player actually experiences.
Do not simply display scientific facts in pop-ups.
Let the player discover the principle through experimentation.
Update the Science Roadmap with appropriate new nodes.
When a major discovery occurs, reuse the existing Roadmap activation animation and visual language.
8. SHELTER INTERIOR AND ENVIRONMENT
The completed shelter should become a meaningful location.
Allow the player to:

* Enter the shelter.
* Look around its interior.
* Rest inside.
* Observe rain outside while remaining protected.
* Store or organize a few resources if the existing inventory architecture supports it.

Add subtle environmental details:

* Leaves moving in the wind.
* Rain hitting the roof.
* Ambient forest sounds.
* Soft light entering through the shelter entrance.
* Natural shadows.
* Slightly darker lighting inside the shelter.

Make the shelter feel like something the player personally constructed.
9. VISUAL QUALITY REQUIREMENTS
The current environment should continue to evolve toward a realistic prehistoric wilderness.
Improve:

* Wooden material textures.
* Bark and leaf variation.
* Ground detail around the construction site.
* Natural lighting.
* Ambient occlusion where affordable.
* Realistic-looking rain.
* Material-specific sound effects.
* Construction animations.

The shelter must visually belong in the existing forest.
Avoid:

* Floating objects.
* Perfectly symmetrical artificial structures.
* Oversized snap indicators.
* Objects clipping through each other.
* Materials that look like plastic.
* Abrupt object spawning.

Keep the environment visually cohesive.
10. VR INTERACTION AND COMFORT
PRIMAL is specifically designed for Meta Quest and hands-first VR.
All new features must work using hand tracking.
Requirements:

* No mandatory controller interactions.
* Natural pinch-to-grab interactions.
* Physical object manipulation.
* Clear interaction feedback.
* Comfortable hand reach.
* Avoid requiring excessive stretching.
* Keep important UI within a comfortable field of view.
* Preserve seated accessibility.
* Do not introduce unnecessary wrist menus.

Desktop mouse-and-keyboard interactions must continue working for development and testing.
If a physical interaction is difficult to perform with hand tracking, provide an accessible alternative gesture without compromising the experience.
11. TECHNICAL IMPLEMENTATION
Follow the current IWSDK architecture.
Extend existing modules where appropriate.
Potential areas of modification:

* `src/game/quests`
* `src/game/items`
* `src/game/observations`
* `src/game/blueprints`
* `src/systems/`
* `src/scene-assets/`
* `public/scenes/`
* `public/ui/`

These are suggested locations, not instructions to create duplicate files or systems.
Requirements:

1. Use the existing blueprint and snap-point architecture where possible.
2. Make construction state persistent.
3. Save progress when the player completes individual construction stages.
4. Support leaving and returning to the game without losing progress.
5. Ensure the quest system correctly detects completed objectives.
6. Prevent duplicate resource collection and construction.
7. Ensure objects have appropriate collision and interaction behavior.
8. Avoid unnecessary geometry and draw calls.
9. Optimize for Meta Quest performance.
10. Maintain the existing desktop development experience.

Do not break Chapter 1.
12. DEVELOPMENT MILESTONES
Implement this chapter incrementally.
Milestone A — Resources

* Add necessary shelter resources.
* Implement gathering and physical handling.
* Verify inventory and persistence.

Milestone B — Structural Construction

* Add shelter blueprint.
* Implement support poles.
* Implement cross-supports.
* Add alignment and snap interactions.
* Implement rope-lashing interactions.

Milestone C — Roofing

* Add roof construction stages.
* Implement leaf, grass and bark placement.
* Complete the shelter appearance.

Milestone D — Environmental Testing

* Introduce rain.
* Implement roof protection.
* Add leaks and reinforcement.
* Add basic drainage.

Milestone E — Science and Progression

* Add quests and hints.
* Add scientific observations.
* Update the Science Roadmap.
* Add completion rewards.

Milestone F — Polish and Testing

* Improve visual quality.
* Add sounds and animations.
* Test all hand interactions.
* Test desktop controls.
* Test save and reload.
* Run existing tests and add new tests.
* Run typecheck and production build.

13. IMPORTANT DEVELOPMENT RULES

* Do not rewrite the existing project.
* Do not replace the current game architecture.
* Do not remove completed Chapter 1 features.
* Do not introduce unrelated gameplay systems.
* Do not create an entirely separate crafting system.
* Do not use static, prebuilt shelter models as a substitute for construction gameplay.
* Do not make the player complete construction through a single button press.
* Do not sacrifice VR usability for visual effects.
* Do not claim an interaction is complete until it has been implemented and tested.

Prioritize a smaller number of genuinely interactive construction mechanics over a large number of superficial features.
14. DEFINITION OF DONE
Chapter 2 is complete when:

1. The player can start the new chapter after completing Chapter 1.
2. The player can discover and gather shelter materials.
3. The player can physically construct the shelter frame.
4. The player can secure structural components.
5. The player can construct the roof.
6. The finished shelter has a convincing interior and exterior.
7. Rain interacts meaningfully with the shelter.
8. The player can identify and repair leaks.
9. Scientific discoveries are recorded in the Lab Notebook.
10. The Science Roadmap reflects the new discoveries.
11. Progress survives saving and reloading.
12. The entire experience works with hands-first VR.
13. Existing Chapter 1 functionality remains intact.

FINAL CREATIVE DIRECTION
PRIMAL should make the player feel that they are genuinely learning to rebuild civilization.
When the player finishes this chapter, they should look at the shelter and think:
"I built that with my own hands. And now I understand why it works."
That feeling is more important than simply completing another quest.
Build Chapter 2 to deliver that experience.
