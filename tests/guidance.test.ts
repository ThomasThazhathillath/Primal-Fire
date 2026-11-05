import { describe, expect, it } from 'vitest';
import { blueprintsForKeyItem, spotWorldPosition } from '../src/game/blueprint.js';
import { describePlace, landmarkPhrase, nearestSpot, relativeDirection, whereIs, whereLandmark } from '../src/game/directions.js';
import { Game } from '../src/game/game.js';
import { ITEMS, SATCHEL_ORDER, type ItemId } from '../src/game/items.js';
import { nextStepLine, OBJECTIVES } from '../src/game/objectives.js';
import { gatherPrompt } from '../src/game/prompts.js';
import { RESOURCES } from '../src/game/world-layout.js';

describe('used-for lines', () => {
  it('every item has one short line saying what it is for', () => {
    const ids = Object.keys(ITEMS) as ItemId[];
    expect(ids.length).toBeGreaterThanOrEqual(43);
    for (const id of ids) {
      const t = ITEMS[id].usedFor;
      expect(t, id).toBeTruthy();
      expect(t.length, id).toBeGreaterThan(8);
      expect(t.length, id).toBeLessThan(60);
      expect(t, id).not.toContain('\n');
    }
    // The bag can list them all.
    for (const id of SATCHEL_ORDER) expect(ITEMS[id].usedFor).toBeTruthy();
  });
  it('the key stones say what they build', () => {
    expect(ITEMS.slab.usedFor.toLowerCase()).toContain('workbench');
    expect(ITEMS.flint.usedFor.toLowerCase()).toContain('flake');
    expect(ITEMS.wetStone.usedFor.toLowerCase()).toContain('fire');
  });
});

describe('directions', () => {
  it('relative direction follows where you face', () => {
    // Facing -Z (yaw 0): a target at -Z is ahead, +X is right, -X left, +Z behind.
    expect(relativeDirection(0, -10, 0)).toBe('straight ahead');
    expect(relativeDirection(10, 0, 0)).toBe('to your right');
    expect(relativeDirection(-10, 0, 0)).toBe('to your left');
    expect(relativeDirection(0, 10, 0)).toBe('behind you');
    expect(relativeDirection(7, -7, 0)).toBe('ahead to your right');
    // Turn left 90 degrees (positive yaw): now -X is ahead.
    expect(relativeDirection(-10, 0, Math.PI / 2)).toBe('straight ahead');
    expect(relativeDirection(0, -10, Math.PI / 2)).toBe('to your right');
  });
  it('the world has a spot for everything a gather objective asks for', () => {
    for (const items of [['dryStone', 'wetStone'], ['slab'], ['flint'], ['twigs'], ['logs'], ['dryGrass'], ['cane'], ['fibers'], ['clay'], ['sand'], ['spindle'], ['board'], ['greenBranch']] as ItemId[][]) {
      const f = nearestSpot(items, 0, 0);
      expect(f, items.join()).not.toBeNull();
      expect(RESOURCES.some((r) => r.x === f!.x && r.z === f!.z && items.includes(r.itemId))).toBe(true);
    }
  });
  it('says a distance and a way, with a visible landmark when there is one', () => {
    const t = describePlace(0, -20, { x: 0, z: 0 }, 0);
    expect(t).toMatch(/about 20 metres straight ahead/);
    // Near the split rock the landmark is named; far from any it is not.
    expect(landmarkPhrase(-4, 26)).toBe('by the big split rock');
    expect(landmarkPhrase(-22, -19)).toContain('ruins');
    expect(landmarkPhrase(12.6, -34)).toBe('along the stream');
    expect(describePlace(-4, 26, { x: 0, z: 0 }, 0)).toContain('split rock');
  });
  it('right beside you is said plainly, and unknown area names never appear', () => {
    expect(describePlace(1, 1, { x: 0, z: 0 }, 0)).toMatch(/right beside you/);
    for (const [x, z] of [[18, 14], [-17, 11], [6.2, -20]]) {
      expect(landmarkPhrase(x, z) ?? '').not.toMatch(/Meadow|Glade|Bend/);
    }
    expect(whereLandmark('ruins', { x: 0, z: 0 }, 0)).toMatch(/metres/);
    expect(whereIs(['dryStone'], { x: 0, z: 0 }, 0)).toMatch(/^Nearest: about \d+ metres/);
  });
});

