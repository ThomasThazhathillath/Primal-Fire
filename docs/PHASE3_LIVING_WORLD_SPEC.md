PRIMAL: FIRST FIRE — DEVELOPMENT PROMPT
Phase 3: THE LIVING WORLD — Ecosystem & Survival Expansion
Repository: https://github.com/ThomasThazhathillath/Primal-Fire
You are continuing development of PRIMAL: First Fire, a hands-first VR science-survival game built using Meta's Immersive Web SDK, Three.js and WebXR.
The game currently includes:

* First Steps tutorial.
* Chapter 1: First Fire.
* Chapter 2: The Living Camp.
* Resource gathering and crafting.
* Fire-making and charcoal production.
* Water filtration and boiling.
* Physical shelter construction.
* Rope lashing and structural placement.
* Rain, shelter leak repair and drainage.
* Shelter interior and resting.
* Day/night environmental systems.
* Fishing, farming and hunting as additional quests.
* 80 Lab Notebook observations.
* Science Roadmap and ancient ruins.

Your task is to develop the next phase:
THE LIVING WORLD
The objective is to make the existing environment feel like a functioning prehistoric ecosystem.
The player should no longer feel like they are exploring a static environment populated with resources placed specifically for collection.
Instead, the world should have its own behaviours, wildlife, food cycles, environmental interactions and opportunities for scientific discovery.
IMPORTANT: This is an expansion of the existing world, not a new chapter that replaces existing gameplay.
1. FIRST: AUDIT THE EXISTING IMPLEMENTATION
Before writing code:

1. Read README.md.
2. Read docs/DESIGN.md.
3. Read docs/PROJECT_STATUS.md.
4. Inspect existing quest, farming, fishing and hunting implementations.
5. Inspect the environment and wildlife systems.
6. Inspect the existing day/night and weather systems.
7. Understand resource spawning, object interaction and inventory persistence.
8. Identify incomplete implementations and existing reusable systems.

Do not assume that a feature is missing simply because it is not documented in detail.
Extend existing functionality instead of creating duplicate systems.
Update PROJECT_STATUS.md and README.md as features are completed.
Since real Meta Quest testing is currently unavailable, clearly distinguish between:

* Implemented and unit-tested.
* Implemented but not hardware-tested.
* Planned or incomplete.

Do not claim Quest compatibility based solely on desktop emulator testing.
2. WILDLIFE ECOSYSTEM
Introduce a more convincing wildlife ecosystem.
The forest should contain animals that exist independently of the player's quest progression.
Start with a small number of species:

* Deer.
* Rabbits.
* Birds.
* Fish.
* Small insects.

Do not attempt to introduce dozens of animals immediately.
Animal behaviour
Implement simple behavioural states:

* Idle.
* Grazing.
* Walking.
* Running.
* Drinking.
* Sleeping.
* Alert.
* Fleeing.

Animals should not move randomly without purpose.
Examples:
Deer:

* Graze in clearings.
* Move between vegetation areas.
* Occasionally approach water.
* Become alert when the player approaches.
* Run away when the player gets too close.

Rabbits:

* Move through undergrowth.
* Stop periodically.
* React to nearby movement.
* Retreat into vegetation.

Birds:

* Perch on branches.
* Fly between trees.
* Produce ambient calls.
* Become startled by nearby activity.

Fish:

* Swim in the existing stream.
* Move in small groups.
* React to nearby disturbances.
* Remain visible beneath the water surface where rendering permits.

Important technical requirements

* Use lightweight state machines.
* Avoid expensive pathfinding for every animal.
* Use simple navigation and obstacle avoidance.
* Support basic collision avoidance.
* Avoid spawning too many animals simultaneously.
* Use distance-based activation and deactivation.
* Preserve frame rate on Quest hardware.

Animals should have persistent or deterministic behaviour where practical, but do not introduce complicated simulation systems unnecessarily.
3. ANIMAL TRACKING
Introduce animal tracking as a new gameplay mechanic.
The player should be able to discover animal footprints in the environment.
Implement:

* Different footprint shapes.
* Track direction.
* Track spacing and size variation.
* Tracks that gradually fade or become obscured.
* Tracks appearing near water and vegetation.

Introduce a new quest:
THE HIDDEN TRAIL
The player discovers footprints near the campsite.
They must:

1. Examine the tracks.
2. Open the Lab Notebook.
3. Compare them with known animal tracks.
4. Follow the trail.
5. Discover the animal.

Use environmental clues instead of constantly displaying quest markers.
Scientific learning:

* Animal identification.
* Locomotion.
* Track morphology.
* Predator-prey relationships.

Avoid making tracking a mandatory hunting mechanic. It should also reward observation and exploration.
4. FOOD SYSTEM EXPANSION
Develop a coherent food progression system.
Connect the existing farming, fishing and hunting systems.
The player should be able to obtain food through multiple methods.
Gathering
Introduce:

* Berries.
* Nuts.
* Seeds.
* Roots.
* Edible plants.

Use fictional species with clear in-game properties.
Do not rely on real-world visual resemblance to determine whether a plant is safe.
The player should examine and identify unfamiliar plants before consuming them.
Fishing
Improve the existing fishing experience.
Add:

