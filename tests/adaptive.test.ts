import { describe, expect, it } from 'vitest';
import { ADAPT, Adaptive } from '../src/game/adaptive.js';
import { openMarks } from '../src/game/assist.js';
import { Game } from '../src/game/game.js';

describe('adaptive assistance', () => {
  it('starts at the default for every channel', () => {
    const a = new Adaptive();
    for (const ch of ['place', 'tap', 'knap'] as const) {
      expect(a.level(ch)).toBe(0);
      expect(a.scale(ch)).toBe(1);
    }
    expect(a.magnet()).toBe(1);
    expect(a.indicator()).toBe(0);
  });
  it('repeated failures grow the radius and magnet step by step and show a clearer indicator', () => {
    const a = new Adaptive();
    const radii: number[] = [];
    const magnets: number[] = [];
    const inds: number[] = [];
    for (let i = 0; i < 8; i++) {
      a.fail('place');
      radii.push(a.scale('place'));
      magnets.push(a.magnet());
      inds.push(a.indicator());
    }
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeGreaterThanOrEqual(radii[i - 1]);
      expect(magnets[i]).toBeGreaterThanOrEqual(magnets[i - 1]);
      expect(inds[i]).toBeGreaterThanOrEqual(inds[i - 1]);
    }
    expect(radii[0]).toBe(1); // one miss changes nothing yet
    expect(radii.at(-1)!).toBeGreaterThan(1.5);
    expect(inds.at(-1)).toBe(2); // pulsing outline and an arrow
    expect(inds).toContain(1); // the pulsing outline comes first
  });
  it('is clamped: it never grows past the cap however often you miss', () => {
    const a = new Adaptive();
    for (let i = 0; i < 500; i++) a.fail('place');
    expect(a.level('place')).toBe(ADAPT.maxLevel);
    expect(a.scale('place')).toBeCloseTo(1 + ADAPT.gain.place * ADAPT.maxLevel);
    expect(a.magnet()).toBeCloseTo(1 + ADAPT.magnetGain * ADAPT.maxLevel);
  });
  it('several successes ease it back to the default, and it never goes below', () => {
    const a = new Adaptive();
    for (let i = 0; i < 8; i++) a.fail('place');
    expect(a.level('place')).toBeGreaterThan(0);
    for (let i = 0; i < 6; i++) a.success('place');
    expect(a.level('place')).toBe(0);
    expect(a.scale('place')).toBe(1);
    for (let i = 0; i < 20; i++) a.success('place');
    expect(a.scale('place')).toBe(1);
  });
  it('the channels are independent: missed taps do not change placing', () => {
    const a = new Adaptive();
    for (let i = 0; i < 8; i++) a.fail('tap');
    expect(a.scale('tap')).toBeGreaterThan(1);
    expect(a.scale('place')).toBe(1);
    expect(a.scale('knap')).toBe(1);
    for (let i = 0; i < 6; i++) a.fail('knap');
    expect(a.scale('knap')).toBeGreaterThan(1);
  });
  it('is saved and restored, tolerates old or broken saves, and clamps what it loads', () => {
    const a = new Adaptive();
    for (let i = 0; i < 6; i++) a.fail('place');
    const b = new Adaptive();
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    expect(b.level('place')).toBe(a.level('place'));
    const c = new Adaptive();
    c.restore(undefined);
    expect(c.level('place')).toBe(0);
    c.restore({ place: 9999, tap: Number.NaN, knap: -5 });
    expect(c.level('place')).toBe(ADAPT.maxLevel);
    expect(c.level('tap')).toBe(0);
    expect(c.level('knap')).toBe(0);
  });
});

describe('placement misses and hits in the game', () => {
  const setup = () => {
    const g = new Game();
    g.addItem('dryStone', 6);
    g.addItem('twigs', 2);
    g.placeFromBook('firePit', 0, -1);
    return { g, m: openMarks(g.structures)[0] };
  };
  it('wrong-material attempts widen the snap radius until a real placement; a Game save keeps it', () => {
    const { g, m } = setup();
    g.takeOut('twigs');
    for (let i = 0; i < 6; i++) g.seatNear('twigs', m.x, m.z, { say: true });
    expect(g.assist.level('place')).toBeGreaterThan(0);
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.assist.level('place')).toBe(g.assist.level('place'));
    g.stow();
    g.takeOut('dryStone');
    // A stone released further away than the default radius now still seats.
    const far = 1.2 * g.assist.scale('place') - 0.05;
    expect(g.seatNear('dryStone', m.x + far, m.z, { say: true, radius: 1.2 })).toBe(true);
  });
  it('old saves without assist load at the default', () => {
    const { g } = setup();
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    delete snap.assist;
    expect(Game.restore(snap).assist.level('place')).toBe(0);
  });
});
