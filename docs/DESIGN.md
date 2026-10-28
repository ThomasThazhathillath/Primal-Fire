# PRIMAL: First Fire — Chapter 1 Design (science-first)

The tone is inspired by the opening of *Dr. Stone*: one person, a ruined world, and the conviction that **science rebuilds everything, step by step**. Survival is only the backdrop. The game is about **experiments, the reasons behind them, and chaining one discovery into the next**.

> **Originality rule (it matters for judging and for policy):** take the *spirit*, not the IP. Don't use Dr. Stone characters, names, art, catchphrases, the petrification premise, or "revival fluid". Judges score originality, and the competition's content policies forbid infringing work.

## Premise (original)

You wake on the forest floor with nothing. Your world ended so long ago that every machine has rusted to dust. Deep in the woods, in the ruins of a research station, someone carved a **Science Roadmap** into a stone wall: a tree of empty sockets running from *Fire* up to *Electricity*. Each discovery you make by hand lights up a node.

**Hook line:** *"Every machine is gone. The science isn't."*

## The Science Roadmap (signature feature)

- It's a diegetic tech tree: a large carved stone wall in the ruins. Glowing nodes are connected by grooves.
- When you discover something, molten light runs along the groove into a new node. That's the big payoff moment.
- Each node shows a short **Lab Notebook** entry with the principle, the evidence you saw, and a "what if" question.
- Chapter 1 lights **4 nodes**. About 8 more stay dark but labeled, as a teaser: *Glass, Soap, Lime, Iron, Magnetism, Electricity…*
- This covers several judging points at once: progression, a "reason to come back", and the first five minutes.

## Chapter 1 science chain

Each experiment's result becomes a material for the next one. That's what makes this feel like Dr. Stone and not a crafting menu.

```
0. SCAVENGE ──► 1. FIRE ──► 2. CHARCOAL ──► 3. CLEAN WATER ──► 4. FINALE: "First Lab"
 materials &     friction→heat  pyrolysis      adsorption +        combine all three;
 first tool      fire triangle  (O₂ control)   thermal disinfection Roadmap lights up
```

### Quest 0: Scavenger *(explore first, then science)*

Nothing starts in the player's hands. Camp is a clearing in a large, dense forest, and there are no markers, rings or lists of locations.

- **Exploring:** the player finds the gathering places on their own, and each discovery rewards them.
- **Needs, not places:** quests say what they *need*, for example "something dry and fine that catches a spark", not where to find it.
- **Hints on request:** they escalate from the science clue, to the kind of place, to a direction.
- **Gathering:** materials go into a **satchel**, a hip pouch in VR.
- **First tool:** the player crafts the bow drill at a **workbench**.
- **VR locomotion:** free hand-teleport anywhere on the forest floor, using IWSDK's teleport with its hand micro-gesture mode. It stays seated and comfortable.

| Site | Materials | Science seeded while gathering |
|---|---|---|
| Meadow | Dry grass (tinder), plant fibres | — |
| Forest edge | Dead twigs, logs from a fallen tree, a straight stick, a flat board, a flexible branch from a living sapling | **Dead wood snaps** (dry), but **green wood bends** (water-filled cells). Green wood is poor fuel and a perfect bow. |
| Stream bank | Clay, sand, gravel, damp moss | **Moss is a sponge**, a decoy tinder. **Clay is plastic.** |
| Ruins | Lens, cloth scraps, flat stone slabs, the Roadmap wall | — |

**Workbench recipes** (deterministic):
- 3 fibres → cord: **twisting makes strength**.
- Straight stick + flat board + flexible branch + cord → **bow drill**: **the bow drill is a machine** that turns a long stroke into fast rotation.

Each later quest begins by gathering what it needs: clay for the mound; lens, cloth, gravel and sand for the filter.

### Experiment 1 — Fire *(hero)*

- **Problem:** night is coming and you have no fire.
- **What you handle:**
  - Pick tinder: dry grass or damp moss.
  - Build one **fire lay** in the pit: a tinder nest, a twig teepee around it, then a log teepee outside that. Or feed twigs and logs onto the flame while it catches.
  - Saw the **bow drill**. An ember-progress glow shows heat building up.
  - Move the ember into the tinder nest.
  - Fan or blow on it with an open palm to add airflow.
- **Variables:** tinder dryness, layering order, airflow.
- **Outcomes:**

