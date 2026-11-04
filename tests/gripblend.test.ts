import { describe, expect, it } from 'vitest';
import { GRIP_BLEND, GripBlend } from '../src/game/twohand.js';
import { Game } from '../src/game/game.js';
import { LAY_NEEDS } from '../src/game/fire.js';
import { FAN, fanStrength, Reciprocation } from '../src/game/gestures.js';
import { HandMotion } from '../src/game/handmotion.js';

type Q = { x: number; y: number; z: number; w: number };
const axisAngle = (x: number, y: number, z: number, deg: number): Q => {
  const h = (deg * Math.PI) / 360;
  const s = Math.sin(h);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(h) };
};
const angleBetween = (a: Q, b: Q): number => (2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w))) * 180) / Math.PI;
const mulQ = (a: Q, b: Q): Q => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});

describe('releasing one hand of a two-hand hold', () => {
  const rest = axisAngle(0, 1, 0, 90); // the one-hand grip pose (hand frame)
  const hand = axisAngle(1, 0, 0, 20);
  // The log sits 39 degrees away from where a one-hand grip would put it.
  const log = mulQ(hand, mulQ(rest, axisAngle(0, 0, 1, 39)));

  it('starts exactly at the pose the log had, with no snap', () => {
    const b = new GripBlend();
    b.begin(hand, log);
    const out: Q = { x: 0, y: 0, z: 0, w: 1 };
    b.target(0, hand, rest, out);
    expect(angleBetween(out, log)).toBeLessThan(0.01);
    // Without the blend the target would be 39 degrees away.
    expect(angleBetween(mulQ(hand, rest), log)).toBeGreaterThan(30);
  });

  it('eases to the grip pose in small steps and then stays there', () => {
    const b = new GripBlend();
    b.begin(hand, log);
    const out: Q = { x: 0, y: 0, z: 0, w: 1 };
    let prev = log;
    let worst = 0;
    const dt = 1 / 72;
    for (let i = 0; i < Math.ceil(GRIP_BLEND.seconds / dt) + 5; i++) {
      b.target(dt, hand, rest, out);
      worst = Math.max(worst, angleBetween(out, prev));
      prev = { ...out };
    }
    expect(worst).toBeLessThan(4); // degrees in one frame
    expect(angleBetween(out, mulQ(hand, rest))).toBeLessThan(0.01);
    expect(b.active).toBe(false);
  });

  it('follows the remaining hand while blending', () => {
    const b = new GripBlend();
    b.begin(hand, log);
    const turned = mulQ(axisAngle(0, 1, 0, 30), hand);
    const out: Q = { x: 0, y: 0, z: 0, w: 1 };
    for (let i = 0; i < 100; i++) b.target(1 / 72, turned, rest, out);
    expect(angleBetween(out, mulQ(turned, rest))).toBeLessThan(0.01);
  });
});

describe('fanning an ember can reach ignition', () => {
  function fanFor(freq: number, amp: number, maxT: number): { burning: boolean; t: number } {
    const g = new Game();
    g.addItem('dryStone', 5);
    g.takeOut('dryStone');
    const res = g.placeBlueprint('firePit', 0, 0);
    g.addItem('dryStone', 3);
    res.structure!.spots.forEach((_, i) => g.fillSpot(res.structure!.id, i));
    g.addItem('dryGrass', LAY_NEEDS.tinder);
    g.addItem('twigs', LAY_NEEDS.twigs);
    g.addItem('logs', LAY_NEEDS.logs);
    while (!g.fire.layBuilt) g.fire.addFuel();
    g.addItem('bowDrill');
    g.takeOut('bowDrill');
    for (let i = 0; i < 100 && !g.fire.carrying; i++) g.fire.saw(0.3, 0.2);
    g.fire.transferEmber();
    const m = new HandMotion();
    const r = new Reciprocation();
    const dt = 1 / 72;
    let t = 0;
    while (t < maxT && g.fire.embedded) {
      t += dt;
      m.push(amp * Math.sin(2 * Math.PI * freq * t), 0.6, 0, t);
      const s = fanStrength(m.speed, r.update(dt, m.vel.x, m.vel.y, m.vel.z));
      if (s > 0) g.fire.fan(s, dt);
      g.fire.tick(dt);
    }
    return { burning: g.fire.stage === 'burning', t };
  }

  it('a normal wave (2-3 Hz, 10-15 cm) lights it within a few seconds', () => {
    for (const [f, a] of [[2, 0.15], [3, 0.1], [2.5, 0.12]] as const) {
      const r = fanFor(f, a, 8);
      expect(r.burning).toBe(true);
      expect(r.t).toBeLessThan(6);
    }
  });

  it('even a gentle wave lights it before the ember dies', () => {
    expect(fanFor(2, 0.1, 12).burning).toBe(true);
  });

  it('barely moving the hand does not', () => {
    expect(fanFor(0.8, 0.05, 12).burning).toBe(false);
  });

  it('the fan thresholds are configurable', () => {
    expect(fanStrength(0.6, 1)).toBeGreaterThan(0);
    expect(fanStrength(0.6, 1, { ...FAN, minSpeed: 1 })).toBe(0);
  });
});
