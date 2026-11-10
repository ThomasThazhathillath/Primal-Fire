import { describe, expect, it } from 'vitest';
import { LASH, LashGesture } from '../src/game/lashing.js';

describe('lashing gestures', () => {
  it('two hands rolling against each other, apart, tighten a joint; the same way or too close do not', () => {
    const g = new LashGesture();
    let sum = 0;
    for (let i = 0; i < 60; i++) sum += g.twoHand(0.3, 0.05, -0.05);
    expect(sum).toBeGreaterThan(0.3);
    const same = new LashGesture();
    let s2 = 0;
    for (let i = 0; i < 60; i++) s2 += same.twoHand(0.3, 0.05, 0.05);
    expect(s2).toBe(0);
    const close = new LashGesture();
    let s3 = 0;
    for (let i = 0; i < 60; i++) s3 += close.twoHand(0.02, 0.05, -0.05);
    expect(s3).toBe(0);
  });
  it('a joint is tied by a few seconds of twisting, not an instant: well over one second, under a minute', () => {
    const g = new LashGesture();
    let total = 0;
    let frames = 0;
    while (total < 1 && frames < 100000) {
      total += g.twoHand(0.3, 0.02, -0.02); // 0.04 rad/frame combined at 72 Hz = 2.9 rad/s
      frames++;
    }
    const seconds = frames / 72;
    expect(seconds).toBeGreaterThan(1);
    expect(seconds).toBeLessThan(60);
  });
  it('one hand circling the joint works in either direction, and only at the right distance', () => {
    const turn = (dir: number, r: number) => {
      const g = new LashGesture();
      let sum = 0;
      for (let i = 0; i <= 120; i++) {
        const a = dir * (i / 120) * Math.PI * 2 * LASH.circleTurns;
        sum += g.circle(Math.cos(a) * r, Math.sin(a) * r);
      }
      return sum;
    };
    expect(turn(1, 0.12)).toBeCloseTo(1, 1);
    expect(turn(-1, 0.12)).toBeCloseTo(1, 1);
    expect(turn(1, 0.01)).toBe(0); // a fist in place
    expect(turn(1, 0.9)).toBe(0); // waving about
  });
  it('a hand jumping across the joint or jittering counts as nothing', () => {
    const g = new LashGesture();
    g.circle(0.1, 0);
    expect(g.circle(-0.1, 0.001)).toBe(0); // half a turn in one frame: a tracking jump
    const h = new LashGesture();
    h.circle(0.1, 0);
    expect(h.circle(0.1, 0.0004)).toBe(0); // jitter
  });
  it('the wheel tightens a joint after enough scrolling, either way', () => {
    const g = new LashGesture();
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += g.wheel(i % 2 ? 2 : -2);
    expect(sum).toBeCloseTo(1);
  });
});
