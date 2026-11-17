// Lesson 02 (Fire): the combustion rules, fuel moisture, the bow drill's speed and pressure, and every
// experiment run to its conclusion by the real fire rules (no outcome is set by hand).
import { describe, expect, it } from 'vitest';
import { FUEL, Hearth, type HearthListener, type Piece } from '../src/game/combustion.js';
import { stepById } from '../src/game/curriculum/registry.js';
import { legacyFireDone } from '../src/game/curriculum/lessons/fire/steps.js';
import { FIRE_EXPERIMENTS } from '../src/game/curriculum/lessons/fire/experiments.js';
import { KEEP_SECONDS, LAY_NEEDS, PRESSURE } from '../src/game/fire.js';
import { Game } from '../src/game/game.js';
import { jumpTo } from './helpers/lessons.js';

const quiet: HearthListener = { caught: () => {}, burnt: () => {}, doused: () => {} };

function withPit(): Game {
  const g = new Game();
  g.addItem('dryStone', 5);
  g.takeOut('dryStone');
  const res = g.placeBlueprint('firePit', 0, 0);
  g.addItem('dryStone', 3);
  res.structure!.spots.forEach((_, i) => g.fillSpot(res.structure!.id, i));
  g.stow();
  return g;
}
function layFire(g: Game): void {
  g.addItem('dryGrass', LAY_NEEDS.tinder);
  g.addItem('twigs', LAY_NEEDS.twigs);
  g.addItem('logs', LAY_NEEDS.logs);
  while (!g.fire.layBuilt) expect(g.fire.addFuel()).toBe(true);
}
/** Saw fast and firm at the pit until the ember comes (frame by frame, cooling included). */
function sawEmber(g: Game): void {
  if (g.held !== 'bowDrill') {
    g.addItem('bowDrill');
    g.takeOut('bowDrill');
  }
  for (let i = 0; i < 400 && !g.fire.carrying; i++) {
    g.fire.saw(1.5 * 0.05, 0.05, PRESSURE.firm, 1);
    g.fire.tick(0.05);
  }
  expect(g.fire.carrying).toBe(true);
}
function light(g: Game): void {
  layFire(g);
  sawEmber(g);
  g.stow();
  expect(g.fire.transferEmber()).toBe(true);
  for (let i = 0; i < 40 && g.fire.stage !== 'burning'; i++) g.fire.fan(0.8, 0.25);
  expect(g.fire.stage).toBe('burning');
}
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) g.fire.tick(0.05);
};
/** Saw for `seconds` at `speed` m/s with `pressure`, then pause long enough to end the stroke run. */
function sawFor(g: Game, seconds: number, speed: number, pressure: number): void {
  for (let t = 0; t < seconds; t += 0.05) {
    g.fire.saw(speed * 0.05, 0.05, pressure, 1);
    g.fire.tick(0.05);
  }
  run(g, 1);
}
/** Put a fuel item from the bag on the fire. */
function feed(g: Game, id: Parameters<Game['addItem']>[0]): void {
  g.addItem(id);
  g.takeOut(id);
  expect(g.fire.addFuel()).toBe(true);
}
/** Put Lesson 02 at `step`, open experiment `exp` (its step's id unless given) and predict. */
function openAt(g: Game, step: string, prediction: string, exp = step): void {
  jumpTo(g, step);
  g.experiments.update(g);
  expect(g.experiments.phase(exp)).toBe('predict');
  expect(g.experiments.predict(exp, prediction)).toBe(true);
}

