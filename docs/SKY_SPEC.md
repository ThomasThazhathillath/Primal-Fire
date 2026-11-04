# Sky, celestial objects and distant mountain atmosphere (owner brief, verbatim)

PRIMAL: FIRST FIRE — SKY, CELESTIAL OBJECTS AND DISTANT MOUNTAIN ATMOSPHERE ENHANCEMENT
You are working inside the existing PRIMAL: First Fire repository.
Your task is to significantly improve the sky and distant environmental scenery to make the wilderness feel like a large, believable natural world.
Focus exclusively on:

1. Night sky with stars and moon.
2. Day sky with sun and clouds.
3. Realistic atmospheric sky transitions.
4. Distant mountain appearance.
5. Atmospheric fog and depth.
6. Integration with the existing day/night cycle.

Do not redesign the gameplay, terrain layout, quest system, interaction system or existing forest.
Do not replace the existing environment architecture unnecessarily.
First inspect the existing Three.js scene, sky implementation, lighting, fog, environmental systems and day/night cycle.
Reuse existing systems wherever possible.
The current night sky should feel like an actual wilderness night rather than a dark empty background.
A. STARS
Introduce a natural-looking star field.
Requirements:

* Hundreds or thousands of small stars distributed across the visible sky.
* Natural variation in brightness.
* Different star sizes.
* Subtle brightness variation.
* Some stars should be barely visible.
* A small number of slightly brighter stars.
* Avoid perfectly uniform distribution.
* Avoid stars appearing as large glowing dots.
* Avoid excessive brightness.

Stars should be visible primarily during nighttime.
They should gradually fade in as daylight disappears and gradually fade out as morning approaches.
Do not abruptly switch them on or off.
Use efficient rendering, such as a single BufferGeometry with Points or another lightweight approach.
Do not create thousands of individual Three.js objects.
B. MOON
Introduce a clearly visible moon in the night sky.
The moon should:

* Have a natural circular appearance.
* Have a subtle luminous glow.
* Have a realistic pale white or slightly warm-grey surface.
* Be distinguishable from the stars.
* Be positioned high enough to be visible from the playable area.
* Move slowly across the sky as time progresses.

Avoid making the moon excessively large.
Implement a subtle atmospheric halo around it.
If feasible within the performance budget, introduce simple lunar surface shading or a lightweight texture.
Do not use an oversized glowing white sphere.
C. MOONLIGHT
The moon should contribute to the nighttime atmosphere.
Introduce subtle cool-toned ambient illumination.
The forest should remain dark enough to feel like night, but the player should still be able to recognise nearby objects.
Ensure the existing campfire remains an important local light source.
The campfire should illuminate nearby stones, trees, ground and the player's surroundings.
D. OPTIONAL MOON PHASES
If the existing day/night system supports it without substantial complexity, introduce gradual moon phases.
Possible phases:

* New moon.
* Crescent.
* Half moon.
* Gibbous.
* Full moon.

This is optional and should not delay the core implementation.
The daytime sky should look open, natural and atmospheric.
A. SUN
Introduce a clearly visible sun.
Requirements:

* Natural sunlight appearance.
* Soft glow.
* Appropriate sky positioning.
* Smooth movement throughout the day.
* Consistent relationship with directional lighting.
* Gradual colour changes during sunrise and sunset.

The sun must not look like a giant white sphere pasted onto the sky.
Use an appropriate sun representation, shader or sprite with atmospheric blending.
The directional light should follow the sun's position.
Shadows and environmental illumination should respond consistently to the time of day.
B. CLOUDS
Introduce natural-looking clouds.
Requirements:

* Multiple cloud formations.
* Different sizes and shapes.
* Varied density.
* Soft edges.
* Different heights.
* Slow movement across the sky.
* Natural spacing.
* No obvious repetitive patterns.

Clouds should look like distant atmospheric formations, not floating white blobs.
Use lightweight cloud textures, procedural geometry, sprites or shaders as appropriate.
Avoid expensive volumetric cloud simulation.
Cloud movement should be slow and subtle.
C. CLOUD LIGHTING
Clouds should respond visually to the sun.
During daytime:

* White illuminated regions.
* Soft grey undersides.
* Subtle shading.
* Natural brightness variation.

During sunset:

* Slight warm illumination.
* Orange and pink highlights where appropriate.

During sunrise:

* Soft golden illumination.

During nighttime:

* Clouds should become darker and blend naturally into the night sky.
* Stars should not visibly render on top of opaque clouds.

D. CLOUD DENSITY
Introduce some variation in cloud coverage.
Some periods should have relatively clear skies.
Other periods should have partially cloudy skies.
Avoid constantly covering the entire sky.
Make the transition between day and night visually convincing.
Do not abruptly change the sky material.
Implement gradual transitions for:

* Sky colour.
* Sun visibility.
* Moon visibility.
* Star visibility.
* Cloud illumination.
* Ambient light.
* Directional light.
* Fog colour.
* Environmental brightness.

SUNRISE:

* The horizon gradually becomes brighter.
* Sky transitions from dark blue to warm dawn colours.
* Stars disappear gradually.
* The sun rises.
* Clouds receive warm light.
* Forest illumination increases naturally.

SUNSET:

* Sun gradually approaches the horizon.
* Daylight becomes warmer.
* Sky shifts to orange, pink and deep blue tones.
* Clouds receive warm highlights.
* Moon becomes visible.
* Stars gradually appear.

Avoid sudden lighting changes.
Ensure the transition remains smooth when the player loads an existing saved game at a particular time of day.
This is an especially important visual improvement.
The mountains in the distance currently appear too white and foggy.
They should retain their atmospheric distance while having a more recognisable rocky appearance.
The desired appearance:
Distant mountain silhouettes with muted grey, beige-grey and slightly brownish stone colours, partially obscured by atmospheric haze.
They should look like real distant rocky mountains rather than white clouds.
A. MOUNTAIN COLOUR
Introduce natural stony colours.
Suggested palette:

