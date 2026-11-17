// Lesson 03 (Water): the filter's layer order, settling, rain off the roof, stone boiling, the clay test
// cups and the experiments they feed. Every outcome comes from a rule, never from the experiment.
import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, type PlacedStructure } from '../src/game/blueprint.js';
import { ClayLab, cracksWhileDrying, dryingStrain, firingOutcome, PIECE_FIRE_SECONDS, TEST_DRY_SECONDS } from '../src/game/curriculum/lessons/water/clay.js';
import { CLAY_TEMPER, FILTER_ORDER, POT_FIRING, TREATMENT, WATER_SOURCE } from '../src/game/curriculum/lessons/water/experiments.js';
import { filterLayers, filterResult, filterWorks, LAYER_SPOTS } from '../src/game/curriculum/lessons/water/filter.js';
import { legacyWater } from '../src/game/curriculum/lessons/water/steps.js';
import { LAY_NEEDS, PRESSURE } from '../src/game/fire.js';
import { Game } from '../src/game/game.js';
import { resolveIntent } from '../src/game/intent.js';
import type { ItemId } from '../src/game/items.js';
import { BOIL_SECONDS, SETTLE_SECONDS } from '../src/game/water.js';
import { jumpTo } from './helpers/lessons.js';

const STREAM = { x: 4.4, z: 3 };
/** Run the game; a burning fire is kept stocked with logs (the fire is the setting here, not the thing tested). */
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) {
    if (g.fire.stage === 'burning' && g.fire.hearth.count() < 3) g.fire.hearth.add('logs', 0, true);
    g.tick(0.25);
  }
};

/** A finished filter at (0, 0) with these layers, bottom to top. */
function filter(g: Game, layers: ItemId[]): PlacedStructure {
  const spots: Array<ItemId | null> = ['forkedStick', 'forkedStick', 'cane', null, null, null, null];
  LAYER_SPOTS.forEach((i, k) => (spots[i] = layers[k] ?? null));
  const s: PlacedStructure = { id: 77, kind: 'filter', x: 0, z: 0, rotY: 0, key: 'forkedStick', spots, complete: spots.every((v) => v !== null) };
  g.structures.push(s);
  return s;
}

/** A real fire pit near (-3, -3) with a fire lit by the fire's own rules (lay, bow-drill ember, fanning). */
function lightFire(g: Game): void {
  g.addItem('dryStone', 4);
  g.takeOut('dryStone');
  let pit: PlacedStructure | undefined;
  for (const [x, z] of [[-3, -3], [-4, 3], [3, 5], [-3, -5], [5, -3], [-5, -1], [2, 6], [6, 1]]) pit ??= g.placeBlueprint('firePit', x, z, 0).structure;
  if (!pit) throw new Error('no open ground for the pit');
  g.addItem('dryStone', 3);
  pit.spots.forEach((_, i) => g.fillSpot(pit!.id, i));
  g.stow();
  g.addItem('dryGrass', LAY_NEEDS.tinder);
  g.addItem('twigs', LAY_NEEDS.twigs);
  g.addItem('logs', LAY_NEEDS.logs);
  while (!g.fire.layBuilt) expect(g.fire.addFuel()).toBe(true);
  g.addItem('bowDrill');
  g.takeOut('bowDrill');
  for (let i = 0; i < 400 && !g.fire.carrying; i++) {
    g.fire.saw(1.5 * 0.05, 0.05, PRESSURE.firm, 1);
    g.fire.tick(0.05);
  }
  g.stow();
  expect(g.fire.transferEmber()).toBe(true);
  for (let i = 0; i < 40 && g.fire.stage !== 'burning'; i++) g.fire.fan(0.8, 0.25);
  expect(g.fire.stage).toBe('burning');
  // Let it get going: a just-lit fire is still weak.
  run(g, 10);
  expect(g.water.fireHeat()).toBeGreaterThan(0.5);
}

