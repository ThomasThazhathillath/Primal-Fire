// Lesson 05 (Food, Navigation & Long-Term Survival): every new rule and experiment, driven by the game's own
// actions and simulation (digestion, spoilage, patch regrowth, weather, the sun path), never by faked trials.
import { describe, expect, it, vi } from 'vitest';
import { FINAL_CHECK, sunSector, TREK_FOOD } from '../src/game/curriculum/lessons/food/field.js';
import { FOOD_PROFILES, LASTING_SECONDS } from '../src/game/curriculum/lessons/food/nutrition.js';
import { Environment, RAIN_LEAD, WEATHER } from '../src/game/environment.js';
import { FIELD_GUIDE, FORAGE_PATCHES, FORAGE_REGROW, mismatches, PATCH_STOCK, STOCK_REGROW } from '../src/game/forage.js';
import { Game } from '../src/game/game.js';
import type { ItemId } from '../src/game/items.js';
import { Body } from '../src/game/survival/body.js';
import { LANDMARK_BY_ID } from '../src/game/world-layout.js';
import { jumpTo } from './helpers/lessons.js';

// Several tests simulate minutes of game time (digestion, spoilage, regrowth, weather).
vi.setConfig({ testTimeout: 60_000 });

/** Advance the game and its weather/sky like the running game does (EnvironmentSystem updates env each frame). */
const run = (g: Game, seconds: number, step = 0.25) => {
  for (let t = 0; t < seconds; t += step) {
    g.tick(step);
    g.env.update(g.time, step);
  }
};
/** Hold a view for `seconds`, as FieldSystem reports it. */
const look = (g: Game, yaw: number, pitch: number, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.1) {
    g.field.observeView(yaw, pitch, 0.1);
    run(g, 0.1, 0.1);
  }
};
const eat = (g: Game, id: ItemId) => {
  g.addItem(id);
  g.takeOut(id);
  const a = g.food.available(g.player, id)!;
  expect(a.id === 'eat' || a.id === 'eatItem').toBe(true);
  expect(g.food.perform(a)).toBe(true);
};
/** Open the experiment of the current step and make a prediction. */
const start = (g: Game, id: string, prediction: string) => {
  jumpTo(g, id);
  run(g, 0.5);
  expect(g.experiments.phase(id)).toBe('predict');
  expect(g.experiments.predict(id, prediction)).toBe(true);
};
const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz);

describe('the lesson', () => {
  it('runs spear -> ... -> the long trek -> the closing check, with six experiments', () => {
    const g = new Game();
    jumpTo(g, 'plantId');
    expect(g.lessons.lesson?.id).toBe('food');
    expect(g.lessons.lesson?.steps).toEqual(['spear', 'fish', 'cook', 'plantId', 'nutrition', 'grow', 'basket', 'dryingTest', 'trail', 'overharvest', 'skyTest', 'sunPath', 'trek', 'finalCheck']);
    expect(g.experiments.def('plantId')?.lesson).toBe('food');
  });
});

describe('Level 5 from the title', () => {
  it('a new game that starts at Level 5 gets a working camp once; one that played on from Lesson 04 keeps its own', () => {
    const g = new Game();
    g.lessons.setResume('food');
    run(g, 0.5);
    expect(g.lessons.lesson?.id).toBe('food');
    for (const k of ['workbench', 'firePit', 'dryingRack', 'bedding'] as const) expect(g.structures.some((s) => s.kind === k && s.complete), k).toBe(true);
    expect(g.fire.stage).toBe('burning');
    expect(g.count('spindle') + g.count('flake') + g.count('cord')).toBeGreaterThanOrEqual(3);
    expect(g.flag('potFired')).toBe(true);
    const n = g.structures.length;
    g.structures.length = 0; // even if the camp is taken apart, it is not given twice
    run(g, 0.5);
    expect(g.structures.length).toBe(0);
    expect(n).toBe(4);
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.field.campGiven).toBe(true);

    const own = new Game();
    own.structures.push({ id: 1, kind: 'workbench', x: 2, z: 2, rotY: 0, key: 'slab', spots: [], complete: true });
    jumpTo(own, 'spear');
    run(own, 0.5);
    expect(own.structures).toHaveLength(1);
  });
});

