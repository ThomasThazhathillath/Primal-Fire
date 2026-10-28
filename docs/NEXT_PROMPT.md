I'm building **PRIMAL: First Fire**, a hands-first VR science-survival game for the Meta VR Start Developer Competition 2026. The final game will be Unity + Meta XR for Quest. The deadline is **Nov 18, 2026**. I'm solo, new to Unity, and have no headset.

Before touching Unity, I'm validating the design with a **throwaway browser prototype**. Read these files in the project folder first:
- `prototype/index.html`: the v3 prototype. It's a single-file three.js app: a first-person forest, gathering, a satchel, a workbench, a fire lay, a bow drill, a charcoal mound, a water filter, a lens, and a Science Roadmap wall.
- `prototype/README.md`: controls, world layout, and how each mechanic maps to VR.
- `DESIGN.md`: the Chapter 1 science chain and the originality rule (inspired by Dr. Stone, but no borrowed IP).
- `PROJECT_STATUS.md`: milestones, risks and decisions.
- `.claude/launch.json`: a `prototype` config that serves the folder at http://localhost:5173.

## What I want next (prototype v4): build everything from scratch

Right now camp is pre-built: a fire-pit ring, a workbench, an earth mound, a filter stand and a clay pot are already there or simply found. I want **nothing pre-built. Every structure and tool has to be discovered and built by the player.** You wake in the forest with nothing. No camp exists until you make one.

### Requirements
1. **No pre-placed camp.**
   - The player chooses where to set up. A flat spot works; a spot near the stream is a smart choice.
   - Structures are built in the world by placing gathered materials. One possible approach: a "build spot" appears when you place a key material on open ground. Pick whatever works best.
2. **Each structure is its own small discovery, with a science observation.** For example:
   - **Fire pit:** a ring of stones on bare ground. Wet stones from the stream can crack or burst when heated, because trapped water turns to steam. Dry stones are safe. Clearing the ground prevents spreading.
   - **Workbench:** a stump or a flat stone slab. Or decide whether crafting can happen anywhere on a flat surface.
   - **Charcoal mound:** dig a pit, stack wood, cover it with earth, seal it with clay. Keep the existing pyrolysis science.
   - **Water filter:** a hollow tube (e.g. a bamboo-like stem or rolled bark) held up by a tripod of forked sticks tied with cord. Keep the existing bottom-up layering science.
   - **Clay pot (no longer found):** shape clay, mixed with sand or grit as temper, let it dry, then fire it in the fire. Without temper, or if fired wet, it cracks: steam and uneven shrinking. With both done right it becomes ceramic. This is real pottery science (sintering).
   - **The lens** can stay a rare find in the ruins, since we can't make glass until Chapter 2. Alternatively, suggest an honest substitute.
   - **The Science Roadmap wall** should be discovered in the forest (in the ruins) rather than sitting at camp. Lighting it stays the finale.
3. **Keep v3's exploration feel:**
   - Free first-person walking.
   - Hidden places to discover.
   - Quests phrased as needs ("something to hold water that won't leak"), never locations.
   - Hints only when I press H, escalating from the science clue, to the kind of place, to a direction.
   - A compass showing only discovered places.
   - The satchel (Tab).
4. **Keep the existing science chain and all 23 observations working.** Add the new building observations, aiming for about 5–8 more.
5. **Scope check.** Tell me honestly how much this adds to the Unity build, given ~3 weeks of part-time work as a beginner. Propose what to simplify in VR, for example snap-to-blueprint building instead of free placement.

### How to work
- **Make a plan first and get my OK,** then build. Update `prototype/index.html` in place.
- **Test the whole chapter end to end before telling me it works.** The browser pane often doesn't run animation frames while it's hidden, so drive the game with the debug hooks on `window.__primal` (`tick`, `start`, `goTo`, `face`, `click`, `hold`, `nodeOf`) instead of relying on the render loop. Check the console for errors.
- **Keep the event log (L key) and the debug hooks.** I paste the log when something breaks.
- **Update `prototype/README.md`, `DESIGN.md` and `PROJECT_STATUS.md` afterwards.**
- **Keep explanations beginner-friendly.**

Also remind me where I stand on the real Unity milestones (M0: Unity install and Meta XR setup, per `SETUP.md`). I don't want the prototype to eat the time I need for the actual build.