/** A game with a fired pot in the bag and a burning fire. */
function camp(): Game {
  const g = new Game();
  g.setFlag('potFired');
  lightFire(g);
  g.addItem('pot');
  return g;
}
/** Where to stand to use the fire. */
const FIRE_AT = (g: Game) => {
  const pit = g.structures.find((s) => s.kind === 'firePit')!;
  return { x: pit.x + 0.6, z: pit.z };
};

describe('filter layers (filter.ts)', () => {
  it('every layer mark takes any layer, and the layers fill from the bottom up', () => {
    expect(LAYER_SPOTS).toHaveLength(4);
    for (const i of LAYER_SPOTS) expect([...BLUEPRINTS.filter.spots[i].accepts].sort()).toEqual(['charcoal', 'cloth', 'gravel', 'sand']);
    const g = new Game();
    g.addItem('forkedStick');
    g.takeOut('forkedStick');
    let s: PlacedStructure | undefined;
    for (const [x, z] of [[4, -4], [-4, 3], [3, 5], [-3, -5], [5, -3], [-5, -1], [2, 6], [6, 1]]) s ??= g.placeBlueprint('filter', x, z, 0).structure;
    if (!s) throw new Error('no open ground');
    // Whatever you hold, the lowest open layer is where it goes.
    g.addItem('gravel');
    g.takeOut('gravel');
    expect(g.placementTarget('gravel', s.x, s.z)?.index).toBe(LAYER_SPOTS[0]);
  });

  it('the order decides: coarse first runs clear, fine first clogs, no cloth washes sand out', () => {
    expect(filterResult(['cloth', 'charcoal', 'sand', 'gravel'])).toMatchObject({ flow: 'clear', arrangement: 'coarseFirst', charcoal: true });
    expect(filterResult(['cloth', 'charcoal', 'gravel', 'sand'])).toMatchObject({ flow: 'clogged', arrangement: 'fineFirst' });
    expect(filterResult(['charcoal', 'cloth', 'sand', 'gravel'])).toMatchObject({ flow: 'washout', arrangement: 'noSupport' });
    expect(filterResult(['gravel', 'sand', 'charcoal', 'cloth'])).toMatchObject({ flow: 'washout' });
    // No fine layer at all: fast but cloudy (not part of the order test).
    expect(filterResult(['cloth', 'charcoal', 'gravel', 'gravel'])).toMatchObject({ flow: 'cloudy', arrangement: null });
    // Sand with no gravel above it meets the mud first.
    expect(filterResult(['cloth', 'charcoal', 'sand', 'sand']).flow).toBe('clogged');
  });

  it('charcoal only changes the smell, and a clear result always says germs remain', () => {
    const withC = filterResult(['cloth', 'charcoal', 'sand', 'gravel']);
    const without = filterResult(['cloth', 'sand', 'sand', 'gravel']);
    expect(without.flow).toBe('clear');
    expect(without.charcoal).toBe(false);
    expect(withC.text).toMatch(/fresher/);
    expect(without.text).toMatch(/earthy/);
    for (const r of [withC, without, filterResult(['cloth', 'gravel', 'gravel', 'gravel'])]) expect(r.text).toMatch(/germs/i);
  });

  it('clear rainwater cannot clog the sand; it still washes out with no cloth', () => {
    expect(filterResult(['cloth', 'charcoal', 'gravel', 'sand'], false)).toMatchObject({ flow: 'clear', arrangement: null });
    expect(filterResult(['sand', 'cloth', 'charcoal', 'gravel'], false)).toMatchObject({ flow: 'washout', arrangement: null });
  });

  it('reads a placed filter bottom to top; a record with no layers had the old fixed order', () => {
    const g = new Game();
    expect(filterLayers(filter(g, ['cloth', 'charcoal', 'sand', 'gravel']))).toEqual(['cloth', 'charcoal', 'sand', 'gravel']);
    expect(filterLayers({ spots: [] })).toEqual(['cloth', 'charcoal', 'sand', 'gravel']);
    expect(filterWorks(g.structures[g.structures.length - 1])).toBe(true);
  });
});

