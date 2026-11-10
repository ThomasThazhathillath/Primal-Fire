PRIMAL: FIRST FIRE — GAZE + PINCH INTERACTION AND 90 FPS OPTIMIZATION
I want to upgrade PRIMAL to support the next generation of hands-only VR experiences.
Two major objectives:

1. Implement a complete Gaze + Pinch interaction system.
2. Optimize the entire game to achieve a stable 90 FPS on supported Meta Quest hardware.

These are important platform-readiness improvements. Do not treat them as isolated experimental features.
PART 1 — GAZE + PINCH INTERACTION SYSTEM
1. Core interaction philosophy
The new primary interaction method should be:
LOOK → PINCH → INTERACT
The player looks at an object, the game identifies the object under their gaze, provides visual feedback, and a hand pinch confirms the interaction.
Example:

* Look at a stone.
* The stone receives a subtle highlight.
* Pinch with either hand.
* The stone is selected or grabbed.
* Move the hand to manipulate it.
* Release to drop or place it.

The experience should feel natural and instantaneous.
The player should not have to extend their arm and point at every object.
2. Inspect the existing XR architecture
Before implementing anything, investigate:

* Current rendering engine.
* XR session implementation.
* Hand tracking implementation.
* Hand joint tracking.
* Existing pinch detection.
* Current raycasting and interaction systems.
* Object grabbing and releasing.
* Snap points and blueprint placement.
* UI interaction.
* Locomotion.
* Input abstraction and device compatibility.

Determine whether the project uses Unity, Three.js/WebXR or another framework.
IMPORTANT:
If the project is built using Unity and Meta XR Interaction SDK, investigate the v207.0 Gaze Interactions functionality and use its supported components and interaction patterns.
If the project is built using Three.js/WebXR, implement the equivalent functionality using the existing XR input architecture and supported WebXR capabilities.
Do not introduce Unity-specific packages into a WebXR project.
Do not unnecessarily replace the existing interaction system.
3. Gaze targeting
Implement a reliable gaze targeting system.
The gaze source should use:

1. Eye gaze when available and permitted by the device/runtime.
2. Head-directed gaze as a fallback.

Cast a gaze ray from the appropriate gaze pose into the scene.
Identify the nearest eligible interactable object.
Support:

* Stones.
* Twigs.
* Grass.
* Logs.
* Crafting ingredients.
* Workbench.
* Fire pit.
* Construction snap points.
* Quest-related objects.
* Interactive UI elements.

Avoid targeting:

* Decorative scenery.
* Objects behind walls.
* Objects that are too far away.
* Objects that are not currently interactable.

Implement sensible interaction distances and target priorities.
Do not allow gaze to select objects through solid geometry.
4. Gaze visual feedback
When the player looks at an interactable object, show an immediate visual response.
I want:

* A subtle outline or glow.
* A small interaction indicator.
* Optional object name.
* A clear indication that the object is selected by gaze.

Use smooth transitions.
The highlight should appear quickly when gaze enters an object and disappear when gaze leaves it.
Avoid excessive glowing effects that make the world look artificial.
For construction snap points:

* Highlight the exact snap point.
* Show the required material.
* Indicate whether the held item is compatible.

For resources:

* Highlight the actual resource, not its entire surrounding area.

5. Pinch-to-select
Pinching should confirm the currently targeted object.
Support both left and right hands.
Requirements:

* Detect pinch start.
* Detect pinch hold.
* Detect pinch release.
* Prevent repeated activation while holding a pinch.
* Add sensible debounce and input thresholds.
* Handle temporary tracking loss.
* Avoid accidental selection from noisy hand tracking.

A single pinch should select the current gaze target.
The player should be able to grab an object by looking at it and pinching.
After grabbing, the object should follow the existing hand attachment or grab-anchor system.
Release should return the object to the existing physics and placement system.
6. Gaze-based grabbing and manipulation
Support the following interaction examples.
Gathering a stone
Look at the stone → pinch → stone is grabbed.
Picking up a log
Look at the log → pinch → grab it.
Allow existing two-handed manipulation if already supported.
Building a workbench
Look at a blueprint snap point → pinch while holding the correct stone → stone is placed.
Interacting with the workbench
Look at the workbench → pinch → open its interaction interface.
Crafting
Look at the required ingredient or crafting option → pinch to select.
Do not make every object behave identically. Respect existing object-specific interaction rules.
7. Interaction priority and conflict prevention
This is critical.
Gaze, direct hand interactions and any existing controller interactions must not compete.
Establish a clear interaction priority:

* Nearby direct physical interaction should remain available.
* Gaze should provide far interaction.
* Pinch should confirm the currently active target.
* A currently grabbed object should remain attached to the hand until released.
* A single pinch should never trigger multiple interaction handlers.

Prevent:

* Duplicate grabs.
* Accidental object releases.
* Unintended menu activation.
* Switching targets during an active grab.
* Gaze jumping between overlapping objects.

