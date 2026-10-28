# PRIMAL: First Fire — Project Status

Meta VR Start Developer Competition 2026 · Gaming track · New Experience division
**Deadline:** Nov 19, 01:30 IST (treat as end of **Nov 18**)
**Engine:** **Immersive Web SDK (IWSDK)**, confirmed Oct 27. The official rules explicitly accept IWSDK/WebXR entries, which are submitted as a hosted link. The Unity guide ([SETUP_UNITY.md](SETUP_UNITY.md)) is kept for reference only.

## What the official rules require ([Devpost rules](https://start-developer-competition-26.devpost.com/rules), read Oct 27)

- **Deadline:** Nov 18, 2026, 12:00 PM PT, which is Nov 19, 01:30 IST. **You can't change the entry after the deadline.**
- **Eligibility:**
  - You must be 18 or older.
  - You need a Meta account with developer access.
  - You must be a **Meta VR Start member by the time you submit**.
- **Division, New Experience:** built after Sept 24, 2026, with no pre-existing codebase. Our prototype dates from Oct 26, so it qualifies.
- **What to submit:**
  - **A link** judges can open and test. GitHub Pages is suggested; any host works.
  - It must stay **online and free until the winners are announced (~Dec 11)**.
  - A **demo video under 3 minutes**, public on YouTube or Vimeo, showing footage from a Quest or an emulator. Show real gameplay and don't lean on AI-generated video.
  - Text description and testing instructions **in English**.
  - Track **Gaming**, Division **New Experience**.
- **Must pass (Stage One, pass/fail):**
  - Fully usable with **hands end to end**; controllers are optional.
  - **Seated**: everything works within about a 2 ft radius.
  - **Fast cold start, clean pause/resume, and a satisfying moment within 10 minutes.**
- **Judging (Stage Two):** four criteria, equally weighted at 25% each:
  - **Originality and fit** with the track.
  - **Design and user journey:** onboarding, seated hands-first play. Also **FoV-aware design**, meaning essential UI should stay in a comfortable, narrower field of view.
  - **Technical:** **at least 60 fps on Quest hardware**, bug-free, good use of hand tracking.
  - **Polish:** UI/UX, art, sound and the submission materials.
- **Prizes:**
  - **Best New Gaming Experience** pays $100k for the winner and $50k for the runner-up.
  - Special awards that fit PRIMAL, $25k each:
    - **Best First Five Minutes**
    - **Best Reason to Come Back**, which suits the Roadmap and notebook progression
    - **Boldest Original Concept**
  - There's no IWSDK-only award this year.

## Why IWSDK (Oct 27)

- **Same tech as the prototype.** IWSDK is built on three.js, so the prototype's game logic can be ported instead of rewritten in C#:
  - items, recipes and the 23+ observations
  - quests and hints
  - the fire, charcoal and filter state machines
  - the event log
- **No headset needed day to day.** The IWER emulator runs VR with mouse and keyboard in the browser.
- **Faster setup.** About an hour instead of about 3 days, with no 25 GB Unity install and no Unity Editor or C# to learn.
- **Built in:**
  - hand tracking
  - one-hand, two-hand and distance grab
  - teleport, including a hands-only micro-gesture mode
- **Costs:**
  - It's a younger ecosystem, so fewer tutorials exist.
  - The Quest browser has a tighter performance budget, so the forest must get lighter.
  - Eligibility still needs confirming.

## Milestones (IWSDK)

