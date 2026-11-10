import { describe, expect, it } from 'vitest';
import { GAZE, gazeAction, type GazeCandidate, GazePinchGate, gazeScore, GazeTargeter, segmentBlocked } from '../src/game/gaze.js';

const cand = (key: string, x: number, y: number, z: number, kind: GazeCandidate['kind'] = 'resource', r = 0.1): GazeCandidate => ({ key, kind, x, y, z, r, ref: 0, enabled: true });
/** Unit direction from the eye at (0, 1.6, 0) toward (x, y, z). */
function dir(x: number, y: number, z: number): [number, number, number] {
  const dx = x;
  const dy = y - 1.6;
  const dz = z;
  const l = Math.hypot(dx, dy, dz);
  return [dx / l, dy / l, dz / l];
}
const step = (t: GazeTargeter, list: GazeCandidate[], d: [number, number, number], dt = 1 / 72, occ?: (c: GazeCandidate) => boolean) => t.update(list, list.length, 0, 1.6, 0, d[0], d[1], d[2], dt, occ);

describe('gaze score', () => {
  it('hits what you look at, misses what is off to the side, too near or too far', () => {
    const c = cand('a', 0, 0, -3);
    expect(gazeScore(c, 0, 1.6, 0, ...dir(0, 0, -3), GAZE.enterDeg)).toBeGreaterThan(0.5);
    expect(gazeScore(c, 0, 1.6, 0, ...dir(2, 0, -3), GAZE.enterDeg)).toBe(-1);
    expect(gazeScore(cand('n', 0, 1.5, -0.1), 0, 1.6, 0, ...dir(0, 1.5, -0.1), GAZE.enterDeg)).toBe(-1);
    expect(gazeScore(cand('f', 0, 0, -20), 0, 1.6, 0, ...dir(0, 0, -20), GAZE.enterDeg)).toBe(-1);
    // Behind you never counts.
    expect(gazeScore(c, 0, 1.6, 0, 0, 0, 1, 180)).toBe(-1);
  });

  it('a big target is easier to hit at its edge than a small one', () => {
    const d = dir(0.6, 0, -3);
    expect(gazeScore(cand('s', 0, 0, -3, 'resource', 0.05), 0, 1.6, 0, ...d, GAZE.enterDeg)).toBe(-1);
    expect(gazeScore(cand('b', 0, 0, -3, 'bench', 0.5), 0, 1.6, 0, ...d, GAZE.enterDeg)).toBeGreaterThan(0);
  });
});

describe('gaze targeter', () => {
  it('picks the target under the gaze and drops it after a short grace', () => {
    const t = new GazeTargeter();
    const list = [cand('a', 0, 0, -3), cand('b', 2, 0, -3)];
    expect(step(t, list, dir(0, 0, -3))).toBe(0);
    expect(t.key).toBe('a');
    // A blink-length look away keeps it...
    expect(step(t, list, dir(0, 3, -3), 0.05)).toBe(0);
    // ...a real look away drops it.
    step(t, list, dir(0, 3, -3), 0.2);
    expect(t.key).toBeNull();
  });

  it('does not flicker between two overlapping targets (hysteresis)', () => {
    const t = new GazeTargeter();
    const list = [cand('a', 0, 0, -3), cand('b', 0.25, 0, -3)];
    step(t, list, dir(0.05, 0, -3));
    const first = t.key;
    const before = t.switches;
    // Gaze wobbling across the boundary between them.
    for (let i = 0; i < 60; i++) step(t, list, dir(i % 2 ? 0.2 : 0.06, 0, -3));
    expect(t.key).toBe(first);
    expect(t.switches).toBe(before);
  });

  it('switches to a clearly better target after a short dwell, not instantly', () => {
    const t = new GazeTargeter();
    const list = [cand('a', 0, 0, -3), cand('b', 0.45, 0, -3)];
    step(t, list, dir(0, 0, -3));
    expect(t.key).toBe('a');
    step(t, list, dir(0.45, 0, -3), 0.05);
    expect(t.key).toBe('a');
    step(t, list, dir(0.45, 0, -3), 0.1);
    expect(t.key).toBe('b');
  });

  it('never targets through solid geometry', () => {
    const t = new GazeTargeter();
    const list = [cand('hidden', 0, 0, -4)];
    expect(step(t, list, dir(0, 0, -4), 1 / 72, () => true)).toBe(-1);
    expect(step(t, list, dir(0, 0, -4), 1 / 72, () => false)).toBe(0);
  });

  it('a lock keeps the target during an active grab', () => {
    const t = new GazeTargeter();
    const list = [cand('a', 0, 0, -3), cand('b', 1.2, 0, -3)];
    step(t, list, dir(0, 0, -3));
    t.locked = true;
    for (let i = 0; i < 30; i++) step(t, list, dir(1.2, 0, -3), 0.05);
    expect(t.key).toBe('a');
    t.locked = false;
    for (let i = 0; i < 10; i++) step(t, list, dir(1.2, 0, -3), 0.05);
    expect(t.key).toBe('b');
  });

  it('marks win over a loose thing at the same spot', () => {
    const t = new GazeTargeter();
    const list = [cand('stone', 0, 0, -3), cand('mark', 0.02, 0, -3, 'mark')];
    step(t, list, dir(0.01, 0, -3));
    expect(t.key).toBe('mark');
  });
});

