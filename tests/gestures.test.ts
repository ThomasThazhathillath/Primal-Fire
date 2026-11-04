import { describe, expect, it } from 'vitest';
import { BowDrillMotion, fanStrength, PourState, pourRate, POUR, Reciprocation, tiltDegrees } from '../src/game/gestures.js';
import { distanceToAxis, TwoHandGrip, TwoHandPose } from '../src/game/twohand.js';

describe('two-hand grip', () => {
  it('the second hand takes hold of a two-handed thing close to it', () => {
    const g = new TwoHandGrip();
    g.reset(1);
    expect(g.engage(0, true, 0.2)).toBe(true);
    expect(g.count).toBe(2);
  });

  it('does not engage far away, on a one-handed thing, or twice', () => {
    const g = new TwoHandGrip();
    g.reset(1);
    expect(g.engage(0, true, 0.9)).toBe(false);
    expect(g.engage(0, false, 0.1)).toBe(false);
    expect(g.engage(0, true, 0.1)).toBe(true);
    expect(g.engage(0, true, 0.1)).toBe(false);
  });

  it('releasing one hand leaves the other holding; releasing both lets go', () => {
    const g = new TwoHandGrip();
    g.reset(1);
    g.engage(0, true, 0.1);
    expect(g.open(1)).toBe(false);
    expect(g.primary).toBe(0);
    expect(g.open(0)).toBe(true);
    expect(g.held).toBe(false);
  });

  it('a hand that was never holding cannot let go of it', () => {
    const g = new TwoHandGrip();
    g.reset(1);
    expect(g.open(0)).toBe(false);
    expect(g.held).toBe(true);
  });

  it('measures distance to the object axis, not its middle', () => {
    const c = { x: 0, y: 1, z: 0 };
    const axis = { x: 1, y: 0, z: 0 };
    expect(distanceToAxis({ x: 0.6, y: 1, z: 0 }, c, axis, 0.7)).toBeCloseTo(0);
    expect(distanceToAxis({ x: 0.6, y: 1.3, z: 0 }, c, axis, 0.7)).toBeCloseTo(0.3);
    expect(distanceToAxis({ x: 1.2, y: 1, z: 0 }, c, axis, 0.7)).toBeCloseTo(0.5);
  });
});

describe('two-hand pose', () => {
  const rot = (q: { x: number; y: number; z: number; w: number }, v: [number, number, number]) => {
    const [x, y, z] = v;
    const ix = q.w * x + q.y * z - q.z * y;
    const iy = q.w * y + q.z * x - q.x * z;
    const iz = q.w * z + q.x * y - q.y * x;
    const iw = -q.x * x - q.y * y - q.z * z;
    return [ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x];
  };

  it('puts +X along the line between the hands, in 3D, midway', () => {
    const p = new TwoHandPose();
    p.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1.4, z: -0.8 });
    expect(p.mid).toEqual({ x: 0, y: 1.2, z: -0.4 });
    const ax = rot(p.q, [1, 0, 0]);
    const len = Math.hypot(0, 0.4, -0.8);
    expect(ax[0]).toBeCloseTo(0, 5);
    expect(ax[1]).toBeCloseTo(0.4 / len, 5);
    expect(ax[2]).toBeCloseTo(-0.8 / len, 5);
  });

  it('keeps unit length and does not flip when the hands swap sides', () => {
    const p = new TwoHandPose();
    p.update({ x: -0.4, y: 1, z: 0 }, { x: 0.4, y: 1, z: 0 });
    const before = { ...p.q };
    p.update({ x: 0.4, y: 1, z: 0 }, { x: -0.4, y: 1, z: 0 }); // left and right crossed
    const dot = Math.abs(before.x * p.q.x + before.y * p.q.y + before.z * p.q.z + before.w * p.q.w);
    expect(dot).toBeGreaterThan(0.999);
    expect(Math.hypot(p.q.x, p.q.y, p.q.z, p.q.w)).toBeCloseTo(1, 5);
  });

  it('turns smoothly as the hands sweep round: no frame jumps by more than the step', () => {
    const p = new TwoHandPose();
    let prev = { x: 0, y: 0, z: 0, w: 1 };
    let worst = 0;
    for (let i = 0; i <= 360; i += 2) {
      const a = (i * Math.PI) / 180;
      p.update({ x: -Math.cos(a) * 0.4, y: 1 - Math.sin(a * 2) * 0.1, z: -Math.sin(a) * 0.4 }, { x: Math.cos(a) * 0.4, y: 1 + Math.sin(a * 2) * 0.1, z: Math.sin(a) * 0.4 });
      if (i > 0) {
        const d = Math.abs(prev.x * p.q.x + prev.y * p.q.y + prev.z * p.q.z + prev.w * p.q.w);
        worst = Math.max(worst, 2 * Math.acos(Math.min(1, d)));
      }
      prev = { ...p.q };
    }
    expect(worst).toBeLessThan(0.2); // rad per 2° of sweep
  });

  it('keeps the last pose when the hands touch', () => {
    const p = new TwoHandPose();
    p.update({ x: 0, y: 1, z: 0 }, { x: 0.5, y: 1, z: 0 });
    const q = { ...p.q };
    p.update({ x: 0.2, y: 1, z: 0 }, { x: 0.21, y: 1, z: 0 });
    expect(p.q).toEqual(q);
  });
});

