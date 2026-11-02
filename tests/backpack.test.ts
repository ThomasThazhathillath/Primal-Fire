import { describe, expect, it } from 'vitest';
import { BASE_LOAD, BASE_POCKETS, capacityFor, moveLimits } from '../src/game/backpack.js';
import { Game } from '../src/game/game.js';
import { ITEMS } from '../src/game/items.js';

describe('backpack', () => {
  it('every item has a non-negative weight', () => {
    for (const d of Object.values(ITEMS)) expect(d.weight).toBeGreaterThanOrEqual(0);
  });

  it('slows and stops running as the load grows', () => {
    expect(moveLimits(2, 12)).toMatchObject({ encumbrance: 'light', speed: 1, canRun: true });
    const loaded = moveLimits(11, 12);
    expect(loaded.encumbrance).toBe('loaded');
    expect(loaded.canRun).toBe(false);
    const over = moveLimits(24, 12);
    expect(over.encumbrance).toBe('overloaded');
    expect(over.speed).toBeLessThan(loaded.speed);
    expect(over.speed).toBeGreaterThanOrEqual(0.35);
  });

  it('counts held weight and reports limits', () => {
    const g = new Game();
    g.addItem('slab');
    g.addItem('dryStone', 4);
    expect(g.carriedWeight).toBeCloseTo(12);
    expect(g.moveLimits.canRun).toBe(false);
    g.takeOut('slab');
    expect(g.carriedWeight).toBeCloseTo(12);
  });

  it('refuses gathering when pockets are full', () => {
    const g = new Game();
    g.addItem('twigs', BASE_POCKETS);
    expect(g.gather('twigs')).toBe(false);
    expect(g.count('twigs')).toBe(BASE_POCKETS);
  });

  it('upgrades add pockets and load, and persist through save', () => {
    const g = new Game();
    expect(g.upgradePack('sling')).toBe(false);
    g.addItem('cord', 2);
    g.addItem('fibers', 4);
    expect(g.upgradePack('sling')).toBe(true);
    expect(g.upgradePack('sling')).toBe(false);
    expect(g.capacity.pockets).toBeGreaterThan(BASE_POCKETS);
    expect(g.capacity.load).toBeGreaterThan(BASE_LOAD);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.capacity).toEqual(capacityFor(['sling']));
  });
});
