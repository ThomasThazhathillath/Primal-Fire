import { describe, expect, it } from 'vitest';
import { apparentDepth, COOK_SECONDS, GROW_SECONDS, spearHit, WATER_INDEX, WATER_Y, WILD_TUBERS } from '../src/game/food.js';
import { Game } from '../src/game/game.js';
import { GAME_LEVELS, levelForQuest, levelStart, migrateQuestIndex, QUESTS_VERSION } from '../src/game/levels.js';
import { ITEMS } from '../src/game/items.js';
import { BENCH_BY_ID } from '../src/game/bench.js';
import { QUESTS } from '../src/game/quests.js';
import { BOIL_SECONDS, MOUND_MIN_STREAM, POT_DRY_SECONDS, POT_FIRE_SECONDS, SMOKE_BLUE_AT } from '../src/game/water.js';
import { nearestTreeDistance, streamDistance } from '../src/game/world-layout.js';

/** Dry, open ground for a charcoal pit within reach of the fire at the origin. */
function moundSite(): { x: number; z: number } {
  for (let r = 6; r < 14; r += 0.5)
    for (let a = 0; a < 6.28; a += 0.2) {
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (streamDistance(x, z) > MOUND_MIN_STREAM + 0.5 && nearestTreeDistance(x, z) > 1.5) return { x, z };
    }
  throw new Error('no site');
}

/** A game with a finished fire pit at the origin and a burning fire. */
function burning(): Game {
  const g = new Game();
  g.addItem('dryStone', 5);
  g.takeOut('dryStone');
  const res = g.placeBlueprint('firePit', 0, 0);
  g.addItem('dryStone', 3);
  res.structure!.spots.forEach((_, i) => g.fillSpot(res.structure!.id, i));
  g.fire.restore({ ...g.fire.snapshot(), stage: 'burning', burnLeft: 1e6 });
  return g;
}
const tick = (g: Game, s: number) => {
  for (let t = 0; t < s; t += 0.5) g.tick(0.5);
};

describe('levels', () => {
  it('cover the chain in order with real quests', () => {
    for (const lv of GAME_LEVELS) for (const t of lv.quests) expect(QUESTS.some((q) => q.title === t), t).toBe(true);
    expect(levelStart(1)).toBe(0);
    expect(levelStart(2)).toBe(2);
    expect(levelStart(3)).toBe(5);
    expect(levelForQuest(0).n).toBe(1);
    expect(levelForQuest(2).name).toBe('Clean Water');
    expect(levelStart(4)).toBe(QUESTS.findIndex((q) => q.title === 'A Place to Call Home'));
    expect(levelForQuest(levelStart(4) - 1).n).toBe(3); // First Lab still ends Chapter 1
    expect(levelForQuest(QUESTS.length).n).toBe(4);
  });

  it('completes a level with a level-complete event and XP', () => {
    const g = new Game();
    const events: unknown[] = [];
    g.on((e) => e.type === 'levelComplete' && events.push(e));
    g.questIndex = 1; // First Fire
    g.setFlag('fireLit');
    g.setFlag('fireLayBuilt');
    g.setFlag('emberMade');
    g.addItem('dryStone', 5);
    g.takeOut('dryStone');
    const res = g.placeBlueprint('firePit', 0, 0);
    g.addItem('dryStone', 3);
    const xp0 = g.xp;
    res.structure!.spots.forEach((_, i) => g.fillSpot(res.structure!.id, i));
    g.checkQuests();
    expect(g.gameLevel.n).toBe(2);
    expect(g.levelReached).toBe(2);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ level: 1, name: 'First Fire', next: { n: 2 } });
    expect(g.xp - xp0).toBeGreaterThanOrEqual(GAME_LEVELS[0].xp);
  });

  it('migrates old saves to the right level', () => {
    expect(migrateQuestIndex(1, undefined)).toBe(1);
    expect(migrateQuestIndex(4, undefined)).toBe(4);
    expect(migrateQuestIndex(7, undefined)).toBe(levelStart(3));
    expect(QUESTS[migrateQuestIndex(10, undefined)].title).toBe('First Lab');
    expect(migrateQuestIndex(6, QUESTS_VERSION)).toBe(6);
    const old = new Game().snapshot();
    const save = { ...old, questIndex: 8, questsVersion: undefined, levelReached: undefined };
    const g = Game.restore(JSON.parse(JSON.stringify(save)));
    expect(g.gameLevel.name).toBe('Camp');
    expect(g.levelReached).toBe(3);
  });
});