Use hysteresis or a small target-locking tolerance to prevent flickering when looking near object boundaries.
8. Input modes
Implement a consistent input abstraction.
Support:
Mode A — Gaze + Pinch

* Primary mode.
* Look at an object and pinch to interact.

Mode B — Direct Hand Interaction

* Existing close-range hand interactions remain available.

Mode C — Controller

* Preserve existing controller functionality if supported.

Mode D — Desktop

* Mouse hover and click should emulate gaze targeting and selection where appropriate.

Do not make the game dependent on a specific headset's eye-tracking hardware.
The game must remain playable when eye tracking is unavailable.
9. Tutorial integration
Integrate the new interaction method into the tutorial.
Add a short lesson:
LOOK AND PINCH

1. Ask the player to look at a highlighted stone.
2. Show the highlight.
3. Ask them to pinch.
4. Let them grab it.
5. Ask them to move their hand.
6. Ask them to release it.
7. Repeat with a construction snap point.

The tutorial must teach this through actual interaction.
Do not introduce lengthy text instructions.
PART 2 — TARGET 90 FPS
1. Performance objective
I want PRIMAL optimized for a stable 90 Hz experience on supported Meta Quest hardware.
The frame budget is approximately:
11.11 milliseconds per frame.
This is the maximum total frame time for consistently delivering 90 frames per second.
Do not simply set a refresh-rate value and declare the task complete.
The actual CPU and GPU workloads must fit within the frame budget.
2. Establish a performance baseline
Before optimization:

* Run the existing game.
* Measure frame rate.
* Measure CPU frame time.
* Measure GPU frame time.
* Measure draw calls.
* Measure triangle count.
* Measure memory usage.
* Measure physics workload.
* Measure scene loading and transition spikes.

Profile representative scenarios:

1. Initial forest scene.
2. Resource gathering.
3. Multiple objects being manipulated.
4. Workbench construction.
5. Fire-making.
6. Active campfire at night.
7. Full environment with lighting, particles and shadows.
8. Gaze highlighting with several interactable objects.

Identify the actual bottlenecks before changing graphics quality.
Create a baseline performance report.
3. Rendering optimization
Inspect and optimize the rendering pipeline.
Focus on:
Draw calls

* Reduce unnecessary draw calls.
* Merge static geometry where appropriate.
* Use instancing for repeated vegetation, rocks and environmental objects.
* Avoid unnecessary material duplication.
* Reuse materials.

Geometry

* Optimize high-poly assets.
* Use appropriate LODs.
* Reduce distant geometry complexity.
* Cull objects outside the player's view.
* Avoid rendering unnecessary hidden objects.

Lighting and shadows

* Reduce unnecessary real-time lights.
* Use baked lighting where suitable.
* Optimize shadow-casting objects.
* Reduce shadow-map resolution where appropriate.
* Avoid expensive dynamic lighting on distant objects.

Preserve the atmospheric quality of the forest.
Do not make the world visually primitive just to improve FPS.
Textures

* Optimize texture sizes.
* Use appropriate compression formats.
* Avoid unnecessarily large textures.
* Reuse texture atlases where useful.
* Prevent redundant texture loading.

Post-processing
Review every post-processing effect.
Remove or simplify effects that consume excessive GPU time without providing meaningful visual improvement.
Prioritize visual quality in the player's central viewing area.
4. Vegetation and environment optimization
The forest is likely to be one of the most demanding scenes.
Optimize:

* Trees.
* Grass.
* Shrubs.
* Stones.
* Ground details.
* Distant mountains.
* Environmental particles.

Implement appropriate:

* Frustum culling.
* Distance-based LOD.
* Instanced rendering.
* Visibility management.
* Shadow distance limits.

Avoid individually updating every static object every frame.
Distant vegetation should use cheaper representations.
5. Physics optimization
Inspect the physics system.
Optimize:

* Collision complexity.
* Static environment colliders.
* Dynamic object updates.
* Repeated collision checks.
* Unnecessary rigid bodies.
* Overlapping collision volumes.

Use simplified collision meshes for environmental objects.
Do not compromise the physical interaction quality of stones, logs, construction pieces or other objects the player manipulates.
6. JavaScript and CPU optimization
If the project uses JavaScript/WebXR:

* Eliminate unnecessary per-frame object allocations.
* Avoid repeated array creation in animation loops.
* Reuse vectors and temporary objects.
* Avoid unnecessary DOM updates.
* Reduce expensive raycasts.
* Avoid querying every interactable every frame.
* Use spatial partitioning where beneficial.
* Update static or distant systems less frequently.
* Avoid unnecessary React or UI rerenders if applicable.

The gaze system must also be optimized.
Do not perform expensive full-scene raycasts for every possible object every frame if a more efficient target-query approach exists.
7. Foveation and XR rendering
Investigate platform-supported rendering optimizations.
Where supported and appropriate:

