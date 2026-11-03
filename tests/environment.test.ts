import { describe, expect, it } from 'vitest';
import { DAY_SECONDS, Environment, fireExposed, START_HOUR, TRANSITION, WEATHER } from '../src/game/environment.js';
import { Game } from '../src/game/game.js';

const hourTime = (h: number) => ((h - START_HOUR) / 24) * DAY_SECONDS;

describe('day/night', () => {
  it('starts in the morning and a day lasts DAY_SECONDS', () => {
    const e = new Environment();
    e.update(0, 0);
    expect(e.hour).toBeCloseTo(START_HOUR);
    e.update(DAY_SECONDS, 0);
    expect(e.hour).toBeCloseTo(START_HOUR);
    expect(e.day).toBe(1);
  });

  it('sun is high at noon and below the horizon at midnight', () => {
    const e = new Environment();
    e.update(hourTime(12), 0);
    expect(e.sunDir[1]).toBeGreaterThan(0.9);
    expect(e.night).toBe(0);
    e.update(hourTime(24), 0);
    expect(e.sunDir[1]).toBeLessThan(-0.9);
    expect(e.night).toBe(1);
    expect(e.isNight()).toBe(true);
    // Night stays playable: still some light, and lit from above.
    expect(e.hemiIntensity).toBeGreaterThan(0.15);
    expect(e.lightDir[1]).toBeGreaterThan(0.15);
  });

  it('night is darker than noon and dusk is warm', () => {
    const e = new Environment();
    e.update(hourTime(12), 0);
    const noon = e.hemiIntensity + e.lightIntensity;
    e.update(hourTime(19), 0);
    expect(e.equator[0]).toBeGreaterThan(e.equator[2]);
    e.update(hourTime(23), 0);
    expect(e.hemiIntensity + e.lightIntensity).toBeLessThan(noon * 0.3);
  });

  it('skipTo jumps forward to the given hour', () => {
    const e = new Environment();
    e.skipTo(0, 21);
    e.update(0, 0);
    expect(e.hour).toBeCloseTo(21);
    e.skipTo(0, 6);
    e.update(0, 0);
    expect(e.hour).toBeCloseTo(6);
    expect(e.day).toBe(1);
  });

  it('is saved with the game and old saves default to morning', () => {
    const g = new Game();
    g.env.skipTo(0, 20);
    g.env.wet = 0.5;
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    back.env.update(0, 0);
    expect(back.env.hour).toBeCloseTo(20);
    expect(back.env.wetness()).toBe(0.5);
    const old = g.snapshot();
    delete old.env;
    const fromOld = Game.restore(old);
    fromOld.env.update(0, 0);
    expect(fromOld.env.hour).toBeCloseTo(START_HOUR);
  });
});

describe('weather', () => {
  it('first spell is calm and clear', () => {
    const e = new Environment();
    for (let t = 0; t < 300; t += 10) {
      e.update(t, 10);
      expect(e.weather).toBe('clear');
      expect(e.isRaining()).toBe(false);
    }
  });

  it('is deterministic from the seed and visits several kinds', () => {
    const a = new Environment();
    const b = new Environment();
    a.seed = b.seed = 42;
    const seen = new Set<string>();
    for (let t = 0; t < 20000; t += 30) {
      a.update(t, 0);
      b.update(t, 0);
      expect(a.weather).toBe(b.weather);
      expect(a.rain).toBe(b.rain);
      seen.add(a.weather);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('transitions smoothly between spells', () => {
    const e = new Environment();
    e.seed = 7;
    let last = -1;
    for (let t = 0; t < 8000; t += 0.5) {
      e.update(t, 0);
      if (last >= 0) expect(Math.abs(e.rain - last)).toBeLessThan(0.5 / TRANSITION + 1e-6 + 0.02);
      last = e.rain;
    }
  });

  it('rain soaks the world and sun dries it; fog cuts visibility', () => {
    const e = new Environment();
    // Find a heavy rain spell.
    let t = 0;
    for (; t < 1e6; t += 20) {
      e.update(t, 0);
      if (e.spell.kind === 'heavyRain' && t > e.spell.start + TRANSITION) break;
    }
    expect(e.isRaining()).toBe(true);
    for (let i = 0; i < 30; i++) e.update(t, 1);
    expect(e.wetness()).toBeGreaterThan(0.3);
    expect(e.visibility()).toBeLessThan(45);
    expect(Math.hypot(e.windVector().x, e.windVector().z)).toBeCloseTo(WEATHER.heavyRain.wind, 1);
  });

  it('a wet world dries out in clear weather', () => {
    const e = new Environment();
    e.wet = 0.5;
    e.update(hourTime(12), 60);
    expect(e.wetness()).toBeLessThan(0.5);
  });
});

describe('rain and fire', () => {
  it('a shelter over the fire keeps the rain off', () => {
    const s = [{ kind: 'shelter', x: 1, z: 0, complete: true }];
    expect(fireExposed(s, 0, 0)).toBe(false);
    expect(fireExposed(s, 10, 0)).toBe(true);
    expect(fireExposed([], 0, 0)).toBe(true);
  });

  it('rain eats burn time but never ends the fire by itself in one step', () => {
    const g = new Game();
    g.fire.stage = 'burning';
    g.fire.burnLeft = 30;
    g.fire.weather(2, 5);
    expect(g.fire.burnLeft).toBe(20);
    g.fire.weather(2, 100);
    expect(g.fire.burnLeft).toBeGreaterThan(0);
    expect(g.fire.stage).toBe('burning');
  });
});