describe('pouring through the filter (water.ts)', () => {
  it('sets what is in the pot, records the notebook entry and reports the layer-order trial', () => {
    const cases: Array<[ItemId[], string, string]> = [
      [['cloth', 'charcoal', 'sand', 'gravel'], 'filtered', 'water.filter.poured'],
      [['cloth', 'charcoal', 'gravel', 'sand'], 'empty', 'water.filter.clog'],
      [['charcoal', 'cloth', 'sand', 'gravel'], 'raw', 'water.filter.washout'],
      [['cloth', 'sand', 'sand', 'gravel'], 'filtered', 'water.filter.odour'],
    ];
    for (const [layers, pot, event] of cases) {
      const g = camp();
      jumpTo(g, 'filterOrder');
      run(g, 0.5);
      const f = filter(g, layers);
      g.water.perform('fillPot', STREAM);
      expect(g.water.perform('pourFilter', { x: f.x, z: f.z })).toBe(true);
      expect(g.water.potWater, layers.join()).toBe(pot);
      expect(g.hasEvent(event as never), event).toBe(true);
    }
  });

  it('wiring: washout, clog, settling, odour and hot stones unlock their notebook entries', () => {
    const g = camp();
    for (const layers of [['charcoal', 'cloth', 'sand', 'gravel'], ['cloth', 'charcoal', 'gravel', 'sand'], ['cloth', 'sand', 'sand', 'gravel']] as ItemId[][]) {
      const old = g.structures.findIndex((s) => s.kind === 'filter');
      if (old >= 0) g.structures.splice(old, 1);
      filter(g, layers);
      g.water.potWater = 'empty';
      g.water.perform('fillPot', STREAM);
      g.water.perform('pourFilter', { x: 0, z: 0 });
    }
    for (const id of ['w_washout', 'w_clog', 'w_odor']) expect(g.notebook, id).toContain(id);
  });

  it('the intent table pours and boils settled and rain water too', () => {
    const fire = { burning: true, embedded: false, layBuilt: true, stage: 'burning', carrying: false };
    for (const water of ['raw', 'settled', 'rain'] as const) {
      expect(resolveIntent('pot', { kind: 'filter', pot: { fired: true, dry: true, water } })).toBe('pourFilter');
      expect(resolveIntent('pot', { kind: 'firePit', fire, pot: { fired: true, dry: true, water } })).toBe('boilPot');
    }
    expect(resolveIntent('pot', { kind: 'filter', pot: { fired: true, dry: true, water: 'filtered' } })).toBeNull();
  });
});