describe('nutrition: sugar, fat, protein', () => {
  it('sugar arrives at once and is soon done; fat and protein keep feeding for minutes', () => {
    const b = new Body();
    const seen: Array<[string, number]> = [];
    b.onMeal = (tag, s) => seen.push([tag, s]);
    b.food = 50;
    const p = FOOD_PROFILES;
    b.digest(p.berries!.points, p.berries!.quick, p.berries!.release, 0, 'berries');
    expect(b.food).toBeCloseTo(50 + 15 * 0.8, 5);
    b.digest(p.nuts!.points, p.nuts!.quick, p.nuts!.release, p.nuts!.repair, 'nuts');
    expect(b.food).toBeCloseTo(62 + 25 * 0.2, 5);
    const climate = { air: 18, ground: 15, wind: 0, rain: 0, night: 0, sheltered: false, onBed: false, fire: 0 } as never;
    for (let t = 0; t < 200; t += 0.25) b.tick(0.25, climate, false);
    const berries = seen.find((s) => s[0] === 'berries')![1];
    const nuts = seen.find((s) => s[0] === 'nuts')![1];
    expect(berries).toBeLessThan(LASTING_SECONDS);
    expect(nuts).toBeGreaterThanOrEqual(LASTING_SECONDS);
    expect(b.digesting()).toBe(0);
  });

  it('protein speeds recovery for a while', () => {
    const b = new Body();
    b.digest(40, 0.25, 120, 150, 'cookedFish');
    expect(b.repair).toBe(150);
    const plain = new Body();
    const roof = { air: 18, ground: 15, wind: 0, rain: 0, night: 0, sheltered: true, onBed: false, fire: 0 } as never;
    b.rest = plain.rest = 30;
    b.tick(10, roof, true);
    plain.tick(10, roof, true);
    expect(b.rest).toBeGreaterThan(plain.rest);
  });

  it('the nutrition experiment concludes from real meals: berries short, nuts and fish long', () => {
    const g = new Game();
    start(g, 'nutrition', 'slow');
    eat(g, 'berries');
    run(g, 20);
    expect(g.experiments.state('nutrition').trials.get('berries')).toBe('short');
    eat(g, 'nuts');
    run(g, 160);
    eat(g, 'cookedFish');
    run(g, 130);
    expect(g.experiments.phase('nutrition')).toBe('result');
    expect(g.experiments.predictedRight('nutrition')).toBe(true);
    for (const e of ['fd_sugar', 'fd_fat', 'fd_protein']) expect(g.notebook).toContain(e);
  });
});

describe('plant judgement', () => {
  it('a look-alike shares the colour and most features, and differs in two', () => {
    for (const p of FORAGE_PATCHES) {
      if (p.truth === 'food') expect(mismatches(p)).toEqual([]);
      if (p.truth === 'lookalike') {
        expect(mismatches(p)).toHaveLength(2);
        expect(p.color).toBe(FORAGE_PATCHES.find((q) => q.kind === p.kind && q.truth === 'food')!.color);
      }
    }
    expect(FORAGE_PATCHES.filter((p) => p.truth === 'unknown')).toHaveLength(2);
    // Made-up plants only (docs/SCIENCE.md): no real species names in the guide.
    expect(Object.values(FIELD_GUIDE).map((f) => f.name)).toEqual(['Redcane berry', 'Ringnut', 'Featherroot']);
  });

  it('calling a look-alike safe makes you ill for a while (gently); calling food unsafe only costs a meal', () => {
    const g = new Game();
    const bad = FORAGE_PATCHES.find((p) => p.truth === 'lookalike')!;
    const food0 = g.body.food;
    const r = g.food.judge(bad.id, 'safe')!;
    expect(r.correct).toBe(false);
    expect(r.sick).toBe(true);
    expect(g.body.queasy).toBeGreaterThan(0);
    expect(food0 - g.body.food).toBeLessThanOrEqual(8);
    expect(g.notebook).toContain('fd_sick');
    expect(g.food.judge(bad.id, 'unsafe')).toBeNull(); // judged once
    const ok = FORAGE_PATCHES.find((p) => p.truth === 'food')!;
    const r2 = g.food.judge(ok.id, 'unsafe')!;
    expect(r2.correct).toBe(false);
    expect(r2.sick).toBe(false);
    expect(g.count(ok.yield)).toBe(0);
    // Now you know: the next time it is an ordinary pick.
    g.setPlayerPosition(ok.x, ok.z);
    expect(g.food.available(g.player, null)?.id).toBe('forage');
  });

  it('a plant not in the guide: not sure is right', () => {
    const g = new Game();
    const u = FORAGE_PATCHES.find((p) => p.truth === 'unknown')!;
    g.setPlayerPosition(u.x, u.z);
    g.food.perform(g.food.available(g.player, null)!);
    expect(g.field.prompt?.cols?.[1].head).toContain('Field guide');
    g.field.choose(2);
    expect(g.field.prompt?.note).toContain('Good judgement');
    expect(g.hasEvent('food.forage.unsure')).toBe(true);
    expect(g.field.judgedRight).toBe(1);
  });

  it('the plant experiment concludes from what the plants really were', () => {
    const g = new Game();
    start(g, 'plantId', 'all');
    g.food.judge(FORAGE_PATCHES.find((p) => p.truth === 'food')!.id, 'safe');
    g.food.judge(FORAGE_PATCHES.find((p) => p.truth === 'lookalike')!.id, 'unsure');
    expect(g.experiments.phase('plantId')).toBe('result');
    expect(g.experiments.state('plantId').supported).toBe('all');
  });
});

