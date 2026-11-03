import { describe, expect, it } from 'vitest';
import { bounceOff, type Body } from '../src/game/carry.js';
import { HandMotion, MOTION_CONFIG, throwImpulse, throwShare, THROW_CONFIG } from '../src/game/handmotion.js';

const run = (m: HandMotion, vx: number, seconds: number, t0 = 0, x0 = 0, hz = 72) => {
  const dt = 1 / hz;
  let t = t0;
  let x = x0;
  for (let i = 0; i < seconds * hz; i++) {
    t += dt;
    x += vx * dt;
    m.push(x, 1, 0, t);
  }
  return { t, x };
};

describe('hand motion', () => {
  it('measures a steady swing', () => {
    const m = new HandMotion();
    run(m, 2.5, 0.5);
    expect(m.vel.x).toBeCloseTo(2.5, 1);
    expect(m.speed).toBeCloseTo(2.5, 1);
    expect(m.swing).toBeCloseTo(2.5 / MOTION_CONFIG.fullSwing, 1);
    expect(Math.abs(m.accel.x)).toBeLessThan(0.3);
  });

  it('a still hand has no velocity or swing', () => {
    const m = new HandMotion();
    run(m, 0, 0.5);
    expect(m.speed).toBeCloseTo(0, 3);
    expect(m.swing).toBeCloseTo(0, 3);
  });

  it('smooths jitter', () => {
    const m = new HandMotion();
    for (let i = 1; i <= 60; i++) m.push(i * 0.01 + (i % 2 ? 0.004 : -0.004), 1, 0, i / 72 * 1);
    // x grows 0.01 per 1/72 s = 0.72 m/s; a single-difference estimate would swing wildly around it.
    expect(Math.abs(m.vel.x - 0.72)).toBeLessThan(0.25);
  });

  it('sees speeding up: swing back, then forward, gives a forward acceleration', () => {
    const m = new HandMotion();
    const a = run(m, -1.5, 0.3); // back
    run(m, 0, 0.1, a.t, a.x);
    // forward flick: speed ramps up
    let t = a.t + 0.1;
    let x = a.x;
    let v = 0;
    for (let i = 0; i < 8; i++) {
      v += 0.4;
      t += 1 / 72;
      x += v / 72;
      m.push(x, 1, 0, t);
    }
    expect(m.vel.x).toBeGreaterThan(0);
    expect(m.accel.x).toBeGreaterThan(5);
  });

  it('drops history on a tracking jump instead of reporting a huge speed', () => {
    const m = new HandMotion();
    const a = run(m, 0.5, 0.3);
    m.push(a.x + 3, 1, 0, a.t + 1 / 72); // 3 m in one frame
    expect(m.speed).toBe(0);
    expect(m.samples).toBe(1);
  });

  it('drops history after tracking loss (a long gap)', () => {
    const m = new HandMotion();
    const a = run(m, 1, 0.3);
    m.push(a.x + 0.2, 1, 0, a.t + 0.5);
    expect(m.samples).toBe(1);
    expect(m.speed).toBe(0);
  });

  it('never reports more than the top speed', () => {
    const m = new HandMotion();
    run(m, 13, 0.3); // just under the jump limit
    expect(m.speed).toBeLessThanOrEqual(MOTION_CONFIG.maxSpeed + 1e-6);
  });

  it('reset clears everything', () => {
    const m = new HandMotion();
    run(m, 2, 0.3);
    m.reset();
    expect(m.speed).toBe(0);
    expect(m.samples).toBe(0);
  });
});

describe('releasing: drop, place or throw', () => {
  const out = { x: 0, y: 0, z: 0 };

  it('a gentle release transfers nothing', () => {
    throwImpulse({ x: 0.5, y: 0, z: 0.3 }, 0.3, out);
    expect(out).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('a fast forward release flies the way the hand was going', () => {
    throwImpulse({ x: 0, y: 0.5, z: -4 }, 0.3, out);
    expect(out.z).toBeLessThan(-2);
    expect(Math.abs(out.x)).toBeLessThan(1e-9);
    expect(out.y).toBeGreaterThan(0);
  });

  it('passes on only a share of the hand speed, never more', () => {
    throwImpulse({ x: 5, y: 0, z: 0 }, 0.3, out);
    expect(out.x).toBeGreaterThan(0);
    expect(out.x).toBeLessThan(5);
  });

  it('heavier things leave slower', () => {
    const v = { x: 4, y: 0, z: 0 };
    const light = throwImpulse(v, 0.3, { x: 0, y: 0, z: 0 }).x;
    const axe = throwImpulse(v, 1.5, { x: 0, y: 0, z: 0 }).x;
    const log = throwImpulse(v, 8, { x: 0, y: 0, z: 0 }).x;
    expect(light).toBeGreaterThan(axe);
    expect(axe).toBeGreaterThan(log);
    expect(throwShare(4, 0.3)).toBeGreaterThan(throwShare(4, 8));
  });

  it('the share grows with speed', () => {
    expect(throwShare(1.0, 0.3)).toBeLessThan(throwShare(2.0, 0.3));
    expect(throwShare(THROW_CONFIG.gentle, 0.3)).toBe(0);
  });

  it('clamps extreme velocities (tracking jumps)', () => {
    throwImpulse({ x: 80, y: 90, z: -80 }, 0.1, out);
    expect(Math.hypot(out.x, out.y, out.z)).toBeLessThanOrEqual(THROW_CONFIG.maxSpeed + 1e-6);
    expect(out.y).toBeLessThanOrEqual(THROW_CONFIG.maxUp);
    throwImpulse({ x: 0, y: -50, z: 0 }, 0.1, out);
    expect(out.y).toBeGreaterThanOrEqual(THROW_CONFIG.maxDown);
  });

  it('survives NaN from a bad sample', () => {
    throwImpulse({ x: NaN, y: 0, z: 1 }, 0.3, out);
    expect(out).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('collision bounce', () => {
  const body = (vx: number, vz: number): Body => ({ pos: { x: 0, y: 1, z: 0 }, vel: { x: vx, y: 0, z: vz }, spin: 0, settled: false });

  it('turns a body flying into a wall back, slower', () => {
    const b = body(0, -4);
    const hit = bounceOff(b, 0, 1); // wall faces +z
    expect(hit).toBeCloseTo(4);
    expect(b.vel.z).toBeGreaterThan(0);
    expect(b.vel.z).toBeLessThan(4);
  });

  it('leaves a body moving away or sliding along untouched', () => {
    const away = body(0, 3);
    expect(bounceOff(away, 0, 1)).toBe(0);
    expect(away.vel.z).toBe(3);
    const slide = body(2, 0);
    bounceOff(slide, 0, 1);
    expect(slide.vel.x).toBe(2);
  });
});