describe('combustion rules', () => {
  const hot = () => {
    const h = new Hearth(quiet);
    for (let i = 0; i < 3; i++) h.ignite(h.add('logs', 0, false)!);
    h.coals = 0.5;
    for (let i = 0; i < 40; i++) h.step(0.25, 0);
    return h;
  };
  const catchTime = (h: Hearth, p: Piece) => {
    for (let t = 0; t < 60; t += 0.25) {
      h.step(0.25, 0);
      if (p.burning) return p.caughtAt;
    }
    return Infinity;
  };

  it('thin dry fuel catches in seconds, a log takes far longer (surface area)', () => {
    const h = hot();
    const twig = h.add('twigs', 0, true)!;
    const log = h.add('logs', 0, true)!;
    expect(catchTime(h, twig)).toBeLessThan(4);
    expect(catchTime(h, log)).toBeGreaterThan(10);
  });

  it('a log does not catch on a small fire at all: the fire ladder', () => {
    const h = new Hearth(quiet);
    h.ignite(h.add('dryGrass', 0, false)!);
    const log = h.add('logs', 0, false)!;
    for (let i = 0; i < 30; i++) h.step(0.25, 0);
    expect(log.burning).toBe(false);
    expect(h.heat).toBeLessThan(FUEL.logs.catchHeat);
  });

  it('water must boil off first: damp fuel steams, cools the fire and smokes before it catches', () => {
    // A modest fire (two logs), so the heat the steam takes shows.
    const modest = () => {
      const h = new Hearth(quiet);
      for (let i = 0; i < 2; i++) h.ignite(h.add('logs', 0, false)!);
      h.coals = 0.2;
      for (let i = 0; i < 40; i++) h.step(0.25, 0);
      return h;
    };
    const dry = modest();
    const d = dry.add('dryGrass', 0, true)!;
    const wet = modest();
    const heatBefore = wet.heat;
    const w = wet.add('dryGrass', 0.8, true)!;
    wet.step(0.25, 0);
    wet.step(0.25, 0);
    expect(wet.smoke).toBeGreaterThan(dry.smoke);
    expect(wet.steam).toBeGreaterThan(0);
    expect(wet.heat).toBeLessThan(heatBefore);
    expect(catchTime(wet, w)).toBeGreaterThan(catchTime(dry, d) + 2);
  });

  it('green wood holds its sap: it smoulders far longer than a dead branch', () => {
    const a = hot();
    const dead = a.add('dryBranch', 0, true)!;
    const b = hot();
    const green = b.add('greenBranch', 0, true)!;
    expect(green.wet).toBeGreaterThan(0.5);
    expect(catchTime(a, dead)).toBeLessThan(10);
    expect(catchTime(b, green)).toBeGreaterThan(15);
  });

  it('charcoal gives more heat than a log with almost no smoke', () => {
    expect(FUEL.charcoal.heat).toBeGreaterThan(FUEL.logs.heat);
    expect(FUEL.charcoal.smoke).toBeLessThan(FUEL.logs.smoke / 2);
  });

  it('wind and fanning add air: more heat and faster burning; earth takes it all away', () => {
    const still = hot();
    const windy = hot();
    for (let i = 0; i < 8; i++) {
      still.step(0.25, 0);
      windy.step(0.25, 1);
    }
    expect(windy.power).toBeGreaterThan(still.power * 1.2);
    expect(windy.fuelSeconds).toBeLessThan(still.fuelSeconds);
    const fanned = hot();
    const before = fanned.power;
    fanned.fanned(1, 1);
    fanned.step(0.25, 0);
    expect(fanned.power).toBeGreaterThan(before * 1.2);
    const covered = hot();
    covered.smothered = true;
    for (let i = 0; i < 40; i++) covered.step(0.25, 0);
    expect(covered.heat).toBeLessThan(0.03);
    expect(covered.burningCount).toBe(0);
  });

  it('a fire left alone burns down to coals, then to nothing; coals relight fresh tinder', () => {
    const h = new Hearth(quiet);
    for (let i = 0; i < 2; i++) h.ignite(h.add('logs', 0, false)!);
    for (let i = 0; i < 4 * 95; i++) h.step(0.25, 0);
    expect(h.burningCount).toBe(0);
    expect(h.coals).toBeGreaterThan(0);
    const tinder = h.add('dryGrass', 0, true)!;
    for (let i = 0; i < 12; i++) h.step(0.25, 0);
    expect(tinder.burning).toBe(true);
    for (let i = 0; i < 4 * 200; i++) h.step(0.25, 0);
    expect(h.alive).toBe(false);
  });
});

