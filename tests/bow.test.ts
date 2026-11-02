import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { type Arrow, drawSpeed, launch, MAX_SPEED, step } from '../src/game/projectile.js';

const arrow = (): Arrow => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, alive: false });

describe('bow', () => {
  it('maps draw to speed', () => {
    expect(drawSpeed(0.1)).toBe(0);
    expect(drawSpeed(0.65)).toBeCloseTo(MAX_SPEED);
    expect(drawSpeed(0.4)).toBeGreaterThan(drawSpeed(0.3));
  });

  it('flies in an arc and lands', () => {
    const a = arrow();
    launch(a, { x: 0, y: 1.5, z: 0 }, { x: 0, y: 0.1, z: -1 }, 25);
    let result = 'none';
    for (let i = 0; i < 600 && result === 'none'; i++) result = step(a, 1 / 72, []);
    expect(result).toBe('ground');
    expect(a.z).toBeLessThan(-20);
  });

  it('hits a target on the path', () => {
    const a = arrow();
    launch(a, { x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: -1 }, 40);
    let result = 'none';
    for (let i = 0; i < 200 && result === 'none'; i++) result = step(a, 1 / 72, [{ x: 0, y: 1.3, z: -10, r: 0.5 }]);
    expect(result).toBe('target');
  });

  it('crafts a bow and arrows, and nocking spends an arrow', () => {
    const g = new Game();
    g.addItem('greenBranch');
    g.addItem('cord');
    expect(g.bind('bow')).toBe(true);
    g.addItem('spindle', 2);
    g.addItem('flake');
    g.addItem('feather', 2);
    expect(g.bind('arrows')).toBe(true);
    expect(g.count('arrow')).toBe(2);
    expect(g.nockArrow()).toBe(false); // bow not in hand
    g.takeOut('bow');
    expect(g.nockArrow()).toBe(true);
    expect(g.count('arrow')).toBe(1);
  });
});
