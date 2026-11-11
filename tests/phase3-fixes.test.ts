import { describe, expect, it } from 'vitest';
import type { PlacedStructure } from '../src/game/blueprint.js';
import { AGEING_AT, SHELF_LIFE } from '../src/game/food.js';
import { Game } from '../src/game/game.js';
import { Tracks, TRACK_CAP } from '../src/game/tracks.js';
import { Wildlife } from '../src/game/wildlife.js';

describe('wildlife', () => {
  it('an alert deer flees once you come close', () => {
    const w = new Wildlife();
    const d = w.animals.find((a) => a.species === 'deer')!;
    for (let t = 0; t < 3; t += 0.1) w.update(0.1, { px: d.x - 30, pz: d.z, hour: 10 });
    // Close in slowly from far away until it turns alert (before it would flee).
    let alertAt = 0;
    for (let dist = 40; dist > 2 && !alertAt; dist -= 0.5) {
      w.update(0.1, { px: d.x - dist, pz: d.z, hour: 10 });
      if (d.state === 'alert') alertAt = dist;
    }
    expect(alertAt).toBeGreaterThan(0);
    // Now right next to it: alert must become flee (it used to stay alert forever).
    w.update(0.1, { px: d.x - 2, pz: d.z, hour: 10 });
    expect(['flee', 'run']).toContain(d.state);
  });
});

describe('tracks', () => {
  it('animal prints never overwrite the seeded quest trails or make them expire', () => {
    const t = new Tracks();
    const seeded = t.prints.filter((p) => p.live && p.seeded).map((p) => [p.x, p.z]);
    expect(seeded.length).toBeGreaterThan(10);
    const w = new Wildlife();
    // A lot of walking: far more prints than the ring holds.
    for (let i = 0; i < TRACK_CAP * 3; i++) {
      const a = w.animals[0];
      a.state = 'walk';
      a.active = true;
      a.hidden = false;
      a.x += 1;
      t.note(a, i);
    }
    t.expire(1e6);
    const after = t.prints.filter((p) => p.live && p.seeded).map((p) => [p.x, p.z]);
    expect(after).toEqual(seeded);
  });
});

describe('seen events need the animal in view', () => {
  it('an animal behind you is not seen; in front for a moment it is', () => {
    const g = new Game();
    const d = g.wildlife.animals.find((a) => a.species === 'deer')!;
    g.setPlayerPosition(d.x, d.z + 12);
    // Facing +z (away from the deer at -z side): yaw 180 degrees.
    g.facingYaw = Math.PI;
    for (let i = 0; i < 40; i++) {
      d.state = 'graze';
      d.x = d.x;
      g.tick(0.1);
    }
    expect(g.hasEvent('wild.deer.seen')).toBe(false);
    g.facingYaw = 0; // looking toward -z: the deer is ahead
    for (let i = 0; i < 25; i++) g.tick(0.1);
    expect(g.hasEvent('wild.deer.seen')).toBe(true);
  });
});

describe('spoilage and drying persistence', () => {
  it('fresh fish spoils, dried fish keeps far longer, and the stack age is saved and shown', () => {
    expect(SHELF_LIFE.driedFish!).toBeGreaterThan(SHELF_LIFE.fish! * 5);
    const g = new Game();
    g.addItem('fish', 2);
    g.addItem('driedFish', 1);
    const ticks = Math.ceil((SHELF_LIFE.fish! * AGEING_AT + 5) / 0.5);
    for (let i = 0; i < ticks; i++) g.tick(0.5);
    expect(g.food.freshnessOf('fish')).toBe('ageing');
    expect(g.food.freshnessOf('driedFish')).toBe('fresh');
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    g2.tick(0.5);
    expect(g2.food.freshnessOf('fish')).toBe('ageing');
    for (let i = 0; i < Math.ceil(SHELF_LIFE.fish! / 0.5); i++) g2.tick(0.5);
    expect(g2.count('fish')).toBeLessThan(2);
    expect(g2.count('driedFish')).toBe(1);
  });

  it('the drying timer survives a save', () => {
    const g = new Game();
    const rack = { id: 950, kind: 'dryingRack', x: 9, z: 9, rotY: 0, key: 'spindle', spots: [], complete: true, store: { fish: 1 } } as unknown as PlacedStructure;
    g.structures.push(rack);
    g.env.rain = 0;
    g.tick(0.5);
    for (let i = 0; i < 40; i++) g.tick(1);
    const t = g.food.snapshot().rack?.[950] ?? 0;
    expect(t).toBeGreaterThan(20);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.food.snapshot().rack?.[950] ?? 0).toBeGreaterThanOrEqual(t - 1);
  });
});
