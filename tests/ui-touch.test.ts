import { describe, expect, it } from 'vitest';
import { IconState, rowCentres, TouchTracker, type TipSample, type TouchIcon } from '../src/game/ui-touch.js';

const icons: TouchIcon[] = [
  { x: -0.05, y: 0, r: 0.02, enabled: true },
  { x: 0.05, y: 0, r: 0.02, enabled: true },
  { x: 0.15, y: 0, r: 0.02, enabled: false },
];
const DT = 1 / 72;
const tip = (x: number, y: number, z: number, dz = -1): TipSample => ({ x, y, z, dz, tracked: true });

/** Move the tip along a path of [x, y, z] at constant speed; returns every activation. */
function run(t: TouchTracker, path: Array<[number, number, number]>, speed: number, dz = -1): number[] {
  const hits: number[] = [];
  let [x, y, z] = path[0];
  hits.push(t.update(DT, icons, tip(x, y, z, dz)));
  for (let k = 1; k < path.length; k++) {
    const [tx, ty, tz] = path[k];
    const dist = Math.hypot(tx - x, ty - y, tz - z);
    const steps = Math.max(1, Math.ceil(dist / (speed * DT)));
    for (let i = 1; i <= steps; i++) {
      hits.push(t.update(DT, icons, tip(x + ((tx - x) * i) / steps, y + ((ty - y) * i) / steps, z + ((tz - z) * i) / steps, dz)));
    }
    [x, y, z] = [tx, ty, tz];
  }
  return hits.filter((h) => h >= 0);
}

describe('fingertip tap', () => {
  it('a forward poke activates exactly once', () => {
    const t = new TouchTracker();
    expect(run(t, [[0.05, 0, 0.1], [0.05, 0, -0.03], [0.05, 0, 0.1]], 0.4)).toEqual([1]);
  });

  it('shows approaching, then activated', () => {
    const t = new TouchTracker();
    t.update(DT, icons, tip(0.05, 0, 0.05));
    expect(t.states[1]).toBe(IconState.Approaching);
    run(t, [[0.05, 0, 0.05], [0.05, 0, -0.01]], 0.4);
    expect(t.states[1]).toBe(IconState.Activated);
  });

  it('passing sideways at the surface does not activate', () => {
    const t = new TouchTracker();
    expect(run(t, [[-0.2, 0, -0.01], [0.3, 0, -0.01]], 0.4)).toEqual([]);
  });

  it('passing in front without touching does not activate', () => {
    const t = new TouchTracker();
    expect(run(t, [[-0.2, 0, 0.03], [0.3, 0, 0.03]], 0.5)).toEqual([]);
  });

  it('a slow drift onto the surface does not activate', () => {
    const t = new TouchTracker();
    expect(run(t, [[0.05, 0, 0.05], [0.05, 0, -0.03]], 0.05)).toEqual([]);
  });

  it('a finger not pointing into the panel does not activate', () => {
    const t = new TouchTracker();
    expect(run(t, [[0.05, 0, 0.1], [0.05, 0, -0.03]], 0.4, 0.2)).toEqual([]);
  });

  it('missing the icon does not activate', () => {
    const t = new TouchTracker();
    expect(run(t, [[0.0, 0, 0.1], [0.0, 0, -0.03]], 0.4)).toEqual([]);
  });

  it('a disabled icon never activates', () => {
    const t = new TouchTracker();
    expect(run(t, [[0.15, 0, 0.1], [0.15, 0, -0.03]], 0.4)).toEqual([]);
    expect(t.states[2]).toBe(IconState.Disabled);
  });

  it('needs the fingertip to leave before tapping again, and a cooldown', () => {
    const t = new TouchTracker();
    // Poke, stay in, jiggle in and out through the surface without leaving the icon region.
    const first = run(t, [[0.05, 0, 0.1], [0.05, 0, -0.03], [0.05, 0, 0.01], [0.05, 0, -0.03]], 0.4);
    expect(first).toEqual([1]);
    // Withdraw fully, wait out the cooldown, poke again: a second activation.
    for (let i = 0; i < 60; i++) t.update(DT, icons, tip(0.05, 0, 0.12));
    expect(run(t, [[0.05, 0, 0.12], [0.05, 0, -0.03]], 0.4)).toEqual([1]);
  });

  it('losing tracking resets and activates nothing', () => {
    const t = new TouchTracker();
    t.update(DT, icons, tip(0.05, 0, 0.1));
    expect(t.update(DT, icons, { x: 0.05, y: 0, z: -0.03, dz: -1, tracked: false })).toBe(-1);
    expect(t.update(DT, icons, tip(0.05, 0, -0.03))).toBe(-1);
  });

  it('lays icons out centred', () => {
    const c = rowCentres(3, 0.04, 0.01);
    expect(c[1]).toBeCloseTo(0);
    expect(c[2] - c[0]).toBeCloseTo(0.1);
  });
});