describe('fuel moisture', () => {
  it('fuel picked up in the open after rain is wet; under a roof it is dry', () => {
    const g = new Game();
    g.env.wet = 0.8;
    g.gather('twigs');
    expect(g.fuelWet.of('twigs')).toBeCloseTo(0.8);
    expect(g.fuelWet.isDamp('twigs')).toBe(true);
    // A second, dry handful (the ground dried) mixes in: the stack is the average.
    g.env.wet = 0;
    g.gather('twigs');
    expect(g.fuelWet.of('twigs')).toBeCloseTo(0.4);
  });

  it('rain soaks carried fuel, a burning fire dries it, and both survive a reload', () => {
    const g = withPit();
    light(g);
    g.addItem('dryGrass', 2);
    g.env.rain = 1;
    g.player.x = 20;
    for (let i = 0; i < 4 * 60; i++) g.fuelWet.tick(0.25);
    expect(g.fuelWet.isDamp('dryGrass')).toBe(true);
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.fuelWet.of('dryGrass')).toBeCloseTo(g.fuelWet.of('dryGrass'));
    g.env.rain = 0;
    g.player.x = 1;
    g.player.z = 0;
    for (let i = 0; i < 4 * 60 && g.fuelWet.isDamp('dryGrass'); i++) {
      g.fuelWet.tick(0.25);
      g.fire.tick(0.25);
    }
    expect(g.fuelWet.isDamp('dryGrass')).toBe(false);
    expect(g.hasEvent('fire.fuel.dried')).toBe(true);
  });

  it('damp moss and green wood hold water whatever the weather', () => {
    const g = new Game();
    expect(g.fuelWet.total('dampMoss')).toBeGreaterThan(0.6);
    expect(g.fuelWet.total('greenBranch')).toBeGreaterThan(0.5);
    expect(g.fuelWet.total('dryBranch')).toBe(0);
  });
});

describe('the bow drill: speed and pressure', () => {
  it('slow strokes level off below smoking, however long you saw', () => {
    const g = withPit();
    layFire(g);
    g.addItem('bowDrill');
    g.takeOut('bowDrill');
    for (let t = 0; t < 30; t += 0.05) {
      g.fire.saw(0.4 * 0.05, 0.05, PRESSURE.firm, 1);
      g.fire.tick(0.05);
    }
    expect(g.fire.heat).toBeLessThan(0.6);
    expect(g.fire.carrying).toBe(false);
  });

  it('a light touch only polishes the board, even sawing as fast as a hand can', () => {
    const g = withPit();
    layFire(g);
    g.addItem('bowDrill');
    g.takeOut('bowDrill');
    for (let t = 0; t < 30; t += 0.05) {
      g.fire.saw(2.5 * 0.05, 0.05, PRESSURE.light, 1);
      g.fire.tick(0.05);
    }
    expect(g.fire.heat).toBeLessThan(0.6);
    expect(g.fire.carrying).toBe(false);
  });

  it('fast, firm strokes make an ember in a few seconds', () => {
    const g = withPit();
    layFire(g);
    g.addItem('bowDrill');
    g.takeOut('bowDrill');
    let t = 0;
    for (; t < 20 && !g.fire.carrying; t += 0.05) {
      g.fire.saw(1.5 * 0.05, 0.05, PRESSURE.firm, 1);
      g.fire.tick(0.05);
    }
    expect(g.fire.carrying).toBe(true);
    expect(t).toBeLessThan(6);
  });

  it('cannot saw at a cold pit with no lay, but can beside a burning fire (no second ember)', () => {
    const g = withPit();
    g.addItem('bowDrill');
    g.takeOut('bowDrill');
    expect(g.fire.canDrill).toBe(false);
    g.stow();
    light(g);
    g.takeOut('bowDrill');
    expect(g.fire.canDrill).toBe(true);
    sawFor(g, 6, 1.5, PRESSURE.firm);
    expect(g.fire.carrying).toBe(false);
  });
});

