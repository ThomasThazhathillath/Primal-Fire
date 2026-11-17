// Lesson 01 (Shelter), Phase 2: every new rule and experiment, fed by the real simulation.
import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, checkPlacement, DEAD_BRANCH_REACH, isSpotLocked, type PlacedStructure } from '../src/game/blueprint.js';
import { BED_TEST, FRAME_PUSH, NIGHT_SHELTER, ROOF_LAYERS } from '../src/game/curriculum/lessons/shelter/experiments.js';
import { bedParts, COLD_HOUR, dryBed, NIGHT_HOLD, STEADY_RATIO } from '../src/game/curriculum/lessons/shelter/rules.js';
import { LESSONS } from '../src/game/curriculum/registry.js';
import { Game } from '../src/game/game.js';
import { GUIDES } from '../src/game/guides.js';
import { framePush, HOLD_RACK } from '../src/game/shelter.js';
import { hollowDepth, nearestRise, SITE_FEATURES, siteAt } from '../src/game/sites.js';
import { Body, heatFlow, heatRatio } from '../src/game/survival/body.js';
import { HOLLOW_CHILL, microclimate } from '../src/game/survival/climate.js';
import { BED_MATERIALS, bedInsulation, bedMaterialOf, bedMoisture } from '../src/game/survival/materials.js';
import { nearestTreeDistance, STREAM_BANK, streamDistance, TREES } from '../src/game/world-layout.js';
import { jumpTo } from './helpers/lessons.js';

const roles = (role: string) => BLUEPRINTS.leanTo.spots.map((s, i) => (s.role === role ? i : -1)).filter((i) => i >= 0);
const night = { hour: 2, night: 1, cloud: 0, rain: 0, wind: 0.15 };
const here = (o: Partial<Parameters<typeof microclimate>[1]> = {}) => ({ sheltered: false, onBed: false, fireDist: Infinity, fireBurning: false, ...o });
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) g.tick(0.25);
};

/** A game on a Lesson 01 step with every part in the bag and the first pole planted on the north rise. */
function leanToGame(stepId = 'frame') {
  const g = new Game();
  jumpTo(g, 'pole');
  for (const [id, n] of [['pole', 3], ['greenBranch', 5], ['cord', 3], ['twigs', 4], ['bark', 3], ['leafLitter', 10], ['dryGrass', 10], ['dampMoss', 6], ['diggingStick', 1]] as const) g.addItem(id, n);
  g.takeOut('pole');
  const rise = SITE_FEATURES.find((f) => f.id === 'northRise')!;
  const r = g.placeBlueprint('leanTo', rise.x, rise.z, 0);
  expect(r.ok, r.ok ? '' : r.message).toBe(true);
  if (stepId !== 'frame') jumpTo(g, stepId);
  run(g, 0.5);
  return { g, s: r.structure! };
}
const fill = (g: Game, s: PlacedStructure, role: string, prefer?: Parameters<Game['fillSpot']>[2]) => {
  for (const i of roles(role)) expect(g.fillSpot(s.id, i, prefer), `${role}[${i}]`).toBe(true);
};
/** Everything on: frame (pushed first when it asks), lashings, small branches and two layers on every roof panel. */
function finish(g: Game, s: PlacedStructure) {
  fill(g, s, 'upright');
  fill(g, s, 'ridge');
  if (s.pushFirst) g.pushFrame(s.id);
  fill(g, s, 'rib');
  fill(g, s, 'cross');
  for (const i of roles('lash')) expect(g.lashJoint(s.id, i, 1)).toBe(1);
  fill(g, s, 'lattice');
  fill(g, s, 'roofBark');
  fill(g, s, 'roofLeaf');
}
function bed(g: Game, s: PlacedStructure, item: 'leafLitter' | 'dryGrass' | 'dampMoss', parts = 5) {
  g.takeOut(item);
  const r = g.placeBlueprint('bedding', s.x, s.z - 0.2, 0);
  expect(r.ok, r.ok ? '' : r.message).toBe(true);
  for (let i = 0; i < parts - 1; i++) expect(g.fillSpot(r.structure!.id, i, item)).toBe(true);
  return r.structure!;
}
const inside = (g: Game, s: PlacedStructure) => {
  g.player.x = s.x;
  g.player.z = s.z - 0.2;
};