describe('settling, rain and boiling (water.ts)', () => {
  it('muddy water left still settles; carrying it in your hand keeps it stirred', () => {
    const g = camp();
    g.water.perform('fillPot', STREAM);
    g.takeOut('pot');
    run(g, SETTLE_SECONDS + 2);
    expect(g.water.potWater).toBe('raw');
    g.stow();
    run(g, SETTLE_SECONDS + 1);
    expect(g.water.potWater).toBe('settled');
    expect(g.notebook).toContain('w_settle');
  });

  it('boiling kills germs but leaves mud; filtered or rain water boils to safe', () => {
    for (const [start, end] of [['raw', 'boiledRaw'], ['settled', 'boiledRaw'], ['filtered', 'safe'], ['rain', 'safe']] as const) {
      const g = camp();
      g.water.potWater = start;
      expect(g.water.perform('boil', FIRE_AT(g))).toBe(true);
      run(g, BOIL_SECONDS + 1);
      expect(g.water.potWater, start).toBe(end);
    }
  });

  it('the pot heats only as hard as your own fire burns, and stops when it goes out', () => {
    const g = camp();
    g.water.potWater = 'filtered';
    g.takeOut('pot');
    expect(g.water.perform('boil', FIRE_AT(g))).toBe(true);
    run(g, 3);
    expect(g.water.boil).toBeGreaterThan(1.5);
    // All the fuel gone: the fire burns out by its own rules and the pot stops heating.
    g.fire.hearth.clear();
    for (let t = 0; t < 2; t += 0.25) g.tick(0.25);
    expect(g.fire.stage).not.toBe('burning');
    expect(g.water.fireHeat()).toBe(0);
    expect(g.water.onFire).toBe(false);
    expect(g.water.potWater).toBe('filtered');
  });

  it('rain runoff is caught only while it rains, at the low edge of a roofed lean-to', () => {
    const g = camp();
    const spots = BLUEPRINTS.leanTo.spots.map((sp) => sp.accepts[0]);
    g.structures.push({ id: 91, kind: 'leanTo', x: 6, z: -6, rotY: 0.4, key: 'pole', spots, complete: true });
    const edge = g.water.roofEdge()!;
    expect(edge).not.toBeNull();
    expect(g.water.available(edge, 'pot')?.id).not.toBe('catchRain');
    g.env.forceWeather = 'heavyRain';
    g.env.update(g.time, 0.25);
    expect(g.water.available(edge, 'pot')?.id).toBe('catchRain');
    expect(g.water.available({ x: 6, z: -2 }, 'pot')?.id).not.toBe('catchRain');
    expect(g.water.perform('catchRain', edge)).toBe(true);
    expect(g.water.potWater).toBe('rain');
    expect(g.notebook).toContain('w_cycle');
  });

  it('two dry stones heated in the fire boil the pot (stone boiling)', () => {
    const g = camp();
    g.water.potWater = 'filtered';
    const stones = g.count('dryStone');
    g.addItem('dryStone', 2);
    for (let i = 0; i < 2; i++) {
      g.takeOut('dryStone');
      expect(g.water.available(FIRE_AT(g))?.id).toBe('heatStone');
      expect(g.water.perform('heatStone', FIRE_AT(g))).toBe(true);
    }
    expect(g.count('dryStone')).toBe(stones);
    g.takeOut('pot');
    expect(g.water.available(FIRE_AT(g))?.id).toBe('boil');
    run(g, 9);
    expect(g.water.available(FIRE_AT(g))?.id).toBe('stoneBoil');
    expect(g.water.perform('stoneBoil', FIRE_AT(g))).toBe(true);
    expect(g.water.potWater).toBe('safe');
    expect(g.count('dryStone')).toBe(stones + 2);
    expect(g.notebook).toContain('w_hotstones');
  });

  it('a wet stream stone is never offered for stone boiling', () => {
    const g = camp();
    g.water.potWater = 'raw';
    g.addItem('wetStone');
    g.takeOut('wetStone');
    expect(g.water.available(FIRE_AT(g))).toBeNull();
  });

  it('the browser can tip water out where an empty pot is wanted (never on the way to the fire)', () => {
    const g = camp();
    g.water.potWater = 'filtered';
    expect(g.water.available({ x: 20, z: -20 }, 'pot')).toBeNull();
    g.water.potWater = 'rain';
    expect(g.water.available(STREAM, 'pot')?.id).toBe('pourOut');
    expect(g.water.perform('pourOut')).toBe(true);
    expect(g.water.potWater).toBe('empty');
  });

  it('new water state saves and restores; an old save without it loads with defaults', () => {
    const g = camp();
    g.water.potWater = 'settled';
    g.water.source = 'stream';
    g.water.stones = { n: 2, heat: 3 };
    g.water.clay.make();
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.water.potWater).toBe('settled');
    expect(back.water.stones).toEqual({ n: 2, heat: 3 });
    expect(back.water.clay.pieces).toHaveLength(3);
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    for (const k of ['settle', 'source', 'stones', 'clay']) delete snap.water[k];
    snap.water.potWater = 'raw';
    const old = Game.restore(snap);
    expect(old.water.source).toBe('stream');
    expect(old.water.stones).toBeNull();
    expect(old.water.clay.pieces).toEqual([]);
  });
});

