# Performance report — gaze + pinch and the 90 fps target

Date: 2026-11-10. Branch `claude/gaze-90fps-cbdc83`.

**Read this first.** Every number below was measured in IWER (the IWSDK browser XR emulator) running in headless
Chromium on a Mac. That covers stereo rendering of the real scene, but it is **not** Quest hardware:

- Frame rate is pinned to the Mac display's 60 Hz vsync, so the FPS, "frames within 90 Hz budget" and spike
  counts from this run tell you nothing about the Quest. They are left out of the conclusions.
- CPU ms is the page's own work per frame (first ECS system → end of `renderer.render`). A Quest 3 CPU is
  several times slower than this Mac, so treat these as relative numbers, not as Quest frame times.
- GPU time: WebGL has no per-frame GPU timer in this build, so the overlay shows `GPU n/a`. Measure it on the
  headset with OVR Metrics Tool, or with the Meta WebXR performance workflow.
- Physics: `world.features.physics` is off. Carry, drop and collision use the game's own 2D collision grid
  (`src/game/collision.ts`), so there is no rigid-body workload to profile.

**Sustained 90 fps on Quest is not verified yet. That check is the user's next step** (see the last section).

## How it was measured

- `window.__perf.reset()` / `window.__perf.sample()` (`src/systems/perf-system.ts`) record frame time, CPU time,
  draw calls, triangles, geometries/textures/programs, JS heap, and the session's display rate.
- Script: `artifacts/gaze/perf.sh`. It sets up each scenario, waits 1.5 s, then samples for 5 s
  (about 300 frames).
- CPU per system: `artifacts/gaze/sys.sh`. It wraps each ECS system's `update` for 4 s.
- Scene breakdown: `artifacts/gaze/scan.sh` (visible meshes, triangles, instancing, shadows, lights).
- The dev overlay is turned on with `?perf` in the URL or `window.__perf.overlay(true)`. It shows FPS (now and
  average), CPU ms, GPU (n/a), spikes, worst frame, draw calls, triangles and display Hz.

## What the scene costs (baseline breakdown)

- Shadows are already off (`shadowMap.enabled = false`). There are 3 lights (hemisphere, directional, one point
  light for the fire). There is no post-processing pass. The pixel ratio is 1.
- Triangles (visible, one eye): forest trees 116k (4 instanced meshes), ground detail 101k (3 instanced),
  ground 80k (one mesh), undergrowth 33k (4 instanced). Everything else is small.
- One instanced mesh has a single bounding sphere covering the whole forest, so **every tree is drawn even when
  it is behind you**.
- CPU by system (per frame): IWSDK `InputSystem` **1.73 ms**, PanelUISystem 0.27, TransformSystem 0.09,
  IconBar 0.08, HandInput 0.07. Everything else is under 0.05 ms. `GazeTargetSystem` costs **0.027 ms**.
  `InputSystem` raycasts every `RayInteractable` each frame, and that includes every resource spot on the map,
  most of them far outside the 6 m gathering reach.
- Display rate: IWER's Quest 3 profile offers `supportedFrameRates` [72, 80, 90, 120], and the session ran at
  90 Hz once the app requested it.

## Baseline (before optimisation, gaze already in)

| Scenario | CPU ms (mean / p95) | Draw calls | Triangles (stereo) | JS heap MB |
| --- | --- | --- | --- | --- |
| 1 Initial forest, day, spawn | 4.88 / 5.1 | 408 | 704k | 340 |
| 2 Dense forest view | 4.67 / 4.9 | 370 | 698k | 342 |
| 3 Resource gathering + gaze target | 4.81 / 5.0 | 372 | 699k | 350 |
| 4 Multiple objects (8 drops, held log) | 4.72 / 4.9 | 368 | 698k | 357 |
| 5 Construction (outline, stone held, marks lit) | 5.14 / 5.4 | 406 | 701k | 354 |
| 6 Night (22:00), looking at build | 5.24 / 5.5 | 430 | 705k | 368 |
| 7 Night, full view | 5.25 / 5.5 | 450 | 707k | 381 |

Raw data: `artifacts/gaze/perf-baseline.jsonl`. Not measured: an active campfire at night with fire particles
(there is no debug path that lights a fire quickly), and scene-load or transition spikes. In the gaze scenario
(3), the worst frame was 30 ms, once, in the moment the target was acquired.

## What changed

1. **Pointer-target culling** (`PerfSystem.cullRays`): a resource spot keeps `RayInteractable` only within
   7.5 m of the head, re-checked twice a second with hysteresis. Nothing beyond 6 m can be gathered anyway.
   Measured: `InputSystem` went from 1.73 ms to **0.58 ms** per frame (−66%).
2. **Spatial chunks for big instanced scenery** (`chunkInstanced`): instanced meshes that draw ≥ 15k triangles
   (trees, ground detail) are split into 31 m cells, each with its own bounding sphere, so cells outside the
   view are frustum-culled. Geometry and materials stay shared, and the split happens once, 4 s after start.
   - The first try used 14 m cells: triangles −43%, but draw calls doubled (~850) and CPU went up. Rejected.
   - 46 m cells did worse than 31 m.
