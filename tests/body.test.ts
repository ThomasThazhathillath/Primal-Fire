// Curriculum Phase 1, C8: the body simulation. Its parts must interact the way the science says,
// and it must stay gentle: nothing kills you, and Off really is off.
import { describe, expect, it } from 'vitest';
import { Game, type GameEvent } from '../src/game/game.js';
import { Body } from '../src/game/survival/body.js';
import { airTemperature, fireWarmth, type Microclimate, microclimate } from '../src/game/survival/climate.js';

const night = { hour: 2, night: 1, cloud: 0, rain: 0, wind: 0.3 };
const here = (o: Partial<{ sheltered: boolean; onBed: boolean; fireDist: number; fireBurning: boolean }> = {}) => ({ sheltered: false, onBed: false, fireDist: Infinity, fireBurning: false, ...o });

/** Warmth after `s` seconds in a microclimate, from comfortable. */
function warmthAfter(m: Microclimate, s: number, setup: (b: Body) => void = () => {}, resting = false): number {
  const b = new Body();
  b.pressure = 'realistic';
  setup(b);
  for (let t = 0; t < s; t += 0.25) b.tick(0.25, m, resting);
  return b.warmth;
}

describe('climate', () => {
  it('is warmest in the afternoon and coldest before dawn; clouds keep nights milder', () => {
    expect(airTemperature({ ...night, hour: 14, night: 0 })).toBeGreaterThan(airTemperature(night));
    expect(airTemperature({ ...night, cloud: 1 })).toBeGreaterThan(airTemperature(night));
  });
  it('shelter stops the rain and most of the wind; a fire warms more the closer you are', () => {
    const open = microclimate({ ...night, rain: 1 }, here());
    const roof = microclimate({ ...night, rain: 1 }, here({ sheltered: true }));
    expect(roof.rain).toBe(0);
    expect(roof.wind).toBeLessThan(open.wind);
    expect(fireWarmth(1, true)).toBeGreaterThan(fireWarmth(3, true));
    expect(fireWarmth(1, false)).toBe(0);
  });
  it('clear nights make the ground colder than the air', () => {
    const m = microclimate(night, here());
    expect(m.ground).toBeLessThan(m.air);
  });
});

describe('heat balance', () => {
  const cold = microclimate(night, here());
  it('more wind means faster heat loss', () => {
    const calm = microclimate({ ...night, wind: 0 }, here());
    const gale = microclimate({ ...night, wind: 1 }, here());
    expect(warmthAfter(gale, 120)).toBeLessThan(warmthAfter(calm, 120));
  });
  it('being wet makes you lose heat much faster', () => {
    expect(warmthAfter(cold, 120, (b) => (b.wet = 1))).toBeLessThan(warmthAfter(cold, 120));
  });
  it('resting on bare ground loses heat into it; a bed stops nearly all of that', () => {
    const roof = microclimate(night, here({ sheltered: true }));
    const bed = microclimate(night, here({ sheltered: true, onBed: true }));
    expect(warmthAfter(bed, 120, undefined, true)).toBeGreaterThan(warmthAfter(roof, 120, undefined, true));
  });
  it('a fire nearby warms you back up', () => {
    const fire = microclimate(night, here({ fireDist: 1, fireBurning: true }));
    expect(warmthAfter(fire, 60, (b) => (b.warmth = 30))).toBeGreaterThan(30);
  });
  it('shelter beats the open on a windy, rainy night', () => {
    const storm = { ...night, rain: 1, wind: 0.8 };
    expect(warmthAfter(microclimate(storm, here({ sheltered: true })), 180)).toBeGreaterThan(warmthAfter(microclimate(storm, here()), 180));
  });
});