* Visible fish in the stream.
* Different fish sizes.
* Fish movement and reaction to the player.
* Catch feedback.
* Physical handling of caught fish.
* A simple preparation interaction.

Hunting
Build upon the existing hunting quest.
Improve animal detection, tracking and interaction.
Keep hunting optional.
Avoid implementing complex combat systems at this stage.
5. FARMING SYSTEM EXPANSION
Turn farming into an actual progression system rather than a single quest.
Introduce the following stages:

1. Find seeds.
2. Prepare a small patch of soil.
3. Plant seeds.
4. Water the soil.
5. Observe plant growth.
6. Harvest mature crops.
7. Collect seeds for future planting.

Introduce environmental dependencies:

* Soil moisture.
* Sunlight.
* Water availability.
* Growth time.

Plants should not instantly grow after being planted.
Use a simple growth-stage system:

* Seed.
* Sprout.
* Young plant.
* Mature plant.
* Harvestable plant.

The player should see these stages visually.
Make crop growth persist across save and reload.
Avoid implementing an unnecessarily complicated agricultural simulation.
Scientific learning:

* Germination.
* Photosynthesis.
* Plant growth.
* Soil moisture.
* Seed propagation.

6. FOOD PREPARATION AND PRESERVATION
Extend the existing camp and fire systems.
Introduce a food preparation area.
Possible features:

* Roasting food over fire.
* Drying food.
* Smoke drying.
* Storage of harvested food.
* Comparing fresh and preserved food.

The player should physically interact with food items.
For example:

1. Pick up a fish.
2. Prepare it using an appropriate tool.
3. Place it on a primitive cooking surface.
4. Observe it cooking.
5. Remove it when ready.

Introduce visual and audio feedback:

* Smoke.
* Cooking sounds.
* Colour changes.
* Steam where appropriate.

Preserved food should have a longer shelf life than fresh food.
Do not introduce complex hunger mechanics before the food system itself is enjoyable.
Scientific learning:

* Heat transfer.
* Moisture removal.
* Food spoilage.
* Food preservation.

7. MAKE THE CAMPSITE A LIVING HOME
Improve the existing shelter and campsite.
The player should have reasons to return to camp.
Introduce:
A. Sleeping area

* Collect dry grass and leaves.
* Construct a primitive sleeping surface.
* Allow resting inside the shelter.

B. Storage rack

* Build a simple wooden rack.
* Place gathered resources on it.
* Display stored resources physically.

C. Firewood storage

* Stack firewood.
* Introduce a covered storage option.
* Keep stored wood protected from rain.

D. Food storage

* Add a simple storage location.
* Allow preserved food to be organized.

E. Camp improvements

* Add small structures and functional objects.
* Allow the player to arrange items.
* Preserve placement after saving.

Do not turn this into a conventional base-building menu.
Maintain the hands-first physical interaction philosophy.
8. ENVIRONMENTAL ECOSYSTEM
The forest should react to the player and the weather.
Introduce subtle environmental interactions:

* Grass and small vegetation react to movement.
* Leaves move with wind.
* Birds react to nearby activity.
* Animals avoid the player.
* Rain affects exposed resources.
* Puddles form in appropriate locations.
* Stream water reacts to nearby disturbances.
* Vegetation varies across different areas.

Improve the existing day/night system:
Morning:

* Birds become active.
* Mist gradually disappears.
* Sunlight enters the forest.

Afternoon:

* Stronger natural lighting.
* Wildlife activity continues.

Evening:

* Warmer lighting.
* Longer shadows.
* Animals begin moving toward resting areas.

Night:

* Reduced visibility.
* Increased dependence on fire and shelter.
* Nighttime wildlife sounds.
* Visible moon and stars.

Do not implement complex global simulations. Prioritize convincing interactions that are visible to the player.
9. NEW SCIENCE DISCOVERIES
The science-learning system is one of PRIMAL's defining features.
Expand the Lab Notebook and Science Roadmap.
Add observations connected to actual gameplay.
Suggested topics:
Biology:

* Animal locomotion.
* Animal tracks.
* Predator-prey relationships.
* Plant germination.
* Photosynthesis.
* Ecosystems.

Chemistry:

* Food spoilage.
* Cooking.
* Preservation.
* Oxidation.

Physics:

* Heat transfer.
* Evaporation.
* Water movement.
* Friction.

Ecology:

* Food chains.
* Habitats.
* Biodiversity.
* Resource sustainability.