3. **90 Hz request** (`WorldSystem`, `pickFrameRate`): `updateTargetFrameRate(90)` is called only when the
   session's `supportedFrameRates` includes 90. Otherwise the runtime default stays. The previous code always
   asked for 72.
4. **Fixed foveation**: kept at `setFoveation(1)`, which was already in place.
5. **Gaze is cheap by construction**: a 10 Hz candidate list within 8 m (about 20–40 entries), cone scoring per
   frame, and an occlusion test only for the winner and the best challenger, using the 2D collision grid. No
   per-frame allocation, and no scene raycasts of its own.

## After

| Scenario | CPU ms (mean / p95) | Draw calls | Triangles (stereo) | JS heap MB |
| --- | --- | --- | --- | --- |
| 1 Initial forest | 4.86 / 5.2 | 550 | 480k | 323 |
| 2 Dense forest view | 4.75 / 5.6 | 494 | 506k | 315 |
| 3 Gathering + gaze target | 4.61 / 4.9 | 506 | 514k | 340 |
| 4 Multiple objects | 4.57 / 5.0 | 504 | 513k | 325 |
| 5 Construction | 4.61 / 4.9 | 518 | 514k | 332 |
| 6 Night | 4.81 / 5.1 | 550 | 495k | 344 |
| 7 Night, full view | 4.77 / 5.0 | 560 | 480k | 335 |

- Triangles per stereo frame: **−27 to −32%**.
- CPU: about −3% on average. This is within run-to-run noise (±0.3 ms). The `InputSystem` saving is partly
  used up by about 130 extra draw calls (about 65 per eye) from the chunks.
- Heap varies by ±30 MB between runs. That is garbage-collection timing, not a measured leak.

## The bottleneck still to watch, and what to check on the Quest

- **Draw calls (~250 per eye)** are now the main risk for CPU on the Quest, and **triangles (~240k per eye)** for
  GPU. If the Quest's CPU frame time is over budget, the next step is to merge the per-spot resource meshes
  (3–5 meshes each), the IconBar (60 meshes, 57 materials) and the ObjectiveCard (21 meshes). If the GPU is over
  budget, the ground mesh (80k triangles) and the ground detail are the next targets.
- If the Quest turns out to be draw-call bound rather than vertex bound, set `CHUNK_MIN_TRIS` very high to turn
  chunking off. It is a one-line change and the effect is easy to measure.

On the headset: open the app with `?perf`, then check the overlay's FPS, CPU and spikes in each scenario above.
Use OVR Metrics Tool for GPU time and the real display rate. **Do not count 90 fps as reached until the Quest
measurements say so.**


## Trees: baked EZ-Tree variants (branch `claude/ez-trees`)