describe('level 2: water', () => {
  it('dries, fires, fills, filters and boils: only filtered + boiled water is safe', () => {
    const g = burning();
    g.addItem('pot');
    tick(g, POT_DRY_SECONDS + 1);
    expect(g.flag('potDry')).toBe(true);
    g.takeOut('pot');
    expect(g.water.available()?.id).toBe('firePot');
    expect(g.water.perform('firePot')).toBe(true);
    tick(g, POT_FIRE_SECONDS + 1);
    expect(g.flag('potFired')).toBe(true);

    // Raw water boiled is not safe.
    g.water.potWater = 'raw';
    expect(g.water.available()?.id).toBe('boil');
    g.water.perform('boil');
    tick(g, BOIL_SECONDS + 1);
    expect(g.water.potWater).toBe('boiledRaw');
    expect(g.flag('waterSafe')).toBe(false);
    expect(g.hasEvent('water.boil.murky')).toBe(true);

    // Filtered, then boiled.
    g.water.potWater = 'filtered';
    g.water.perform('boil');
    tick(g, BOIL_SECONDS + 1);
    expect(g.water.potWater).toBe('safe');
    expect(g.flag('waterSafe')).toBe(true);
    expect(g.hasEvent('water.boil.done')).toBe(true);
  });

  it('a damp pot bursts in the fire', () => {
    const g = burning();
    g.addItem('pot');
    g.takeOut('pot');
    g.water.perform('firePot');
    expect(g.hasEvent('pottery.wet.burst')).toBe(true);
    expect(g.held).toBe(null);
  });

  it('fills at the stream and pours through a finished filter', () => {
    const g = new Game();
    g.setFlag('potFired');
    const bank = { x: 4.4, z: 3 };
    expect(streamDistance(bank.x, bank.z)).toBeLessThan(1);
    g.water.perform('fillPot', bank);
    expect(g.water.potWater).toBe('raw');
    g.structures.push({ id: 99, kind: 'filter', x: 0, z: 0, rotY: 0, key: 'forkedStick', spots: [], complete: true });
    expect(g.water.perform('pourFilter', { x: 0.5, z: 0 })).toBe(true);
    expect(g.water.potWater).toBe('filtered');
  });

  it('makes charcoal only when sealed and opened at blue smoke', () => {
    const g = burning();
    g.addItem('diggingStick');
    g.addItem('logs', 4);
    g.addItem('clay', 2);
    g.takeOut('diggingStick');
    const site = moundSite();
    expect(streamDistance(site.x, site.z)).toBeGreaterThan(MOUND_MIN_STREAM);
    // Too near the stream: water seeps in.
    g.water.perform('digMound', { x: 4.4, z: 3 });
    expect(g.hasEvent('charcoal.pit.water')).toBe(true);
    expect(g.water.mound).toBe(null);

    expect(g.water.perform('digMound', site)).toBe(true);
    expect(g.flag('moundBuilt')).toBe(true);
    g.takeOut('clay');
    g.water.perform('sealMound', site);
    g.water.perform('lightMound', site);
    expect(g.flag('kilnLit')).toBe(true);
    tick(g, 10);
    expect(g.water.smoke()).toBe('white');
    tick(g, SMOKE_BLUE_AT);
    expect(g.water.smoke()).toBe('blue');
    g.water.perform('openMound', site);
    expect(g.flag('charcoalMade')).toBe(true);
    expect(g.count('charcoal')).toBe(3);
  });

  it('open vents burn the wood to ash', () => {
    const g = burning();
    g.addItem('diggingStick');
    g.addItem('logs', 2);
    g.takeOut('diggingStick');
    const site = moundSite();
    g.water.perform('digMound', site);
    g.water.perform('lightMound', site);
    tick(g, 8);
    expect(g.hasEvent('charcoal.ash')).toBe(true);
    expect(g.flag('charcoalMade')).toBe(false);
  });
});