Each observation should follow the existing format:
Observation → Scientific Principle → Real-world Application.
Do not simply display scientific information in pop-ups.
The player should encounter the phenomenon, experiment with it and then discover the explanation.
Update the Science Roadmap with new nodes.
Reuse existing visual conventions and discovery animations.
10. NEW QUESTS
Introduce quests that connect the new mechanics.
Suggested quest progression:
QUEST 1: THE HIDDEN TRAIL
Discover and identify animal footprints.
QUEST 2: THE LIVING FOREST
Observe different wildlife species and their behaviours.
QUEST 3: SEEDS OF TOMORROW
Find seeds, prepare soil and plant crops.
QUEST 4: A GROWING FUTURE
Maintain crops and observe their growth.
QUEST 5: FROM STREAM TO FIRE
Catch and prepare fish.
QUEST 6: PRESERVING THE HARVEST
Experiment with food preservation.
QUEST 7: A HOME THAT PROVIDES
Improve the campsite with food storage and resource organization.
Do not force the player to complete every quest in a strict linear order.
Where possible, allow optional exploration and multiple approaches.
11. VR INTERACTION REQUIREMENTS
PRIMAL is a hands-first VR experience.
All new interactions must work with the existing hand-tracking architecture.
Prioritize:

* Natural grabbing.
* Pinch interactions.
* Physical placement.
* Two-handed manipulation where appropriate.
* Clear object feedback.
* Comfortable interaction distances.
* Seated accessibility.

Examples:

* Picking berries.
* Collecting seeds.
* Planting seeds.
* Pouring water.
* Handling caught fish.
* Arranging food.
* Placing objects on storage racks.

Avoid making every action a button press.
However, do not make interactions unnecessarily complicated. A simple, reliable interaction is better than a physically elaborate interaction that frequently fails.
Preserve desktop keyboard and mouse support.
12. VISUAL AND AUDIO QUALITY
Improve the existing world without replacing its visual identity.
Focus on:

* More convincing vegetation.
* Better animal animations.
* Natural movement.
* Better stream appearance.
* Improved ground materials.
* Environmental particles.
* Better ambient occlusion where affordable.
* Natural wildlife audio.
* Spatial sound positioning.

Avoid:

* Excessive particle effects.
* Heavy real-time shadows.
* Unnecessary high-poly assets.
* Repeated identical vegetation.
* Floating objects.
* Obvious animation loops.
* Excessive wildlife density.

All improvements must respect Quest performance constraints.
13. TECHNICAL REQUIREMENTS
Preserve the existing architecture.
Extend existing:

* Quest systems.
* Inventory.
* Resource gathering.
* Farming.
* Fishing.
* Hunting.
* Save and persistence.
* Lab Notebook.
* Science Roadmap.
* Environment systems.

Requirements:

1. Persistent animal and crop state where appropriate.
2. Save and reload support.
3. Efficient entity management.
4. Distance-based activation.
5. Collision and interaction consistency.
6. No duplicate resources.
7. No quest progression regressions.
8. Optimized geometry and rendering.
9. Desktop development support.
10. Compatibility with the existing hand-tracking implementation.

14. DEVELOPMENT MILESTONES
Implement incrementally.
MILESTONE A — Wildlife

* Animal models.
* Basic animal state machines.
* Movement and reactions.
* Ambient wildlife audio.

MILESTONE B — Tracking

* Footprints.
* Track identification.
* Trail-following quest.

MILESTONE C — Farming

* Seeds.
* Soil preparation.
* Planting.
* Growth stages.
* Harvesting.
* Persistence.

MILESTONE D — Food

* Fishing improvements.
* Food preparation.
* Cooking.
* Preservation.

MILESTONE E — Living Camp

* Sleeping area.
* Storage rack.
* Firewood storage.
* Food storage.
* Persistent object placement.

MILESTONE F — Science and Polish

* Lab Notebook observations.
* Science Roadmap updates.
* New quests.
* Visual and audio improvements.
* Performance optimization.

Do not attempt to implement all milestones in one massive change. Complete and validate each milestone before moving to the next.
15. TESTING WITHOUT PHYSICAL QUEST HARDWARE
Development is continuing without immediate access to a physical Meta Quest headset.
Therefore:

* Run existing unit tests.
* Add tests for new systems.
* Run the production build.
* Validate desktop interactions.
* Use the existing VR emulator.
* Check hand-tracking logic where possible.
* Test save and reload.
* Profile rendering and entity counts.

Clearly document what has and has not been verified on actual hardware.
Do not report hardware-specific performance or compatibility as confirmed without real-device testing.
16. DEFINITION OF DONE
This phase is complete when:

* Wildlife exists and behaves naturally.
* Animals react to the player.
* Tracking is playable.
* Farming has persistent growth stages.
* Food can be obtained through multiple activities.
* Food preparation and preservation work.
* The campsite has functional storage and sleeping facilities.
* Environmental interactions feel more convincing.
* New science discoveries are recorded.
* Quest progression remains stable.
* Save and reload preserve progress.
* Existing Chapter 1 and Chapter 2 functionality remains intact.
* Performance remains within the project's intended Quest budget.

FINAL CREATIVE DIRECTION
PRIMAL should make the player feel that they are not merely completing survival missions.
They are learning to understand and interact with an entire ecosystem.
The forest should exist independently of the player.
Animals should have behaviours. Plants should grow. Food should require effort. Weather should influence decisions. The campsite should become a place worth returning to.
Every major mechanic should connect back to a scientific principle.
The ultimate goal is to make PRIMAL feel like a believable prehistoric world in which the player learns science by physically experiencing it.
Build carefully, preserve existing functionality and prioritize immersion over feature count.