describe('bed materials (survival/materials.ts)', () => {
  it('dry grass and leaves insulate; damp moss barely; a gap stops nothing', () => {
    expect(BED_MATERIALS.dryGrass!.insulation).toBeGreaterThan(BED_MATERIALS.dampMoss!.insulation);
    expect(BED_MATERIALS.leafLitter!.insulation).toBeGreaterThan(BED_MATERIALS.dampMoss!.insulation);
    const full = (id: 'dryGrass' | 'leafLitter' | 'dampMoss') => bedInsulation([id, id, id, id, id]);
    expect(full('dryGrass')).toBeCloseTo(0.9);
    expect(full('dampMoss')).toBeLessThan(0.5);
    // A thin bed (two of five parts) insulates less than a whole one of the same material.
    expect(bedInsulation(['dryGrass', 'dryGrass', null, null, null])).toBeLessThan(full('dryGrass'));
    expect(bedInsulation([])).toBe(0);
    expect(bedMoisture(['dampMoss', 'dampMoss'])).toBeGreaterThan(0.5);
    expect(bedMoisture([null, null])).toBe(0);
  });
  it('a fair test needs a whole bed of one material', () => {
    expect(bedMaterialOf(['dryGrass', 'dryGrass', 'dryGrass'])).toBe('dryGrass');
    expect(bedMaterialOf(['dryGrass', 'leafLitter', 'dryGrass'])).toBeNull();
    expect(bedMaterialOf(['dampMoss', null, 'dampMoss'])).toBeNull();
    expect(bedMaterialOf(['twigs', 'twigs'])).toBeNull();
  });
  it('the bed takes damp moss too (dry material is used first when the bag fills a mark)', () => {
    expect(BLUEPRINTS.bedding.keyAccepts).toContain('dampMoss');
    for (const sp of BLUEPRINTS.bedding.spots) expect(sp.accepts[sp.accepts.length - 1]).toBe('dampMoss');
  });
});

describe('the body: the bed drives ground conduction, hollows pool cold air', () => {
  const resting = (bedInsulationValue: number) => heatFlow(microclimate(night, here({ sheltered: true, bedInsulation: bedInsulationValue })), 0, true).ground;
  it('heat into the ground: bare > damp moss > leaves > grass', () => {
    const grass = resting(bedInsulation(Array(5).fill('dryGrass')));
    const leaves = resting(bedInsulation(Array(5).fill('leafLitter')));
    const moss = resting(bedInsulation(Array(5).fill('dampMoss')));
    const bare = resting(0);
    expect(bare).toBeGreaterThan(moss);
    expect(moss).toBeGreaterThan(leaves);
    expect(leaves).toBeGreaterThan(grass);
    // Standing up, the ground takes nothing.
    expect(heatFlow(microclimate(night, here({ sheltered: true })), 0, false).ground).toBe(0);
  });
  it('without bedInsulation the old rule holds: a bed stops 90%', () => {
    const m = microclimate(night, here({ sheltered: true, onBed: true }));
    expect(m.bedInsulation).toBeUndefined();
    expect(heatFlow(m, 0, true).ground).toBeCloseTo(resting(0.9));
  });
  it('a damp bed soaks you; a dry one does not', () => {
    const lie = (moisture: number) => {
      const b = new Body();
      const m = microclimate({ ...night, hour: 14, night: 0 }, here({ sheltered: true, bedInsulation: 0.3, bedMoisture: moisture }));
      for (let t = 0; t < 60; t += 0.25) b.tick(0.25, m, true);
      return b.wet;
    };
    expect(lie(0.85)).toBeGreaterThan(0.3);
    expect(lie(0.05)).toBe(0);
  });
  it('cold air pools in a hollow on a calm night, not by day and less in wind', () => {
    const flat = microclimate(night, here());
    const low = microclimate(night, here({ hollow: 1 }));
    expect(flat.air - low.air).toBeCloseTo(HOLLOW_CHILL * (1 - 1.2 * 0.15));
    expect(microclimate({ ...night, hour: 14, night: 0 }, here({ hollow: 1 })).air).toBe(microclimate({ ...night, hour: 14, night: 0 }, here()).air);
    expect(microclimate({ ...night, wind: 1 }, here({ hollow: 1 })).air).toBe(microclimate({ ...night, wind: 1 }, here()).air);
  });
  it('heat out over heat made: the open beats the shelter on a cold night', () => {
    const open = heatRatio(heatFlow(microclimate(night, here()), 0, false));
    const roof = heatRatio(heatFlow(microclimate(night, here({ sheltered: true, bedInsulation: 0.9 })), 0, true));
    expect(open).toBeGreaterThan(1.8);
    expect(roof).toBeLessThanOrEqual(STEADY_RATIO);
  });
  it('the readings work at every survival setting, Off included (the setting only scales what it does to you)', () => {
    const b = new Body();
    b.pressure = 'off';
    b.tick(0.25, microclimate(night, here()), false);
    expect(b.flow.loss).toBeGreaterThan(0);
    expect(b.warmth).toBe(100);
  });
});