describe('the ember', () => {
  it('damp tinder needs much more fanning; soaking tinder kills the ember', () => {
    const fanTo = (wet: number) => {
      const g = withPit();
      layFire(g);
      for (const p of g.fire.hearth.pieces) if (p.used && p.kind === 'tinder') p.wet = wet;
      sawEmber(g);
      g.stow();
      g.fire.transferEmber();
      let t = 0;
      for (; t < 30 && g.fire.embedded; t += 0.1) {
        g.fire.fan(0.5, 0.1);
        g.fire.tick(0.1);
      }
      return { g, t };
    };
    const dry = fanTo(0);
    const damp = fanTo(0.45);
    expect(dry.g.fire.stage).toBe('burning');
    expect(damp.g.fire.stage).toBe('burning');
    expect(damp.t).toBeGreaterThan(dry.t * 1.5);
    const soaked = fanTo(0.8);
    expect(soaked.g.fire.stage).toBe('cold');
    expect(soaked.g.notebook).toContain('f_damp');
  });

  it('wind across an open pit feeds an ember', () => {
    const g = withPit();
    layFire(g);
    sawEmber(g);
    g.stow();
    g.fire.transferEmber();
    g.fire.wind = 1;
    for (let t = 0; t < 12 && g.fire.embedded; t += 0.05) {
      g.fire.wind = 1;
      g.fire.tick(0.05);
    }
    expect(g.fire.stage).toBe('burning');
  });
});

describe('Lesson 02 experiments, run by the real fire', () => {
  it('stroke speed: slow (firm) never smokes, fast (firm) does', () => {
    const g = withPit();
    layFire(g);
    openAt(g, 'ember', 'faster', 'drillSpeed');
    g.addItem('bowDrill');
    g.takeOut('bowDrill');
    sawFor(g, 5, 0.4, PRESSURE.firm);
    expect(g.experiments.state('drillSpeed').trials.get('slow')).toBe('nosmoke');
    // A slow run with a light touch is not a fair speed test: it is not recorded as one.
    sawFor(g, 5, 0.4, PRESSURE.light);
    sawEmber(g);
    expect(g.experiments.state('drillSpeed').trials.get('fast')).toBe('smoke');
    expect(g.experiments.phase('drillSpeed')).toBe('result');
    expect(g.experiments.predictedRight('drillSpeed')).toBe(true);
    expect(g.hasEvent('fire.drill.slow')).toBe(true);
  });

  it('pressure: fast and light only polishes, fast and firm smokes (beside the burning fire)', () => {
    const g = withPit();
    light(g);
    g.addItem('logs', 2);
    feed(g, 'logs');
    openAt(g, 'drillPressure', 'firm');
    g.takeOut('bowDrill');
    sawFor(g, 5, 2, PRESSURE.light);
    sawFor(g, 5, 2, PRESSURE.firm);
    const s = g.experiments.state('drillPressure');
    expect([...s.trials]).toEqual([
      ['light', 'nosmoke'],
      ['firm', 'smoke'],
    ]);
    expect(g.experiments.predictedRight('drillPressure')).toBe(true);
    expect(g.notebook).toContain('f_pressure');
  });

  it('damp or dry: damp moss steams and catches late, dry grass flares at once', () => {
    const g = withPit();
    light(g);
    run(g, 20);
    openAt(g, 'tinderDamp', 'dry');
    feed(g, 'dampMoss');
    feed(g, 'dryGrass');
    run(g, 16);
    const s = g.experiments.state('tinderDamp');
    expect(s.trials.get('dry')).toBe('quick');
    expect(s.trials.get('damp')).toBe('slow');
    expect(g.experiments.predictedRight('tinderDamp')).toBe(true);
    expect(g.notebook).toContain('f_steam');
  });

  it('twig or log: the twig catches in seconds, the log late', () => {
    const g = withPit();
    light(g);
    run(g, 20);
    openAt(g, 'fuelSize', 'thick');
    feed(g, 'twigs');
    feed(g, 'logs');
    run(g, 16);
    expect(g.experiments.state('fuelSize').supported).toBe('thin');
    expect(g.experiments.predictedRight('fuelSize')).toBe(false);
    expect(g.notebook).toContain('f_ladder');
  });

  it('dead or green wood: the dead branch burns bright, the green one smoulders in white smoke', () => {
    const g = withPit();
    light(g);
    run(g, 20);
    openAt(g, 'woodType', 'dead');
    feed(g, 'dryBranch');
    feed(g, 'greenBranch');
    run(g, 16);
    expect(g.experiments.state('woodType').trials.get('dead')).toBe('bright');
    expect(g.experiments.state('woodType').trials.get('green')).toBe('smoky');
    expect(g.experiments.predictedRight('woodType')).toBe(true);
    expect(g.notebook).toContain('f_smoke');
  });

  it('air: fanning grows the fire, earth smothers it out', () => {
    const g = withPit();
    light(g);
    run(g, 20);
    openAt(g, 'airflow', 'air');
    for (let i = 0; i < 8; i++) g.fire.fan(1, 0.2);
    run(g, 0.5);
    expect(g.experiments.state('airflow').trials.get('fanned')).toBe('grows');
    // Fanning again (a second run, the fire already roaring) is still judged against still air: still grows.
    for (let i = 0; i < 8; i++) g.fire.fan(1, 0.2);
    run(g, 0.5);
    expect(g.experiments.state('airflow').trials.get('fanned')).toBe('grows');
    g.addItem('diggingStick');
    g.takeOut('diggingStick');
    expect(g.runIntent('diggingStick', 0, 0, 'touch')).toBe('smotherFire');
    run(g, 10);
    expect(g.fire.stage).toBe('out');
    expect(g.experiments.state('airflow').trials.get('smothered')).toBe('dies');
    expect(g.experiments.predictedRight('airflow')).toBe(true);
    expect(g.notebook).toEqual(expect.arrayContaining(['f_fanned', 'f_smother']));
  });

  it('fanning a fire burned down to glowing coals also makes it grow', () => {
    const g = withPit();
    light(g);
    openAt(g, 'airflow', 'air');
    for (let t = 0; t < 200 && g.fire.hearth.burningCount > 0; t += 1) run(g, 1);
    expect(g.fire.stage).toBe('burning');
    expect(g.fire.hearth.coals).toBeGreaterThan(0.05);
    for (let i = 0; i < 8; i++) g.fire.fan(1, 0.2);
    run(g, 0.5);
    expect(g.experiments.state('airflow').trials.get('fanned')).toBe('grows');
  });

  it('charcoal: a log burned in the open fire is ash, logs in a sealed mound are charcoal', () => {
    const g = withPit();
    light(g);
    openAt(g, 'charcoal', 'less', 'charcoalAir');
    // The lay's logs burn through in the open pit (kept going with a little kindling).
    for (let t = 0; t < 120 && !g.experiments.state('charcoalAir').trials.has('open'); t += 10) {
      if (g.fire.hearth.count() < 3) feed(g, 'twigs');
      run(g, 10);
    }
    expect(g.experiments.state('charcoalAir').trials.get('open')).toBe('ash');
    // A sealed mound that has burned to thin blue smoke, opened.
    g.water.mound = { x: 10, z: 10, sealed: true, burn: 45 };
    expect(g.water.perform('openMound')).toBe(true);
    expect(g.flag('charcoalMade')).toBe(true);
    expect(g.experiments.state('charcoalAir').supported).toBe('less');
  });

  it('charcoal burns on the fire hot and clean (notebook)', () => {
    const g = withPit();
    light(g);
    run(g, 20);
    feed(g, 'charcoal');
    run(g, 10);
    expect(g.notebook).toContain('f_charcoal');
  });
});

