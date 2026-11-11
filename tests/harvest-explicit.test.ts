import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';

describe('harvesting is explicit', () => {
  it('a held pot touching or released over a ripe plot does not harvest it', () => {
    const g = new Game();
    g.setPlayerPosition(2, 2);
    g.food.plots.push({ id: 1, x: 2, z: 2, crop: 'seeds', growth: 1, moist: 1e9, shaded: false });
    g.addItem('pot');
    g.takeOut('pot');
    expect(g.held).toBe('pot');
    for (const motion of ['touch', 'release'] as const) {
      expect(g.runIntent('pot', 2, 2, motion)).not.toBe('harvest');
      expect(g.food.plots[0].crop).toBe('seeds');
    }
    // The explicit action (pinch / key in WaterSystem) still harvests.
    g.stow();
    const a = g.food.available({ x: 2, z: 2 }, null)!;
    expect(a.id).toBe('harvest');
    expect(g.food.perform(a)).toBe(true);
    expect(g.food.plots[0].crop).toBeFalsy();
  });
});