describe('site choice (sites.ts)', () => {
  it('hollows and rises lie in the Waking Clearing: tree-free, off the bank, clear of where you wake', () => {
    for (const f of SITE_FEATURES) {
      expect(nearestTreeDistance(f.x, f.z), f.id).toBeGreaterThan(f.r + 1.5);
      expect(streamDistance(f.x, f.z), f.id).toBeGreaterThan(STREAM_BANK + f.r * 0.5);
      expect(Math.hypot(f.x, f.z), f.id).toBeGreaterThan(f.r + 1);
    }
    expect(siteAt(0, 0).kind).toBe('flat');
  });
  it('reads hollow, rise and flat ground, deepest at the centre', () => {
    const h = SITE_FEATURES.find((f) => f.kind === 'hollow')!;
    expect(siteAt(h.x, h.z)).toMatchObject({ kind: 'hollow', depth: 1 });
    expect(hollowDepth(h.x + h.r * 0.5, h.z)).toBeGreaterThan(0);
    expect(hollowDepth(h.x + h.r * 0.5, h.z)).toBeLessThan(1);
    const r = SITE_FEATURES.find((f) => f.kind === 'rise')!;
    expect(siteAt(r.x, r.z).kind).toBe('rise');
    expect(hollowDepth(r.x, r.z)).toBe(0);
    expect(nearestRise(r.x + 1, r.z)).toBe(r);
  });
  it('a lean-to is turned down in a hollow and under dead branches; other structures are not', () => {
    const h = SITE_FEATURES.find((f) => f.kind === 'hollow')!;
    expect(checkPlacement('leanTo', h.x, h.z, [])).toMatchObject({ ok: false, reason: 'low' });
    expect(checkPlacement('workbench', h.x, h.z, [])).toMatchObject({ ok: true });
    const r = SITE_FEATURES.find((f) => f.kind === 'rise')!;
    expect(checkPlacement('leanTo', r.x, r.z, [])).toMatchObject({ ok: true });
    // A spot near a dead tree but far enough from every trunk to fit a lean-to.
    let near: [number, number] | null = null;
    for (const t of TREES.filter((t) => t.kind === 2)) {
      for (let a = 0; a < 16 && !near; a++) {
        const x = t.x + Math.cos(a) * (DEAD_BRANCH_REACH - 0.3);
        const z = t.z + Math.sin(a) * (DEAD_BRANCH_REACH - 0.3);
        if (nearestTreeDistance(x, z) >= BLUEPRINTS.leanTo.radius + 0.6 && streamDistance(x, z) > 4 && Math.hypot(x, z) < 40) near = [x, z];
      }
      if (near) break;
    }
    if (near) expect(checkPlacement('leanTo', near[0], near[1], [])).toMatchObject({ ok: false, reason: 'overhead' });
  });
  it('in the game: the hollow is a guide failure and a notebook entry; a rise is praised', () => {
    const g = new Game();
    jumpTo(g, 'pole');
    g.addItem('pole');
    g.takeOut('pole');
    const h = SITE_FEATURES.find((f) => f.kind === 'hollow')!;
    expect(g.placeBlueprint('leanTo', h.x, h.z, 0).ok).toBe(false);
    expect(g.notebook).toContain('l1_hollow');
    expect(g.guide.view(GUIDES.find((x) => x.id === 'shelter')!).failure?.code).toBe('site.lowGround');
    const r = SITE_FEATURES.find((f) => f.kind === 'rise')!;
    expect(g.placeBlueprint('leanTo', r.x, r.z, 0).ok).toBe(true);
    expect(g.notebook).toEqual(expect.arrayContaining(['l1_rise', 's_site']));
  });
  it('standing in a hollow on a calm night, the body feels the colder air', () => {
    const g = new Game();
    g.env.skipTo(g.time, 2);
    g.env.update(g.time, 0);
    const h = SITE_FEATURES.find((f) => f.kind === 'hollow')!;
    const flat = g.microclimateHere().air;
    g.player.x = h.x;
    g.player.z = h.z;
    expect(g.microclimateHere().air).toBeLessThan(flat);
  });
});

