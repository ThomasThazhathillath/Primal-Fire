import { describe, expect, it } from 'vitest';
import { LAY_NEEDS } from '../src/game/fire.js';
import { Game } from '../src/game/game.js';

function withPit(): Game {
  const g = new Game();
  g.addItem('dryStone', 5);
  g.takeOut('dryStone');
  const res = g.placeBlueprint('firePit', 0, 0);
  g.addItem('dryStone', 3);
  res.structure!.spots.forEach((_, i) => g.fillSpot(res.structure!.id, i));
  return g;
}
function layFire(g: Game): void {
  g.addItem('dryGrass', LAY_NEEDS.tinder);
  g.addItem('twigs', LAY_NEEDS.twigs);
  g.addItem('logs', LAY_NEEDS.logs);
  while (!g.fire.layBuilt) expect(g.fire.addFuel()).toBe(true);
}
function sawEmber(g: Game): void {
  g.addItem('bowDrill');
  g.takeOut('bowDrill');
  for (let i = 0; i < 100 && !g.fire.carrying; i++) g.fire.saw(0.3, 0.2);
}

describe('fire', () => {
  it('needs a pit', () => {
    const g = new Game();
    g.addItem('twigs');
    expect(g.fire.addFuel()).toBe(false);
  });

  it('builds the lay from the satchel in order and sets the flag', () => {
    const g = withPit();
    layFire(g);
    expect(g.flag('fireLayBuilt')).toBe(true);
    expect(g.fire.fuelFirst).toBe(false);
    expect(g.fire.stage).toBe('lay');
  });

  it('lights with ember + fanning and sets flags/observations', () => {
    const g = withPit();
    layFire(g);
    sawEmber(g);
    expect(g.flag('emberMade')).toBe(true);
    expect(g.notebook).toContain('f_drill');
    expect(g.fire.transferEmber()).toBe(true);
    for (let i = 0; i < 20; i++) g.fire.fan(0.6, 0.25);
    expect(g.fire.stage).toBe('burning');
    expect(g.flag('fireLit')).toBe(true);
    expect(g.notebook).toContain('f_success');
  });

  it('slow sawing makes no ember', () => {
    const g = withPit();
    layFire(g);
    g.addItem('bowDrill');
    g.takeOut('bowDrill');
    for (let i = 0; i < 200; i++) g.fire.saw(0.01, 0.2);
    expect(g.fire.carrying).toBe(false);
  });

  it('a carried ember dies if not transferred', () => {
    const g = withPit();
    layFire(g);
    sawEmber(g);
    g.tick(25);
    expect(g.fire.carrying).toBe(false);
    expect(g.notebook).toContain('f_oxygen');
  });

  it('an unfanned ember fades', () => {
    const g = withPit();
    layFire(g);
    sawEmber(g);
    g.fire.transferEmber();
    g.tick(20);
    expect(g.fire.embedded).toBe(false);
    expect(g.fire.stage).toBe('lay');
  });

  it('logs before kindling starve the fire', () => {
    const g = withPit();
    g.addItem('logs');
    g.takeOut('logs');
    g.fire.addFuel();
    g.addItem('dryGrass', 1);
    g.addItem('twigs', 3);
    g.addItem('logs', 1);
    while (!g.fire.layBuilt) g.fire.addFuel();
    sawEmber(g);
    g.fire.transferEmber();
    for (let i = 0; i < 20; i++) g.fire.fan(0.6, 0.25);
    expect(g.flag('fireLit')).toBe(false);
    expect(g.notebook).toContain('f_bigfuel');
  });

  it('damp moss kills the ember', () => {
    const g = withPit();
    g.addItem('dampMoss');
    g.addItem('twigs', 3);
    g.addItem('logs', 2);
    g.takeOut('dampMoss');
    g.fire.addFuel();
    while (!g.fire.layBuilt) g.fire.addFuel();
    sawEmber(g);
    g.fire.transferEmber();
    expect(g.notebook).toContain('f_damp');
    expect(g.fire.stage).toBe('cold');
  });

  it('burns out and survives save/restore', () => {
    const g = withPit();
    layFire(g);
    sawEmber(g);
    g.fire.transferEmber();
    for (let i = 0; i < 20; i++) g.fire.fan(0.6, 0.25);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.fire.stage).toBe('burning');
    g2.tick(1000);
    expect(g2.fire.stage).toBe('out');
    expect(g2.notebook).toContain('f_nofuel');
  });
});