* Fixed Foveated Rendering.
* Dynamic resolution scaling.
* Multiview or multiview rendering.
* Efficient stereo rendering.
* Appropriate XR render scale.
* Supported WebXR layers or equivalent native rendering features.

Do not introduce unsupported APIs.
Ensure the game remains visually comfortable and readable.
8. Refresh rate configuration
Configure the application to request 90 Hz on devices that support it.
If using Unity and Meta XR:

* Check supported display frequencies.
* Request 90 Hz using the supported Meta APIs.
* Handle refresh-rate change notifications.
* Handle unsupported devices gracefully.

If using WebXR:

* Inspect the browser/runtime's supported display-rate capabilities.
* Use supported APIs where available.
* Do not assume the application can force the headset's refresh rate through standard WebXR.

Always retain a sensible fallback.
Do not force 90 Hz on devices that cannot support it.
Do not make unsupported refresh-rate requests.
9. Performance monitoring
Introduce a developer-only performance overlay.
Display:

* Current FPS.
* Average FPS.
* CPU frame time.
* GPU frame time, where available.
* Frame-time spikes.
* Draw calls, where available.
* Current refresh rate, where available.

Include an option to enable or disable the overlay.
Do not show this overlay to normal players.
If possible, record performance statistics during a playtest and generate a report.
10. Performance acceptance criteria
The target is:

* 90 Hz refresh rate on supported devices.
* Sustained 90 FPS under representative gameplay conditions.
* Approximately 11.11 ms or less per frame.
* No persistent frame drops during normal exploration.
* No severe spikes when gathering or constructing.
* No major performance degradation when multiple objects are highlighted.
* No noticeable interaction lag.

Measure both CPU and GPU frame times.
Test the most demanding scenes, not just an empty forest.
If the game cannot sustain 90 FPS after reasonable optimization, identify the bottleneck and report the actual measured results. Do not fake the performance metrics or claim success based on the requested refresh rate alone.
PART 3 — TESTING AND COMPATIBILITY
Test the following:

1. Gaze targeting with eye tracking.
2. Head-gaze fallback.
3. Pinch selection with either hand.
4. Gaze-based object grabbing.
5. Object release.
6. Gaze-based blueprint placement.
7. Gaze-based UI selection.
8. Direct hand interaction.
9. Existing controller interaction.
10. Desktop emulation.
11. Tracking loss and recovery.
12. Gaze and pinch interaction during active gameplay.

For performance, test:

* Empty clearing.
* Dense forest.
* Daytime.
* Nighttime.
* Campfire.
* Multiple physics objects.
* Construction.
* Full gameplay.

Use actual Quest hardware for final performance verification.
Desktop FPS is not an acceptable substitute for headset performance.
PART 4 — IMPLEMENTATION ORDER
Implement in this order:
Priority 1: Gaze infrastructure

* Gaze source.
* Target resolution.
* Gaze hover.
* Pinch selection.

Priority 2: Gameplay integration

* Resource gathering.
* Object grabbing.
* Construction.
* Workbench.
* UI interactions.

Priority 3: Compatibility

* Head-gaze fallback.
* Direct hand interaction.
* Controllers.
* Desktop emulation.

Priority 4: Performance

* Baseline profiling.
* CPU optimization.
* GPU optimization.
* Geometry and vegetation optimization.
* Physics optimization.
* 90 Hz configuration.

Priority 5: Validation

* Automated tests.
* XR playtesting.
* Performance reports.
* Final optimization.

FINAL DESIGN GOAL
I want PRIMAL to feel like a native next-generation hands-only VR game.
A player should be able to:

* Look at a stone and pinch to grab it.
* Look at a workbench and pinch to interact.
* Look at a snap point and place the correct material.
* Look at a resource and collect it naturally.
* Manipulate objects using their hands without requiring controllers.

All of this should happen in a visually rich prehistoric world running smoothly at 90 FPS on supported Quest hardware.
Do not sacrifice the immersive physical nature of PRIMAL.
The target experience: Look naturally. Pinch intuitively. Interact physically. Run smoothly.Two official references for Claude
I'd also give Claude these references so it uses the right platform APIs:

1. [Meta Interaction SDK v207.0 release notes](https://developers.meta.com/vr/downloads/package/meta-xr-interaction-sdk-ovr-integration/207.0/?utm_source=chatgpt.com) — gaze interactions, grabbing and hover effects.
2. [Meta WebXR performance optimization workflow](https://developers.meta.com/vr/documentation/web/webxr-perf-workflow/?utm_source=chatgpt.com) — CPU/GPU profiling, draw calls and foveated rendering.

And this is useful for refresh-rate configuration: [Meta's display refresh-rate documentation](https://developers.meta.com/vr/documentation/unity/unity-set-disp-freq/?utm_source=chatgpt.com).
My recommendation: Implement Gaze + Pinch first, test it thoroughly, and then optimize the game. Otherwise, you risk optimizing the current rendering workload and subsequently introducing new costs from gaze targeting, highlighting and interaction processing.
