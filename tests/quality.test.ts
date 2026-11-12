import { describe, expect, it } from 'vitest';
import { nextLower, quality, QUALITY, QualityGovernor } from '../src/game/quality.js';

const run = (g: QualityGovernor, seconds: number, fps: number, target = 72): number => {
  let drops = 0;
  for (let t = 0; t < seconds; t += 1 / fps) if (g.frame(1 / fps, target)) drops++;
  return drops;
};

describe('quality tiers', () => {
  it('each tier is cheaper than the one above it', () => {
    expect(QUALITY.medium.ground).toBeLessThan(QUALITY.high.ground);
    expect(QUALITY.low.ground).toBeLessThan(QUALITY.medium.ground);
    expect(QUALITY.low.grassCount).toBeLessThan(QUALITY.medium.grassCount);
    expect(QUALITY.low.iblPeriod).toBeGreaterThan(QUALITY.medium.iblPeriod);
  });
  it('the live tier switches config and bumps the version once per change', () => {
    quality.set('high');
    const v = quality.version;
    quality.set('high');
    expect(quality.version).toBe(v);
    quality.set('low');
    expect(quality.cfg).toBe(QUALITY.low);
    expect(quality.version).toBe(v + 1);
    quality.set('high');
  });
  it('drops only after the frame rate stays low, never when it is fine', () => {
    expect(run(new QualityGovernor(), 30, 72)).toBe(0);
    expect(run(new QualityGovernor(), 30, 68)).toBe(0); // within 88% of 72
    const g = new QualityGovernor();
    expect(run(g, 4, 40)).toBe(0); // settling after a switch
    expect(run(g, 12, 40)).toBeGreaterThanOrEqual(1);
  });
  it('a short dip does not drop', () => {
    const g = new QualityGovernor();
    run(g, 6, 72);
    expect(run(g, 2, 30)).toBe(0);
    expect(run(g, 6, 72)).toBe(0);
  });
  it('never goes below the lowest tier', () => {
    expect(nextLower('low')).toBe('low');
    expect(nextLower('high')).toBe('medium');
  });
});