describe('the push test (shelter.ts framePush)', () => {
  it('posts alone are not a frame; the bare box folds; ribs and cross-supports hold; lashing stiffens', () => {
    const { g, s } = leanToGame();
    expect(framePush(s).bracing).toBe('posts');
    fill(g, s, 'upright');
    fill(g, s, 'ridge');
    const bare = framePush(s);
    expect(bare).toMatchObject({ bracing: 'unbraced', holds: false });
    expect(bare.rack).toBeGreaterThan(HOLD_RACK);
    g.pushFrame(s.id);
    const [first, ...rest] = roles('rib');
    g.fillSpot(s.id, first);
    expect(framePush(s)).toMatchObject({ bracing: 'partial', ribs: 1 });
    for (const i of rest) expect(g.fillSpot(s.id, i)).toBe(true);
    expect(framePush(s).rack).toBeLessThan(bare.rack);
    fill(g, s, 'cross');
    const braced = framePush(s);
    expect(braced).toMatchObject({ bracing: 'braced', holds: true });
    for (const i of roles('lash')) g.lashJoint(s.id, i, 1);
    expect(framePush(s).rack).toBeLessThan(braced.rack);
  });
  it('on the frame step the bare frame waits for a push: rib marks stay closed until then', () => {
    const { g, s } = leanToGame();
    const msgs: string[] = [];
    g.on((e) => e.type === 'toast' && msgs.push(e.text));
    fill(g, s, 'upright');
    fill(g, s, 'ridge');
    expect(s.pushFirst).toBe(true);
    expect(isSpotLocked(s, roles('rib')[0])).toBe(true);
    expect(g.wantsItem('greenBranch', s.x, s.z)).toBe(false);
    expect(g.fillSpot(s.id, roles('rib')[0])).toBe(false);
    expect(msgs.join(' ')).toMatch(/push the bare frame/i);
    const events: number[] = [];
    g.on((e) => e.type === 'framePush' && events.push(e.rack));
    expect(g.pushFrame(s.id)?.holds).toBe(false);
    expect(events).toHaveLength(1);
    expect(s.pushFirst).toBe(false);
    expect(g.notebook).toContain('l1_rack');
    expect(g.fillSpot(s.id, roles('rib')[0])).toBe(true);
  });
  it('nothing waits outside the frame step (other lessons, old tests, finished saves)', () => {
    const g = new Game();
    g.addItem('pole', 3);
    g.takeOut('pole');
    const s = g.placeBlueprint('leanTo', 0, -1.6, 0).structure!;
    fill(g, s, 'upright');
    fill(g, s, 'ridge');
    expect(s.pushFirst).toBeFalsy();
    expect(g.pushFrame(-1)).toBeNull();
  });
  it('the push is saved with the structure', () => {
    const { g, s } = leanToGame();
    fill(g, s, 'upright');
    fill(g, s, 'ridge');
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.leanTo()!.pushFirst).toBe(true);
  });
  it('the experiment: unbraced folds, braced holds, and the step needs the check answered', () => {
    const { g, s } = leanToGame();
    expect(g.experiments.phase('framePush')).toBe('predict');
    g.experiments.predict('framePush', 'posts');
    fill(g, s, 'upright');
    fill(g, s, 'ridge');
    g.pushFrame(s.id);
    fill(g, s, 'rib');
    fill(g, s, 'cross');
    g.pushFrame(s.id);
    expect(g.experiments.phase('framePush')).toBe('result');
    expect(g.experiments.predictedRight('framePush')).toBe(false);
    expect(g.experiments.state('framePush').supported).toBe('triangles');
  });
});

