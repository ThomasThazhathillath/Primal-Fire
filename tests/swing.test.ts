import { describe, expect, it } from 'vitest';
import { bladeAlign, Drive, DRIVE_REASONS, driveBlow, SWING_ALIGN, SWING_WEAK, HIT_RADIUS, HIT_SWEET, impactQuality, Notch, strike, SWING_STRONG } from '../src/game/interact.js';

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

describe('a flat or edge-wrong blow is weaker, with a reason', () => {
  // Head velocity split into the cutting direction (down) and along the blade flat (side).
  const clean = bladeAlign(0.98, 0.1);
  const flat = bladeAlign(0.6, 0.8);
  const upward = bladeAlign(-0.8, 0);

  it('a flat slap scores well under a clean edge, below the glance limit', () => {
    expect(clean).toBeGreaterThan(SWING_ALIGN);
    expect(flat).toBeLessThan(clean * 0.6);
    expect(flat).toBeLessThan(SWING_ALIGN);
  });
  it('an axe slapped flat only glances, and says so', () => {
    const good = strike(SWING_STRONG, clean, 'wood', 'axe');
    const bad = strike(SWING_STRONG, flat, 'wood', 'axe');
    expect(good.outcome).toBe('chop');
    expect(bad.outcome).toBe('glance');
    expect(bad.damage).toBeLessThan(good.damage * 0.2);
    expect(bad.code).toBe('swing.glancing');
  });
  it('an upward flick does nothing at all', () => {
    expect(upward).toBe(0);
    expect(strike(SWING_STRONG, upward, 'wood', 'axe').damage).toBeLessThan(0.05);
  });
});

describe('hammer blows on a construction part', () => {
  it('a square, fast blow makes real progress and needs no excuse', () => {
    const r = driveBlow(SWING_STRONG, 1, 1, 'hammer');
    expect(r.outcome).toBe('drive');
    expect(r.progress).toBeGreaterThan(0.2);
    expect(r.reason).toBeNull();
  });
  it('a flat hit barely moves it and gives a short reason', () => {
    const good = driveBlow(SWING_STRONG, 1, 1, 'hammer');
    const flat = driveBlow(SWING_STRONG, bladeAlign(0.6, 0.8), 1, 'hammer');
    expect(flat.outcome).toBe('glance');
    expect(flat.progress).toBeLessThan(good.progress * 0.2);
    expect(flat.reason).toBe(DRIVE_REASONS.glance);
  });
  it('a gentle tap does nothing and says to swing faster', () => {
    const r = driveBlow(SWING_WEAK - 0.2, 1, 1, 'hammer');
    expect(r.progress).toBe(0);
    expect(r.reason).toBe(DRIVE_REASONS.weak);
  });
  it('a glancing landing off the middle drives less than a centred one', () => {
    expect(driveBlow(SWING_STRONG, 1, 0.4, 'hammer').progress).toBeLessThan(driveBlow(SWING_STRONG, 1, 1, 'hammer').progress);
  });
  it('only a hammer drives', () => {
    expect(driveBlow(SWING_STRONG, 1, 1, 'axe').progress).toBe(0);
    expect(driveBlow(SWING_STRONG, 1, 1, null).reason).toBe(DRIVE_REASONS.noTool);
  });
  it('a few good blows seat the part; flat slaps never do', () => {
    const blows = (align: number) => {
      const d = new Drive();
      for (let i = 1; i <= 40; i++) if (d.hit(driveBlow(SWING_STRONG, align, 1, 'hammer').progress)) return i;
      return Infinity;
    };
    expect(blows(1)).toBeGreaterThan(1);
    expect(blows(1)).toBeLessThanOrEqual(5);
    expect(blows(bladeAlign(0.6, 0.8))).toBeGreaterThan(20);
  });
});
