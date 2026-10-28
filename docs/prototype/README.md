# PRIMAL — browser prototype (throwaway)

This prototype tests one question: **is exploring a forest for materials, then doing the science, fun?** It doesn't test hand-tracking feel; that needs the real build and a headset.

**What carries over (updated Oct 27):** the real build is now planned in the **Immersive Web SDK (IWSDK)**, which is also built on three.js.
- **Ported, not rewritten:** the game logic, meaning items, recipes, observations, quests, hints, the fire/charcoal/filter state machines and the event log.
- **Rebuilt for hands:** the rendering and the mouse input.
- **Unity fallback:** if we have to switch back to Unity, only the *design* carries over.

**This prototype is frozen at v3.** The v4 "build everything from scratch" design (no pre-built camp, blueprint structures, pottery) was never built here. It goes straight into the IWSDK build; see [DESIGN.md](../DESIGN.md). So the pre-built camp you see in this prototype is v3 behaviour, not the final design.

## Run it

Double-click `index.html` to open it in Chrome or Edge, or use the local server at http://localhost:5173. It needs an internet connection, because it loads three.js from a CDN. Click the scene to capture the mouse, and press `Esc` to release it.

## Controls

| Action | Input |
|---|---|
| Walk / run | `W A S D` / hold `Shift` |
| Look | Mouse (arrow keys turn if mouse capture isn't available) |
| Gather, place or use what the dot points at | Left-click |
| Saw the bow drill, fan the ember | Hold left-click and move the mouse left ↔ right |
| Open the satchel to take something in hand | `Tab` |
| Put the held item back | Right-click or `Q` |
| Craft at the workbench | `C` |
| Hint (ask again for a more specific one) | `H` |
| Notebook | `N` |
| Event log, for bug reports | `L` |

## The world

The world is about 140 × 140 m of dense forest with a winding stream. Camp is a clearing in the middle with a tall rusted mast you can see over the trees. Hidden out in the woods, waiting to be discovered:

| Place | What's there |
|---|---|
| Sunny Meadow | Dry grass, stringy fibre plants, saplings at the edge |
| Lightning Glade | A shattered dead tree, split boards, a straight stick, a fallen trunk, twigs, a little grass |
| Clay Bend | Clay, sand, gravel and mossy rocks where the stream slows |
| Collapsed Outpost | A clay pot, a lens and cloth |

Twigs, fallen trunks, mossy rocks and a few fibre plants are also **scattered naturally** through the forest.

## Few clues

- **Quests describe what you need, not where to find it.** For example: "something dry and fine that catches a spark".
- **Resources show only a description**, like "tall, pale grass that crackles when touched", until you've gathered one.
- **The compass** shows camp and only the places you've already discovered.
- **Hints (`H`) get more specific each time you ask:**
  1. The science clue.
  2. The kind of place to look.
  3. A direction and distance, with a ★ on the compass.

## Chapter 1

1. **Scavenger:** find tinder, kindling, fuel, the bow drill parts and fibres. Twist the cord and build the bow drill at the workbench.
2. **First Fire:** build a fire lay in the pit, saw an ember, move it to the tinder and fan it.
3. **Black Gold:** find something to seal the vents, then load the mound, seal it or don't, light it, and open it at the right moment.
4. **Clear ≠ Safe:** find a container, a lens and filter materials. Pack the filter tube from the bottom up, pour, boil, and check with the lens.
5. **First Lab:** nightfall, and the Roadmap lights up through to CHEMISTRY.

There are 23 notebook observations. Failures count as discoveries.

## How the prototype maps to VR

| Prototype | VR (hands, IWSDK) |
|---|---|
| Walking with WASD | Teleport anywhere on the forest floor, using IWSDK's hand micro-gesture teleport (a thumb tap), so play stays seated and comfortable |
| Clicking a resource | Pluck grass, snap dead twigs, bend the sapling |
| Satchel (`Tab`) | A pouch on your hip: drop items in, reach in to pull one out |
| Placing on a glowing spot | Release the item over a snap zone |
| Hold and move on the drill or ember | Saw the bow, wave a palm over the nest |
