# Resource overhaul: audit and plan

Spec: `docs/RESOURCE_OVERHAUL_SPEC.md`. Branch: `claude/resource-overhaul` (cut from `claude/phase3-living-world`).

## Audit

### How it works today
- `world-layout.ts` builds `RESOURCES` (hand-placed spots, then rule-driven `SCATTER_RULES`, seeded). `ResourceSystem` makes one entity per spot (hit sphere 0.55 m, glow ring, flattened mesh) and gathers through the Ray press, the VR pinch aim-assist and desktop click; `gaze-target-system` and `pinch-grab-system` read `RESOURCES` too. So **every spot in `RESOURCES` is already gatherable by every path**; a new spot appended to `RESOURCES` is picked up everywhere.
- Distance: meshes beyond 20 m are parked out of the scene graph; `PerfSystem.cullRays` removes `RayInteractable` beyond 7.5 m. Reach is 6 m.
- Inventory: 20 pockets base (`BASE_POCKETS`); a full pocket shows a toast and logs; big items need free hands (also toasted). Nothing is silent.

### Counts today (465 spots, charges in brackets)
| Look to item | Spots | Charges | Regrow |
|---|---|---|---|
| stone / stonePale to dryStone | 44 + 10 | 54 | never |
| wetStone (stream) | 35 | 35 | never |
| **stoneDark to flint** | **14** | **14** | **never** |
| twigPile to twigs | 76 | 152 | 50 s |
| dryBranch | 50 | 100 | 80 s |
| leafLitter / bark / vine | 70 / 28 / 18 | 140 / 56 / 36 | 40 / 90 / 70 s |
| fibrePlant to fibers | 20 | 40 | 45 s |
| grass to dryGrass | 20 | 20 | 45 s |
| clay / sand / gravel | 6 / 4 / 11 | 24 / 16 / 44 | 30 s |
| fallenLog to logs | 5 | 15 | 60 s |
| pole, slab, mossRock, cane, others | 12, 9, 13, 7, ... | | |

Flint: 14 nodules over a 46 m radius, 3 of them near the start, none ever regrow. Chapter needs are small (a few flakes) but the player has to walk 25-40 m for most of them.

### Findings
1. **Spot state is not saved.** `charges` and `regrowAt` live only on the ECS component. Reload brings every used spot back (duplicate resources, and the opposite of "persist"). Highest-priority bug.
2. **Decor that looks like a resource.** 40 `FALLEN_TRUNKS` are drawn as logs but are decoration; only 5 gatherable `fallenLog` spots exist and none is near a trunk, so the obvious collectible-looking logs give nothing. 45 `BOULDERS` (0.45-0.95 m) are intended as environment but read as big stones; 3 sit within 3 m of the stream. No sticks, bark or fibre lie around any trunk.
3. **Ambiguous looks.** Living green grass clumps (1200, walk-through decor) versus pale `grass` resources: colours differ, but nothing states which is which. Moss cushions (260, decor) versus `mossRock` (gatherable).
4. **No explicit classification.** Nothing says resource / interactable / decor / quest / constructed. Quest-ish objects (`lens`, `cloth`, `board`) are indistinguishable in data.
5. **Stones.** Stone spots exist and are gatherable on every path (checked in code; emulator check in the final report). Stones are lone, spaced at least 1.2 m apart, so they never read as a deposit, and all are single-use forever.
6. **Berries/nuts:** only the Phase 3 forage patches (10 total), picked after inspection.

## Plan
1. `resource-class.ts`: explicit class for every `ResourceLook` and every non-spot world object, with tests that nothing collectible-looking is decor.
2. `resource-clusters.ts`: seeded, habitat-based clusters appended last to `RESOURCES` (ids stay stable): rocky deposits (8-15 stones + 3-6 flint) beside boulders and on the stream bank, fallen-tree clusters around trunks (sticks, branches, bark, vine, fibre), stream deposits (clay, sand, gravel, wet stones). More berry and nut patches.
3. Regrowth by type: sticks/leaves/grass/berries regrow; stones and flint regrow very slowly (new pieces), clay and sand are finite and bigger. Saved as `resources` (spot id to charges and regrow time) in the save; applied at load; no duplicates.
4. Feedback: reach and full-pocket messages already exist; add a visible stack count and a "pockets full" refusal that keeps the item in the world.
5. `?resdebug` overlay (instanced markers for spots, cluster rings, density counts).
6. Tests, draw-call measurement before and after, emulator screenshots, docs.