describe('the bed test: the body measures the heat flow into the ground', () => {
  function ready() {
    const { g, s } = leanToGame();
    finish(g, s);
    jumpTo(g, 'bed');
    run(g, 0.5);
    expect(g.experiments.phase('bedMaterials')).toBe('predict');
    g.experiments.predict('bedMaterials', 'any');
    inside(g, s);
    return { g, s };
  }
  it('resting on bare ground under the roof: most heat flows into it', () => {
    const { g } = ready();
    run(g, 4);
    expect(g.experiments.state('bedMaterials').trials.get('bare')).toBe('most');
    expect(g.shelterRules.bedReadout()).toMatch(/100%/);
  });
  it('walking about takes no reading; standing still does', () => {
    const { g } = ready();
    for (let t = 0; t < 4; t += 0.25) {
      g.player.x += 0.2;
      g.tick(0.25);
      g.player.x -= 0.2;
      g.tick(0.25);
    }
    expect(g.experiments.state('bedMaterials').trials.size).toBe(0);
  });
  it('an unfinished or mixed bed is not a fair test and says so', () => {
    const { g, s } = ready();
    const msgs: string[] = [];
    g.on((e) => e.type === 'toast' && msgs.push(e.text));
    const b = bed(g, s, 'dryGrass', 3);
    run(g, 4);
    expect(g.experiments.state('bedMaterials').trials.size).toBe(0);
    expect(msgs.join(' ')).toMatch(/same thickness/);
    g.fillSpot(b.id, 2, 'dampMoss');
    g.fillSpot(b.id, 3, 'dampMoss');
    run(g, 4);
    expect(g.experiments.state('bedMaterials').trials.size).toBe(0);
    expect(msgs.join(' ')).toMatch(/one material/);
  });
  it('dry grass and dry leaves together count as one whole dry bed', () => {
    const { g, s } = ready();
    const b = bed(g, s, 'dryGrass', 3);
    g.fillSpot(b.id, 2, 'leafLitter');
    g.fillSpot(b.id, 3, 'leafLitter');
    run(g, 4);
    expect(g.experiments.state('bedMaterials').trials.get('leafLitter')).toBe('little');
  });
  it('dry grass lets very little through, damp moss a lot; the result supports "dry" against the "any" prediction', () => {
    const { g, s } = ready();
    run(g, 4);
    const grass = bed(g, s, 'dryGrass');
    run(g, 4);
    expect(g.experiments.state('bedMaterials').trials.get('dryGrass')).toBe('little');
    expect(g.notebook).toContain('l1_stems');
    for (let i = 0; i < 4; i++) g.takeBack(grass.id, i);
    g.stow();
    bed(g, s, 'dampMoss');
    run(g, 4);
    expect(g.experiments.state('bedMaterials').trials.get('dampMoss')).not.toBe('little');
    expect(g.notebook).toEqual(expect.arrayContaining(['l1_damp', 'l1_air']));
    expect(g.experiments.state('bedMaterials').supported).toBe('dry');
    expect(g.experiments.predictedRight('bedMaterials')).toBe(false);
  });
  it('in the warm afternoon the ground pulls almost nothing, so there is nothing to measure', () => {
    const { g } = ready();
    g.env.skipTo(g.time, 14);
    g.env.update(g.time, 0);
    run(g, 4);
    expect(g.experiments.state('bedMaterials').trials.size).toBe(0);
    expect(g.shelterRules.bedReadout()).toMatch(/warm/);
  });
});

