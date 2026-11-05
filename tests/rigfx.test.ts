import { describe, expect, it } from 'vitest';
import { bowSlide, drillSmokeRate, drillSpin, fanLean, RIG, SawAxis } from '../src/game/gestures.js';
import { pressSink, ringsWound, stepStarted, strandOffset, strokeOffset, strokePhase, WorkRate, wrapAngle } from '../src/game/stepfx.js';

describe('bow drill rig', () => {
  it('the spindle spins with the stroke and reverses with it, capped', () => {
    expect(drillSpin(0)).toBe(0);
    expect(drillSpin(0.2)).toBeCloseTo(0.2 * RIG.spinGain);
    expect(drillSpin(-0.2)).toBeCloseTo(-0.2 * RIG.spinGain);
    expect(drillSpin(5)).toBe(RIG.spinMax);
    expect(drillSpin(-5)).toBe(-RIG.spinMax);
    expect(Math.abs(drillSpin(0.6))).toBeGreaterThan(Math.abs(drillSpin(0.3)));
  });
  it('the bow follows the hand along its length and never slides off the spindle', () => {
    expect(bowSlide(0.05)).toBe(0.05);
    expect(bowSlide(0.9)).toBe(RIG.slideMax);
    expect(bowSlide(-0.9)).toBe(-RIG.slideMax);
  });
  it('smoke needs a spinning spindle and thickens with heat', () => {
    expect(drillSmokeRate(0, 0.9)).toBe(0);
    expect(drillSmokeRate(RIG.smokeSpin - 1, 0.9)).toBe(0);
    expect(drillSmokeRate(30, 0.8)).toBeGreaterThan(drillSmokeRate(30, 0.1));
    expect(drillSmokeRate(-30, 0.5)).toBe(drillSmokeRate(30, 0.5));
  });
  it('the saw axis starts as given, follows the real stroke direction, and does not flip on reversal', () => {
    const a = new SawAxis();
    a.set(1, 0);
    for (let i = 0; i < 60; i++) a.update(1 / 60, 0, 1); // sawing along +z
    expect(Math.abs(a.z)).toBeGreaterThan(0.95);
    const zBefore = a.z;
    for (let i = 0; i < 10; i++) a.update(1 / 60, 0, -1); // hand reverses
    expect(Math.sign(a.z)).toBe(Math.sign(zBefore));
    expect(Math.hypot(a.x, a.z)).toBeCloseTo(1);
    // a slow drift does nothing
    const x = a.x;
    a.update(1 / 60, 0.05, 0.05);
    expect(a.x).toBe(x);
    expect(a.along(0, 1) * a.along(0, -1)).toBeLessThan(0);
  });
});

describe('fanning leans smoke and sparks with the sweep', () => {
  it('drifts the way the hand sweeps, is capped, and settles when the hand stops', () => {
    const d = { x: 0, z: 0 };
    for (let i = 0; i < 30; i++) fanLean(d, 1 / 60, 2, 0, true);
    expect(d.x).toBeGreaterThan(0.3);
    expect(Math.abs(d.z)).toBeLessThan(1e-6);
    for (let i = 0; i < 60; i++) fanLean(d, 1 / 60, 20, 20, true);
    expect(Math.hypot(d.x, d.z)).toBeLessThanOrEqual(0.9 + 1e-6);
    for (let i = 0; i < 120; i++) fanLean(d, 1 / 60, 3, 3, false);
    expect(Math.hypot(d.x, d.z)).toBeLessThan(0.01);
    // opposite sweep, opposite lean
    const e = { x: 0, z: 0 };
    for (let i = 0; i < 30; i++) fanLean(e, 1 / 60, -2, 0, true);
    expect(e.x).toBeLessThan(-0.3);
  });
});

describe('workbench step motion', () => {
  it('work rate follows the hand and falls to zero when it stops', () => {
    const w = new WorkRate();
    for (let i = 0; i < 30; i++) w.update(1 / 60, 0.01);
    expect(w.rate).toBeGreaterThan(0.1);
    for (let i = 0; i < 120; i++) w.update(1 / 60, 0);
    expect(w.rate).toBe(0);
  });
  it('the ghost-hand cue ends once the step has started', () => {
    expect(stepStarted(0, 0)).toBe(false);
    expect(stepStarted(0.2, 0)).toBe(true);
    expect(stepStarted(0, 0.5)).toBe(true);
  });
  it('cord rings wind one by one with the lashing', () => {
    expect(ringsWound(0, 14)).toBe(0);
    expect(ringsWound(0.5, 14)).toBe(7);
    expect(ringsWound(1, 14)).toBe(14);
    expect(ringsWound(2, 14)).toBe(14);
  });
  it('a scraped part moves only as far as the hand worked', () => {
    let p = 0;
    p = strokePhase(p, 0, 0.1);
    expect(strokeOffset(p, 0.05)).toBe(0);
    p = strokePhase(p, 0.05, 0.1);
    expect(Math.abs(strokeOffset(p, 0.05))).toBeCloseTo(0.05, 3);
  });
  it('a pressed part sinks smoothly to its seat', () => {
    expect(pressSink(0, 0.02)).toBe(0);
    expect(pressSink(1, 0.02)).toBeCloseTo(0.02);
    expect(pressSink(0.5, 0.02)).toBeCloseTo(0.01);
    expect(pressSink(3, 0.02)).toBeCloseTo(0.02);
  });
  it('strands spiral round each other as they are twisted, staying evenly spaced', () => {
    const a = { y: 0, z: 0 };
    const b = { y: 0, z: 0 };
    strandOffset(a, 0, 2, 3, 6, 0, 0.01);
    strandOffset(b, 1, 2, 3, 6, 0, 0.01);
    expect(a.y + b.y).toBeCloseTo(0);
    const c = { y: 0, z: 0 };
    strandOffset(c, 0, 2, 3, 6, 6, 0.01);
    expect(c.z).not.toBeCloseTo(a.z);
    // the far end turns more than the near end
    const n = { y: 0, z: 0 };
    const f = { y: 0, z: 0 };
    strandOffset(n, 0, 2, 0, 6, 3, 0.01);
    strandOffset(f, 0, 2, 5, 6, 3, 0.01);
    expect(Math.atan2(f.z, f.y)).not.toBeCloseTo(Math.atan2(n.z, n.y));
  });
  it('wrap angle advances a full turn per turn of work', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI * 2)).toBeCloseTo(Math.PI * 2);
  });
});
