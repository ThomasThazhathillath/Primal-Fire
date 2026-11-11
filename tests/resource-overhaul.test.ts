import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { fitsPouch, ITEMS } from '../src/game/items.js';
import { isCollectibleLook, LOOK_CLASS, WORLD_OBJECTS } from '../src/game/resource-class.js';
import { afterGather, afterRegrow, loadedCharges } from '../src/game/resource-state.js';
import { BOULDERS, CLUSTERS, FALLEN_TRUNKS, RESOURCES, STREAM_BANK, streamDistance, TREES } from '../src/game/world-layout.js';

describe('classification', () => {
  it('every look has a class and nothing placed as a spot is decor', () => {
    for (const r of RESOURCES) {
      expect(LOOK_CLASS[r.look], r.look).toBeDefined();
      expect(isCollectibleLook(r.look), r.id).toBe(true);
      expect(ITEMS[r.itemId], r.id).toBeDefined();
    }
  });
  it('world objects that are not spots are documented as decor or something else on purpose', () => {
    for (const [k, v] of Object.entries(WORLD_OBJECTS)) expect(v.why.length, k).toBeGreaterThan(5);
    expect(WORLD_OBJECTS.boulder.cls).toBe('decor');
  });
});

describe('collectibility (every item a spot offers can be gathered, stacks and leaves the world)', () => {
  const items = [...new Set(RESOURCES.map((r) => r.itemId))];
  it.each(items)('%s goes into the bag or the hands', (id) => {
    const g = new Game();
    const before = g.gatheredCount(id);
    expect(g.gather(id, 'test')).toBe(true);
    expect(g.gatheredCount(id)).toBe(before + 1);
    if (fitsPouch(id)) expect(g.count(id)).toBe(1);
    else expect(g.held).toBe(id);
  });
  it('stacks small things', () => {
    const g = new Game();
    for (let i = 0; i < 6; i++) g.gather('flint', 'test');
    expect(g.count('flint')).toBe(6);
  });
  it('a full pack refuses with a message and takes nothing', () => {
    const g = new Game();
    for (let i = 0; i < 20; i++) g.gather('dryStone', 'test');
    const n = g.count('dryStone');
    expect(g.gather('flint', 'test')).toBe(false);
    expect(g.count('flint')).toBe(0);
    expect(g.count('dryStone')).toBe(n);
  });
});

describe('spot state: gathering, regrowth, persistence', () => {
  const rule = { charges: 3, regrow: 100 };
  it('takes one charge at a time and schedules one return', () => {
    const a = afterGather(undefined, rule, 10);
    expect(a).toEqual({ c: 2, r: 110 });
    const b = afterGather(a, rule, 20);
    expect(b).toEqual({ c: 1, r: 110 });
  });
  it('regrows one charge per period until full, then forgets the state', () => {
    let st = afterGather(afterGather(undefined, rule, 0), rule, 0);
    expect(afterRegrow(st, rule, 50)).toBe('wait');
    let next = afterRegrow(st, rule, 100);
    expect(next).toEqual({ c: 2, r: 200 });
    st = next as { c: number; r: number };
    expect(afterRegrow(st, rule, 200)).toBeNull();
  });
  it('never regrows when regrow is 0', () => {
    const st = afterGather(undefined, { charges: 1, regrow: 0 }, 5);
    expect(st).toEqual({ c: 0, r: 0 });
    expect(afterRegrow(st, { charges: 1, regrow: 0 }, 1e9)).toBe('wait');
  });
  it('a saved state loads exactly (no refill) and is clamped', () => {
    expect(loadedCharges({ c: 0, r: 0 }, rule)).toBe(0);
    expect(loadedCharges(undefined, rule)).toBe(3);
    expect(loadedCharges({ c: 99, r: 0 }, rule)).toBe(3);
  });
  it('survives a save and reload with no duplicate entries', () => {
    const g = new Game();
    g.spotState.set('flint-1', { c: 0, r: 500 });
    g.spotState.set('clay-3', { c: 4, r: 700 });
    const raw = JSON.parse(JSON.stringify(g.snapshot()));
    const g2 = Game.restore(raw);
    expect(g2.spotState.size).toBe(2);
    expect(g2.spotState.get('flint-1')).toEqual({ c: 0, r: 500 });
    const g3 = Game.restore(JSON.parse(JSON.stringify(g2.snapshot())));
    expect([...g3.spotState]).toEqual([...g2.spotState]);
  });
  it('old saves without the field load fine', () => {
    const raw = JSON.parse(JSON.stringify(new Game().snapshot()));
    delete raw.resources;
    expect(Game.restore(raw).spotState.size).toBe(0);
  });
  it('stones regrow slowly and flint slower, sticks fast, clay is a deep bed', () => {
    const by = (item: string) => RESOURCES.find((r) => r.itemId === item)!;
    expect(by('flint').regrow).toBeGreaterThan(by('twigs').regrow * 10);
    expect(by('dryStone').regrow).toBeGreaterThan(by('twigs').regrow * 10);
    expect(by('clay').charges).toBeGreaterThanOrEqual(6);
    expect(by('twigs').regrow).toBeGreaterThan(0);
  });
});