describe('the night test and the proof that finishes the lesson', () => {
  function atNight() {
    const { g, s } = leanToGame();
    finish(g, s);
    jumpTo(g, 'nightShelter');
    run(g, 0.5);
    g.experiments.predict('nightShelter', 'less');
    expect(g.waitForNight()).not.toBeNull();
    return { g, s };
  }
  const sky = (g: Game, seconds: number) => {
    for (let t = 0; t < seconds; t += 0.25) {
      g.env.update(g.time, 0.25);
      g.tick(0.25);
    }
  };
  it('Rest until midnight skips to the cold of the night, and is refused once it is cold', () => {
    const { g } = atNight();
    g.env.update(g.time, 0);
    expect(Math.floor(g.env.hour)).toBe(COLD_HOUR);
    sky(g, 0.5);
    expect(g.waitForNight()).toBeNull();
    expect(NIGHT_SHELTER.testAction!.label(g)).toBe('Keep testing');
  });
  it('no trials by day', () => {
    const { g, s } = leanToGame();
    finish(g, s);
    jumpTo(g, 'nightShelter');
    run(g, 0.5);
    expect(NIGHT_SHELTER.testAction!.label(g)).toBe('Rest until midnight');
    g.player.x = s.x + 5;
    sky(g, 5);
    expect(g.experiments.state('nightShelter').trials.size).toBe(0);
  });
  it('the open loses heat faster than the shelter, and a dry bed under the roof holds warmth steady', () => {
    const { g, s } = atNight();
    g.player.x = s.x + 5;
    g.player.z = s.z + 4;
    sky(g, 4);
    expect(g.experiments.state('nightShelter').trials.has('open')).toBe(true);
    const open = g.shelterRules.lastNight!.ratio;
    expect(g.notebook).toContain('l1_open');
    bed(g, s, 'dryGrass');
    inside(g, s);
    sky(g, 4);
    expect(g.shelterRules.lastNight!.ratio).toBeLessThan(open);
    expect(g.experiments.state('nightShelter').trials.get('shelter')).toBe('steady');
    expect(g.hasEvent('shelter.night.warm')).toBe(false);
    sky(g, NIGHT_HOLD);
    expect(g.hasEvent('shelter.night.warm')).toBe(true);
    expect(g.notebook).toContain('l1_night');
    expect(g.experiments.state('nightShelter').supported).toBe('less');
    expect(g.shelterRules.nightReadout(g)).toMatch(/open .*x, your shelter, on the bed .*x/);
  });
  it('on bare ground, a damp bed or under a leaking roof, it is not proven, and the card says why', () => {
    const { g, s } = atNight();
    inside(g, s);
    sky(g, 4);
    expect(g.experiments.state('nightShelter').trials.has('shelter')).toBe(false);
    g.player.x = s.x + 5;
    sky(g, 4);
    inside(g, s);
    sky(g, 1);
    expect(g.shelterRules.nightAdvice(g)).toMatch(/bed/);
    const moss = bed(g, s, 'dampMoss');
    expect(dryBed(moss)).toBe(false);
    sky(g, NIGHT_HOLD + 4);
    expect(g.hasEvent('shelter.night.warm')).toBe(false);
    expect(g.experiments.state('nightShelter').trials.has('shelter')).toBe(false);
    expect(g.shelterRules.nightAdvice(g)).toMatch(/damp bed/);
    // A dry bed, but the roof loses its leaf layer on one panel: it drips, so you are not sheltered.
    for (let i = 0; i < 4; i++) g.takeBack(moss.id, i);
    g.stow();
    bed(g, s, 'leafLitter');
    g.takeBack(s.id, roles('roofLeaf')[0]);
    g.stow();
    sky(g, NIGHT_HOLD + 4);
    expect(g.hasEvent('shelter.night.warm')).toBe(false);
    expect(g.shelterRules.nightAdvice(g)).toMatch(/drips/);
  });
});