describe('clay test cups (clay.ts)', () => {
  it('drying strain: clay alone tears halfway through drying, tempered clay never does', () => {
    expect(dryingStrain(false, 0.5)).toBeGreaterThan(1);
    expect(cracksWhileDrying(false, 0.5)).toBe(true);
    expect(cracksWhileDrying(false, 0.02)).toBe(false);
    for (let f = 0; f <= 1; f += 0.05) expect(cracksWhileDrying(true, f)).toBe(false);
    expect(firingOutcome(false)).toBe('burst');
    expect(firingOutcome(true)).toBe('ceramic');
  });

  it('the clay-only cup cracks (its clay comes back), the sand cups dry whole', () => {
    const g = camp();
    jumpTo(g, 'clayTemper');
    run(g, 0.5);
    g.water.clay.make();
    run(g, TEST_DRY_SECONDS / 2);
    expect(g.water.clay.pieces[0].state).toBe('cracked');
    expect(g.count('clay')).toBe(1);
    expect(g.notebook).toContain('p_temper');
    expect(g.notebook).toContain('p_reclaim');
    run(g, TEST_DRY_SECONDS);
    expect(g.water.clay.pieces.slice(1).map((p) => p.state)).toEqual(['dry', 'dry']);
    expect([...g.experiments.state('clayTemper').trials]).toEqual([['none', 'cracked'], ['sand', 'whole']]);
  });

  it('a damp cup bursts in the fire, a dry one becomes ceramic; a dying fire hands it back', () => {
    const g = camp();
    jumpTo(g, 'potFiring');
    run(g, 0.5);
    expect(g.experiments.phase('potFiring')).toBe('predict');
    g.experiments.predict('potFiring', 'damp');
    const lab = g.water.clay;
    lab.make();
    expect(g.water.available(FIRE_AT(g), null)?.id).toBe('fireTest');
    expect(lab.nextToFire()).toMatchObject({ dry: false });
    expect(g.water.perform('fireTest', FIRE_AT(g))).toBe(true);
    run(g, 2);
    expect(lab.count('temper', 'burst')).toBe(1);
    expect(g.experiments.state('potFiring').trials.get('damp')).toBe('burst');
    run(g, TEST_DRY_SECONDS);
    expect(lab.nextToFire()).toMatchObject({ dry: true });
    lab.fire();
    g.fire.stage = 'out';
    run(g, 1);
    expect(lab.count('temper', 'dry')).toBe(1);
    g.fire.stage = 'burning';
    lab.fire();
    run(g, PIECE_FIRE_SECONDS + 1);
    expect(lab.count('temper', 'ceramic')).toBe(1);
    expect(g.experiments.phase('potFiring')).toBe('result');
    expect(g.experiments.predictedRight('potFiring')).toBe(false);
  });

  it('test cups are only offered for the fire while the firing test is open', () => {
    const g = camp();
    g.water.clay.make();
    expect(g.water.available(FIRE_AT(g), null)).toBeNull();
  });

  it('saves and restores a cup in the fire', () => {
    const g = new Game();
    const lab = new ClayLab(g);
    lab.make();
    lab.pieces[1].state = 'firing';
    lab.firing = { index: 1, t: 2, dry: true };
    const back = new ClayLab(g);
    back.restore(JSON.parse(JSON.stringify(lab.snapshot())));
    expect(back.firing).toEqual({ index: 1, t: 2, dry: true });
    back.restore({ pieces: [{ kind: 'temper', dry: TEST_DRY_SECONDS, state: 'firing' }], firing: null });
    expect(back.pieces[0].state).toBe('dry');
  });

  it('the real pot feeds the firing test too', () => {
    const fresh = new Game();
    lightFire(fresh);
    jumpTo(fresh, 'potFiring');
    run(fresh, 0.5);
    fresh.addItem('pot');
    fresh.takeOut('pot');
    expect(fresh.water.perform('firePot', FIRE_AT(fresh))).toBe(true);
    expect(fresh.experiments.state('potFiring').trials.get('damp')).toBe('burst');
  });
});

