import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../src/game/actions.js';
import { Game } from '../src/game/game.js';
import { ITEMS } from '../src/game/items.js';

describe('hand actions', () => {
  it('reference real items', () => {
    for (const a of ACTIONS) {
      expect(ITEMS[a.input]).toBeDefined();
      for (const id of Object.keys(a.outputs)) expect(ITEMS[id as keyof typeof ITEMS]).toBeDefined();
    }
  });

  it('snapping a branch gives twigs and a stick', () => {
    const g = new Game();
    g.addItem('branch');
    g.takeOut('branch');
    expect(g.work(0.2)).toBe(false);
    expect(g.actionProgress).toBeCloseTo(0.4);
    expect(g.work(0.4)).toBe(true);
    expect(g.held).toBeNull();
    expect(g.count('twigs')).toBe(3);
    expect(g.count('spindle')).toBe(1);
  });

  it('rubbing fibre makes cord and sets the observation', () => {
    const g = new Game();
    g.addItem('fibers');
    g.takeOut('fibers');
    for (let i = 0; i < 10; i++) g.work(0.3);
    expect(g.count('cord')).toBe(1);
    expect(g.notebook).toContain('g_cord');
  });

  it('knapping needs a hammerstone and keeps it', () => {
    const g = new Game();
    g.addItem('flint');
    g.takeOut('flint');
    expect(g.work(1)).toBe(false);
    expect(g.actionProgress).toBe(0);
    g.addItem('dryStone');
    for (let i = 0; i < 6; i++) g.work(1);
    expect(g.count('flake')).toBe(2);
    expect(g.count('dryStone')).toBe(1);
  });

  it('items with no action ignore work', () => {
    const g = new Game();
    g.addItem('twigs');
    g.takeOut('twigs');
    expect(g.work(5)).toBe(false);
  });
});