describe('gaze pinch gate', () => {
  const dt = 1 / 72;
  const settle = (g: GazePinchGate) => {
    for (let i = 0; i < 20; i++) g.update(false, true, dt);
  };

  it('reports start, hold and release once each', () => {
    const g = new GazePinchGate();
    settle(g);
    expect(g.update(true, true, dt)).toBe('start');
    expect(g.update(true, true, dt)).toBe('hold');
    expect(g.update(true, true, dt)).toBe('hold');
    expect(g.update(false, true, dt)).toBe('release');
    expect(g.update(false, true, dt)).toBeNull();
  });

  it('a held pinch never activates again; consume() marks it used', () => {
    const g = new GazePinchGate();
    settle(g);
    expect(g.update(true, true, dt)).toBe('start');
    g.consume();
    let starts = 0;
    for (let i = 0; i < 100; i++) if (g.update(true, true, dt) === 'start') starts++;
    expect(starts).toBe(0);
    expect(g.consumed).toBe(true);
  });

  it('debounces a quick double pinch from noisy tracking', () => {
    const g = new GazePinchGate();
    settle(g);
    expect(g.update(true, true, dt)).toBe('start');
    g.update(false, true, dt);
    expect(g.update(true, true, dt)).toBe('hold');
    expect(g.consumed).toBe(true);
    g.update(false, true, dt);
    for (let i = 0; i < 30; i++) g.update(false, true, dt);
    expect(g.update(true, true, dt)).toBe('start');
  });

  it('ignores a pinch right after tracking returns, accepts one once settled', () => {
    const g = new GazePinchGate();
    g.update(false, false, dt);
    expect(g.update(true, true, dt)).toBe('hold');
    g.update(false, true, dt);
    for (let i = 0; i < 30; i++) g.update(false, true, dt);
    expect(g.update(true, true, dt)).toBe('start');
  });

  it('tracking lost while open reports nothing; a pinch frozen through a loss stays held', () => {
    const g = new GazePinchGate();
    settle(g);
    expect(g.update(false, false, dt)).toBeNull();
    settle(g);
    g.update(true, true, dt);
    // HandInputSystem keeps a pinch closed through a short loss.
    expect(g.update(true, false, dt)).toBe('hold');
  });
});

describe('gaze action table', () => {
  const base = { held: false, fits: false, bagFits: false, owned: false };
  it('maps each target to its own interaction', () => {
    expect(gazeAction({ ...base, kind: 'resource' })).toBe('take');
    expect(gazeAction({ ...base, kind: 'drop' })).toBe('pickUp');
    expect(gazeAction({ ...base, kind: 'bench' })).toBe('openBench');
    expect(gazeAction({ ...base, kind: 'mark', bagFits: true })).toBe('fillFromBag');
    expect(gazeAction({ ...base, kind: 'mark', held: true, fits: true })).toBe('seatHeld');
    expect(gazeAction({ ...base, kind: 'mark', held: true, fits: false })).toBe('wrongPart');
    expect(gazeAction({ ...base, kind: 'firePit', held: true, fits: true })).toBe('useAtFire');
  });
  it('never grabs a second thing while one is held, and never fights a higher-priority handler', () => {
    expect(gazeAction({ ...base, kind: 'resource', held: true })).toBe('none');
    expect(gazeAction({ ...base, kind: 'drop', held: true })).toBe('none');
    expect(gazeAction({ ...base, kind: 'bench', held: true })).toBe('none');
    expect(gazeAction({ ...base, kind: 'resource', owned: true })).toBe('none');
    expect(gazeAction({ ...base, kind: null })).toBe('none');
  });
});

describe('occlusion segment', () => {
  it('is blocked by a solid in the middle, not by one at the target', () => {
    const tree = (x: number, z: number) => Math.hypot(x, z + 2) < 0.3;
    expect(segmentBlocked(0, 0, 0, -4, tree)).toBe(true);
    expect(segmentBlocked(0, 0, 3, -4, tree)).toBe(false);
    const atTarget = (x: number, z: number) => Math.hypot(x, z + 4) < 0.3;
    expect(segmentBlocked(0, 0, 0, -4, atTarget)).toBe(false);
  });
});
