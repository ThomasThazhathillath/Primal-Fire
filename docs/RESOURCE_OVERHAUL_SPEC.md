# PRIMAL: FIRST FIRE — RESOURCE SYSTEM OVERHAUL
## Universal Collectibility, Resource Abundance & Natural Distribution

You are improving the existing resource gathering system in PRIMAL: First Fire.

There are currently two major gameplay problems:

1. Some resources that visually appear collectible cannot actually be picked up. For example, stones lying on the ground may be impossible to collect even though stones are an essential crafting resource.
2. Resources such as flint are extremely scarce. The map may contain only a handful of instances, making exploration and crafting unnecessarily frustrating.

Your task is to overhaul resource collection and distribution across the entire game.

IMPORTANT: Inspect the existing implementation before making changes. Reuse the existing inventory, gathering, interaction, resource spawning and persistence systems.

Do not create a separate collection system.

# 1. UNIVERSAL RESOURCE COLLECTIBILITY

Establish a consistent rule:

**If an object is presented as a collectible resource, the player must be able to collect it.**

This applies to:
- Stones.
- Flint.
- Small rocks.
- Wooden sticks.
- Branches.
- Plant fibres.
- Leaves.
- Grass bundles.
- Berries.
- Nuts.
- Seeds.
- Clay.
- Other existing collectible resources.

Inspect every resource currently placed in the environment.

Identify objects that:
- Have a collectible appearance but no interaction.
- Have collision but cannot be grabbed.
- Can be grabbed but do not enter inventory correctly.
- Have incorrect interaction distances.
- Are incorrectly classified as environmental decorations.
- Cannot be collected because of inconsistent collider sizes.

Fix these systematically.

## Physical interaction

Every collectible should support the existing hands-first interaction model.

Requirements:
- Gaze-and-pinch or the existing supported grab gesture.
- Correct hand interaction detection.
- Appropriate collider sizes.
- Visual feedback when targeted.
- Physical grabbing and release.
- Correct inventory registration.
- No disappearing objects without feedback.

Small resources such as stones should be easy to pick up from the ground.

Large objects such as logs should retain their existing appropriate two-handed or specialized interactions.

Do not force all objects into identical interaction behaviours.

# 2. DISTINGUISH COLLECTIBLES FROM DECORATION

Introduce or standardize resource classifications.

Every relevant object should have an explicit classification:

- Collectible resource.
- Interactable object.
- Environmental decoration.
- Quest-specific object.
- Constructed object.

Environmental decorations can remain non-collectible, but they must not look identical to resources that the player is expected to gather.

For example:

A small individual stone lying on the ground should be collectible.

A large embedded boulder can remain part of the environment.

A cluster of loose stones should allow the player to collect individual stones where appropriate.

Make the distinction visually understandable.

# 3. RESOURCE ABUNDANCE OVERHAUL

Increase the number of naturally occurring resources across the entire map.

The current distribution is too sparse.

The player should not need to search an enormous area to find four pieces of flint.

Introduce resource distribution based on natural habitats and terrain.

Use resource density rather than a handful of manually placed individual objects.

Suggested initial distribution targets:

| Resource | Suggested availability |
|---|---|
| Small stones | Very abundant |
| Flint | Abundant in rocky areas |
| Wooden sticks | Very abundant |
| Branches | Abundant |
| Plant fibres | Abundant near vegetation |
| Dry grass | Very abundant |
| Leaves | Very abundant |
| Berries | Common in suitable vegetation |
| Nuts and seeds | Common in appropriate areas |
| Clay | Common near stream banks |
| Sand | Common near water |
| Gravel | Common near stream banks |
| Special minerals | Uncommon |

These are relative density targets, not fixed global spawn counts.

Do not distribute every resource uniformly across the map.

# 4. NATURAL RESOURCE DISTRIBUTION

Resources should appear in locations where they make environmental sense.

Examples:

**Flint and stones**
- Rocky terrain.
- Exposed soil.
- Riverbanks.
- Near rock formations.
- Small natural stone deposits.

**Sticks and branches**
- Beneath trees.
- Around fallen branches.
- In forest clearings.
- Near dead vegetation.

**Plant fibres**
- Around suitable vegetation.
- Near tall grasses.
- In specific plant clusters.

**Berries**
- Around bushes.
- In appropriate forest areas.
- In clusters rather than isolated floating objects.

**Clay**
- Along stream banks.
- In exposed damp soil.
- Near suitable geological formations.

**Sand and gravel**
- Along stream edges.
- In shallow riverbank deposits.

Resources should appear naturally integrated into the terrain.

