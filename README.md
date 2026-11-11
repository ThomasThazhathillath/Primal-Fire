# PRIMAL: First Fire

A hands-first VR science-survival game for the **Meta VR Start Developer Competition 2026** (Gaming · New Experience). You wake on the forest floor with nothing. Every machine is gone; the science isn't. Gather, build and experiment your way from bare hands to fire, charcoal and clean water.

Built with Meta's **Immersive Web SDK (IWSDK)** on three.js and WebXR, and shipped as a link (GitHub Pages). Design and plans live in [`docs/`](docs/): start with [PROJECT_STATUS.md](docs/PROJECT_STATUS.md) (current state and the docs index) and [DESIGN.md](docs/DESIGN.md). The original browser prototype is in [docs/prototype/](docs/prototype/README.md).

## Run it

Node 22.12+ (see `.nvmrc`).

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` opens a managed browser with IWSDK's **IWER** emulator (an emulated Quest 3 in the browser). Click **Enter XR** to play in emulated VR, or play on the desktop without entering XR. To play on a real Quest, run the dev server and open one of the `runtimeUrls.network` addresses from `npx @iwsdk/cli dev status` on the headset (same Wi-Fi), accepting the local certificate warning.

The game is **hands-only** in VR; controllers also work.

| Desktop | VR (hands) |
|---|---|
| `W A S D` / arrows walk, `Q` `E` turn | Teleport with a hand gesture (blocked near the menu) |
| Mouse hover + click: gather, place, use | **Look + pinch** (gaze and pinch), or point and pinch up close |
| `Tab` satchel · `R` put back · `G` / `F` take / stash | Pinch the satchel on your hip; pinch an empty mark to fill it from the bag |
| `U` use the held tool (dig, fire, pour) | Make the motion (dig, saw, twist, fan) |
| `H` hint · `N` notebook · `J` guide · `T` skip / mute story thoughts | Menu button on the right (folding icon grid, fingertip tap or gaze + pinch) |
| `V` shoot (bow) | Draw and release |

Add `?perf` to the URL for the developer performance overlay, or `?resdebug` for the resource layout view (spot markers, hit spheres, cluster rings, counts; developers only). Double-tap the restart icon to start over.

## How to play

1. **The First Steps** (tutorial, the story opening): wake in the clearing and learn look-and-pinch, gathering, the satchel, carrying, the workbench, cord and fire before nightfall. What you learn carries into the survival game.
2. **Chapter 1 — First Fire:** quests say what you *need*, not where. Ask for a hint up to three times (science clue → kind of place → direction with a light pillar and ground glow). Build a workbench and fire pit by snap-to-blueprint, craft a bow drill, make fire, then pottery, charcoal and clean water, and establish your first camp. Story thoughts follow your discoveries and end with the ruins teaser.
3. **Chapter 2 — The Living Camp:** gather poles, branches, cord, grass and bark; set the poles, add cross-supports, lash them with a twist, roof the frame in layers, then survive a rain test: find the leaks, patch them and dig a drainage channel.
4. **Phase 3 — The Living World** (open from the start, in any order; branch `claude/phase3-living-world`): deer, rabbits and birds live in the forest and notice how loud you are. Look for **tracks** and read whose they are and how old; **plant** seeds, water them and watch them grow through sprout, young, mature and harvestable (keep some seed); **forage** only plants you have looked at closely, because some look-alikes are poisonous; **spear, gut, cook** a fish and **dry** food on a rack; build a **bed, firewood stack with a bark cover and a storage basket**. Seven field tasks (The Hidden Trail, The Living Forest, Seeds of Tomorrow, A Growing Future, From Stream to Fire, Preserving the Harvest, A Home That Provides) follow your progress on the quest card. Checked in the emulator only, not on a headset.
5. Every outcome is recorded in the **Lab Notebook** as Observation → Principle → Real-world limit (92 observations), and big discoveries light nodes on the **Science Roadmap** wall in the ruins.

**Resources:** stones, flint, sticks, bark, clay, sand and gravel now lie in natural deposits (rocky deposits beside outcrops and on the stream bank, sticks and bark round fallen trunks, clay/sand/gravel beds along the water), so you never walk far for a stone or a flint. Pick them one at a time. Used spots stay used after a reload; sticks and leaves regrow within minutes, stones and flint only very slowly, clay and sand are big finite beds. Large boulders and fallen trunks stay scenery (see `src/game/resource-class.ts`).

Progress saves in the browser automatically (`primal-first-fire.save.v1`, migrated safely between versions).

Trees are baked with [EZ-Tree](https://github.com/dgreenheck/ez-tree) (MIT, Daniel Greenheck) by `npm run trees:bake` into `public/trees/`; see `docs/PERF_REPORT.md`.

## Look (modern-look round, branch `claude/modern-look`)

Trees, shrubs and ferns are EZ-Tree bakes; boulders and collectible stones are Poly Haven Rock Moss Set 01; the ground blends three Poly Haven textures by zone with
normal and roughness maps and has instanced grass tufts; the sky is the three.js physical Sky with photographed Poly Haven clouds; the stream reflects the sky and
clouds; ACES tone mapping. Sources and licences: `docs/ASSETS.md`. Numbers: `docs/PERF_REPORT.md`. Screenshots: `docs/shots-revamp/`. Checked in the emulator only, not on a headset.

## Project layout

```
iwsdk.config.json          IWSDK project authority: scene, assets, XR features
src/game/                  pure game rules, no rendering: items, observations,
                           quests, objectives, hints, blueprints, story beats,
                           tutorial lessons, gaze targeting, intent, shelter,
                           weather/sky, world layout, save data
src/systems/               IWSDK ECS systems: hand input, gaze, carry, building,
                           shelter, fire, water, satchel, menu bar, HUD, story,
                           tutorial, environment/sky, perf overlay, desktop controls
src/scene-assets/          procedural low-poly forest, landmarks and item meshes
src/debug-hooks.ts         window.__primal: drive the game from the console
public/scenes/             scene composition (JSON)
public/ui/                 UIKitML panels (HUD, satchel, notebook card, tooltip)
tests/                     unit tests for src/game (vitest)
scripts/                   play-test and state scripts for the IWSDK CLI
docs/                      design, status, setup guides and the v3 prototype
```

## Checks

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

About 600 unit tests cover the game rules. End-to-end browser checks run against the dev session (`scripts/`: `playtest.mjs`, `tutorial-check.mjs`, `story-check.mjs`, `gaze-ui-check.mjs` and others):

```bash
npx @iwsdk/cli dev up --allow-browser-automation
```

```bash
npx @iwsdk/cli browser run scripts/playtest.mjs --timeout 110000
```

`window.__primal` (see `src/debug-hooks.ts`) exposes `begin`, `goTo`, `face`, `gather`, `spots`, `take`, `place`, `fill`, `craft`, `hint`, `log`, `state` and `reset`. The event log (`__primal.log()`) is the thing to paste into a bug report.

## Deploy

Pushing to `main` runs [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml): typecheck, tests, build, then publish `dist/` to GitHub Pages. One-time setup: repository **Settings → Pages → Source: GitHub Actions**.

The project also contains IWSDK's agent guidance (`AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/`, `.cursor/` …) generated by `npm create @iwsdk`.