describe('strokes', () => {
  const wave = (r: Reciprocation, seconds: number, hz = 2, amp = 1) => {
    const dt = 1 / 72;
    for (let t = 0; t < seconds; t += dt) r.update(dt, Math.sign(Math.sin(t * hz * Math.PI * 2)) * amp, 0, 0);
  };

  it('a steady back-and-forth builds rhythm', () => {
    const r = new Reciprocation();
    wave(r, 1.5);
    expect(r.rhythm).toBeGreaterThan(0.8);
  });

  it('one sweep, or a hand at rest, does not', () => {
    const r = new Reciprocation();
    for (let i = 0; i < 100; i++) r.update(1 / 72, 1, 0, 0);
    expect(r.rhythm).toBe(0);
    const s = new Reciprocation();
    wave(s, 1.5);
    for (let i = 0; i < 72; i++) s.update(1 / 72, 0, 0, 0);
    expect(s.rhythm).toBeLessThan(0.1);
  });

  it('slow drift does not count as a stroke', () => {
    const r = new Reciprocation();
    for (let i = 0; i < 200; i++) r.update(1 / 72, i % 2 ? 0.1 : -0.1, 0, 0);
    expect(r.rhythm).toBe(0);
  });
});

describe('bow drill', () => {
  const sawFor = (d: BowDrillMotion, steadyDist: number, steadySpeed: number, seconds = 1.5) => {
    const dt = 1 / 72;
    let k = 0;
    for (let t = 0; t < seconds; t += dt) k = d.update(dt, Math.sign(Math.sin(t * 4 * Math.PI)) * 1.2, 0, steadyDist, steadySpeed);
    return k;
  };

  it('makes the most heat with a steady second hand on the spindle', () => {
    expect(sawFor(new BowDrillMotion(), 0.1, 0.05)).toBeGreaterThan(0.8);
  });

  it('makes much less with the other hand away or waving', () => {
    const steady = sawFor(new BowDrillMotion(), 0.1, 0.05);
    expect(sawFor(new BowDrillMotion(), Infinity, 0)).toBeLessThan(steady * 0.4);
    expect(sawFor(new BowDrillMotion(), 0.1, 1.5)).toBeLessThan(steady * 0.4);
  });

  it('stops making heat when the sawing stops', () => {
    const d = new BowDrillMotion();
    sawFor(d, 0.1, 0.05);
    let k = 1;
    for (let i = 0; i < 72; i++) k = d.update(1 / 72, 0, 0, 0.1, 0.05);
    expect(k).toBeLessThan(0.4);
  });
});

describe('fanning', () => {
  it('needs real motion, and a wave beats a single swipe', () => {
    expect(fanStrength(0.3, 1)).toBe(0);
    expect(fanStrength(2, 1)).toBeGreaterThan(fanStrength(2, 0));
    expect(fanStrength(2.4, 1)).toBeGreaterThan(fanStrength(1, 1));
    expect(fanStrength(5, 1)).toBeLessThanOrEqual(1);
  });
});

describe('pouring', () => {
  it('nothing runs until the rim dips, then more the further it tips', () => {
    expect(pourRate(0)).toBe(0);
    expect(pourRate(POUR.start)).toBe(0);
    expect(pourRate(70)).toBeGreaterThan(0);
    expect(pourRate(90)).toBeGreaterThan(pourRate(70));
    expect(pourRate(180)).toBeCloseTo(POUR.fullRate);
  });

  it('the angle sets how fast it empties; upright pours nothing', () => {
    const slow = new PourState();
    const fast = new PourState();
    for (let i = 0; i < 72; i++) {
      slow.step(1 / 72, 55);
      fast.step(1 / 72, 100);
    }
    expect(fast.level).toBeLessThan(slow.level);
    const still = new PourState();
    for (let i = 0; i < 72; i++) still.step(1 / 72, 10);
    expect(still.level).toBe(1);
  });

  it('empties completely at a steep tilt and reports what poured', () => {
    const p = new PourState();
    let poured = 0;
    for (let i = 0; i < 72 * 3; i++) poured += p.step(1 / 72, 120);
    expect(p.empty).toBe(true);
    expect(poured).toBeCloseTo(1, 5);
    p.refill();
    expect(p.level).toBe(1);
  });

  it('tilt from the up vector', () => {
    expect(tiltDegrees(1)).toBeCloseTo(0);
    expect(tiltDegrees(0)).toBeCloseTo(90);
    expect(tiltDegrees(-1)).toBeCloseTo(180);
    expect(tiltDegrees(1.0000001)).toBeCloseTo(0);
  });
});