Avoid obvious grid patterns, evenly spaced placement and repetitive identical clusters.

# 5. RESOURCE CLUSTERS

Introduce resource clusters instead of placing all resources individually.

Examples:

A rocky deposit might contain:
- 8–15 small stones.
- 3–6 flint pieces.
- A few larger rocks.

A fallen tree might contain:
- Several sticks.
- A few branches.
- Bark.
- Plant fibres nearby.

A berry bush might contain:
- Multiple collectible berries.
- Some leaves and surrounding vegetation.

These clusters should feel natural and provide enough resources to make exploration rewarding.

Allow players to collect individual items rather than forcing them to collect an entire cluster at once.

# 6. RESOURCE SPAWNING AND REPLENISHMENT

Introduce a sensible resource regeneration system.

Not every resource should regenerate at the same rate.

Suggested behaviour:

- Sticks and fallen branches: gradually replenish.
- Berries: regenerate after a growth period.
- Leaves and grass: regrow over time.
- Stones: generally do not regenerate quickly.
- Flint: limited replenishment or new exposed deposits.
- Clay: finite deposits with substantial quantities.

Avoid unlimited instant respawning.

Use the existing day/night and save systems where possible.

Resource availability should persist across save and reload.

Prevent duplicate spawning when the player reloads the game.

# 7. RESOURCE DISCOVERY AND COLLECTION FEEDBACK

Improve the experience of finding resources.

When looking at a collectible:
- Show a subtle outline or highlight.
- Display the resource name.
- Indicate whether it can be picked up.
- Provide appropriate interaction feedback.

When collecting:
- Play a suitable sound.
- Update inventory immediately.
- Provide visual confirmation.
- Remove the world object correctly.

Do not make the highlight overly bright or distracting.

The experience should remain immersive.

# 8. INVENTORY AND RESOURCE LIMITS

Review whether current inventory limits unnecessarily restrict resource collection.

Ensure:
- Common resources can be collected without excessive interruptions.
- Resource stacking works correctly.
- Inventory counts remain accurate.
- Duplicate items are not created.
- Collected resources are removed from the world.
- Resources can be transferred to existing storage systems.

If inventory capacity is limited, communicate it clearly.

Do not silently prevent collection.

# 9. PERFORMANCE AND WORLD OPTIMIZATION

Resource abundance must not destroy Quest performance.

Implement:
- Instanced rendering for repeated decorative resources where appropriate.
- Efficient resource spawn management.
- Spatial partitioning or proximity-based interaction detection.
- Distance-based activation.
- Efficient collider management.
- Avoid unnecessary physics calculations.
- Avoid creating hundreds of expensive individual update loops.

Important distinction:

Visual resource density and interactive resource density do not need to be identical.

However, every object that visually appears as a collectible must have a valid collection interaction.

Optimize the system without sacrificing this rule.

# 10. RESOURCE DISTRIBUTION DEBUG MODE

Introduce a development-only resource visualization mode.

Allow developers to see:
- Resource spawn locations.
- Resource types.
- Cluster boundaries.
- Resource density.
- Active collectible counts.
- Interaction collider locations.

This will make it easier to identify sparse areas and incorrectly configured objects.

Do not expose this debug mode in the normal player experience.

# 11. TESTING

Add tests for:

- Collectibility of every registered resource type.
- Correct inventory updates.
- Correct object removal.
- Resource stacking.
- Resource persistence.
- Resource regeneration.
- No duplicate spawning.
- Resource cluster generation.
- Distribution across different terrain types.

Verify that previously implemented quests still work with the new resource quantities.

Pay particular attention to Chapter 1 and Chapter 2 crafting requirements.

# 12. DEFINITION OF DONE

The overhaul is complete when:

1. All intended collectible resources can be picked up.
2. Stones lying on the ground are collectible.
3. Flint is distributed abundantly throughout suitable rocky locations.
4. Common resources are readily available without excessive searching.
5. Resource distribution follows environmental logic.
6. Clusters look natural rather than artificially placed.
7. Individual resources can be collected from clusters.
8. Inventory updates reliably.
9. Resources persist correctly.
10. Regeneration works without duplication.
11. The system remains performant.
12. Existing quests and crafting recipes continue to function.

# FINAL DESIGN PRINCIPLE

The player should never feel that the world is artificially withholding basic resources.

PRIMAL is a survival and scientific exploration game, not a resource-hunting simulator where the player spends most of their time searching for a handful of stones.

Make resources abundant enough to encourage experimentation, crafting and exploration.

Scarcity should be reserved for genuinely special resources and advanced progression materials, not basic survival necessities.
