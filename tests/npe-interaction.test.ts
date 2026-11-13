// NPE milestone A: stable target selection, the pinch-time lock, pickup tolerance and pinch-press on buttons.
import { afterEach, describe, expect, it } from 'vitest';
import { type GazeCandidate, GazeTargeter, pickByRay, PinchLock, type RayCandidate, TOLERANCE } from '../src/game/gaze.js';
import { Game } from '../src/game/game.js';
import { pinchPressIcon, TOUCH_CONFIG, type TouchIcon } from '../src/game/ui-touch.js';

const rc = (key: string, x: number, z: number, inReach = true, r = 0.12): RayCandidate => ({ key, x, y: 0.08, z, r, inReach });
/** A ray from a hand at (0, 1.1, 0) toward a ground point (x, 0.08, z). */
function ray(x: number, z: number): [number, number, number, number, number, number] {
  const o = [0, 1.1, 0];
  const dx = x - o[0];
  const dy = 0.08 - o[1];
  const dz = z - o[2];
  const l = Math.hypot(dx, dy, dz);
  return [o[0], o[1], o[2], dx / l, dy / l, dz / l];
}
const pick = (list: RayCandidate[], x: number, z: number, deg?: number) => pickByRay(list, list.length, ...ray(x, z), deg);

afterEach(() => {
  TOLERANCE.sensitivity = 1;
});

describe('stable target selection (hand ray)', () => {
  it('picks what the ray points at, and nothing far off to the side', () => {
    const list = [rc('a', 0, -1.5), rc('b', 1.2, -1.5)];
    expect(pick(list, 0, -1.5)).toBe(0);
    expect(pick(list, 1.2, -1.5)).toBe(1);
    expect(pick([rc('a', 3, -1.5)], 0, -1.5)).toBe(-1);
  });

  it('prefers the target nearest the ray line, with distance only as a tie-break', () => {
    // Both inside the cone; b is clearly closer to the ray line, though farther away.
    const list = [rc('a', 0.25, -1.2), rc('b', 0.02, -2.0)];
    expect(list[pick(list, 0, -2)].key).toBe('b');
    // Two about equally near the line: the nearer one wins, every time.
    const tie = [rc('far', 0.05, -2.2), rc('near', -0.04, -1.6)];
    for (let i = 0; i < 5; i++) expect(tie[pick(tie, 0, -1.9)].key).toBe('near');
  });

  it('never chooses a target hidden directly behind a nearer one', () => {
    // 'front' sits on a rock half-way along the ray to 'behind' (same line of sight, 1.5 m nearer).
    const list = [rc('behind', 0, -3), { ...rc('front', 0.01, -1.5), y: 0.59 }];
    expect(list[pick(list, 0, -3)].key).toBe('front');
  });

  it('a target in reach beats one out of reach; out of reach is offered only when nothing else is', () => {
    const list = [rc('far', 0, -8, false), rc('ok', 0.6, -3, true)];
    expect(list[pick(list, 0, -8, 20)].key).toBe('ok');
    expect(pick([rc('far', 0, -8, false)], 0, -8)).toBe(0);
  });

  it('interaction sensitivity widens and narrows the cone', () => {
    const list = [rc('a', 0.55, -1.5)];
    TOLERANCE.sensitivity = 0.6;
    expect(pick(list, 0, -1.5)).toBe(-1);
    TOLERANCE.sensitivity = 1.6;
    expect(pick(list, 0, -1.5)).toBe(0);
  });
});

describe('pinch-time target lock', () => {
  it('locks the last stable target, not the one the ray swings onto as the fingers close', () => {
    const lock = new PinchLock();
    for (let i = 0; i < 10; i++) lock.track('stone-1', 1 / 72);
    expect(lock.stable).toBe('stone-1');
    // The pinch closes: for a frame or two the ray is on the neighbour.
    lock.track('stone-2', 1 / 72);
    expect(lock.begin('stone-2')).toBe('stone-1');
    // While held, nothing changes the lock.
    expect(lock.locked).toBe('stone-1');
    lock.end();
    expect(lock.locked).toBeNull();
  });

  it('a target glimpsed for a single frame never becomes stable', () => {
    const lock = new PinchLock();
    lock.track('flicker', 1 / 72);
    expect(lock.stable).toBeNull();
    expect(lock.begin('flicker')).toBe('flicker'); // nothing stable: the current target, never a random one
  });

  it('forgets the stable target once the ray has been away for a while', () => {
    const lock = new PinchLock();
    for (let i = 0; i < 10; i++) lock.track('a', 1 / 72);
    for (let i = 0; i < 40; i++) lock.track(null, 1 / 72);
    expect(lock.stable).toBeNull();
    expect(lock.begin(null)).toBeNull();
  });
});

describe('gaze: nearest to the gaze line, distance as the tie-break', () => {
  const g = (key: string, x: number, z: number): GazeCandidate => ({ key, kind: 'resource', x, y: 0, z, r: 0.1, ref: 0, enabled: true });
  it('of two stones on the same line of sight, the nearer one is chosen', () => {
    const t = new GazeTargeter();
    const list = [g('far', 0.03, -3.2), g('near', -0.02, -2.4)];
    const d = [0, -1.6, -2.8];
    const l = Math.hypot(...d);
    const i = t.update(list, list.length, 0, 1.6, 0, d[0] / l, d[1] / l, d[2] / l, 1 / 72);
    expect(list[i].key).toBe('near');
  });
});

describe('pickup tolerance and feedback state', () => {
  it('says why a pickup would be refused before the pinch', () => {
    const g = new Game();
    expect(g.gatherBlock('dryStone')).toBeNull();
    for (let i = 0; i < 40 && g.gatherBlock('dryStone') === null; i++) g.gather('dryStone');
    expect(g.gatherBlock('dryStone')).toBe('pockets');
  });
});

describe('pinch-press on buttons', () => {
  const icons: TouchIcon[] = [
    { x: 0, y: 0, r: 0.03, enabled: true },
    { x: 0.1, y: 0, r: 0.03, hw: 0.04, hh: 0.025, enabled: true },
    { x: 0.2, y: 0, r: 0.03, enabled: false },
  ];
  it('a pinch closing on a button presses that button', () => {
    expect(pinchPressIcon(icons, 0.005, 0.01, 0.02)).toBe(0);
    expect(pinchPressIcon(icons, 0.12, -0.01, 0)).toBe(1);
  });
  it('never from out in the room, behind the panel, beside the button, or on a disabled one', () => {
    expect(pinchPressIcon(icons, 0, 0, TOUCH_CONFIG.pinchFront + 0.01)).toBe(-1);
    expect(pinchPressIcon(icons, 0, 0, -TOUCH_CONFIG.pinchBehind - 0.01)).toBe(-1);
    expect(pinchPressIcon(icons, 0, 0.08, 0)).toBe(-1);
    expect(pinchPressIcon(icons, 0.2, 0, 0)).toBe(-1);
  });
});