describe('needs interact', () => {
  it('rain soaks you, and you dry by a fire', () => {
    const b = new Body();
    for (let t = 0; t < 60; t += 0.25) b.tick(0.25, microclimate({ ...night, rain: 1 }, here()), false);
    expect(b.wet).toBeGreaterThan(0.5);
    const w = b.wet;
    for (let t = 0; t < 30; t += 0.25) b.tick(0.25, microclimate(night, here({ fireDist: 1, fireBurning: true })), false);
    expect(b.wet).toBeLessThan(w);
  });
  it('short of water, you cannot get fully rested', () => {
    const b = new Body();
    b.water = 5;
    b.rest = 10;
    for (let t = 0; t < 300; t += 0.25) b.tick(0.25, microclimate({ ...night, hour: 14, night: 0 }, here({ sheltered: true, onBed: true })), true);
    expect(b.rest).toBeLessThanOrEqual(b.restCap());
    expect(b.rest).toBeLessThan(100);
  });
  it('resting under a roof restores you; a bed does it faster', () => {
    const day = { ...night, hour: 14, night: 0 };
    const rest = (onBed: boolean) => {
      const b = new Body();
      b.rest = 20;
      for (let t = 0; t < 20; t += 0.25) b.tick(0.25, microclimate(day, here({ sheltered: true, onBed })), true);
      return b.rest;
    };
    expect(rest(true)).toBeGreaterThan(rest(false));
    expect(rest(false)).toBeGreaterThan(20);
  });
  it('every third drink of untreated stream water upsets your stomach', () => {
    const b = new Body();
    b.water = 10;
    expect(b.drinkRaw()).toBe(false);
    expect(b.drinkRaw()).toBe(false);
    expect(b.drinkRaw()).toBe(true);
    expect(b.queasy).toBeGreaterThan(0);
    expect(b.water).toBeGreaterThan(90);
  });
});

describe('gentle by design', () => {
  it('nothing kills you: the worst is slow, never stuck', () => {
    const b = new Body();
    b.pressure = 'realistic';
    for (let t = 0; t < 4000; t += 0.25) b.tick(0.25, microclimate({ ...night, rain: 1, wind: 1 }, here()), false);
    expect(b.warmth).toBe(0);
    expect(b.speedFactor()).toBeGreaterThanOrEqual(0.6);
  });
  it('Off changes nothing; Gentle is slower than Realistic', () => {
    const m = microclimate({ ...night, wind: 1 }, here());
    const off = new Body();
    off.pressure = 'off';
    for (let t = 0; t < 600; t += 0.25) off.tick(0.25, m, false);
    expect([off.warmth, off.water, off.food, off.rest]).toEqual([100, 100, 100, 100]);
    expect(warmthAfter(m, 200)).toBeLessThan(
      (() => {
        const g = new Body();
        g.pressure = 'gentle';
        for (let t = 0; t < 200; t += 0.25) g.tick(0.25, m, false);
        return g.warmth;
      })(),
    );
  });
});

describe('in the game', () => {
  it('ticks in the slow step, slows you when cold, saves, and reports level changes once', () => {
    const g = new Game();
    g.body.pressure = 'realistic';
    const events: GameEvent[] = [];
    g.on((e) => e.type === 'body' && events.push(e));
    g.body.warmth = 25;
    g.body.tick(0.25, microclimate(night, here()), false);
    expect(events.filter((e) => e.type === 'body' && e.need === 'warmth')).toHaveLength(1);
    expect(g.moveLimits.speed).toBeLessThan(new Game().moveLimits.speed);
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.body.warmth).toBeCloseTo(g.body.warmth);
  });
  it('a save from before the body starts comfortable', () => {
    const snap = JSON.parse(JSON.stringify(new Game().snapshot()));
    delete snap.body;
    const g = Game.restore(snap);
    expect([g.body.warmth, g.body.water, g.body.food, g.body.rest]).toEqual([100, 100, 100, 100]);
  });
  it('drinking at the stream is offered with empty hands when thirsty', () => {
    const g = new Game();
    g.body.water = 50;
    const s = { x: 4.3, z: 0 };
    const a = g.water.available(s, null);
    expect(a?.id).toBe('drinkStream');
    g.player.x = s.x;
    g.player.z = s.z;
    expect(g.water.perform('drinkStream')).toBe(true);
    expect(g.body.water).toBeGreaterThan(50);
  });
});
