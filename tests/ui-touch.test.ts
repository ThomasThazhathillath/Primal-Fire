import { describe, expect, it } from 'vitest';
import { IconState, rowCentres, TOUCH_CONFIG, TouchTracker, type TipSample, type TouchIcon } from '../src/game/ui-touch.js';

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

/** A straight poke at icon 1 with a fixed pinch distance, 0.4 m/s. */
function run2(t: TouchTracker, pinchDist: number): number[] {
  const hits: number[] = [];
  for (let z = 0.1; z >= -0.03; z -= 0.4 * DT) hits.push(t.update(DT, icons, { ...tip(0.05, 0, z), pinchDist }));
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

  it('a pinching hand never taps, even on a perfect poke', () => {
    const t = new TouchTracker();
    const hits: number[] = [];
    for (const z of [0.1, 0.08, 0.06, 0.04, 0.02, 0, -0.02, -0.03]) {
      hits.push(t.update(DT * 3, icons, { ...tip(0.05, 0, z), pinchDist: 0.012 }));
    }
    expect(hits.filter((h) => h >= 0)).toEqual([]);
  });

  it('pinch hysteresis: still pinching just past pinchOn, free once clearly open', () => {
    const t = new TouchTracker();
    t.update(DT, icons, { ...tip(0.05, 0, 0.1), pinchDist: 0.015 });
    // 0.028 m is between pinchOn and pinchOff: still counted as pinching.
    const still = run2(t, 0.028);
    expect(still).toEqual([]);
    t.update(DT, icons, { ...tip(0.05, 0, 0.12), pinchDist: 0.09 });
    expect(run2(t, 0.09)).toEqual([1]);
  });

  it('a diagonal slide across icons does not fire any of them', () => {
    const t = new TouchTracker();
    // Starts in front of the left icon, sweeps diagonally into the surface across both.
    expect(run(t, [[-0.07, 0, 0.06], [0.07, 0, -0.03]], 0.4)).toEqual([]);
  });

  it('sliding sideways along the surface from icon to icon does not fire the second', () => {
    const t = new TouchTracker();
    // Touch down beside the bar, then slide through both icons just in front of the surface.
    expect(run(t, [[-0.2, 0, 0.1], [-0.2, 0, 0.02], [0.2, 0, 0.02], [0.2, 0, -0.03]], 0.4)).toEqual([]);
  });

  it('a fast poke that skips the press depth in one frame still fires', () => {
    const t = new TouchTracker();
    t.update(DT, icons, tip(0.05, 0, 0.12));
    t.update(DT, icons, tip(0.05, 0, 0.1));
    // 0.1 -> -0.09 in a single frame (≈ 13.7 m/s): past the through depth.
    expect(t.update(DT, icons, tip(0.05, 0, -0.09))).toBe(1);
  });

  it('a fast poke still needs to cross over the icon, judged at the surface', () => {
    const t = new TouchTracker();
    t.update(DT, icons, tip(0.2, 0, 0.1));
    // Ends over icon 1 but crossed the surface plane well outside every icon.
    expect(t.update(DT, icons, tip(0.05, 0, -0.09))).toBe(-1);
  });

  it('an instant tracking jump across the bar never fires, and needs a fresh approach', () => {
    const t = new TouchTracker();
    t.update(DT, icons, tip(-0.3, 0.2, 0.1));
    t.update(DT, icons, tip(-0.3, 0.2, 0.09));
    // Jumps 0.5 m in one frame, landing behind the surface over icon 1.
    expect(t.update(DT, icons, tip(0.05, 0, -0.03))).toBe(-1);
    // Staying there, or poking on from behind, still does nothing.
    expect(t.update(DT, icons, tip(0.05, 0, -0.04))).toBe(-1);
    // A fresh, proper approach afterwards works.
    for (let i = 0; i < 40; i++) t.update(DT, icons, tip(0.05, 0, 0.12));
    expect(run(t, [[0.05, 0, 0.12], [0.05, 0, -0.03]], 0.4)).toEqual([1]);
  });

  it('the jump threshold is configurable', () => {
    const t = new TouchTracker();
    const saved = TOUCH_CONFIG.maxJump;
    TOUCH_CONFIG.maxJump = 0.05;
    t.update(DT, icons, tip(0.05, 0, 0.12));
    t.update(DT, icons, tip(0.05, 0, 0.1));
    expect(t.update(DT, icons, tip(0.05, 0, -0.09))).toBe(-1); // 0.19 m step now counts as a jump
    TOUCH_CONFIG.maxJump = saved;
  });

  it('thresholds are configurable', () => {
    const t = new TouchTracker();
    const saved = TOUCH_CONFIG.minSpeed;
    TOUCH_CONFIG.minSpeed = 2;
    expect(run(t, [[0.05, 0, 0.1], [0.05, 0, -0.03]], 0.4)).toEqual([]);
    TOUCH_CONFIG.minSpeed = saved;
  });

  it('lays icons out centred', () => {
    const c = rowCentres(3, 0.04, 0.01);
    expect(c[1]).toBeCloseTo(0);
    expect(c[2] - c[0]).toBeCloseTo(0.1);
  });
});

describe('pointing pose', () => {
  it('a relaxed hand (not pointing) never taps; a pointing hand does', async () => {
    const { TouchTracker } = await import('../src/game/ui-touch.js');
    const icons = [{ x: 0, y: 0, r: 0.02, enabled: true }];
    const poke = (pointing: boolean) => {
      const t = new TouchTracker();
      let got = -1;
      for (let i = 0; i <= 10; i++) {
        const z = 0.08 - i * 0.01;
        const r = t.update(1 / 72, icons, { x: 0, y: 0, z, dz: -1, tracked: true, pointing });
        if (r >= 0) got = r;
      }
      return got;
    };
    expect(poke(false)).toBe(-1);
    expect(poke(true)).toBe(0);
  });
});

describe('tap guards tuned on Quest (relaxed hand)', () => {
  const icons2: TouchIcon[] = [{ x: 0, y: 0, r: 0.04, enabled: true }];
  const poke = (extra: Partial<{ pinchDist: number; pointing: boolean }>, dx = 0, approachZ = 0.05) => {
    const t = new TouchTracker();
    const out: number[] = [];
    const frames: Array<[number, number]> = [[0, 0.1], [0, approachZ], [dx * 0.5, 0.01], [dx, -0.03]];
    for (const [x, z] of frames) out.push(t.update(1 / 72, icons2, { x, y: 0, z, dz: -0.9, tracked: true, pointing: true, ...extra }));
    return out.some((v) => v >= 0);
  };
  it('a relaxed thumb 2.5 cm from the index tip still taps; touching tips (1 cm) still do not', () => {
    expect(poke({ pinchDist: 0.025 })).toBe(true);
    expect(poke({ pinchDist: 0.01 })).toBe(false);
  });
  it('a small sideways drift while poking still taps; a big sweep does not', () => {
    expect(poke({}, 0.03)).toBe(true);
    expect(poke({}, 0.2)).toBe(false);
  });
  it('a hand that was only 2.5 cm out front before crossing counts as an approach', () => {
    expect(poke({}, 0, 0.025)).toBe(true);
  });
  it('a resting (not pointing) hand still never taps', () => {
    expect(poke({ pointing: false })).toBe(false);
  });
});
