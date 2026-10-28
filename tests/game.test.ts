import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, checkPlacement, spotWorldPosition } from '../src/game/blueprint.js';
import { Game, RECIPES, type Locator } from '../src/game/game.js';
import { ITEMS, type ItemId } from '../src/game/items.js';
import { OBSERVATION_COUNT, OBSERVATIONS } from '../src/game/observations.js';
import { QUESTS } from '../src/game/quests.js';
import {
  inClearing,
  LANDMARKS,
  nearestTreeDistance,
  RESOURCES,
  STREAM_BANK,
  streamDistance,
  TREES,
} from '../src/game/world-layout.js';

const locateFromLayout: Locator = (items, from) => {
  let best: { x: number; z: number; d: number } | null = null;
  for (const r of RESOURCES) {
    if (!items.includes(r.itemId)) continue;
    const d = Math.hypot(r.x - from.x, r.z - from.z);
    if (!best || d < best.d) best = { x: r.x, z: r.z, d };
  }
  return best;
};

function gatherN(g: Game, id: ItemId, n: number): void {
  for (let i = 0; i < n; i++) g.gather(id, 'test');
}

/** Builds a structure of `kind` at (x, z) using items given for the purpose. */
function build(g: Game, kind: 'workbench' | 'firePit', x: number, z: number, key: ItemId, fill: ItemId) {
  g.addItem(key);
  g.takeOut(key);
  const res = g.placeBlueprint(kind, x, z);
  expect(res.ok).toBe(true);
  const s = res.structure!;
  g.addItem(fill, s.spots.length);
  s.spots.forEach((_, i) => expect(g.fillSpot(s.id, i)).toBe(true));
  expect(s.complete).toBe(true);
  return s;
}

describe('content data', () => {
  it('has the 31 notebook observations from the design', () => {
    expect(OBSERVATION_COUNT).toBe(31);
  });

  it('references only observations that exist', () => {
    const refs = [
      ...Object.values(ITEMS).map((i) => i.firstObservation),
      ...Object.values(BLUEPRINTS).map((b) => b.completeObservation),
      ...RECIPES.map((r) => r.observation),
    ].filter(Boolean) as string[];
    for (const id of refs) expect(OBSERVATIONS[id], id).toBeDefined();
  });

  it('gives every quest step two hints', () => {
    for (const q of QUESTS) for (const s of q.steps) expect(s.hints).toHaveLength(2);
  });
});

describe('world layout', () => {
  it('keeps trees out of clearings and off the stream bank', () => {
    expect(TREES.length).toBeGreaterThan(250);
    for (const t of TREES) {
      expect(inClearing(t.x, t.z)).toBe(false);
      expect(streamDistance(t.x, t.z)).toBeGreaterThan(STREAM_BANK);
    }
  });

  it('wakes the player in an open clearing with the stream in sight', () => {
    expect(nearestTreeDistance(0, 0, 10)).toBeGreaterThan(6.5);
    const d = streamDistance(0, 0);
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(6);
  });

  it('is deterministic (same forest every load)', async () => {
    const again = await import('../src/game/world-layout.js?again');
    expect(again.TREES.map((t: { x: number }) => t.x)).toEqual(TREES.map((t) => t.x));
  });

  it('offers every Scavenger material somewhere in the forest', () => {
    const offered = new Set(RESOURCES.map((r) => r.itemId));
    for (const id of ['dryGrass', 'twigs', 'logs', 'slab', 'dryStone', 'spindle', 'board', 'greenBranch', 'fibers'] as ItemId[]) {
      expect(offered.has(id), id).toBe(true);
    }
  });

  it('has unique resource ids and landmark ids', () => {
    expect(new Set(RESOURCES.map((r) => r.id)).size).toBe(RESOURCES.length);
    expect(new Set(LANDMARKS.map((l) => l.id)).size).toBe(LANDMARKS.length);
  });
});