| Setup | Result | What it teaches |
|---|---|---|
| Dry tinder, correct layers, airflow | Flame grows into a stable fire | **Fire triangle:** heat + fuel + oxygen |
| Damp tinder | Smoke and hissing, no flame | Water absorbs heat, so the fuel can't reach ignition temperature |
| Big logs first | Ember dies | Small fuel heats faster (surface area vs. volume) |
| No airflow | Ember glows, then fades | Combustion needs oxygen |

- **Principle:** friction turns motion (kinetic energy) into heat. The hot wood dust smoulders into an ember. Combustion is fast oxidation.

### Experiment 2 — Charcoal *(applies Fire, adds a twist)*

- **Problem:** your filter needs charcoal, but normal burning only leaves ash.
- **What you handle:** load wood into a clay-covered pit or an earthen mound. Then choose between leaving the vents open and sealing them with clay so only a small opening remains.
- **Variables:** oxygen supply (open or sealed), and heating time on a short timer with visible smoke colour.
- **Outcomes:**
  - **Open:** the wood burns down to **ash**.
  - **Sealed:** the wood turns into **charcoal**.
  - **Pulled out too early:** half-charred wood.
- **Principle:**
  - **Pyrolysis.** Heating wood *without enough oxygen* drives off water and volatile gases. You see this as smoke changing from white to thin blue. Mostly carbon is left behind.
  - **Same wood + different oxygen = a different product.**
  - **Bonus observation:** charcoal burns hotter and with less smoke. That unlocks the "High-heat fire" node, a teaser for metallurgy.

### Experiment 3 — Clean Water *(applies Charcoal and Fire)*

- **Problem:** the stream water is murky. Is it drinkable?
- **What you handle:**
  - Build a layered filter in a hollow log or bamboo tube by snapping in the layers: gravel → sand → **your charcoal** → cloth.
  - Pour the water through.
  - Put the clear water in a clay pot over **your fire** and bring it to a rolling boil.
- **Variables:** layer order, whether charcoal is included, whether the water was boiled.
- **Outcomes, shown with a "microscope lens" view of the water:**
  - **Unfiltered:** murky, with visible particles and microbes.
  - **Filtered:** *clear*, but the lens still shows **microbes**. The journal says **"Clear ≠ safe."**
  - **Filtered + boiled:** the microbes are inactivated. The journal adds: **"Boiling does not remove chemicals."**
  - **Wrong layer order:** the filter clogs or the water comes out cloudy.
- **Principle:**
  - Filtration removes particles, and charcoal adsorbs some odour and taste compounds.
  - Heat at a rolling boil denatures the proteins of many pathogens.
  - **Neither one removes dissolved chemicals.** Boiling can even concentrate them.

### Finale — "First Lab" *(nightfall)*

- **Trigger:** night falls and the temperature vignette closes in.
- **Check:** a fire is burning, charcoal is in stock, and safe water is in the pot.
- **If something's missing:** the Roadmap glows the missing node and gives a hint.
- **When everything's there:**
  - The Roadmap's first branch lights up all the way to the carved symbol for **"Chemistry"**.
  - A short narration plays.
  - The camera holds on the dark nodes ahead, a cliffhanger for Chapter 2.

## What changed from the original plan

- **Shelter quest → Charcoal quest.** Shelter was engineering plus physics-wobble work. Charcoal reuses the fire VFX and stations, builds a real chemistry chain, and costs about the same.
- **Nothing is pre-built (Oct 27).** The old "camp shelter is already standing" idea is gone. The player builds every structure; see "Build everything from scratch" below.
- **New:** the Science Roadmap wall and the Lab Notebook format.

## Build everything from scratch (decided Oct 27, built directly in IWSDK)

**Nothing is pre-built.** You wake in a small, empty clearing near the stream with nothing in your hands. Camp exists only where you build it.
- The **⌂ Camp** compass marker appears at your first structure.
- The **Science Roadmap wall** and the rusted mast stand in the **ruins**, and the mast is the landmark that draws you there. Lighting the wall at nightfall is still the finale.

### How building works (snap-to-blueprint)

1. Hold a structure's **key part** over open ground.
2. A ghost outline of the structure appears, with glowing **snap spots** for the remaining parts.
3. Release the key part to place the outline, then fill every snap spot to finish the structure.