describe('rain on an open fire', () => {
  const rained = (rain: number, seconds: number) => {
    const g = withPit();
    light(g);
    for (let t = 0; t < seconds; t += 0.25) {
      g.fire.weather(rain * 1.5, 0.25); // EnvironmentSystem: rain x RAIN_BURN_LOSS on an exposed pit
      g.fire.tick(0.25);
    }
    return g;
  };
  it('light rain only slows a fire that has caught', () => {
    const g = rained(0.4, 60);
    expect(g.fire.stage).toBe('burning');
    expect(g.fire.hearth.pieces.some((p) => p.used && p.burning && p.kind === 'logs')).toBe(true);
  });
  it('heavy rain on an unsheltered fire puts it out in the end', () => {
    expect(rained(1, 400).fire.stage).toBe('out');
  });
});

describe('experiment card readouts', () => {
  it('show what the fire really measures: dust heat and stroke, the last piece fed, the air', () => {
    const g = withPit();
    layFire(g);
    g.addItem('bowDrill');
    g.takeOut('bowDrill');
    const drill = FIRE_EXPERIMENTS.find((e) => e.id === 'drillSpeed')!;
    for (let t = 0; t < 2; t += 0.05) {
      g.fire.saw(1.2 * 0.05, 0.05, PRESSURE.light, 1);
      g.fire.tick(0.05);
    }
    expect(drill.readout!(g)).toMatch(/Dust heat \d+% .*Stroke 1\.\d m\/s, press light/);
    g.stow();
    light(g);
    run(g, 20);
    feed(g, 'dampMoss');
    run(g, 2);
    expect(FIRE_EXPERIMENTS.find((e) => e.id === 'tinderDamp')!.readout!(g)).toMatch(/Last piece: damp moss, damp, steaming for \d+ s/);
    g.fire.smother();
    run(g, 0.5);
    expect(FIRE_EXPERIMENTS.find((e) => e.id === 'airflow')!.readout!(g)).toMatch(/covered: no air|fire is out/);
  });
});