describe('blueprint placement', () => {
  it('accepts open ground in the waking clearing', () => {
    expect(checkPlacement('firePit', -1, -2, []).ok).toBe(true);
  });

  it('rejects the stream bank, tree gaps and overlaps', () => {
    expect(checkPlacement('firePit', 4.3, 0, [])).toMatchObject({ ok: false, reason: 'bank' });
    const t = TREES[0];
    expect(checkPlacement('firePit', t.x + 0.5, t.z, [])).toMatchObject({ ok: false });
    const g = new Game();
    build(g, 'firePit', -1, -2, 'dryStone', 'dryStone');
    expect(checkPlacement('workbench', -1.5, -2, g.structures)).toMatchObject({ ok: false, reason: 'structure' });
    expect(checkPlacement('workbench', -1, 2, g.structures).ok).toBe(true);
  });

  it('rotates snap spots the same way three.js rotates about +Y', () => {
    const p = spotWorldPosition({ kind: 'firePit', x: 0, z: 0, rotY: Math.PI / 2 }, -1);
    // The key stone sits at local +x; a quarter turn about +Y moves +x to −z.
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-0.38);
  });
});

describe('game flow', () => {
  it('needs the key part in hand to start a blueprint', () => {
    const g = new Game();
    expect(g.placeBlueprint('firePit', -1, -2).ok).toBe(false);
    g.addItem('slab');
    g.takeOut('slab');
    expect(g.placeBlueprint('firePit', -1, -2).ok).toBe(false);
    expect(g.held).toBe('slab');
  });

  it('rejects a bad spot without consuming the held stone', () => {
    const g = new Game();
    g.addItem('dryStone');
    g.takeOut('dryStone');
    expect(g.placeBlueprint('firePit', 4.3, 0).ok).toBe(false);
    expect(g.held).toBe('dryStone');
  });

  it('plays the Scavenger quest through to First Fire', () => {
    const g = new Game();
    expect(g.quest?.title).toBe('Scavenger');
    gatherN(g, 'dryGrass', 2);
    gatherN(g, 'twigs', 3);
    gatherN(g, 'logs', 2);
    expect(g.notebook).toContain('g_dead');
    expect(g.currentStep()?.index).toBe(2); // the workbench step

    const bench = build(g, 'workbench', -1, 2, 'slab', 'dryStone');
    expect(g.notebook).toContain('b_tripod');
    expect(g.currentStep()?.index).toBe(3);

    gatherN(g, 'spindle', 1);
    gatherN(g, 'board', 1);
    gatherN(g, 'greenBranch', 1);
    gatherN(g, 'fibers', 3);

    g.setPlayerPosition(10, 10);
    expect(g.craft('cord')).toBe(false); // too far from the bench
    g.setPlayerPosition(bench.x + 1, bench.z);
    expect(g.craft('bowDrill')).toBe(false); // no cord yet
    expect(g.craft('cord')).toBe(true);
    expect(g.craft('bowDrill')).toBe(true);
    expect(g.count('bowDrill')).toBe(1);

    expect(g.quest?.title).toBe('First Fire');
    expect(g.notebook).toEqual(expect.arrayContaining(['g_cord', 'g_bow', 'g_green']));

    build(g, 'firePit', -1, -2, 'wetStone', 'dryStone');
    expect(g.currentStep()?.index).toBe(1); // fire lay next
  });

  it('levels up as XP accumulates', () => {
    const g = new Game();
    g.addXp(260);
    expect(g.level).toBe(3);
  });

  it('escalates hints and finally points the way', () => {
    const g = new Game();
    expect(g.hint(locateFromLayout)?.level).toBe(0);
    expect(g.hint(locateFromLayout)?.level).toBe(1);
    const third = g.hint(locateFromLayout)!;
    expect(third.level).toBe(2);
    expect(third.target).toBeDefined();
    expect(third.text).toMatch(/north|east|south|west/);
  });

  it('gives ground advice for an unbuilt structure once you carry its key part', () => {
    const g = new Game();
    gatherN(g, 'dryGrass', 2);
    gatherN(g, 'twigs', 3);
    gatherN(g, 'logs', 2);
    g.gather('slab');
    g.hint(locateFromLayout);
    g.hint(locateFromLayout);
    expect(g.hint(locateFromLayout)!.text).toMatch(/Build it on/);
  });

  it('discovers places by walking near them', () => {
    const g = new Game();
    const meadow = LANDMARKS.find((l) => l.id === 'meadow')!;
    g.setPlayerPosition(meadow.x, meadow.z);
    expect(g.discovered.has('meadow')).toBe(true);
  });

  it('round-trips through save data', () => {
    const g = new Game();
    gatherN(g, 'twigs', 2);
    build(g, 'firePit', -1, -2, 'dryStone', 'dryStone');
    const copy = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(copy.snapshot()).toEqual(g.snapshot());
    expect(copy.hasStructure('firePit')).toBe(true);
  });
});