describe('preserving: fresh vs dried', () => {
  it('carried for the same time, fresh fish goes off and dried fish keeps', () => {
    const g = new Game();
    start(g, 'dryingTest', 'dry');
    g.addItem('fish');
    g.addItem('driedFish');
    run(g, 230);
    const s = g.experiments.state('dryingTest');
    expect(s.trials.get('fresh')).toBe('off');
    expect(s.trials.get('dried')).toBe('keeps');
    expect(s.supported).toBe('dry');
    expect(g.food.freshnessOf('fish')).toBe('ageing');
    expect(g.food.freshnessOf('driedFish')).toBe('fresh');
  });
});

describe('ecology: overharvesting', () => {
  it('a patch picked with care grows back full; a stripped one comes back slowly and thin', () => {
    const g = new Game();
    start(g, 'overharvest', 'less');
    const [a, b] = FORAGE_PATCHES.filter((p) => p.truth === 'food' && p.kind === 'berry');
    g.food.judge(a.id, 'safe'); // one handful: picked with care
    g.food.judge(b.id, 'safe');
    const pick = (id: number) => g.food.perform({ id: 'forage', patchId: id, label: '', at: FORAGE_PATCHES[id] });
    while (g.food.stock[b.id] > 0) pick(b.id); // stripped bare
    expect(g.food.stock[a.id]).toBe(PATCH_STOCK - 1);
    expect(g.food.cap[b.id]).toBe(PATCH_STOCK - 1);
    run(g, STOCK_REGROW + 2);
    expect(g.food.stock[a.id]).toBe(PATCH_STOCK);
    expect(g.food.stock[b.id]).toBe(0);
    run(g, FORAGE_REGROW - STOCK_REGROW);
    expect(g.food.stock[b.id]).toBe(1);
    expect(g.experiments.state('overharvest').supported).toBe('less');
    expect(g.notebook).toContain('fd_overharvest');
    expect(g.notebook).toContain('fd_recover');
  });

  it('a basket picks two handfuls at once', () => {
    const g = new Game();
    g.packUpgrades.add('basket');
    const a = FORAGE_PATCHES.find((p) => p.truth === 'food')!;
    g.food.judge(a.id, 'safe');
    expect(g.count(a.yield)).toBe(4);
    expect(g.food.stock[a.id]).toBe(PATCH_STOCK - 2);
  });

  it('food chain and prey eyes: plant-eaters watched, a fish eaten; a deer that spots you from the side', () => {
    const g = new Game();
    g.science('wild.rabbit.seen');
    eat(g, 'cookedFish');
    run(g, 0.5);
    expect(g.notebook).toContain('n_chain');
    // A deer facing away (heading +Z) notices the player behind it (-Z): side-set eyes.
    g.setPlayerPosition(0, -10);
    g.field.preyAlert(0, 0, 0);
    expect(g.notebook).toContain('n_eyes');
  });
});