The low-poly forest (3 instanced meshes) was replaced by five baked [EZ-Tree](https://github.com/dgreenheck/ez-tree) variants
(MIT): oak, ash, aspen, pine and a dead snag. `scripts/trees/bake.mjs` (build time only, `npm run trees:bake`) generates each at three
levels of detail into `public/trees/*.glb` with alpha-tested leaf cards (no blending) and bark as vertex colours; the library is a
dev dependency and is never imported by the app. `TreeSystem` draws them: one InstancedMesh per variant and level (trunk and leaves in
one geometry), a camera-facing billboard baked at start-up beyond 26 m, instances re-bucketed by distance 10 times a second, trees
behind you skipped, wind as a vertex sway only. Positions, collision, perching, sightlines and gaze occlusion still come from `TREES`.

| Level | Distance | Triangles per tree |
|---|---|---|
| LOD0 | under 6 m | 2.9k to 12.2k |
| LOD1 | 6 to 14 m | 0.5k to 2.0k |
| LOD2 | 14 to 26 m | 0.1k to 0.6k |
| Billboard | beyond 26 m | 2 |

Small trees and the 420 understory saplings count their distance 1.2 to 2.2 times over, so they drop levels sooner.

Measured in the IWER browser (flat view, clear weather, noon, 4 s sample, same script before and after). **Not a Quest.**

| Viewpoint | | Draw calls | Triangles | CPU ms | Scene meshes |
|---|---|---|---|---|---|
| Spawn clearing | before (main a538d22) | 216 | 236,142 | 4.71 | 1713 |
| Spawn clearing | after | 203 | 199,004 | 4.85 | 1684 |
| Dense forest | before | 159 | 173,912 | 4.72 | 1505 |
| Dense forest | after | 163 | 204,772 | 4.70 | 1476 |

- Trees alone in the dense view: 62k triangles, 17 draw calls (3 full, 23 medium, 67 low and 438 billboard instances drawn).
- Triangles are about 15% lower at spawn and about 18% higher in the dense forest. Draw calls and CPU are unchanged within noise.
- Billboards are rendered once at start-up into 128 px textures per variant; the leaf textures (512 px, four of them) add about 21 MB of GPU memory with mipmaps.
- GLB payload is about 3.8 MB in total (embedded textures).
- Not measured: a headset. The editor preview of the scene no longer shows trees (they are runtime only).

Follow-up (clean screenshots round): LOD0 foliage was made fuller (it looked skeletal), bark colours lightened, and the billboard bake
uses flatter light so far trees no longer look pale. The table above shows the final per-level counts. The two tables of measurements
above were taken before this change with the HUD visible; the new clean shots in `docs/shots-trees/clean-*.jpg` were taken with all
UI hidden, so draw call counts from that session (about 115 to 158) are lower for that reason and are not comparable.


## Modern look round (branch `claude/modern-look`)

Method: IWER browser, flat view, clear noon, same viewpoint before and after each stage, HUD hidden, 4 s sample. Not a Quest.

| Stage | | Draw calls | Triangles | CPU ms |
|---|---|---|---|---|
| 1 Bushes (EZ-Tree bush presets, LOD0-2 and billboards, instanced) | before | 189 | 201,686 | 4.58 |
| | after | 196 | 198,692 | 4.88 |

Stage 1: the 260 faceted icosahedron shrubs became three baked EZ-Tree bush variants drawn by the same `TreeSystem` as the trees, so no new
system and +7 draw calls. Bush full detail is 2.2k to 8.4k triangles but only within about 2.5 m; beyond about 21 m they are 2-triangle billboards.

| 2 Rocks (Poly Haven Rock Moss Set 01) | before (= stage 1 after) | 196 | 198,692 | 4.88 |
| | after | 210 | 214,708 | 4.69 |

Stage 2: the 45 boulders are six baked rocks (2.2k / 450 / 110 triangles) drawn by `RockSystem` with distance LOD; collectible stones, flint and chalk are
110-triangle vertex-coloured versions of the same rocks (no texture) so decor (large, textured, mossy) and resources (small, tinted, with a pickup ring)
stay different. Rock GLB 2.4 MB with embedded 1K JPEGs (JPEG, not KTX2: no basis encoder is installed). +14 draw calls, +16k triangles.
| 3 Ground (zone-blended Poly Haven textures with normal and roughness, plus grass tufts) | before (= stage 2 after) | 210 | 214,708 | 4.69 |
| | after | 211 | 237,138 | 4.81 |

Stage 3: `GroundSystem` swaps the ground for a MeshStandardMaterial that blends three textures by a per-vertex zone weight (6 texture fetches, no
extra geometry). `GrassSystem` adds one InstancedMesh of up to 2,400 five-blade tufts (10 triangles each, about 24k) on a hashed 1 m grid within 11 m of
the camera, shrinking to nothing at the edge; it re-lays every 0.2 s only when you have moved 0.35 m and allocates nothing. +1 draw call, +22k triangles.
Also fixed: `environment-system` looked the ground up by a name the scene does not use ("Forest Ground"), so wet-ground darkening never applied; it does now.
| 4 Sky (three.js physical Sky + Poly Haven photo clouds) | before (= stage 3 after) | 211 | 237,138 | 4.81 |
| | | after | 213 | 233,974 | 4.41 |

Stage 4: the Preetham `Sky` box (12 triangles) is drawn behind the world and fades out at night so the existing gradient dome, stars and moon still show; a
second dome carries the photographed clouds (alpha mask from the Poly Haven HDRI, tinted warm at dusk, faded at night, thicker with the weather's cloud cover).
Two extra draw calls and no per-frame allocation. The scene's image-based light is still the time-of-day gradient (`IBLGradient`), not a PMREM of the physical sky.
| 5 Stream look (dual scrolling normals, sky and cloud reflection, bed and depth tint, wet banks) | before (= stage 4 after) | 213 | 233,974 | 4.41 |
| | after | 213 | 235,488 | 4.55 |

Stage 5: look only. The water shader gains a second counter-scrolling normal layer, a Fresnel reflection of the sky gradient plus the photographed clouds
(sampled by the reflected ray from the cloud texture, no second scene render), the mud texture as a bed seen through the shallows with a depth tint toward
the middle, and variable transparency; the ground shader darkens and glosses the mud zone for wet banks. The stream mesh, its path and every water hook are
untouched. No new draw calls. Not done: foam rings round individual rocks (the bank foam and crest foam are the old ones).
| 6 Fern cards, baked-rock leftovers, round particles, ACES tone mapping | before (= stage 5 after) | 213 | 235,488 | 4.55 |
| | after | 209 | 222,650 | 4.68 |

Stage 6 (partial, see PROJECT_STATUS): the 700 spiky faceted ferns became arching leaf cards (9/6/4 cards by distance, 2-triangle billboards far away) drawn by
`TreeSystem`; the story clue stones, mossy rocks and gravel beds use the baked rock shapes; every `PointsMaterial` particle is now a soft round point (one
shared fragment tweak); the renderer uses ACES filmic tone mapping at exposure 1.05. Fewer triangles than before the stage (the spiky ferns were more geometry
than the cards), draw calls 209. Total over the whole round (stage 1 before to stage 6 after): draw calls 189 to 209, triangles 201,686 to 222,650, CPU
4.58 to 4.68 ms in the IWER browser. Not measured on a Quest. No real-time shadows were added.
