import { describe, expect, it } from 'vitest';
import { carrySpeed, followStiffness, springStep, stepBody, VelocityTracker, type Body } from '../src/game/carry.js';
import { contactGain, contactProfile } from '../src/game/contact.js';
import { Game } from '../src/game/game.js';

const v = (x = 0, y = 0, z = 0) => ({ x, y, z });

describe('held objects follow the hand', () => {
  it('heavy things lag more; two hands steady them', () => {
    expect(followStiffness(0.1, 1)).toBeGreaterThan(followStiffness(6, 1));
    expect(followStiffness(6, 2)).toBeGreaterThan(followStiffness(6, 1));
  });
  it('the spring approaches the hand without overshooting or teleporting', () => {
    const p = v();
    const vel = v();
    const target = v(1, 0, 0);
    const k = followStiffness(6, 2);
    springStep(p, vel, target, k, 1 / 72);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(0.2);
    let max = 0;
    for (let i = 0; i < 400; i++) {
      springStep(p, vel, target, k, 1 / 72);
      max = Math.max(max, p.x);
    }
    expect(p.x).toBeCloseTo(1, 2);
    expect(max).toBeLessThan(1.01);
  });
});

describe('release', () => {
  it('throws with the hand velocity over the last frames', () => {
    const t = new VelocityTracker();
    for (let i = 0; i <= 10; i++) t.push(v(i * 0.02, 1, 0), i / 50);
    const out = t.velocity(v());
    expect(out.x).toBeCloseTo(1, 1);
    expect(out.y).toBeCloseTo(0, 5);
  });
  it('a thrown stone falls, bounces, rolls and settles', () => {
    const b: Body = { pos: v(0, 1.2, 0), vel: v(2, 1, 0), spin: 3, settled: false };
    let impacts = 0;
    let settled = false;
    for (let i = 0; i < 72 * 10 && !settled; i++) {
      const e = stepBody(b, 'dryStone', 1 / 72);
      if (e?.kind === 'impact') impacts++;
      if (e?.kind === 'settled') settled = true;
    }
    expect(settled).toBe(true);
    expect(impacts).toBeGreaterThanOrEqual(1);
    expect(b.pos.y).toBe(0);
    expect(b.pos.x).toBeGreaterThan(1);
  });
  it('clay just plops', () => {
    const b: Body = { pos: v(0, 1, 0), vel: v(0, 0, 0), spin: 0, settled: false };
    let impacts = 0;
    for (let i = 0; i < 72 * 5 && !b.settled; i++) if (stepBody(b, 'clay', 1 / 72)?.kind === 'impact') impacts++;
    expect(impacts).toBe(1);
  });
});

describe('carrying', () => {
  it('slows you while carrying something big', () => {
    expect(carrySpeed(null)).toBe(1);
    expect(carrySpeed('slab')).toBeLessThan(1);
    const g = new Game();
    g.gather('slab');
    expect(g.held).toBe('slab');
    expect(g.count('slab')).toBe(0);
    expect(g.moveLimits.canRun).toBe(false);
    expect(g.moveLimits.speed).toBeLessThan(1);
  });
  it('the bag rejects big things and full hands cannot take more', () => {
    const g = new Game();
    g.gather('logs');
    g.stow();
    expect(g.held).toBe('logs');
    expect(g.gather('slab')).toBe(false);
    g.dropItem('logs', 1, 1);
    expect(g.held).toBeNull();
    expect(g.pickUpDrop(g.drops[0].id)).toBe(true);
    expect(g.held).toBe('logs');
  });
  it('taking something out of the bag keeps a log in your hands', () => {
    const g = new Game();
    g.addItem('twigs');
    g.gather('logs');
    expect(g.takeOut('twigs')).toBe(false);
    expect(g.held).toBe('logs');
  });
});

describe('contact table', () => {
  it('maps material pairs both ways, with a fallback', () => {
    expect(contactProfile('flint', 'stone').sound).toBe('knap');
    expect(contactProfile('stone', 'flint').particle).toBe('sparks');
    expect(contactProfile('stone', 'stone').sound).toBe('click');
    expect(contactProfile('leaf', 'soil').particle).toBe('leaves');
    expect(contactProfile('clay', 'soil').sound).toBe('squish');
    expect(contactProfile('stone', 'water').sound).toBe('splash');
    expect(contactProfile('ember', 'water').sound).toBe('thud');
  });
  it('harder hits are louder', () => {
    const p = contactProfile('stone', 'stone');
    expect(contactGain(p, 4)).toBeGreaterThan(contactGain(p, 0.5));
  });
});