describe('layout: abundance, clusters, habitat', () => {
  it('ids are unique and nothing sits inside a trunk or a boulder', () => {
    expect(new Set(RESOURCES.map((r) => r.id)).size).toBe(RESOURCES.length);
    for (const c of CLUSTERS) {
      for (const r of RESOURCES.filter((x) => x.cluster === c.id)) {
        for (const b of BOULDERS) expect(Math.hypot(b.x - r.x, b.z - r.z), r.id).toBeGreaterThan(b.size);
        for (const t of TREES) expect(Math.hypot(t.x - r.x, t.z - r.z), r.id).toBeGreaterThan(0.2);
      }
    }
  });
  it('flint is abundant and some is within a short walk of the start', () => {
    const flint = RESOURCES.filter((r) => r.itemId === 'flint');
    expect(flint.length).toBeGreaterThanOrEqual(35);
    expect(flint.filter((r) => Math.hypot(r.x, r.z) < 22).length).toBeGreaterThanOrEqual(6);
  });
  it('rocky deposits hold 8-15 stones and 3-6 flint beside an outcrop', () => {
    const rocky = CLUSTERS.filter((c) => c.kind === 'rocky');
    expect(rocky.length).toBeGreaterThanOrEqual(4);
    for (const c of rocky) {
      const stones = (c.counts.stone ?? 0) + (c.counts.stonePale ?? 0);
      expect(stones, c.id).toBeGreaterThanOrEqual(8);
      expect(stones, c.id).toBeLessThanOrEqual(15);
      expect(c.counts.stoneDark ?? 0, c.id).toBeGreaterThanOrEqual(3);
      expect(c.counts.stoneDark ?? 0, c.id).toBeLessThanOrEqual(6);
      expect(Math.min(...BOULDERS.map((b) => Math.hypot(b.x - c.x, b.z - c.z))), c.id).toBeLessThan(2.6);
    }
  });
  it('fallen-tree clusters have sticks, branches and bark round a trunk', () => {
    const fallen = CLUSTERS.filter((c) => c.kind === 'fallen');
    expect(fallen.length).toBeGreaterThanOrEqual(10);
    for (const c of fallen) {
      expect(c.counts.twigPile ?? 0, c.id).toBeGreaterThanOrEqual(3);
      expect(c.counts.dryBranch ?? 0, c.id).toBeGreaterThanOrEqual(1);
      expect(Math.min(...FALLEN_TRUNKS.map((t) => Math.hypot(t.x - c.x, t.z - c.z))), c.id).toBeLessThan(0.01);
    }
  });
  it('clay, sand and gravel clusters lie on the stream bank and nowhere else', () => {
    const wet = new Set(['clayPatch', 'sandBar', 'gravelBed']);
    for (const r of RESOURCES.filter((x) => wet.has(x.look))) expect(streamDistance(r.x, r.z), r.id).toBeLessThan(STREAM_BANK + 1);
    expect(CLUSTERS.filter((c) => c.kind === 'stream').length).toBeGreaterThanOrEqual(4);
  });
  it('is deterministic and spread over the map, not gridded', () => {
    const quad = [0, 0, 0, 0];
    for (const r of RESOURCES.filter((x) => x.cluster)) quad[(r.x > 0 ? 1 : 0) + (r.z > 0 ? 2 : 0)]++;
    for (const q of quad) expect(q).toBeGreaterThan(20);
    const xs = RESOURCES.filter((x) => x.look === 'stone' && x.cluster).map((r) => +(r.x % 1).toFixed(2));
    expect(new Set(xs).size).toBeGreaterThan(xs.length * 0.6);
  });
  it('still has enough of everything the chapters need', () => {
    const total = (id: string) => RESOURCES.filter((r) => r.itemId === id).reduce((n, r) => n + r.charges, 0);
    const need: Record<string, number> = { dryStone: 40, flint: 30, twigs: 100, dryGrass: 15, fibers: 20, cane: 8, clay: 15, pole: 12, bark: 30, logs: 10, wetStone: 30, gravel: 20, sand: 10 };
    for (const [id, n] of Object.entries(need)) expect(total(id), id).toBeGreaterThanOrEqual(n);
  });
});
