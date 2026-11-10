import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { arrived, planHint, PULSE_MAX } from '../src/game/hintfx.js';
import { OBJECTIVES } from '../src/game/objectives.js';
import { RESOURCES } from '../src/game/world-layout.js';

const spots = RESOURCES.map((r) => ({ id: r.id, x: r.x, z: r.z, item: r.itemId }));
const level = (g: Game, n: number) => {
  const id = g.objectives.current!.id;
  for (let i = g.objectives.hintLevel(id); i < n; i++) g.objectives.unlockHint(id);
};

describe('hint effects follow the hint level', () => {
  it('no hint, no effects', () => {
    const g = new Game();
    const p = planHint(g, spots);
    expect(p.level).toBe(0);
    expect(p.target).toBeNull();
    expect(p.nearby).toHaveLength(0);
  });
  it('level 1 is a clue only; level 2 pulses nearby stones; level 3 raises the beacon on the nearest needed stone', () => {
    const g = new Game();
    level(g, 1);
    let p = planHint(g, spots);
    expect(p.effects).toMatchObject({ clue: true, pulse: false, beacon: false });
    level(g, 2);
    p = planHint(g, spots);
    expect(p.effects.pulse).toBe(true);
    expect(p.nearby.length).toBeGreaterThan(0);
    expect(p.nearby.length).toBeLessThanOrEqual(PULSE_MAX);
    level(g, 3);
    p = planHint(g, spots);
    expect(p.effects.beacon).toBe(true);
    // The beacon is exactly on a real stone spot, the nearest one.
    const stones = RESOURCES.filter((r) => r.itemId === 'dryStone' || r.itemId === 'wetStone');
    const best = stones.reduce((a, b) => (Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b));
    expect(p.target).toMatchObject({ x: best.x, z: best.z });
  });
  it('level 4 marks the exact target as well; it never completes the objective', () => {
    const g = new Game();
    level(g, 4);
    const p = planHint(g, spots);
    expect(p.effects).toMatchObject({ beacon: true, exact: true });
    expect(g.objectives.current!.id).toBe('firstStone');
    expect(g.objectives.completed).toHaveLength(0);
  });
  it('the beacon target follows what is still needed and where you stand', () => {
    const g = new Game();
    for (let i = 0; i < 4; i++) g.gather('dryStone');
    g.tick(3);
    expect(g.objectives.current!.id).toBe('flatStone');
    level(g, 3);
    const p = planHint(g, spots);
    const slabs = RESOURCES.filter((r) => r.itemId === 'slab');
    expect(slabs.some((r) => r.x === p.target!.x && r.z === p.target!.z)).toBe(true);
    // Standing next to a different slab picks that one.
    const far = slabs[slabs.length - 1];
    g.player.x = far.x + 1;
    g.player.z = far.z;
    const q = planHint(g, spots);
    expect(q.target).toMatchObject({ x: far.x, z: far.z });
  });
  it('effects end when the hint is dismissed, the objective completes, or you arrive', () => {
    const g = new Game();
    level(g, 3);
    expect(planHint(g, spots).target).not.toBeNull();
    const t = planHint(g, spots).target!;
    expect(arrived(planHint(g, spots), t.x + 1, t.z)).toBe(true);
    expect(arrived(planHint(g, spots), t.x + 20, t.z)).toBe(false);
    g.objectives.dismissHintFx();
    expect(planHint(g, spots).level).toBe(0);
    expect(planHint(g, spots).target).toBeNull();
    // A higher level turns them back on.
    g.objectives.unlockHint('firstStone');
    expect(planHint(g, spots).level).toBeGreaterThan(0);
    // Completing the objective ends them for good: the next objective starts with none.
    g.gather('dryStone');
    g.tick(3);
    expect(planHint(g, spots).level).toBe(0);
  });
  it('a building objective points at the open mark that takes what you carry', () => {
    const g = new Game();
    for (let i = 0; i < 4; i++) g.gather('dryStone');
    g.gather('slab');
    g.tick(3);
    expect(g.objectives.current!.id).toBe('workbench');
    g.placeFromBook('workbench', 0, -1);
    level(g, 4);
    const p = planHint(g, spots);
    expect(p.target!.id).toMatch(/^mark_/);
    expect(p.effects.exact).toBe(true);
  });
  it('the science objective points at the ruins', () => {
    const g = new Game();
    g.objectives.index = OBJECTIVES.findIndex((o) => o.id === 'science');
    expect(g.objectives.current?.id).toBe('science');
    level(g, 3);
    const p = planHint(g, spots);
    expect(p.target!.id).toBe('place_ruins');
  });
});
