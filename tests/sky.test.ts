import { describe, expect, it } from 'vitest';
import { DAY_SECONDS, Environment, START_HOUR } from '../src/game/environment.js';
import { cloudCoverage, cloudLight, moonIllumination, moonPhase, starVisibility } from '../src/game/sky.js';

const hourTime = (h: number) => ((h - START_HOUR) / 24) * DAY_SECONDS;

describe('stars', () => {
  it('are off by day, fade in gradually at dusk and are full at night', () => {
    expect(starVisibility(0, 0)).toBe(0);
    let last = -1;
    for (let n = 0; n <= 1.001; n += 0.1) {
      const v = starVisibility(n, 0);
      expect(v).toBeGreaterThanOrEqual(last); // monotonic, no switch
      last = v;
    }
    expect(starVisibility(0.6, 0)).toBeGreaterThan(0);
    expect(starVisibility(0.6, 0)).toBeLessThan(starVisibility(1, 0));
    expect(starVisibility(1, 0)).toBeGreaterThan(0.7);
  });
  it('are hidden by cloud and dimmed a little by a bright moon', () => {
    expect(starVisibility(1, 1)).toBeLessThan(0.1);
    expect(starVisibility(1, 0, 1)).toBeLessThan(starVisibility(1, 0, 0));
    expect(starVisibility(1, 0, 1)).toBeGreaterThan(0.5);
  });
  it('follow the one clock, also right after a load', () => {
    const e = new Environment();
    e.forceWeather = 'clear';
    e.update(hourTime(12), 0);
    expect(starVisibility(e.night, e.cloud, e.moonIllum)).toBe(0);
    e.update(hourTime(24), 0);
    expect(starVisibility(e.night, e.cloud, e.moonIllum)).toBeGreaterThan(0.6);
  });
});

describe('moon', () => {
  it('phase cycles 0..1 with the day count and is full around the first night', () => {
    expect(moonIllumination(moonPhase(0, 22))).toBeGreaterThan(0.85);
    const seen = new Set<string>();
    for (let d = 0; d < 8; d += 0.25) seen.add(moonIllumination(moonPhase(d, 0)).toFixed(1));
    expect(seen.size).toBeGreaterThan(5);
    for (let d = 0; d < 20; d++) {
      const p = moonPhase(d, 3);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
  it('illumination: new 0, half 0.5, full 1', () => {
    expect(moonIllumination(0)).toBeCloseTo(0);
    expect(moonIllumination(0.25)).toBeCloseTo(0.5);
    expect(moonIllumination(0.5)).toBeCloseTo(1);
    expect(moonIllumination(0.75)).toBeCloseTo(0.5);
  });
  it('a thin moon gives less light than a full one', () => {
    const e = new Environment();
    // Find a new-ish and a full night at the same hour.
    let thin = 0;
    let full = 0;
    for (let d = 0; d < 8; d++) {
      e.update(hourTime(24 + 24 * d), 0);
      if (e.moonIllum < 0.1) thin = e.lightIntensity;
      if (e.moonIllum > 0.95) full = e.lightIntensity;
    }
    expect(thin).toBeGreaterThan(0);
    expect(thin).toBeLessThan(full);
  });
});

describe('cloud light', () => {
  const lit = new Float32Array(3);
  const shade = new Float32Array(3);
  it('noon: white tops, soft grey undersides', () => {
    cloudLight(1, 0, 0, lit, shade, false);
    expect(lit[0]).toBeGreaterThan(0.95);
    expect(shade[0]).toBeLessThan(lit[0] - 0.25);
  });
  it('sunset is warm and pink-orange, sunrise is golden, both redder than noon', () => {
    cloudLight(1, 0, 0, lit, shade, false);
    const noonB = lit[2];
    cloudLight(0.04, 0.1, 0, lit, shade, false);
    expect(lit[0]).toBeGreaterThan(lit[2] + 0.3);
    expect(lit[2]).toBeLessThan(noonB - 0.3);
    const sunsetG = lit[1];
    cloudLight(0.04, 0.1, 0, lit, shade, true);
    expect(lit[1]).toBeGreaterThan(sunsetG); // gold is yellower than the sunset orange
  });
  it('night clouds are dark blue and blend into the sky', () => {
    cloudLight(-0.8, 1, 0, lit, shade, false);
    expect(lit[0]).toBeLessThan(0.15);
    expect(lit[2]).toBeGreaterThan(lit[0]);
    expect(shade[2]).toBeLessThan(lit[2]);
  });
  it('overcast flattens the contrast and dulls the tops', () => {
    cloudLight(1, 0, 0, lit, shade, false);
    const gap0 = lit[0] - shade[0];
    const l0 = lit[0];
    cloudLight(1, 0, 1, lit, shade, false);
    expect(lit[0] - shade[0]).toBeLessThan(gap0);
    expect(lit[0]).toBeLessThan(l0);
  });
  it('coverage: some wisps when clear, never total', () => {
    expect(cloudCoverage(0)).toBeGreaterThan(0.05);
    expect(cloudCoverage(0)).toBeLessThan(0.4);
    expect(cloudCoverage(1)).toBeLessThan(1);
    expect(cloudCoverage(0.7)).toBeGreaterThan(cloudCoverage(0.3));
  });
});