- **Where you can build:** not on the stream bank, not squeezed between trees, and not on top of another structure.
- **Free placement anywhere is out of scope.** If time runs short, outlines only appear at 2–3 authored camp spots.

### The structures

| Structure | Key part → remaining parts | Observation (new) |
|---|---|---|
| **Workbench** | Flat stone slab → 3 stones as legs | **Three legs never wobble:** three points always define a plane, so a tripod sits firm on uneven ground and a fourth leg can rock. |
| **Fire pit** | Any stone → 3 stones to close the ring. Sweeping the leaf litter first is optional. | **Wet stones burst:** stream stones crack once the fire burns, because trapped water flashes to steam. *Limit:* porous and layered rocks are the risk; dense rock is safer, but never heat stones straight from water. **Clear the ground:** if you skip sweeping, sparks set the litter smoking and you stamp it out. |
| **Bow drill** | Crafted at the bench, then placed at the pit (a snap spot) | (existing observations) |
| **Clay pot** | Bench recipe: 2 clay, plus sand as temper (optional). Dry it on the bench, then place it in a burning fire. | **Temper prevents cracking** (no sand → it cracks from uneven shrinking). **Fire it dry** (wet → steam bursts it). **Clay becomes ceramic:** above about 550 °C the water bound in the clay minerals leaves for good and grains begin to fuse (sintering). *Limit:* open-fire pottery stays porous. |
| **Charcoal pit** | Digging stick → dig, stack 2 logs, cover with earth. Then the existing vents, clay, torch and open-at-the-right-time steps. Opening it breaks the mound back down to a pit. | **The water table:** a pit dug within about 5 m of the stream floods with seepage, so you have to move to drier ground. (The pyrolysis observations are unchanged.) |
| **Water filter** | Forked stick → 3 forked sticks, cord to lash them, a hollow cane as the tube. Then the existing bottom-up layers. | **Hollow is strong** (on first gathering a cane): a tube is nearly as stiff as a solid rod with far less material. |

That's **8 new observations, 31 in total.**
- **Where you build matters.** Near the stream is smart for the fire and the filter, but that same wet ground floods the charcoal pit.
- **The lens stays a rare ruins find.** A water-drop magnifier is real, but only about 5–10×, far short of the ~100× needed to see microbes, so there's no honest substitute in Chapter 1.

### New materials and places

- **Materials:**
  - **Dry stones**, sun-baked, found in the meadow, in the forest and at Split Rock.
  - **Wet stones**, from the stream bed.
  - **Flat stone slabs**, at Split Rock and in the ruins.
  - A **digging stick** and **forked sticks**, at Lightning Glade.
  - **Hollow canes**, at Clay Bend and along the stream.
  - A **second cord**, needed to lash the tripod.
- **New hidden place:** **Split Rock** ridge.
- **Quest chain:**
  1. Scavenger: includes "a steady surface to work on".
  2. First Fire: starts with "a safe place for a fire".
  3. **Hold Water** (new): "something to hold water that won't leak".
  4. Black Gold.
  5. Clear ≠ Safe.
  6. First Lab.
- **Roadmap:** a new **POTTERY** node sits between Fire and Clean Water.

### Hints for building steps

- **Third hint (direction):**
  - **Structure already built:** it points to that structure.
  - **Not built yet:** it suggests good ground, for example "open, flat ground; near water but not on the bank".

## Engine notes (Oct 27)

- **The plan:** build in the **Immersive Web SDK** (WebXR on three.js), pending the competition-rules check. See [PROJECT_STATUS.md](PROJECT_STATUS.md).
- **Building structures:** use **snap-to-blueprint**, not free placement.
  - Holding a key part over open ground shows a ghost outline of the structure.
  - The remaining parts snap into glowing spots on that outline.
- **Shared logic:** the prototype's logic (items, observations, quests, hints) becomes plain modules shared by the game.

## Stretch, only if ahead of schedule

- **Experiment 4 — Soap:** wood ash + water gives **lye**, and lye + animal fat gives soap (**saponification**). This sets up the germ-theory theme. It's a natural Chapter 2 opener, so it can also go in the ending teaser.

## Accuracy guardrails

- Never say a friction fire is guaranteed. The journal notes that real bow drills take practice.
- Never say a homemade filter makes water safe.
- Boiling: a rolling boil for about 1 minute (CDC guidance; longer at high altitude).
- Every Lab Notebook entry has three lines: **Observation → Principle → Real-world limit.**