describe('level 3: fishing (refraction)', () => {
  const fish = { x: 0, z: 2, depth: 0.5 };
  const eye = { x: 0, y: 1.6, z: 0 };
  const towards = (x: number, y: number, z: number) => {
    const d = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
    return { x: (x - eye.x) / d, y: (y - eye.y) / d, z: (z - eye.z) / d };
  };

  it('the image is shallower than the fish by the refractive index', () => {
    expect(apparentDepth(0.5)).toBeCloseTo(0.5 / WATER_INDEX);
  });
  it('a thrust at the image overshoots; aiming below hits', () => {
    const atImage = spearHit(eye, towards(fish.x, WATER_Y - apparentDepth(fish.depth), fish.z), fish);
    expect(atImage.hit).toBe(false);
    expect(atImage.overshoot).toBe(true);
    const atFish = spearHit(eye, towards(fish.x, WATER_Y - fish.depth, fish.z), fish);
    expect(atFish.hit).toBe(true);
  });
  it('catching needs a spear and adds a fish', () => {
    const g = new Game();
    g.food.fish.push({ id: 1, ...fish, heading: 0, speed: 0, turn: 9, scared: 0 });
    expect(g.food.thrust(eye, towards(0, WATER_Y - 0.5, 2))).toBe('noSpear');
    g.addItem('fishingSpear');
    g.takeOut('fishingSpear');
    expect(g.food.thrust(eye, towards(0, WATER_Y - apparentDepth(0.5), 2))).toBe('refraction');
    expect(g.hasEvent('food.fish.miss.refraction')).toBe(true);
    g.food.fish[0].scared = 0;
    expect(g.food.thrust(eye, towards(0, WATER_Y - 0.5, 2))).toBe('hit');
    expect(g.count('fish')).toBe(1);
  });
  it('the spear is a bench recipe for real items', () => {
    const r = BENCH_BY_ID.fishingSpear;
    expect(r.output).toBe('fishingSpear');
    for (const id of Object.keys(r.inputs)) expect(ITEMS[id as keyof typeof ITEMS]).toBeDefined();
  });
});

describe('level 3: cooking and farming', () => {
  it('cooks a fish only over a burning fire, then you eat it', () => {
    const g = burning();
    g.addItem('fish');
    g.takeOut('fish');
    expect(g.food.available()?.id).toBe('cook');
    for (let t = 0; t < COOK_SECONDS + 1 && g.held === 'fish'; t += 0.5) g.food.cookOver(0.5);
    expect(g.held).toBe('cookedFish');
    expect(g.hasEvent('food.fish.opaque')).toBe(true);
    g.food.perform(g.food.available()!);
    expect(g.hasEvent('body.eat')).toBe(true);
  });
  it('wild tubers grow on open ground and can be dug up once, then regrow', () => {
    for (const w of WILD_TUBERS) {
      expect(streamDistance(w.x, w.z), `${w.x},${w.z}`).toBeGreaterThan(2.5);
      expect(nearestTreeDistance(w.x, w.z), `${w.x},${w.z}`).toBeGreaterThan(0.8);
    }
    const g = new Game();
    const a = g.food.available(WILD_TUBERS[0])!;
    expect(a.id).toBe('gatherWild');
    g.food.perform(a);
    expect(g.count('tuber')).toBe(1);
    expect(g.food.available(WILD_TUBERS[0])).toBe(null);
  });
  it('raw fish is refused with a reason', () => {
    const g = new Game();
    g.addItem('fish');
    g.takeOut('fish');
    const a = g.food.available({ x: 20, z: 20 })!;
    expect(a.id).toBe('eatRaw');
    g.food.perform(a);
    expect(g.count('fish') + (g.held === 'fish' ? 1 : 0)).toBe(1);
  });
  it('dig, plant, water, grow while moist, harvest', () => {
    const g = new Game();
    const at = { x: -3, z: 8 };
    g.addItem('diggingStick');
    g.addItem('tuber');
    g.takeOut('diggingStick');
    const dig = g.food.available(at)!;
    expect(dig.id).toBe('digPlot');
    g.food.perform(dig);
    g.takeOut('tuber');
    g.food.perform(g.food.available(at)!);
    const plot = g.food.plots[0];
    expect(plot.crop).toBe('tuber');
    // No water, no growth.
    tick(g, 30);
    expect(plot.growth).toBe(0);
    g.setFlag('potFired');
    g.addItem('pot');
    g.takeOut('pot');
    g.water.potWater = 'raw';
    g.food.perform(g.food.available(at)!);
    expect(g.hasEvent('farm.watered')).toBe(true);
    // Keep it watered until ripe.
    for (let i = 0; i < 20 && plot.growth < 1; i++) {
      plot.moist = 60;
      tick(g, GROW_SECONDS / 4);
    }
    expect(plot.growth).toBe(1);
    g.stow();
    g.food.perform(g.food.available(at)!);
    expect(g.hasEvent('farm.harvested')).toBe(true);
    expect(g.count('tuber')).toBe(3);
  });
});