| Milestone | Dates | Scope | Status |
|---|---|---|---|
| **M0 Setup** | Oct 27–28 | ~~Check the rules~~ ✅ web allowed · apply to Start · ~~`npm create @iwsdk@latest`~~ ✅ in the [Primal-Fire](https://github.com/ThomasThazhathillath/Primal-Fire) repo · ~~run it in the IWER emulator~~ ✅ · host on an https URL: Pages workflow ready, needs Pages switched on ([SETUP.md](SETUP.md)) | **Almost done** (Start membership + Pages switch-on left) |
| **M1 Vertical slice** | Oct 29–Nov 2 | ~~Port the shared logic out of the prototype into modules (`items`, `observations`, `quests`, `hints`, `log`)~~ ✅ · ~~a small forest (ground, stream, instanced trees, ~100 × 100 m)~~ ✅ · hand teleport (built into IWSDK; needs a device test) · ~~gather into a **hip-pouch satchel**~~ ✅ · ~~**the generic Blueprint system** (ghost outline, snap spots, placement rules) proven on the **fire pit**~~ ✅ and the workbench ✅ · ~~start in an empty clearing~~ ✅ · ~~quest panel and XP~~ ✅ · litter sweeping and wet stones bursting move to M2 (they need fire) | **Mostly done** (Oct 28) |
| **M2 First Fire** | Nov 3–7 | Workbench blueprint (slab + 3 stone legs) · bow drill placed at the pit · cord and bow-drill crafting · fire lay · bow-drill **sawing with hand motion** · ember transfer · fanning with an open palm · fire effects · notebook panel | Not started |
| **M3 Chain + finale** | Nov 8–12 | Pottery (temper, dry, fire) · charcoal pit (dig, water table, cover, mound) · filter tripod (forked sticks, cord, cane) and layers · lens view · Roadmap wall and mast in the ruins · Split Rock · nightfall finale · all 31 observations ([DESIGN.md](DESIGN.md)) | Not started |
| **M4 Polish** | Nov 13–15 | **Quest-browser performance pass** · save in the browser · pause/resume · fast start (something satisfying within 10 minutes) · **real-device test** | Not started |
| **M5 Ship** | Nov 16–18 | **Demo video under 3 min** on YouTube or Vimeo · final build on **GitHub Pages** (frozen from then until ~Dec 11) · Devpost entry with an English description and testing instructions, Gaming / New Experience · **submit by Nov 18, 12:00 PM PT** | Not started |

**Rule for the prototype:** from M1 on, the browser prototype is frozen. New design ideas (like v4 "build everything from scratch") go straight into the IWSDK build as snap-to-blueprint structures, instead of being built twice.

### If M3 runs late, cut in this order

1. Pottery (go back to a found pot).
2. The water-table flooding.
3. The leaf-litter clearing.

## Completed systems

- **IWSDK build, M0 + most of M1** (Oct 28, cloud session). Code at the repo root; see [README](../README.md).
  - **Game core** (`src/game/`, unit-tested, no rendering): items (v3 + v4 building materials), all **31 observations** (23 from v3 + 8 building ones), the **v4 quest chain** (Scavenger → First Fire → Hold Water → Black Gold → Clear ≠ Safe → First Lab), escalating hints, XP/levels, crafting (cord, bow drill), event log, save data, a deterministic forest layout, and the generic **blueprint** rules.
  - **Forest**: ~100 m playable area, stream, 380 instanced trees in one draw call, undergrowth, Lightning Glade, Clay Bend, the Ruins (mast + Science Roadmap wall with named sockets), Split Rock, fog. Measured at ~68 draw calls / ~59k triangles, no real-time shadows.
  - **Hands-first play**: point and pinch to gather (items fly to the hip pouch); pinch the pouch for the satchel; take out a stone or slab and a ghost blueprint follows your ray (green = buildable, red = stream bank / trees / too close); pinch to place, pinch near snap spots to fill. **Fire pit** and **workbench** (three legs → *Three legs never wobble*) work end to end.
  - **UI**: quest/XP HUD (screen-pinned on desktop; eye-level-left follower in VR), toasts, Lab Notebook cards, hover tooltips, hint beacon, title/onboarding panel.
  - **Desktop mode** (WASD) for testing and visitors without a headset; autosave; pause on blur; 72 Hz + foveation on Quest.
  - **Verified**: 19 unit tests; a 19-check browser play-test (`scripts/playtest.mjs`); in the IWER emulator (Quest 3), controller-trigger gathering, hand-pinch gathering, hand-pinch fire-pit placement and snap-spot filling; production build loads with no console errors.

- **Browser prototype** ([prototype/](prototype/README.md)), Oct 26. It plays through end to end with no console errors.
  - **v1:** the full chain, Fire → Charcoal → Clean Water → Roadmap finale.
  - **v2:** gathering at 4 sites, a satchel, a workbench, a single teepee fire lay, 23 observations, and an event log (`L`).
  - **v3:** a free-roaming forest of about 140 × 140 m with 4 hidden places, needs-based quests, escalating hints, a discovered-places compass, and a bottom-up filter.
  - **v4 was skipped on purpose (Oct 27).** The "build everything from scratch" design goes straight into IWSDK during M1–M3. The spec is in [DESIGN.md](DESIGN.md) → "Build everything from scratch". The prototype stays at v3 as the reference.

## Known issues / risks

- **Hand rays swing when you pinch.** Closing a pinch moves the hand's aim ray, so a press can miss a small target. Building already compensates (it uses where you pointed ~150 ms before the pinch, and a pinch near a snap spot counts). Gathering still uses plain ray presses; check on a real Quest, and widen hit areas if it feels fiddly.
- **IWSDK version.** `npm create @iwsdk@latest` installed **1.1.0-rc.2** (npm's `latest` tag points at a release candidate; the last stable is 1.0.1). Fine for development; before the Nov 16 freeze, decide whether to pin a stable release.
- **Teleport with hands** uses IWSDK's built-in micro-gestures (thumb swipe on the index finger). Not yet tried on a device.

- **Start membership** is required by the time you submit. Apply now; if it's still pending on Nov 10, email the hackathon manager.
- **The judging criteria lean slightly toward Unity.** The technical criterion names "gaze interactions (Unity/Unreal ISDK v207+)" as one example. Hand tracking, which is the main one, applies to us fully.
- **No headset.** The emulator covers logic and layout, but not the feel of hand tracking or performance. We need at least one real-device test by **~Nov 10**: borrow one, buy a Quest 3S, or ask for community testing. Over USB, `chrome://inspect` shows the headset's console.
- **Quest-browser performance. The rules require at least 60 fps.** The prototype uses 720 trees, soft shadows and lots of particles.
  - *Mitigation:* fewer trees (instanced), no real-time shadows (baked blob shadows instead), capped particles, and a smaller world.
- **Hands-only teleport.** IWSDK's teleport is controller-first, with a hand **micro-gesture** mode (thumb tap). Test it early in M1.
  - *Fallback:* point-and-pinch teleport, or fixed hotspots.
- **Bow-drill sawing** with real hand tracking is unproven.
  - *Fallback:* a push/poke interaction.
- **Keep the code outside OneDrive** (`C:\Dev\primal-first-fire`), backed up with git and GitHub.

## Open decisions (defaults in bold)

1. Engine: **IWSDK** ✅ confirmed by the rules (Oct 27)
2. Language: **TypeScript**
3. Building: **snap-to-blueprint** (ghost outlines with snap spots), not free placement
4. v4 design: **build it directly in IWSDK** ✅ decided Oct 27 (no v4 prototype)
5. Fire method: **bow drill**
6. Headset plan: _TBD by Nov 10_
7. Art: **free CC0 low-poly packs** (glTF/GLB format for the web)
8. Direction: **science-first, inspired by the opening of Dr. Stone but with an original premise and no IP borrowed**

## Next tasks

_Updated Oct 28:_
1. **Apply to Meta VR Start and register on Devpost** (still required to submit).
2. **Switch on GitHub Pages** (Settings → Pages → Source: GitHub Actions) so every push to `main` deploys; open the URL on a phone/PC, then on a Quest.
3. **M2 First Fire**: fire lay in the pit, bow-drill sawing with hand motion, ember transfer, fanning, fire effects; wet stones bursting and leaf litter (the two remaining building observations that need fire).
4. Borrow or buy a Quest for a first real-device test (hand rays, teleport, comfort, frame rate).

_Original list (Oct 27):_

1. ~~Read the Devpost rules~~ ✅ IWSDK is allowed, and you submit a hosted link.
2. **Apply to Meta VR Start and register on Devpost.** Membership is required to submit.
3. Create the IWSDK project, run it in the emulator, and host the empty build on an https URL.
4. ~~Decide on v4~~ ✅ straight into IWSDK.

## Installed versions

Node `24.20.0` (local PC) / `22.x` (CI, `.nvmrc`) · IWSDK `1.1.0-rc.2` (`@iwsdk/core`, `@iwsdk/cli`) · three.js via `super-three@0.185.0` · Hosting: GitHub Pages via Actions (`.github/workflows/deploy-pages.yml`)