* Muted grey.
* Grey-brown.
* Weathered stone.
* Slightly warm beige-grey.
* Desaturated blue-grey in the far distance.

Avoid:

* Pure white.
* Extremely bright grey.
* Saturated artificial colours.
* Strong black outlines.

The mountains should be visible but subdued.
B. MOUNTAIN DETAIL
Introduce subtle rocky surface variation.
Where appropriate:

* Gentle ridge variation.
* Rocky slopes.
* Slightly uneven silhouettes.
* Subtle geological colour variation.
* Natural mountain contours.

Do not make the mountains appear like detailed nearby rocks.
They should retain the scale and appearance of distant terrain.
C. ATMOSPHERIC FOG
The mountains should become progressively lighter and less detailed with distance.
Use atmospheric perspective.
Nearby distant ridges:

* More visible.
* Stronger stony colours.
* More recognisable contours.

Farther ridges:

* Lower contrast.
* More desaturated.
* More atmospheric haze.
* Softer silhouettes.

Avoid making every mountain uniformly white.
D. FOG COLOUR
Make fog respond to the sky.
Day:

* Soft neutral grey-blue haze.
* Slightly warm haze near sunrise and sunset.

Night:

* Darker blue-grey atmosphere.
* Mountains should remain faintly visible where appropriate.

The fog should blend naturally with the horizon.
Do not create an obvious white horizontal fog wall.
E. MOUNTAIN LAYERS
If the existing mountain implementation allows it, introduce several layers of distant ridges.
The closest mountain range should have a stronger rocky appearance.
Farther ranges should gradually fade into the atmosphere.
This creates a sense of scale and depth.
Preserve the existing terrain layout and landmarks.
Do not unnecessarily increase polygon counts.
Pay special attention to the transition between the sky, mountains and forest.
The horizon should not look like a hard line separating two different images.
Implement:

* Natural atmospheric blending.
* Distance-based desaturation.
* Soft fog transitions.
* Consistent sky and mountain colour.
* Appropriate horizon brightness.

The distant mountains should blend into the sky without disappearing completely.
Make the horizon look natural from different viewing directions.
Ensure the player does not see obvious seams, rectangular cloud planes or gaps in the sky dome.
Inspect the existing time and lighting system.
Integrate the new sky elements into the current system.
Do not create a second independent day/night clock.
All celestial objects should derive their positions and visibility from the same existing time source.
Coordinate:

* Sun position.
* Moon position.
* Star visibility.
* Cloud illumination.
* Directional lighting.
* Ambient lighting.
* Fog.
* Sky colour.

Ensure all components remain synchronised.
PRIMAL runs on standalone Meta Quest hardware.
Performance is essential.
Requirements:

* Avoid expensive volumetric effects.
* Avoid thousands of individual star meshes.
* Avoid excessive transparent overlapping cloud layers.
* Use efficient shaders.
* Reuse materials.
* Use instancing or particle geometry where appropriate.
* Avoid unnecessary per-frame object creation.
* Update sky parameters efficiently.
* Keep draw calls low.

Target stable 60 FPS or better on the actual target Quest device.
The sky must not become a major performance bottleneck.
Before making changes:

1. Inspect the existing sky implementation.
2. Identify the current day/night controller.
3. Identify existing mountain meshes and fog.
4. Identify directional and ambient lighting.
5. Identify any existing sky shaders.
6. Determine the correct extension points.

Then implement the enhancements.
TEST 1 — DAYTIME
Expected:

* Clearly visible sun.
* Natural blue daytime sky.
* Soft clouds.
* Stony distant mountains.
* Atmospheric depth.

TEST 2 — NIGHTTIME
Expected:

* Visible stars.
* Clearly recognisable moon.
* Cool moonlit atmosphere.
* Darker forest.
* Campfire remains visually important.

TEST 3 — SUNRISE
Expected:

* Smooth transition.
* Stars fade out.
* Sky brightens.
* Sun appears.
* Clouds receive warm illumination.

TEST 4 — SUNSET
Expected:

* Warm sky colours.
* Sun approaches horizon.
* Stars gradually appear.
* Moon becomes visible.

TEST 5 — MOUNTAIN APPEARANCE
Expected:

* Mountains have natural grey and grey-brown stone colours.
* They are not pure white.
* Distant ridges fade progressively into atmospheric haze.
* They retain recognisable silhouettes.

TEST 6 — QUEST AND GAMEPLAY REGRESSION
Expected:

* No changes to existing gameplay.
* No changes to quest progression.
* No changes to interaction systems.
* No changes to terrain layout.

TEST 7 — PERFORMANCE
Expected:

* Stable frame rate.
* No excessive draw calls.
* No major memory increase.
* No shader compilation problems.

After implementation:

* Run typecheck.
* Run unit tests.
* Run production build.
* Test both day and night.
* Inspect sunrise and sunset transitions.
* Validate performance on actual Quest hardware.

Do not claim Quest hardware validation unless performed.
FINAL VISUAL DIRECTION:
DAY:
A beautiful natural wilderness with a blue sky, a visible sun, slowly drifting clouds and distant rocky mountains in muted stone colours.
NIGHT:
A believable wilderness night with a moon, scattered stars, dark atmospheric mountains and a forest illuminated subtly by moonlight and the player's campfire.
MOUNTAINS:
They must look like distant rocky mountain ranges, with grey and grey-brown stone tones gradually fading into atmospheric haze, NOT white fog-shaped objects.
Preserve the existing environment and improve its realism rather than rebuilding it.