describe('experiment conclusions follow the evidence', () => {
  const m = (o: Record<string, string>) => new Map(Object.entries(o));
  it('clay temper and firing', () => {
    expect(CLAY_TEMPER.conclude(m({ none: 'cracked' }))).toBeNull();
    expect(CLAY_TEMPER.conclude(m({ none: 'cracked', sand: 'whole' }))).toBe('sand');
    expect(CLAY_TEMPER.conclude(m({ none: 'cracked', sand: 'cracked' }))).toBe('same');
    expect(POT_FIRING.conclude(m({ damp: 'burst', dry: 'ceramic' }))).toBe('dry');
    expect(POT_FIRING.conclude(m({ damp: 'ceramic', dry: 'ceramic' }))).toBe('any');
  });

  it('stream or rain', () => {
    expect(WATER_SOURCE.conclude(m({ stream: 'muddy' }))).toBeNull();
    expect(WATER_SOURCE.conclude(m({ stream: 'muddy', rain: 'clearer' }))).toBe('rain');
  });

  it('layer order needs the right order and one wrong one', () => {
    expect(FILTER_ORDER.conclude(m({ coarseFirst: 'clear' }))).toBeNull();
    expect(FILTER_ORDER.conclude(m({ fineFirst: 'clogged', noSupport: 'washout' }))).toBeNull();
    expect(FILTER_ORDER.conclude(m({ coarseFirst: 'clear', fineFirst: 'clogged' }))).toBe('coarse');
    expect(FILTER_ORDER.conclude(m({ coarseFirst: 'clear', noSupport: 'washout' }))).toBe('coarse');
    expect(FILTER_ORDER.conclude(m({ coarseFirst: 'clear', fineFirst: 'clear' }))).toBe('any');
  });

  it('treatment needs all four and finds that each does a different job', () => {
    const all = { settle: 'clearerGerms', filter: 'clearGerms', boil: 'muddyKilled', both: 'clearKilled' };
    const { both: _skip, ...three } = all;
    expect(TREATMENT.conclude(m(three))).toBeNull();
    expect(TREATMENT.conclude(m(all))).toBe('each');
  });

  it('treatment compares stream water only: rain boiled clear is not "boiling alone"', () => {
    const g = camp();
    jumpTo(g, 'treatment');
    run(g, 0.5);
    g.water.potWater = 'rain';
    g.water.source = 'rain';
    g.water.perform('boil', FIRE_AT(g));
    run(g, BOIL_SECONDS + 1);
    expect(g.water.potWater).toBe('safe');
    expect(g.experiments.state('treatment').trials.size).toBe(0);
  });
});

describe('the lesson', () => {
  it('runs clay tests, pot, stream and rain, filter order, treatment, and a closing check', async () => {
    const { lessonById } = await import('../src/game/curriculum/registry.js');
    expect(lessonById('water')!.steps).toEqual(['clayTemper', 'potFiring', 'pot', 'waterSource', 'filterOrder', 'treatment', 'waterSupply']);
  });

  it('the closing check waits for a working setup, then opens straight to its question', () => {
    const g = camp();
    jumpTo(g, 'waterSupply');
    run(g, 0.5);
    expect(g.experiments.phase('waterSupply')).toBe('locked');
    filter(g, ['cloth', 'charcoal', 'sand', 'gravel']);
    g.setFlag('waterSafe');
    run(g, 0.5);
    expect(g.experiments.phase('waterSupply')).toBe('check');
    expect(g.lessons.current?.id).toBe('waterSupply');
    expect(g.experiments.answer('waterSupply', 'charcoal')?.correct).toBe(false);
    expect(g.experiments.answer('waterSupply', 'limits')?.correct).toBe(true);
    run(g, 0.5);
    expect(g.lessons.lessonDone.has('water')).toBe(true);
  });

  it('an old save that finished the old water lesson is not sent back; a player mid-lesson is not skipped', () => {
    const g = new Game();
    g.setFlag('waterSafe');
    expect(legacyWater(g)).toBe(true);
    jumpTo(g, 'clayTemper');
    run(g, 0.5);
    expect(g.lessons.lessonDone.has('water')).toBe(true);
    const mid = camp();
    jumpTo(mid, 'treatment');
    run(mid, 0.5);
    mid.setFlag('waterSafe');
    run(mid, 0.5);
    expect(mid.lessons.current?.id).toBe('treatment');
  });
});
