import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { ITEMS } from '../src/game/items.js';
import { HAND_RECIPES, TOOLS } from '../src/game/tools.js';

describe('tools', () => {
  it('data references real items', () => {
    for (const r of HAND_RECIPES) {
      expect(ITEMS[r.output]).toBeDefined();
      for (const k of Object.keys(r.inputs)) expect(ITEMS[k as keyof typeof ITEMS]).toBeDefined();
    }
    for (const t of TOOLS) expect(ITEMS[t.id]).toBeDefined();
  });

  it('binds an axe from stone, stick and cord', () => {
    const g = new Game();
    expect(g.bind('axe')).toBe(false);
    g.addItem('dryStone');
    g.addItem('spindle');
    g.addItem('cord', 2);
    expect(g.bind('axe')).toBe(true);
    expect(g.count('axe')).toBe(1);
    expect(g.count('cord')).toBe(0);
  });

  it('an axe doubles log gathering and wears out', () => {
    const g = new Game();
    g.addItem('axe');
    g.gather('logs');
    expect(g.count('logs')).toBe(2);
    expect(g.toolUsesLeft('axe')).toBe(19);
    for (let i = 0; i < 25 && g.count('axe') > 0; i++) {
      g.satchel.set('logs', 0);
      g.gather('logs');
    }
    expect(g.count('axe')).toBe(0);
  });

  it('no bonus without the tool, and wear persists', () => {
    const g = new Game();
    g.gather('logs');
    expect(g.count('logs')).toBe(1);
    g.addItem('knife');
    g.gather('fibers');
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.toolUsesLeft('knife')).toBe(24);
  });
});
