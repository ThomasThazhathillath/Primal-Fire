# EUREKA: Survive through Science

A hands-first VR science-survival game (formerly *PRIMAL: First Fire*, made for the **Meta VR Start Developer Competition 2026**, Gaming · New Experience). You wake on the forest floor with nothing. Every machine is gone; the science isn't. Five lessons take you from bare hands to shelter, fire, clean water, tools and food, and every step is an experiment.

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

The game is five lessons ([docs/CURRICULUM.md](docs/CURRICULUM.md)). **The First Steps** (the tutorial) teaches the
controls first.

1. **Lesson 01, Shelter:** night is coming. Gather stones and build a workbench, twist cord, raise and lash a lean-to,
   roof it in layers, survive the rain test, find out by experiment how many layers keep rain out, and make a bed.
2. **Lesson 02, Fire:** dead and green wood, tinder, a bow drill, a fire pit and fire lay, an ember, fire, charcoal.
3. **Lesson 03, Water:** fire a clay pot, filter and boil stream water; clear is not the same as safe.
4. **Lesson 04, Tools:** knap a flake, cut with it, make a stone axe and split wood.
5. **Lesson 05, Food & Navigation:** spear and cook a fish, grow food, follow tracks, find your way to the Science
   Roadmap.

The objective card always says the next step and which lesson it belongs to; ask for a hint up to four times.
Your body needs warmth, water, food and rest (gentle by default; Settings > Survival pressure). Every outcome goes
in the **Lab Notebook** (Notes icon or N), organised by lesson and science concept, with your experiments and
predictions. Big discoveries light nodes on the **Science Roadmap** wall in the ruins.

**Resources:** stones, flint, sticks, bark, clay, sand and gravel now lie in natural deposits (rocky deposits beside outcrops and on the stream bank, sticks and bark round fallen trunks, clay/sand/gravel beds along the water), so you never walk far for a stone or a flint. Pick them one at a time. Used spots stay used after a reload; sticks and leaves regrow within minutes, stones and flint only very slowly, clay and sand are big finite beds. Large boulders and fallen trunks stay scenery (see `src/game/resource-class.ts`).

**New player experience and settings** (branch `claude/npe-accessibility`, docs/NPE_PLAN.md): the first five
minutes follow five stages (wake and move, first find, the pouch, the workbench and cord, the notebook) and reveal
the menu and the objective card as they are taught; pickups lock onto the thing you aimed at when you pinch and
say whether they can be taken; a pinch on a button presses it; help grows step by step when you seem stuck and
goes away when you succeed; the card always says the next action; a small compass points to camp. **Settings**
(from the pause card or the title menu): Guided / Standard / Explorer, text size, hint frequency, guidance markers,
interaction sensitivity and seated assist, applied at once and remembered (`primal-first-fire.settings.v1`).
Checked in the emulator only, not on a headset.

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