describe('experiment rules (pure)', () => {
  const t = (o: Record<string, string>) => new Map(Object.entries(o));
  it('frame push', () => {
    expect(FRAME_PUSH.conclude(t({ unbraced: 'folds' }))).toBeNull();
    expect(FRAME_PUSH.conclude(t({ unbraced: 'folds', braced: 'holds' }))).toBe('triangles');
    expect(FRAME_PUSH.conclude(t({ unbraced: 'holds', braced: 'holds' }))).toBe('posts');
    expect(FRAME_PUSH.conclude(t({ unbraced: 'folds', braced: 'folds' }))).toBe('cord');
  });
  it('bed materials: bare, damp and one dry bed decide it', () => {
    expect(BED_TEST.conclude(t({ bare: 'most', dryGrass: 'little' }))).toBeNull();
    expect(BED_TEST.conclude(t({ bare: 'most', leafLitter: 'little', dampMoss: 'most' }))).toBe('dry');
    expect(BED_TEST.conclude(t({ bare: 'most', dryGrass: 'little', dampMoss: 'little' }))).toBe('any');
    expect(BED_TEST.conclude(t({ bare: 'little', dryGrass: 'little', dampMoss: 'little' }))).toBe('ground');
  });
  it('night shelter', () => {
    expect(NIGHT_SHELTER.conclude(t({ open: 'fast', shelter: 'steady' }))).toBe('less');
    expect(NIGHT_SHELTER.conclude(t({ open: 'slow', shelter: 'slow' }))).toBe('same');
    expect(NIGHT_SHELTER.conclude(t({ open: 'steady', shelter: 'fast' }))).toBe('more');
  });
  it('every check has exactly one right answer, and every option explains itself', () => {
    for (const d of [FRAME_PUSH, BED_TEST, NIGHT_SHELTER]) {
      expect(d.check.options.filter((o) => o.correct)).toHaveLength(1);
      for (const o of d.check.options) expect(o.why.length).toBeGreaterThan(10);
      for (const text of [d.question, d.principle, d.apply, d.limits, ...d.predictions.map((p) => p.text)]) expect(text).toMatch(/^[\x20-\x7e]*$/);
    }
  });
  it('the roof test keeps its Wait for rain button; the others say what they measure', () => {
    const g = new Game();
    expect(ROOF_LAYERS.testAction!.label(g)).toBe('Keep testing');
    expect(FRAME_PUSH.readout!(g)).toMatch(/Push a post/);
    expect(BED_TEST.readout!(g)).toMatch(/Stand still/);
    expect(NIGHT_SHELTER.readout!(g)).toMatch(/air \d+ C/);
  });
});

describe('the lesson', () => {
  it('runs frame -> push test -> roof ... bed -> bed test -> night', () => {
    const steps = LESSONS[0].steps;
    expect(steps.indexOf('framePush')).toBe(steps.indexOf('frame') + 1);
    expect(steps.slice(-3)).toEqual(['bed', 'bedMaterials', 'nightShelter']);
  });
  it('a save made on the roof step before the push test existed carries on with the roof', () => {
    const { g, s } = leanToGame();
    fill(g, s, 'upright');
    fill(g, s, 'ridge');
    s.pushFirst = false; // as an older save had it: ribs went on without a push
    fill(g, s, 'rib');
    fill(g, s, 'cross');
    for (const i of roles('lash')) g.lashJoint(s.id, i, 1);
    fill(g, s, 'lattice');
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    snap.lessons.completed = snap.lessons.completed.filter((id: string) => id !== 'framePush');
    snap.experiments = { v: 1, states: {} };
    const back = Game.restore(snap);
    expect(back.focus()?.id).toBe('roof');
  });
  it('the lean-to guide follows the lean-to stage by stage', () => {
    const { g, s } = leanToGame();
    const guide = GUIDES.find((x) => x.id === 'shelter')!;
    expect(guide.goal.structure).toBe('leanTo');
    expect(guide.keyItems).toEqual(['pole']);
    expect(g.guide.view(guide).step.id).toBe('posts');
    fill(g, s, 'upright');
    fill(g, s, 'ridge');
    expect(g.guide.view(guide).step.id).toBe('push');
    g.pushFrame(s.id);
    expect(g.guide.view(guide).step.id).toBe('ribs');
    fill(g, s, 'rib');
    fill(g, s, 'cross');
    expect(g.guide.view(guide).step.id).toBe('lash');
  });
  it('bed parts include the first handful (the key) unless it is still to come', () => {
    const b: PlacedStructure = { id: 1, kind: 'bedding', x: 0, z: 0, rotY: 0, key: 'dryGrass', spots: [null, 'dryGrass', null, null], complete: false };
    expect(bedParts(b)).toEqual(['dryGrass', null, 'dryGrass', null, null]);
    expect(bedParts({ ...b, keyOpen: true })[0]).toBeNull();
  });
});