describe('weather: clouds before rain', () => {
  it('scheduled rain is preceded by building clouds', () => {
    const e = new Environment();
    e.seed = 7;
    let checked = 0;
    for (let t = 400; t < 20000 && checked < 3; t += 5) {
      e.update(t, 0);
      if ((e.spell.kind === 'lightRain' || e.spell.kind === 'heavyRain') && Math.abs(t - e.spell.start) < 5) {
        const at = e.spell.start;
        const before = new Environment();
        before.seed = 7;
        before.update(at - 10, 0);
        expect(before.rain).toBeLessThan(0.15);
        expect(before.cloud).toBeGreaterThan(0.6);
        before.update(at - RAIN_LEAD - 5, 0);
        const early = before.cloud;
        before.update(at - 10, 0);
        expect(before.cloud).toBeGreaterThan(early);
        checked++;
        t = e.spell.end;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a brewed shower: clouds build, then light rain, then it clears', () => {
    const e = new Environment();
    e.update(10, 0);
    expect(e.brewRain(10)).toBe(true);
    e.update(60, 0);
    expect(e.cloud).toBeGreaterThan(0.7);
    expect(e.rain).toBeLessThan(0.15);
    e.update(100, 0);
    expect(e.isRaining()).toBe(true);
    expect(e.rain).toBeCloseTo(WEATHER.lightRain.rain, 1);
    e.update(300, 0);
    expect(e.brew).toBeNull();
    expect(e.isRaining()).toBe(false);
  });

  it('the sky experiment: a clear sky stays dry, dark building clouds bring rain (x_sky)', () => {
    const g = new Game();
    start(g, 'skyTest', 'clouds');
    look(g, 0, 1.0, 2); // look straight up at the clear morning sky
    run(g, 95);
    expect(g.experiments.state('skyTest').trials.get('clear')).toBe('dry');
    const exp = g.experiments.def('skyTest')!;
    expect(exp.testAction!.label(g)).toBe('Watch the sky');
    expect(exp.testAction!.run(g)).toBeTruthy();
    run(g, 45);
    look(g, 0, 1.0, 2);
    run(g, 40);
    expect(g.experiments.state('skyTest').trials.get('dark')).toBe('rain');
    expect(g.experiments.state('skyTest').supported).toBe('clouds');
    expect(g.notebook).toContain('x_sky');
  });
});

describe('navigation by the sun', () => {
  it('the sun is east in the morning, south at midday, west in the afternoon', () => {
    expect(sunSector(8)).toBe('east');
    expect(sunSector(12)).toBe('south');
    expect(sunSector(16)).toBe('west');
    expect(sunSector(23)).toBe('down');
  });

  it('facing the sun morning and afternoon concludes the sun-path experiment; facing away does nothing', () => {
    const g = new Game();
    g.env.skipTo(g.time, 8);
    start(g, 'sunPath', 'eastWest');
    look(g, yawToward(-g.env.sunDir[0], -g.env.sunDir[2]), 0.2, 2); // back to the sun
    expect(g.experiments.state('sunPath').trials.size).toBe(0);
    look(g, yawToward(g.env.sunDir[0], g.env.sunDir[2]), 0.2, 2);
    expect(g.experiments.state('sunPath').trials.get('morning')).toBe('east');
    const exp = g.experiments.def('sunPath')!;
    expect(exp.testAction!.label(g)).toBe('Rest until afternoon');
    exp.testAction!.run(g);
    run(g, 0.5);
    look(g, yawToward(g.env.sunDir[0], g.env.sunDir[2]), 0.2, 2);
    expect(g.experiments.state('sunPath').supported).toBe('eastWest');
    expect(g.notebook).toContain('nv_sunrise');
    expect(g.notebook).toContain('nv_sunset');
  });
});

describe('the long trek', () => {
  const setOut = (g: Game) => {
    jumpTo(g, 'trek');
    g.env.skipTo(g.time, 8);
    run(g, 0.5);
    expect(g.field.prompt?.key).toBe('trek');
    g.field.act();
    g.setPlayerPosition(0, -12);
    run(g, 0.5);
  };

  it('covers the compass, and finishes only home before dark with food gathered and eaten on the way', () => {
    const g = new Game();
    setOut(g);
    expect(g.field.trek.phase).toBe('active');
    expect(g.field.compassCovered()).toBe(true);
    const ruins = LANDMARK_BY_ID.ruins;
    g.setPlayerPosition(ruins.x, ruins.z);
    run(g, 0.5);
    expect(g.field.trek.reached).toBe(true);
    for (const p of FORAGE_PATCHES.filter((q) => q.truth === 'food').slice(0, 2)) g.food.judge(p.id, 'safe');
    expect(g.field.trek.gathered).toBeGreaterThanOrEqual(TREK_FOOD);
    eat(g, 'nuts');
    expect(g.field.trek.ate).toBe(true);
    g.setPlayerPosition(0, 0);
    run(g, 0.5);
    expect(g.field.trek.phase).toBe('done');
    expect(g.field.compassCovered()).toBe(false);
    expect(g.lessons.completed.has('trek')).toBe(true);
    expect(g.notebook).toContain('nv_home');
  });

  it('is gentle: coming home unfinished or nightfall uncovers the compass and lets you try again', () => {
    const g = new Game();
    setOut(g);
    g.setPlayerPosition(0, 0);
    run(g, 0.5);
    expect(g.field.trek.phase).toBe('idle');
    g.setPlayerPosition(0, -12);
    run(g, 0.5);
    expect(g.field.trek.phase).toBe('active');
    g.env.skipTo(g.time, 21);
    run(g, 0.5);
    expect(g.field.trek.phase).toBe('idle');
    expect(g.field.compassCovered()).toBe(false);
    // Not in the dark: it waits for daylight.
    run(g, 1);
    expect(g.field.trek.phase).toBe('idle');
  });

  it('from Lesson 05, a bed lets you sleep through the night to morning', () => {
    const g = new Game();
    jumpTo(g, 'trek');
    g.structures.push({ id: 801, kind: 'bedding', x: 3, z: 3, rotY: 0, key: 'dryGrass', spots: [], complete: true });
    g.env.skipTo(g.time, 22);
    g.env.update(g.time, 0);
    g.setPlayerPosition(3, 3);
    const a = g.food.available(g.player, null)!;
    expect(a.id).toBe('rest');
    g.food.perform(a);
    g.env.update(g.time, 0);
    expect(g.env.hour).toBeCloseTo(6.5, 1);
  });
});

describe('the closing check', () => {
  it('four questions; a wrong answer explains and stays, a right one moves on', () => {
    const g = new Game();
    jumpTo(g, 'finalCheck');
    run(g, 0.5);
    expect(g.field.prompt?.key).toBe('check:0');
    const wrong = FINAL_CHECK[0].options.findIndex((o) => !o.correct);
    g.field.choose(wrong);
    expect(g.field.prompt?.note).toMatch(/^Not quite/);
    expect(g.field.check).toBe(0);
    for (let q = 0; q < FINAL_CHECK.length; q++) {
      if (q > 0) g.field.act();
      g.field.choose(FINAL_CHECK[q].options.findIndex((o) => o.correct));
    }
    expect(g.field.checkDone).toBe(true);
    run(g, 0.5);
    expect(g.lessons.lessonDone.has('food')).toBe(true);
  });
});

describe('save and load', () => {
  it('keeps judgements, patch stocks, meals being digested, the finished trek and the check', () => {
    const g = new Game();
    const p = FORAGE_PATCHES.find((q) => q.truth === 'food')!;
    g.food.judge(p.id, 'safe');
    g.body.digest(25, 0.2, 150, 30, 'nuts');
    g.field.trek.phase = 'done';
    g.field.check = 2;
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.food.judged.get(p.id)).toBe('safe');
    expect(back.food.stock[p.id]).toBe(PATCH_STOCK - 1);
    expect(back.body.digesting()).toBeCloseTo(20, 5);
    expect(back.field.trek.phase).toBe('done');
    expect(back.field.check).toBe(2);
  });

  it('an older save without any of it loads with safe defaults', () => {
    const g = new Game();
    const data = JSON.parse(JSON.stringify(g.snapshot()));
    delete data.field;
    delete data.food.stock;
    delete data.food.judged;
    delete data.body.meals;
    data.food.forage[0] = 100; // a patch picked under the old rules
    const back = Game.restore(data);
    expect(back.food.stock[0]).toBe(0);
    expect(back.food.stock[1]).toBe(PATCH_STOCK);
    expect(back.field.trek.phase).toBe('idle');
    run(back, 101);
    expect(back.food.stock[0]).toBe(PATCH_STOCK);
  });
});
