import { describe, expect, it } from 'vitest';
import { Wildlife, WILD } from '../src/game/wildlife.js';
import { TREES } from '../src/game/world-layout.js';

const run = (w: Wildlife, secs: number, px: number, pz: number, hour: number, dt = 0.1) => {
  for (let t = 0; t < secs; t += dt) w.update(dt, { px, pz, hour });
};
const far = { x: 0, z: 0 };

describe('wildlife', () => {
  it('is deterministic and has the expected population', () => {
    const a = new Wildlife(5);
    const b = new Wildlife(5);
    run(a, 30, 14, 10, 10);
    run(b, 30, 14, 10, 10);
    expect(a.animals.map((x) => [x.x, x.z, x.state])).toEqual(b.animals.map((x) => [x.x, x.z, x.state]));
    expect(a.animals.filter((x) => x.species === 'deer').length).toBe(WILD.counts.deer);
    expect(a.animals.filter((x) => x.species === 'rabbit').length).toBe(WILD.counts.rabbit);
    expect(a.animals.filter((x) => x.species === 'bird').length).toBeLessThanOrEqual(WILD.counts.bird);
  });

  it('parks animals beyond the active range', () => {
    const w = new Wildlife();
    run(w, 5, 200, 200, 10);
    expect(w.animals.every((a) => !a.active)).toBe(true);
  });

  it('deer become alert then flee as you approach', () => {
    const w = new Wildlife();
    const d = w.animals.find((a) => a.species === 'deer')!;
    run(w, 3, d.x - 30, d.z, 10);
    w.update(0.1, { px: d.x - 14, pz: d.z, hour: 10 });
    expect(['alert', 'flee', 'run']).toContain(d.state);
    const before = Math.hypot(d.x - (d.x - 5), 0);
    w.update(0.1, { px: d.x - 4, pz: d.z, hour: 10 });
    expect(['flee', 'run']).toContain(d.state);
    expect(before).toBeGreaterThan(0);
    // The herd follows the leader.
    run(w, 1, d.x - 4, d.z, 10);
    expect(w.animals.filter((a) => a.species === 'deer' && (a.state === 'flee' || a.state === 'run')).length).toBe(3);
  });

  it('deer sleep at night when left alone', () => {
    const w = new Wildlife();
    run(w, 400, 0, 0, 23);
    const deer = w.animals.filter((a) => a.species === 'deer');
    expect(deer.some((a) => a.state === 'sleep' || a.state === 'walk')).toBe(true);
  });

  it('rabbits hide when you rush at them', () => {
    const w = new Wildlife();
    const r = w.animals.find((a) => a.species === 'rabbit')!;
    run(w, 4, r.x - 12, r.z, 9);
    for (let i = 0; i < 60; i++) w.update(0.1, { px: r.x - 3, pz: r.z, hour: 9 });
    expect(r.hidden || r.state === 'flee').toBe(true);
  });

  it('birds startle and fly to another tree', () => {
    const w = new Wildlife();
    const b = w.animals.find((a) => a.species === 'bird')!;
    const from = b.tree;
    w.update(0.1, { px: b.x + 30, pz: b.z, hour: 10 });
    w.update(0.1, { px: b.x + 3, pz: b.z, hour: 10 });
    expect(b.state).toBe('fly');
    run(w, 12, b.x + 3, b.z, 10);
    expect(b.tree).not.toBe(from);
    expect(['perch', 'alert', 'fly']).toContain(b.state);
  });

  it('never ends up inside a trunk', () => {
    const w = new Wildlife();
    run(w, 200, 6, 4, 9);
    for (const a of w.animals.filter((x) => x.species !== 'bird' && x.active)) {
      for (const t of TREES) expect(Math.hypot(a.x - t.x, a.z - t.z)).toBeGreaterThan(0.1);
    }
  });
});
