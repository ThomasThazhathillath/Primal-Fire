import { describe, expect, it } from 'vitest';
import { bladeAlign, HIT_RADIUS, HIT_SWEET, impactQuality, Notch, strike, SWING_STRONG } from '../src/game/interact.js';

describe('where the head lands', () => {
  it('keeps all force near the middle and none outside reach', () => {
    expect(impactQuality(0)).toBe(1);
    expect(impactQuality(HIT_SWEET)).toBe(1);
    expect(impactQuality(HIT_RADIUS)).toBe(0);
    expect(impactQuality(HIT_RADIUS - 0.001)).toBeCloseTo(0.4, 1);
  });
  it('falls steadily between', () => {
    let last = 1;
    for (let d = HIT_SWEET; d < HIT_RADIUS; d += 0.02) {
      const q = impactQuality(d);
      expect(q).toBeLessThanOrEqual(last);
      last = q;
    }
  });
});

describe('edge alignment', () => {
  it('upward flicks never cut', () => {
    expect(bladeAlign(-0.9, 0)).toBe(0);
    expect(bladeAlign(0, 0)).toBe(0);
  });
  it('a clean downward blow is full, a flat slap loses force', () => {
    expect(bladeAlign(1, 0)).toBe(1);
    expect(bladeAlign(0.8, 0.8)).toBeLessThan(bladeAlign(0.8, 0));
  });
});

describe('chopping a log', () => {
  const blow = (speed: number, align: number, q = 1) => strike(speed, align, 'wood', 'axe').damage * q;
  it('a gentle touch does nothing', () => {
    expect(blow(0.8, 1)).toBe(0);
  });
  it('a flat slap glances', () => {
    expect(strike(3, 0.2, 'wood', 'axe').outcome).toBe('glance');
  });
  it('repeated good swings fell it, a lazy edge takes longer', () => {
    const count = (q: number) => {
      const n = new Notch();
      let blows = 0;
      while (n.depth < 1 && blows < 100) {
        n.hit(blow(SWING_STRONG, 0.95, q), 2.5);
        blows++;
      }
      return blows;
    };
    expect(count(1)).toBeLessThan(15);
    expect(count(1)).toBeGreaterThan(2);
    expect(count(0.5)).toBeGreaterThan(count(1));
  });
  it('the hammer bites wood far less than the axe, harder blows more', () => {
    expect(strike(SWING_STRONG, 1, 'wood', 'hammer').damage).toBeLessThan(strike(SWING_STRONG, 1, 'wood', 'axe').damage);
    expect(strike(SWING_STRONG, 1, 'wood', 'axe').damage).toBeGreaterThan(strike(2, 1, 'wood', 'axe').damage);
  });
  it('stone rings back and soil thuds, with a reason', () => {
    expect(strike(4, 1, 'stone', 'axe').code).toBe('swing.stone');
    expect(strike(4, 1, 'soil', 'axe').code).toBe('swing.soil');
  });
});
