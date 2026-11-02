import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, blueprintsForKeyItem } from '../src/game/blueprint.js';
import { ITEMS, itemName, SATCHEL_ORDER, type ItemId } from '../src/game/items.js';
import { OBSERVATIONS, OBSERVATION_GROUPS } from '../src/game/observations.js';
import { QUESTS } from '../src/game/quests.js';
import { clamp, lerp, mulberry32, range, valueNoise } from '../src/game/rng.js';
import { SpatialGrid } from '../src/game/spatial-grid.js';
import {
  LANDMARKS,
  LANDMARK_BY_ID,
  RESOURCES,
  STREAM,
  WORLD_RADIUS,
  streamDistance,
} from '../src/game/world-layout.js';

describe('rng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('differs between seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
  it('range, clamp and lerp behave', () => {
    const r = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      const v = range(r, 3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(7);
    }
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });
  it('valueNoise is in [0, 1] and deterministic', () => {
    for (let i = 0; i < 100; i++) {
      const v = valueNoise(i * 0.37, i * -0.91);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBe(valueNoise(i * 0.37, i * -0.91));
    }
  });
});

describe('SpatialGrid', () => {
  it('finds the nearest value within range, else null', () => {
    const g = new SpatialGrid<string>(4);
    g.insert(1, 1, 'near');
    g.insert(30, 30, 'far');
    expect(g.nearest(0, 0, 5)).toBe('near');
    expect(g.nearest(29, 29, 5)).toBe('far');
    expect(g.nearest(15, 15, 3)).toBeNull();
  });
  it('searches across cell borders and negative coordinates', () => {
    const g = new SpatialGrid<number>(4);
    g.insert(-0.5, -0.5, 1);
    g.insert(3.9, 0, 2);
    expect(g.nearest(0.2, 0.2, 2)).toBe(1);
    expect(g.nearest(4.1, 0, 1)).toBe(2);
  });
  it('picks the closer of two candidates', () => {
    const g = new SpatialGrid<string>(4);
    g.insert(2, 0, 'a');
    g.insert(1, 0, 'b');
    expect(g.nearest(0, 0, 10)).toBe('b');
  });
});

describe('items', () => {
  it('has a name, categories and colour for every item', () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      expect(def.name, id).toBeTruthy();
      expect(def.cats.length, id).toBeGreaterThan(0);
      expect(def.color, id).toBeGreaterThanOrEqual(0);
    }
    expect(itemName('dryGrass')).toBe('Dry grass');
  });
  it('satchel order has no duplicates and only known items', () => {
    expect(new Set(SATCHEL_ORDER).size).toBe(SATCHEL_ORDER.length);
    for (const id of SATCHEL_ORDER) expect(ITEMS[id]).toBeDefined();
  });
  it('first-observation references exist', () => {
    for (const def of Object.values(ITEMS)) {
      if (def.firstObservation) expect(OBSERVATIONS[def.firstObservation]).toBeDefined();
    }
  });
});

describe('blueprints', () => {
  it('maps key items to blueprints', () => {
    expect(blueprintsForKeyItem('slab').map((b) => b.kind)).toEqual(['workbench']);
    expect(blueprintsForKeyItem('dryStone').map((b) => b.kind)).toEqual(['firePit']);
    expect(blueprintsForKeyItem('wetStone').map((b) => b.kind)).toEqual(['firePit']);
    expect(blueprintsForKeyItem('clay')).toEqual([]);
  });
  it('only accepts known items and has sensible spot counts', () => {
    for (const b of Object.values(BLUEPRINTS)) {
      for (const id of [...b.keyAccepts, ...b.spots.flatMap((s) => s.accepts)]) {
        expect(ITEMS[id as ItemId]).toBeDefined();
      }
      expect(b.spots.length).toBeGreaterThan(0);
      expect(b.radius).toBeGreaterThan(0);
      if (b.completeObservation) expect(OBSERVATIONS[b.completeObservation]).toBeDefined();
    }
  });
});

describe('observations', () => {
  it('has complete entries in known groups', () => {
    for (const [id, o] of Object.entries(OBSERVATIONS)) {
      expect(OBSERVATION_GROUPS[o.group], id).toBeDefined();
      expect(o.title, id).toBeTruthy();
      expect(o.obs, id).toBeTruthy();
      expect(o.pri, id).toBeTruthy();
      expect(o.lim).toBeDefined();
    }
  });
});

describe('quests', () => {
  it('every step has text-independent hints and valid hint targets', () => {
    for (const q of QUESTS) {
      expect(q.steps.length, q.title).toBeGreaterThan(0);
      for (const s of q.steps) {
        expect(s.hints[0]).toBeTruthy();
        expect(s.hints[1]).toBeTruthy();
        for (const id of s.target.items) expect(ITEMS[id]).toBeDefined();
        if ('structure' in s.target) expect(BLUEPRINTS[s.target.structure]).toBeDefined();
      }
    }
  });
});

describe('world layout extras', () => {
  it('keeps landmarks and resources inside the world', () => {
    for (const l of LANDMARKS) expect(Math.hypot(l.x, l.z)).toBeLessThan(WORLD_RADIUS);
    for (const r of RESOURCES) expect(Math.hypot(r.x, r.z)).toBeLessThan(WORLD_RADIUS);
    expect(LANDMARK_BY_ID.wake.known).toBe(true);
  });
  it('resources carry positive charges and valid items', () => {
    for (const r of RESOURCES) {
      expect(r.charges).toBeGreaterThan(0);
      expect(ITEMS[r.itemId]).toBeDefined();
      expect(r.label).toBeTruthy();
    }
  });
  it('streamDistance is ~0 on the centreline and grows away', () => {
    const [x, z] = STREAM[3];
    expect(streamDistance(x, z)).toBeCloseTo(0, 5);
    expect(streamDistance(x + 10, z)).toBeGreaterThan(5);
  });
});