describe('the practical: start and keep a fire on your own', () => {
  const keep = (g: Game, seconds: number) => {
    for (let t = 0; t < seconds; t += 5) {
      if (g.fire.hearth.count() < 3 || g.fire.flame < 0.4) feed(g, g.fire.flame < 0.4 ? 'twigs' : 'logs');
      run(g, 5);
    }
  };

  it('the first, guided fire does not count; a second fire you light and keep fed does', () => {
    const g = withPit();
    light(g);
    keep(g, KEEP_SECONDS + 10);
    expect(g.fire.stage).toBe('burning');
    expect(g.hasEvent('fire.night.kept')).toBe(true);
    expect(g.fire.kept).toBe(false);
    // Put it out, then light a new one from a cold pit.
    g.addItem('diggingStick');
    g.takeOut('diggingStick');
    expect(g.fire.smother()).toBe(true);
    run(g, 10);
    g.stow();
    light(g);
    expect(g.fire.lights).toBe(2);
    keep(g, KEEP_SECONDS + 10);
    expect(g.fire.kept).toBe(true);
    expect(stepById('fireOnOwn')!.done(g, 0)).toBe(true);
    // And it is remembered across a reload.
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.fire.kept).toBe(true);
    expect(back.fire.stage).toBe('burning');
    expect(back.fire.hearth.count()).toBe(g.fire.hearth.count());
  });

  it('a fire left unfed burns out', () => {
    const g = withPit();
    light(g);
    run(g, 400);
    expect(g.fire.stage).toBe('out');
  });
});

describe('Lesson 02 and old saves', () => {
  it('an old save that finished the fire chain has the new steps done; a new player does not', () => {
    const g = new Game();
    g.setFlag('charcoalMade');
    expect(legacyFireDone(g)).toBe(true);
    for (const e of FIRE_EXPERIMENTS) expect(stepById(e.id)!.implied!(g)).toBe(true);
    expect(stepById('fireOnOwn')!.implied!(g)).toBe(true);
    // Once a fire experiment has been offered, the player is doing Lesson 02 as it is now.
    jumpTo(g, 'ember');
    g.experiments.update(g);
    expect(g.experiments.phase('drillSpeed')).toBe('predict');
    expect(legacyFireDone(g)).toBe(false);
  });

  it('a fire burning in an older save keeps burning after the upgrade', () => {
    const g = withPit();
    const data = JSON.parse(JSON.stringify(g.snapshot()));
    data.fire = { tinder: 1, twigs: 3, logs: 2, fuelFirst: false, stage: 'burning', burnLeft: 100 };
    const back = Game.restore(data);
    expect(back.fire.stage).toBe('burning');
    expect(back.fire.hearth.burningCount).toBeGreaterThan(0);
    for (let t = 0; t < 10; t += 0.25) back.fire.tick(0.25);
    expect(back.fire.stage).toBe('burning');
    const once = JSON.stringify(back.snapshot());
    expect(JSON.stringify(Game.restore(JSON.parse(once)).snapshot())).toBe(once);
  });

  it('every Lesson 02 experiment opens only when its step is on the card', () => {
    const g = new Game();
    g.experiments.update(g);
    for (const e of FIRE_EXPERIMENTS) expect(g.experiments.phase(e.id)).toBe('locked');
  });
});
