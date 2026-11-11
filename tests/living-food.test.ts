import { describe, expect, it } from 'vitest';
import type { PlacedStructure } from '../src/game/blueprint.js';
import { cropStage, FoodState } from '../src/game/food.js';
import { FORAGE_PATCHES } from '../src/game/forage.js';
import { Game } from '../src/game/game.js';
import { LIVING_QUESTS } from '../src/game/living-quests.js';

const place = (g: Game, kind: PlacedStructure['kind'], x: number, z: number, spots: PlacedStructure['spots'] = []): PlacedStructure => {
  const s = { id: 900 + g.structures.length, kind, x, z, rotY: 0, key: 'logs', spots, complete: true } as PlacedStructure;
  g.structures.push(s);
  return s;
};

describe('crops', () => {
  it('has five stages', () => {
    expect([0, 0.1, 0.4, 0.8, 1].map(cropStage)).toEqual(['seed', 'sprout', 'young', 'mature', 'harvestable']);
  });
  it('a watered plant announces each stage, returns seeds and survives a save', () => {
    const g = new Game();
    g.setPlayerPosition(2, 2);
    g.food.plots.push({ id: 1, x: 2, z: 2, crop: 'seeds', growth: 0, moist: 1e9, shaded: false });
    for (let i = 0; i < 1300; i++) g.tick(0.1);
    for (const e of ['farm.stage.sprout', 'farm.stage.young', 'farm.stage.mature', 'farm.stage.harvestable'] as const) expect(g.hasEvent(e)).toBe(true);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.food.plots[0].growth).toBe(1);
    g2.addItem('diggingStick');
    g2.setPlayerPosition(2, 2);
    const a = g2.food.available(g2.player, null)!;
    expect(a.id).toBe('harvest');
    const seeds = g2.count('seeds');
    expect(g2.food.perform(a)).toBe(true);
    expect(g2.count('seeds')).toBeGreaterThan(seeds);
    expect(g2.hasEvent('farm.seeds.saved')).toBe(true);
  });
});

describe('foraging', () => {
  it('you must look before you pick, and a look-alike is refused', () => {
    const g = new Game();
    const bad = FORAGE_PATCHES.find((p) => !p.edible)!;
    g.setPlayerPosition(bad.x, bad.z);
    const look = g.food.available(g.player, null)!;
    expect(look.id).toBe('inspect');
    g.food.perform(look);
    expect(g.hasEvent('food.forage.avoided')).toBe(true);
    const pick = g.food.available(g.player, null)!;
    expect(pick.id).toBe('forage');
    g.food.perform(pick);
    expect(g.count(bad.yield)).toBe(0);
  });
  it('an edible patch gives food, then regrows slowly, and the timer is saved', () => {
    const g = new Game();
    const ok = FORAGE_PATCHES.find((p) => p.edible && p.kind === 'berry')!;
    g.setPlayerPosition(ok.x, ok.z);
    g.food.perform(g.food.available(g.player, null)!);
    g.food.perform(g.food.available(g.player, null)!);
    expect(g.count('berries')).toBe(2);
    expect(g.hasEvent('food.forage.picked')).toBe(true);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.food.forage[ok.id]).toBeGreaterThan(0);
  });
});

describe('living camp', () => {
  it('fish dries on a rack in dry daylight and keeps through a save', () => {
    const g = new Game();
    g.env.hourOffset = 12 - ((g.time / g.env.dayLength) * 24) % 24;
    const rack = place(g, 'dryingRack', 4, 4);
    g.setPlayerPosition(4, 4);
    g.addItem('fish');
    g.takeOut('fish');
    const a = g.food.available(g.player, 'fish')!;
    expect(a.id).toBe('hang');
    g.food.perform(a);
    expect(rack.store?.fish).toBe(1);
    for (let i = 0; i < 1100; i++) g.tick(0.1);
    expect(rack.store?.driedFish).toBe(1);
    expect(g.hasEvent('food.fish.dried')).toBe(true);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.structures.find((s) => s.kind === 'dryingRack')?.store?.driedFish).toBe(1);
  });
  it('a woodstack holds fuel, a bed can be rested on, food goes in the basket', () => {
    const g = new Game();
    place(g, 'woodStack', 3, 3, [null, null, 'bark']);
    place(g, 'bedding', 3, 5);
    place(g, 'storage', 3, 3.5);
    g.setPlayerPosition(3, 3);
    g.addItem('logs');
    g.takeOut('logs');
    expect(g.food.perform(g.food.available(g.player, 'logs')!)).toBe(true);
    expect(g.hasEvent('camp.wood.stored')).toBe(true);
    g.setPlayerPosition(3, 4.9);
    expect(g.food.available(g.player, null)?.id).toBe('rest');
    g.food.perform(g.food.available(g.player, null)!);
    expect(g.hasEvent('camp.bed.rested')).toBe(true);
    g.addItem('driedFish');
    g.stash('driedFish');
    expect(g.hasEvent('camp.food.stored')).toBe(true);
  });
  it('the Phase 3 quests are non-linear: finishing one needs none of the others', () => {
    const g = new Game();
    expect(LIVING_QUESTS.length).toBe(7);
    g.science('farm.stage.sprout');
    g.science('farm.stage.mature');
    g.science('farm.harvested');
    g.science('farm.seeds.saved');
    expect(g.living.has('growingFuture')).toBe(true);
    expect(g.living.has('seedsOfTomorrow')).toBe(false);
    expect(FoodState.DRY_SECONDS).toBeGreaterThan(0);
  });
});