describe('objective cards', () => {
  it('each gather objective tells you where the nearest thing is', () => {
    const g = new Game();
    g.facingYaw = 0;
    const ids = ['firstStone', 'moreStones', 'flatStone', 'wood', 'cutting', 'tinder'];
    const seen = new Set<string>();
    for (const o of OBJECTIVES.filter((x) => ids.includes(x.id))) {
      const items = o.find!(g);
      expect(items.length, o.id).toBeGreaterThan(0);
      expect(whereIs(items, g.player, 0), o.id).toMatch(/metres|beside you/);
      seen.add(o.id);
    }
    expect(seen.size).toBe(ids.length);
    // The live card carries it from the first objective.
    expect(g.objectives.view()!.where).toMatch(/metres|beside you/);
  });
  it('the science objective points to the ruins', () => {
    expect(OBJECTIVES.find((o) => o.id === 'science')!.place).toBe('ruins');
  });
  it('the workbench card starts with how to open the build book; flint and cane cards say what to hold', () => {
    const wb = OBJECTIVES.find((o) => o.id === 'workbench')!;
    const g = new Game();
    expect((wb.instruction as (g: Game) => string)(g)).toMatch(/^Tap the grid icon, then the hammer/);
    const sharp = OBJECTIVES.find((o) => o.id === 'stoneTools')!.instruction as string;
    expect(sharp).toMatch(/Hold the flint/);
    expect(sharp).toMatch(/hit/);
    const cut = OBJECTIVES.find((o) => o.id === 'cutting')!.instruction as string;
    expect(cut).toMatch(/Hold the flake/);
    expect(cut).toMatch(/pinch/);
  });
});

describe('next step line', () => {
  it('appears once a recipe has all its parts in the bag, and not before', () => {
    const g = new Game();
    g.gathered.set('slab', 1);
    for (let i = 0; i < 4; i++) g.gather('dryStone');
    g.gather('slab');
    const s = g.placeFromBook('workbench', 0, -1).structure!;
    for (let i = 0; i < 3; i++) {
      const p = spotWorldPosition(s, i);
      g.fillSpot(s.id, i, undefined, { x: p.x, z: p.z });
    }
    g.takeOut('slab');
    g.placeKey(s.id, s.x, s.z, 2);
    expect(g.hasStructure('workbench')).toBe(true);
    expect(nextStepLine(g)).toBeNull();
    g.addItem('fibers', 3);
    const line = nextStepLine(g)!;
    expect(line).toBe('You have everything for cord: go to your workbench and tap Cord.');
    // Once you own the thing it stops nagging.
    g.addItem('cord');
    expect(nextStepLine(g)).toBeNull();
  });
  it('is null without a workbench', () => {
    const g = new Game();
    g.addItem('fibers', 3);
    expect(nextStepLine(g)).toBeNull();
  });
});

describe('the objective decides which outline a held part offers', () => {
  it('a stone offers the fire pit normally, and the key part still prefers the objective structure', () => {
    expect(blueprintsForKeyItem('dryStone').map((b) => b.kind)).toEqual(['firePit']);
    expect(blueprintsForKeyItem('dryStone', 'workbench').map((b) => b.kind)).toEqual(['firePit']);
    expect(blueprintsForKeyItem('slab', 'workbench').map((b) => b.kind)).toEqual(['workbench']);
  });
  it('the workbench objective names its structure (so a held stone offers no fire pit meanwhile)', () => {
    expect(OBJECTIVES.find((o) => o.id === 'workbench')!.structure).toBe('workbench');
    const g = new Game();
    for (let i = 0; i < 4; i++) g.gather('dryStone');
    g.gather('slab');
    g.tick(3);
    expect(g.objectives.current!.id).toBe('workbench');
    expect(g.objectives.current!.structure).toBe('workbench');
  });
});

describe('a sharp flake cuts soft plants', () => {
  it('gathering cane with a flake in the bag gives extra and counts as cutting', () => {
    const g = new Game();
    g.addItem('flake');
    expect(g.hasEvent('tool.edge.cut')).toBe(false);
    g.gather('cane');
    expect(g.count('cane')).toBe(2);
    expect(g.hasEvent('tool.edge.cut')).toBe(true);
  });
  it('the prompt names the flake', () => {
    expect(gatherPrompt('cane', 'flake', new Set<ItemId>())).toMatch(/flake/);
    expect(gatherPrompt('cane', null, new Set<ItemId>(['flake']))).toMatch(/flake/);
  });
});
