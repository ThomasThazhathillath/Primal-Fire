// Curriculum Phase 1, C5: a fresh game played through all five lessons with the game's own actions.
// Lesson 01 is played entirely by real actions (gathering, building, crafting, lashing, the rain test).
// Lesson 02 too: the bow drill, the pit, the lay, every experiment run by the fire's own rules, charcoal in a
// sealed mound and the closing practical (a second fire lit and kept fed).
// Lesson 03 too: clay test cups, firing on your own fire, stream and rain, the filter's layers (with your own
// charcoal), settling and boiling, and the closing check.
// Lesson 04 too: knapping blows, the Tool Yard experiments, bench crafts, the lever and the boulder challenge.
// Later lessons use real actions where the mechanic is cheap to drive here and the same state flags the
// fire and food rules set (their mechanics have their own tests) where it is not.
import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, spotWorldPosition } from '../src/game/blueprint.js';
import { LAYER_SPOTS } from '../src/game/curriculum/lessons/water/filter.js';
import { KEEP_SECONDS, PRESSURE } from '../src/game/fire.js';
import { Game, type GameEvent } from '../src/game/game.js';
import type { ItemId } from '../src/game/items.js';
import { HOLD_DRY } from '../src/game/shelter.js';
import { knap } from '../src/game/interact.js';
import { YARD } from '../src/game/curriculum/lessons/tools/engineering.js';
import { MOUND_MIN_STREAM, SMOKE_BLUE_AT } from '../src/game/water.js';
import { nearestTreeDistance, streamDistance } from '../src/game/world-layout.js';
import { SITE_FEATURES } from '../src/game/sites.js';
import { GUIDES } from '../src/game/guides.js';
import { NIGHT_HOLD } from '../src/game/curriculum/lessons/shelter/rules.js';

const roles = (role: string) => BLUEPRINTS.leanTo.spots.map((s, i) => (s.role === role ? i : -1)).filter((i) => i >= 0);
const step = (g: Game) => `${g.lessons.lesson?.id ?? '-'}/${g.focus()?.id ?? '-'}`;
/** Place a held key part's outline on the first open ground found near camp. */
function placeOpen(g: Game, kind: Parameters<Game['placeBlueprint']>[0]) {
  for (const [x, z] of [[4, 2], [-4, 3], [3, 5], [-3, -5], [5, -3], [-5, -1], [2, 6], [6, 1]]) {
    const r = g.placeBlueprint(kind, x, z, 0);
    if (r.ok) return r.structure!;
  }
  throw new Error(`no open ground for ${kind}`);
}
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) g.tick(0.25);
};
/** Saw the bow drill at `speed` m/s with `pressure` for `seconds` (frame by frame), then pause. */
function saw(g: Game, seconds: number, speed: number, pressure: number) {
  for (let t = 0; t < seconds && !g.fire.carrying; t += 0.05) {
    g.fire.saw(speed * 0.05, 0.05, pressure, 1);
    g.tick(0.05);
  }
  run(g, 1);
}
/** Take a fuel item into the hand and put it on the fire. */
function feed(g: Game, id: Parameters<Game['addItem']>[0]) {
  g.stow();
  if (g.count(id) === 0) g.addItem(id);
  g.takeOut(id);
  expect(g.fire.addFuel()).toBe(true);
}
/** Keep the fire going for `seconds`, feeding it like a player watching the flames. */
function tend(g: Game, seconds: number) {
  for (let t = 0; t < seconds; t += 5) {
    if (g.fire.stage === 'burning' && (g.fire.hearth.count() < 3 || g.fire.flame < 0.45)) feed(g, g.fire.flame < 0.45 ? 'twigs' : 'logs');
    run(g, 5);
  }
}
/** The result is in: read it, get the check question wrong once, then right. */
function check(g: Game, id: string, wrong: string, right: string) {
  expect(g.experiments.phase(id)).toBe('result');
  g.experiments.acknowledge(id);
  expect(g.experiments.answer(id, wrong)?.correct).toBe(false);
  expect(g.experiments.answer(id, right)?.correct).toBe(true);
  run(g, 0.5);
}
/** Dry, open ground for a charcoal mound within reach of the fire at `pit`. */
function moundSite(pit: { x: number; z: number }) {
  for (let r = 4; r < 12; r += 0.5)
    for (let a = 0; a < 6.28; a += 0.2) {
      const x = pit.x + Math.cos(a) * r;
      const z = pit.z + Math.sin(a) * r;
      if (streamDistance(x, z) > MOUND_MIN_STREAM + 0.5 && nearestTreeDistance(x, z) > 1.5) return { x, z };
    }
  throw new Error('no mound site');
}
/** The same, with the sky moving too (EnvironmentSystem does this in the game). */
const runSky = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) {
    g.env.update(g.time, 0.25);
    g.tick(0.25);
  }
};
/** Take every layer off a bed (the last one clears the plan and its first handful goes back in the bag). */
function stripBed(g: Game, bedId: number) {
  for (let i = 0; i < BLUEPRINTS.bedding.spots.length; i++) g.takeBack(bedId, i);
  g.stow();
  expect(g.structures.some((t) => t.id === bedId)).toBe(false);
}
/** Lay a whole bed of one material at (x, z) and return it. */
function layBed(g: Game, item: 'leafLitter' | 'dryGrass' | 'dampMoss', x: number, z: number) {
  g.takeOut(item);
  const r = g.placeBlueprint('bedding', x, z, 0);
  expect(r.ok, r.ok ? '' : r.message).toBe(true);
  for (let i = 0; i < BLUEPRINTS.bedding.spots.length; i++) expect(g.fillSpot(r.structure!.id, i, item)).toBe(true);
  expect(r.structure!.complete).toBe(true);
  return r.structure!;
}

describe('a fresh game through the curriculum', () => {
  it('plays Lessons 01 (Shelter) and 02 (Fire) by real actions, then Lessons 03 to 05 in order', () => {
    const g = new Game();
    const done: string[] = [];
    g.on((e: GameEvent) => e.type === 'lessonComplete' && done.push(e.lesson));
    expect(step(g)).toBe('shelter/firstStone');
    expect(g.steps.view()!.lesson).toMatchObject({ n: 1, name: 'Shelter' });

    // ---- Lesson 01: stones, workbench, cord, lean-to, roof, rain test, bed
    for (let i = 0; i < 4; i++) g.gather('dryStone');
    g.gather('slab');
    run(g, 0.5);
    expect(step(g)).toBe('shelter/workbench');
    // While Lesson 01 builds the workbench, a held stone offers only the workbench outline.
    expect(g.wantedStructure()).toBe('workbench');
    const bench = g.placeFromBook('workbench', 0, -1.5).structure!;
    for (let i = 0; i < 3; i++) {
      const p = spotWorldPosition(bench, i);
      g.fillSpot(bench.id, i, undefined, { x: p.x, z: p.z });
    }
    g.takeOut('slab');
    g.placeKey(bench.id, bench.x, bench.z, 2);
    expect(bench.complete).toBe(true);
    g.learn('bench'); // poking the bench opens its recipes
    run(g, 0.5);
    expect(step(g)).toBe('shelter/cord');
    // Cord twisted by hand counts.
    g.addItem('fibers');
    g.takeOut('fibers');
    for (let i = 0; i < 10 && !g.flag('cordMade'); i++) g.work(0.3);
    run(g, 0.5);
    expect(step(g)).toBe('shelter/pole');
    expect(g.hasEvent('story.ch2.begin')).toBe(true); // the shelter story opens with the pole step
    expect(g.wantedStructure()).toBe('leanTo');

    for (const [id, n] of [['pole', 3], ['greenBranch', 5], ['cord', 3], ['twigs', 4], ['bark', 3], ['leafLitter', 8], ['dryGrass', 8], ['diggingStick', 1], ['dampMoss', 5]] as const) g.addItem(id, n);
    g.takeOut('pole');
    // Site choice: a hollow is turned down (cold air and water collect there), a slight rise is good ground.
    const hollow = SITE_FEATURES.find((f) => f.kind === 'hollow')!;
    const low = g.placeBlueprint('leanTo', hollow.x, hollow.z, 0);
    expect(low.ok).toBe(false);
    expect(!low.ok && low.reason).toBe('low');
    expect(g.hasEvent('shelter.site.hollow')).toBe(true);
    expect(g.guide.view(GUIDES.find((x) => x.id === 'shelter')!).failure?.code).toBe('site.lowGround');
    expect(g.held).toBe('pole');
    const rise = SITE_FEATURES.find((f) => f.kind === 'rise')!;
    const placed = g.placeBlueprint('leanTo', rise.x, rise.z, 0);
    expect(placed.ok).toBe(true);
    const s = placed.structure!;
    expect(g.hasEvent('shelter.site.raised')).toBe(true);
    run(g, 0.5);
    expect(step(g)).toBe('shelter/frame');
    // The lean-to guide follows the lean-to now (it used to point at the old four-spot shelter).
    expect(g.guide.current()?.guide.goal.structure).toBe('leanTo');
    // The frame test opens with the frame: posts and ridge, then the bare frame must be pushed before any rib.
    expect(g.experiments.phase('framePush')).toBe('predict');
    expect(g.experiments.predict('framePush', 'triangles')).toBe(true);
    for (const role of ['upright', 'ridge']) for (const i of roles(role)) expect(g.fillSpot(s.id, i)).toBe(true);
    expect(s.pushFirst).toBe(true);
    expect(g.fillSpot(s.id, roles('rib')[0])).toBe(false);
    expect(g.pushFrame(s.id)).toMatchObject({ bracing: 'unbraced', holds: false });
    expect(g.hasEvent('shelter.frame.racked')).toBe(true);
    for (const role of ['rib', 'cross']) for (const i of roles(role)) expect(g.fillSpot(s.id, i)).toBe(true);
    expect(g.pushFrame(s.id)).toMatchObject({ bracing: 'braced', holds: true });
    expect(g.experiments.phase('framePush')).toBe('result');
    expect(g.experiments.predictedRight('framePush')).toBe(true);
    for (const i of roles('lash')) for (let k = 0; k < 40 && g.lashJoint(s.id, i, 0.05) < 1; k++);
    for (const i of roles('lattice')) expect(g.fillSpot(s.id, i)).toBe(true);
    run(g, 0.5);
    expect(step(g)).toBe('shelter/framePush');
    g.experiments.acknowledge('framePush');
    expect(g.experiments.answer('framePush', 'thicker')?.correct).toBe(false);
    expect(g.experiments.answer('framePush', 'diagonal')?.correct).toBe(true);
    run(g, 0.5);
    expect(step(g)).toBe('shelter/roof');
    // Bark everywhere, leaves on two panels: the third panel has a single layer (a fair comparison).
    for (const i of roles('roofBark')) expect(g.fillSpot(s.id, i)).toBe(true);
    const leaves = roles('roofLeaf');
    for (const i of leaves.slice(0, 2)) expect(g.fillSpot(s.id, i)).toBe(true);
    run(g, 0.5);
    expect(step(g)).toBe('shelter/rainTest');
    // The roof-layer experiment opened with the roof: predict before the rain comes.
    expect(g.experiments.phase('roofLayers')).toBe('predict');
    expect(g.experiments.predict('roofLayers', 'two')).toBe(true);
    // Stand inside; the rain comes, the channel plan appears, dig it, stay dry.
    g.player.x = s.x;
    g.player.z = s.z - 0.2;
    run(g, 30);
    expect(g.shelterTest.raining).toBe(true);
    // The single-layer panel drips; patch it with a second layer (both trials are now real evidence).
    expect(g.experiments.state('roofLayers').trials.get('1')).toBe('leaks');
    expect(g.fillSpot(s.id, leaves[2])).toBe(true);
    run(g, 0.5);
    expect(g.experiments.phase('roofLayers')).toBe('result');
    expect(g.experiments.predictedRight('roofLayers')).toBe(true);
    const drain = g.structures.find((t) => t.kind === 'drainage')!;
    g.takeOut('diggingStick');
    for (let i = 0; i < 3; i++) expect(g.fillSpot(drain.id, i)).toBe(true);
    g.stow();
    run(g, HOLD_DRY + 5);
    expect(g.flag('shelterTested')).toBe(true);
    expect(step(g)).toBe('shelter/roofLayers');
    g.experiments.acknowledge('roofLayers');
    expect(g.experiments.answer('roofLayers', 'flat')?.correct).toBe(false);
    expect(g.experiments.answer('roofLayers', 'layer')?.correct).toBe(true);
    run(g, 0.5);
    expect(step(g)).toBe('shelter/bed');
    // The bed test opens with the bed. Resting under the roof on bare ground first: most heat flows into it.
    expect(g.experiments.phase('bedMaterials')).toBe('predict');
    expect(g.experiments.predict('bedMaterials', 'dry')).toBe(true);
    g.player.x = s.x;
    g.player.z = s.z - 0.2;
    run(g, 4);
    expect(g.experiments.state('bedMaterials').trials.get('bare')).toBe('most');
    g.addItem('leafLitter', 5);
    const leafBed = layBed(g, 'leafLitter', s.x, s.z - 0.2);
    run(g, 0.5);
    expect(step(g)).toBe('shelter/bedMaterials');
    run(g, 4);
    expect(g.experiments.state('bedMaterials').trials.get('leafLitter')).toBe('little');
    expect(g.hasEvent('shelter.bed.dry')).toBe(true);
    // A whole bed of damp moss: the cold comes through, and it dampens you.
    stripBed(g, leafBed.id);
    const mossBed = layBed(g, 'dampMoss', s.x, s.z - 0.2);
    run(g, 4);
    expect(g.experiments.state('bedMaterials').trials.get('dampMoss')).toBe('most');
    expect(g.body.wet).toBeGreaterThan(0);
    expect(g.experiments.phase('bedMaterials')).toBe('result');
    expect(g.experiments.predictedRight('bedMaterials')).toBe(true);
    expect(g.hasEvent('shelter.bed.compared')).toBe(true);
    g.experiments.acknowledge('bedMaterials');
    expect(g.experiments.answer('bedMaterials', 'moss')?.correct).toBe(false);
    expect(g.experiments.answer('bedMaterials', 'leaves')?.correct).toBe(true);
    run(g, 0.5);
    expect(step(g)).toBe('shelter/nightShelter');
    // The night: rest until the cold of midnight, stand in the open, then rest in the shelter.
    expect(g.experiments.phase('nightShelter')).toBe('predict');
    expect(g.experiments.predict('nightShelter', 'less')).toBe(true);
    expect(g.waitForNight()).not.toBeNull();
    g.player.x = s.x + 5;
    g.player.z = s.z + 4;
    runSky(g, 4);
    expect(g.shelterRules.lastNight?.cold).toBe(true);
    const openTrial = g.experiments.state('nightShelter').trials.get('open');
    expect(openTrial === 'fast' || openTrial === 'slow').toBe(true);
    expect(g.hasEvent('shelter.night.exposed')).toBe(true);
    // On the damp moss bed the night is not steady: the card says why.
    g.player.x = s.x;
    g.player.z = s.z - 0.2;
    runSky(g, 4);
    expect(g.hasEvent('shelter.night.warm')).toBe(false);
    expect(g.shelterRules.nightAdvice(g)).toMatch(/damp bed/);
    // A dry grass bed instead: warmth holds steady, and the shelter is proven.
    stripBed(g, mossBed.id);
    layBed(g, 'dryGrass', s.x, s.z - 0.2);
    runSky(g, NIGHT_HOLD + 30);
    expect(g.experiments.state('nightShelter').trials.get('shelter')).toBe('steady');
    expect(g.hasEvent('shelter.night.warm')).toBe(true);
    expect(g.experiments.phase('nightShelter')).toBe('result');
    expect(g.experiments.predictedRight('nightShelter')).toBe(true);
    g.experiments.acknowledge('nightShelter');
    expect(g.experiments.answer('nightShelter', 'hollow')?.correct).toBe(false);
    expect(g.experiments.answer('nightShelter', 'shelter')?.correct).toBe(true);
    run(g, 0.5);
    expect(done).toEqual(['shelter']);
    expect(step(g)).toBe('fire/wood');
    // From Lesson 02 a held part prefers, but no longer limits, what it builds.
    expect(g.lessons.buildFocus()).toBeUndefined();

    // ---- Lesson 02: Fire, by real actions (the leftovers go into camp storage first, so the pockets have room)
    g.satchel.clear();
    g.stow();
    for (let i = 0; i < 3; i++) g.gather('twigs');
    // Logs take both hands and do not fit the pouch: carry each one and set it down by the fire.
    const logDrops = [0, 1].map((i) => {
      g.gather('logs');
      return g.dropItem('logs', -2 - i * 0.4, -2)!;
    });
    for (let i = 0; i < 2; i++) g.gather('dryGrass');
    for (const id of ['spindle', 'board', 'greenBranch'] as const) g.gather(id);
    run(g, 0.5);
    expect(step(g)).toBe('fire/bowDrill');
    // The bow drill at the workbench (the cord was twisted in Lesson 01).
    g.addItem('cord');
    g.player.x = bench.x;
    g.player.z = bench.z + 1;
    expect(g.craft('bowDrill')).toBe(true);
    run(g, 0.5);
    expect(step(g)).toBe('fire/firePit');
    g.addItem('dryStone', 4);
    g.takeOut('dryStone');
    const pit = placeOpen(g, 'firePit');
    for (let i = 0; i < pit.spots.length; i++) g.fillSpot(pit.id, i);
    expect(pit.complete).toBe(true);
    g.stow();
    run(g, 0.5);
    expect(step(g)).toBe('fire/fireLay');
    g.player.x = pit.x + 1;
    g.player.z = pit.z;
    // Tinder and twigs from the bag, then each log carried from where it was set down.
    expect(g.fire.addFuel()).toBe(true);
    for (let i = 0; i < 3; i++) expect(g.fire.addFuel()).toBe(true);
    for (const d of logDrops) {
      expect(g.pickUpDrop(d.id)).toBe(true);
      expect(g.fire.addFuel()).toBe(true);
    }
    run(g, 0.5);
    expect(step(g)).toBe('fire/ember');
    // The stroke-speed experiment opens as you make your first ember: slow strokes, then fast ones.
    expect(g.experiments.phase('drillSpeed')).toBe('predict');
    expect(g.experiments.predict('drillSpeed', 'faster')).toBe(true);
    g.takeOut('bowDrill');
    saw(g, 5, 0.4, PRESSURE.firm);
    expect(g.experiments.state('drillSpeed').trials.get('slow')).toBe('nosmoke');
    saw(g, 10, 1.5, PRESSURE.firm);
    expect(g.fire.carrying).toBe(true);
    g.stow();
    expect(g.fire.transferEmber()).toBe(true);
    for (let i = 0; i < 20 && g.fire.stage !== 'burning'; i++) g.fire.fan(0.8, 0.25);
    run(g, 0.5);
    expect(step(g)).toBe('fire/drillSpeed');
    check(g, 'drillSpeed', 'rest', 'faster');
    expect(step(g)).toBe('fire/drillPressure');
    run(g, 0.5);
    expect(g.experiments.predict('drillPressure', 'firm')).toBe(true);
    // Beside the burning fire the drill still saws (no second ember): fast with a light touch, then firm.
    g.takeOut('bowDrill');
    saw(g, 5, 2, PRESSURE.light);
    saw(g, 5, 2, PRESSURE.firm);
    g.stow();
    check(g, 'drillPressure', 'speed', 'press');
    expect(step(g)).toBe('fire/tinderDamp');
    tend(g, 5);
    expect(g.experiments.predict('tinderDamp', 'dry')).toBe(true);
    g.gather('dampMoss');
    feed(g, 'dampMoss');
    feed(g, 'dryGrass');
    tend(g, 20);
    check(g, 'tinderDamp', 'pile', 'dry');
    expect(step(g)).toBe('fire/fuelSize');
    run(g, 0.5);
    expect(g.experiments.predict('fuelSize', 'thin')).toBe(true);
    feed(g, 'twigs');
    feed(g, 'logs');
    tend(g, 20);
    check(g, 'fuelSize', 'log', 'kindling');
    expect(step(g)).toBe('fire/woodType');
    run(g, 0.5);
    expect(g.experiments.predict('woodType', 'dead')).toBe(true);
    feed(g, 'dryBranch');
    feed(g, 'greenBranch');
    tend(g, 20);
    expect(g.notebook).toContain('f_smoke');
    check(g, 'woodType', 'green', 'dead');
    expect(step(g)).toBe('fire/charcoal');
    run(g, 0.5);
    expect(g.experiments.predict('charcoalAir', 'less')).toBe(true);
    // A log on the open fire burns away to ash while a sealed mound turns logs to charcoal.
    feed(g, 'logs');
    const site = moundSite(pit);
    g.stow();
    g.addItem('logs', 2);
    g.addItem('diggingStick');
    g.takeOut('diggingStick');
    g.player.x = site.x;
    g.player.z = site.z;
    expect(g.water.perform('digMound')).toBe(true);
    g.stow();
    g.addItem('clay');
    g.takeOut('clay');
    expect(g.water.perform('sealMound')).toBe(true);
    expect(g.water.perform('lightMound')).toBe(true);
    tend(g, SMOKE_BLUE_AT + 5);
    expect(g.water.smoke()).toBe('blue');
    expect(g.water.perform('openMound')).toBe(true);
    expect(g.flag('charcoalMade')).toBe(true);
    tend(g, 100);
    expect(g.experiments.state('charcoalAir').trials.get('open')).toBe('ash');
    run(g, 0.5);
    expect(step(g)).toBe('fire/charcoalAir');
    check(g, 'charcoalAir', 'open', 'wait');
    expect(step(g)).toBe('fire/airflow');
    run(g, 0.5);
    expect(g.experiments.predict('airflow', 'air')).toBe(true);
    g.player.x = pit.x + 1;
    g.player.z = pit.z;
    if (g.fire.flame < 0.45) tend(g, 10);
    for (let i = 0; i < 8; i++) g.fire.fan(1, 0.2);
    run(g, 0.5);
    g.takeOut('diggingStick');
    expect(g.runIntent('diggingStick', pit.x, pit.z, 'touch')).toBe('smotherFire');
    run(g, 10);
    expect(g.fire.stage).toBe('out');
    check(g, 'airflow', 'fan', 'earth');
    expect(step(g)).toBe('fire/fireOnOwn');
    // The practical: a new fire from a cold pit, lit and kept fed on your own.
    g.stow();
    g.addItem('dryGrass');
    g.addItem('twigs', 3);
    g.addItem('logs', 2);
    while (!g.fire.layBuilt) expect(g.fire.addFuel()).toBe(true);
    g.takeOut('bowDrill');
    saw(g, 10, 1.5, PRESSURE.firm);
    g.stow();
    expect(g.fire.transferEmber()).toBe(true);
    for (let i = 0; i < 20 && g.fire.stage !== 'burning'; i++) g.fire.fan(0.8, 0.25);
    expect(g.fire.lights).toBe(2);
    tend(g, KEEP_SECONDS + 10);
    expect(g.fire.kept).toBe(true);
    run(g, 0.5);
    expect(done).toEqual(['shelter', 'fire']);
    expect(step(g)).toBe('water/clayTemper');
    for (const id of ['f_drill', 'f_speed', 'f_pressure', 'f_steam', 'f_ladder', 'f_smoke', 'f_fanned', 'f_smother', 'f_night', 'c_success']) expect(g.notebook, id).toContain(id);

    // ---- Lesson 03: Water, by real actions on the player's own fire (kept fed) with the charcoal from the
    // player's own mound: clay test cups, the pot, stream and rain, the filter's order, settle / filter / boil,
    // and the closing check. Every result comes from the water and clay rules.
    expect(g.fire.stage).toBe('burning');
    /** Feed the fire when it runs low, keeping whatever is in hand. */
    const keepFire = () => {
      if (g.fire.stage !== 'burning' || (g.fire.hearth.count() >= 3 && g.fire.flame >= 0.45)) return;
      const hand = g.held;
      feed(g, g.fire.flame < 0.45 ? 'twigs' : 'logs');
      if (hand) g.takeOut(hand);
    };
    const wait = (seconds: number) => {
      for (let t = 0; t < seconds; t += 1) {
        keepFire();
        run(g, 1);
      }
    };
    const atPit = () => g.setPlayerPosition(pit.x + 0.8, pit.z);
    const atBench = () => g.setPlayerPosition(bench.x, bench.z + 0.8);
    const stream = { x: 4.4, z: 3 };
    const act = (id: Parameters<Game['water']['perform']>[0], at = g.player) => expect(g.water.perform(id, at), id).toBe(true);
    const craft = (id: string) => {
      atBench();
      expect(g.startBench(id, bench.id)).toBe(true);
      for (let i = 0; g.bench && i < 10000; i++) g.benchWork(g.bench.step!.motion, 0.05);
    };
    const ownCharcoal = g.count('charcoal');
    expect(ownCharcoal).toBeGreaterThan(0);
    wait(1);
    expect(g.experiments.phase('clayTemper')).toBe('predict');
    expect(g.experiments.predict('clayTemper', 'sand')).toBe(true);
    wait(1);
    // The firing test opens right after, so the same test cups serve both.
    expect(g.experiments.phase('potFiring')).toBe('predict');
    expect(g.experiments.predict('potFiring', 'dry')).toBe(true);
    g.addItem('clay', 4);
    g.addItem('sand', 2);
    craft('clayTest');
    expect(g.water.clay.pieces.map((p) => p.kind)).toEqual(['plain', 'temper', 'temper']);
    const clayLeft = g.count('clay');
    // A damp sand cup goes straight into the fire: steam bursts it.
    atPit();
    g.stow();
    expect(g.water.available(g.player, null)?.id).toBe('fireTest');
    act('fireTest');
    wait(3);
    expect(g.experiments.state('potFiring').trials.get('damp')).toBe('burst');
    // The clay-only cup cracks as it dries (its clay comes back); the other sand cup dries whole.
    wait(30);
    expect(g.experiments.state('clayTemper').trials.get('none')).toBe('cracked');
    expect(g.experiments.phase('clayTemper')).toBe('result');
    expect(g.experiments.predictedRight('clayTemper')).toBe(true);
    expect(g.hasEvent('pottery.untempered.crack')).toBe(true);
    expect(g.count('clay')).toBe(clayLeft + 1);
    g.stow();
    act('fireTest');
    wait(7);
    expect(g.experiments.phase('potFiring')).toBe('result');
    for (const id of ['clayTemper', 'potFiring']) g.experiments.acknowledge(id);
    expect(g.experiments.answer('clayTemper', 'fire')?.correct).toBe(false);
    expect(g.experiments.answer('clayTemper', 'temper')?.correct).toBe(true);
    expect(g.experiments.answer('potFiring', 'wait')?.correct).toBe(true);
    wait(1);
    expect(step(g)).toBe('water/pot');
    // The pot: tempered, dried in the bag, fired in the player's own fire.
    craft('pot');
    wait(46);
    expect(g.flag('potDry')).toBe(true);
    g.stow();
    g.takeOut('pot');
    atPit();
    act('firePot');
    wait(16);
    expect(g.flag('potFired')).toBe(true);
    wait(1);
    expect(step(g)).toBe('water/waterSource');
    // Stream water is muddy; rain off the roof is clearer.
    expect(g.experiments.predict('waterSource', 'rain')).toBe(true);
    act('fillPot', stream);
    expect(g.water.potWater).toBe('raw');
    act('pourOut');
    const rain = g.experiments.def('waterSource')!.testAction!;
    expect(rain.label(g)).toBe('Wait for rain');
    expect(rain.run(g)).toMatch(/Clouds gather/);
    for (let t = 0; t < 2; t += 0.25) {
      g.tick(0.25);
      g.env.update(g.time, 0.25);
    }
    const edge = g.water.roofEdge()!;
    g.setPlayerPosition(edge.x, edge.z);
    expect(g.water.available(g.player, 'pot')?.id).toBe('catchRain');
    act('catchRain');
    expect(g.water.potWater).toBe('rain');
    expect(g.notebook).toContain('w_cycle');
    wait(1);
    expect(g.experiments.phase('waterSource')).toBe('result');
    g.experiments.acknowledge('waterSource');
    expect(g.experiments.answer('waterSource', 'boil')?.correct).toBe(true);
    act('pourOut');
    wait(1);
    expect(step(g)).toBe('water/filterOrder');
    // The filter: legs and spout, then the layers in the order they go in (bottom first), with your own charcoal.
    expect(g.experiments.predict('filterOrder', 'coarse')).toBe(true);
    g.addItem('forkedStick', 3);
    g.addItem('cane');
    for (const [id, n] of [['cloth', 1], ['sand', 1], ['gravel', 1]] as const) g.addItem(id, n);
    g.stow();
    g.takeOut('forkedStick');
    const f = placeOpen(g, 'filter');
    for (let i = 0; i < 3; i++) expect(g.fillSpot(f.id, i)).toBe(true);
    const layer = (k: number, id: ItemId) => expect(g.fillSpot(f.id, LAYER_SPOTS[k], id)).toBe(true);
    // First try: sand on top of the gravel.
    (['cloth', 'charcoal', 'gravel', 'sand'] as const).forEach((id, k) => layer(k, id));
    expect(f.complete).toBe(true);
    expect(g.count('charcoal')).toBe(ownCharcoal - 1);
    const pour = () => {
      act('fillPot', stream);
      act('pourFilter', { x: f.x, z: f.z });
    };
    g.takeOut('pot');
    pour();
    expect(g.water.lastFilter?.flow).toBe('clogged');
    expect(g.notebook).toContain('w_clog');
    // Swap the top two layers: gravel above sand.
    for (const k of [3, 2]) {
      expect(g.takeBack(f.id, LAYER_SPOTS[k])).toBe(true);
      g.stow();
    }
    layer(2, 'sand');
    layer(3, 'gravel');
    g.takeOut('pot');
    pour();
    expect(g.water.potWater).toBe('filtered');
    wait(1);
    expect(g.experiments.phase('filterOrder')).toBe('result');
    expect(g.experiments.predictedRight('filterOrder')).toBe(true);
    g.experiments.acknowledge('filterOrder');
    expect(g.experiments.answer('filterOrder', 'clear')?.correct).toBe(false);
    expect(g.experiments.answer('filterOrder', 'boil')?.correct).toBe(true);
    act('pourOut');
    wait(1);
    expect(step(g)).toBe('water/treatment');
    // Settle, filter, boil unfiltered, then filter and boil (on the player's own fire).
    expect(g.experiments.predict('treatment', 'each')).toBe(true);
    act('fillPot', stream);
    g.stow();
    wait(16);
    expect(g.water.potWater).toBe('settled');
    g.takeOut('pot');
    atPit();
    act('boil');
    wait(13);
    expect(g.water.potWater).toBe('boiledRaw');
    pour();
    expect(g.water.potWater).toBe('filtered');
    atPit();
    act('boil');
    wait(13);
    expect(g.water.potWater).toBe('safe');
    expect(g.flag('waterSafe')).toBe(true);
    wait(1);
    expect(g.experiments.phase('treatment')).toBe('result');
    expect(g.experiments.predictedRight('treatment')).toBe(true);
    g.experiments.acknowledge('treatment');
    expect(g.experiments.answer('treatment', 'mud')?.correct).toBe(true);
    wait(1);
    expect(step(g)).toBe('water/waterSupply');
    // The closing check opens straight to its question once the setup works.
    wait(1);
    expect(g.experiments.phase('waterSupply')).toBe('check');
    expect(g.experiments.answer('waterSupply', 'clear')?.correct).toBe(false);
    expect(g.experiments.answer('waterSupply', 'limits')?.correct).toBe(true);
    wait(1);
    expect(done).toEqual(['shelter', 'fire', 'water']);
    expect(step(g)).toBe('tools/stoneTools');

    // ---- Lesson 04: Tools, by real actions. Every experiment is fed by the knapping and Tool Yard rules.
    const answer = (id: string) => {
      g.experiments.acknowledge(id);
      const right = g.experiments.def(id)!.check.options.find((o) => o.correct)!.id;
      expect(g.experiments.answer(id, right)?.correct).toBe(true);
      run(g, 0.5);
    };
    const holdItem = (id: Parameters<Game['addItem']>[0]) => {
      g.stow();
      g.addItem(id);
      expect(g.takeOut(id)).toBe(true);
    };
    const make = (recipe: string) => {
      expect(g.startBench(recipe, bench.id)).toBe(true);
      for (let k = 0; k < 400 && g.bench; k++) g.benchWork(g.bench.step!.motion, 0.25);
      expect(g.bench).toBeNull();
    };
    // Knapping: the strike-angle experiment opened with the step. Two angled flakes, one square blow.
    expect(g.experiments.phase('strikeAngle')).toBe('predict');
    g.experiments.predict('strikeAngle', 'angled');
    g.satchel.clear();
    g.addItem('dryStone');
    holdItem('flint');
    for (const angle of [50, 89, 45]) {
      const r = knap(2, 0.01, angle);
      g.yard.knapStrike(2, 0.01, angle, r.outcome);
      if (r.outcome === 'flake') g.work(1);
    }
    expect(g.count('flake')).toBe(2);
    run(g, 0.5);
    expect(step(g)).toBe('tools/strikeAngle');
    expect(g.experiments.predictedRight('strikeAngle')).toBe(true);
    answer('strikeAngle');
    expect(step(g)).toBe('tools/cutting');
    expect(g.takeOut('flake')).toBe(true);
    g.gather('cane');
    run(g, 0.5);
    expect(step(g)).toBe('tools/cordTest');
    // At the Tool Yard by Split Rock: lift the test stone with loose fibres, then with cord.
    g.stow();
    g.setPlayerPosition(YARD.x, YARD.z);
    run(g, 0.5);
    g.experiments.predict('cordStrength', 'twisted');
    holdItem('fibers');
    expect(g.yard.liftTestStone()).toBe('snaps');
    holdItem('cord');
    expect(g.yard.liftTestStone()).toBe('holds');
    g.stow();
    answer('cordStrength');
    expect(step(g)).toBe('tools/axe');
    // Haft an axe at the workbench and split a log with it (the axe in the bag drives in like a wedge).
    for (const [id, n] of [['dryStone', 2], ['spindle', 3], ['cord', 3]] as const) g.addItem(id, n);
    make('axe');
    run(g, 0.5);
    expect(step(g)).toBe('tools/split');
    g.gather('logs');
    g.dropItem('logs', YARD.x + 1, YARD.z + 1);
    run(g, 0.5);
    expect(step(g)).toBe('tools/toolkit');
    make('knife');
    make('hammer');
    run(g, 0.5);
    expect(step(g)).toBe('tools/frameTest');
    // A square frame folds under a push; with a diagonal brace it stands.
    g.experiments.predict('frameBracing', 'braced');
    g.addItem('spindle', 4);
    for (let i = 0; i < 3; i++) g.yard.addFramePiece();
    expect(g.yard.pushFrame(0.1)).toBe('folds');
    expect(g.yard.addFramePiece()).toBe('raised');
    expect(g.yard.addFramePiece()).toBe('brace');
    expect(g.yard.pushFrame(0.1)).toBe('holds');
    answer('frameBracing');
    expect(step(g)).toBe('tools/leverTest');
    // The lever: hands alone cannot; the pivot near your hands cannot; close to the boulder it lifts.
    g.experiments.predict('leverPivot', 'near');
    expect(g.yard.rigLever()).toBe('needPole');
    holdItem('pole');
    expect(g.yard.rigLever()).toBe('set');
    g.yard.setPivot('far');
    g.yard.beginPush();
    expect(g.yard.push(0.3)!.moves).toBe(false);
    g.yard.setPivot('near');
    g.yard.beginPush();
    expect(g.yard.push(0.1)!.moves).toBe(true);
    answer('leverPivot');
    expect(step(g)).toBe('tools/boulder');
    // The engineering challenge: roll the boulder clear of the flint seam, setting the lever again after each roll.
    for (let i = 0; i < 2; i++) {
      g.yard.rigLever();
      g.yard.beginPush();
      g.yard.push(0.4);
    }
    expect(g.yard.seamOpen()).toBe(true);
    run(g, 0.5);
    expect(step(g)).toBe('tools/toolCheck');
    // The tool test: the axe already chopped; the knife cuts fibres; the hammer breaks flint from the seam.
    g.gather('fibers');
    expect(g.yard.takeFlint()).toBe(true);
    run(g, 0.5);
    expect(done).toEqual(['shelter', 'fire', 'water', 'tools']);
    for (const id of ['t_crumble', 't_twist', 't_kit', 'b_triangle', 't_pivot', 't_lever']) expect(g.notebook, id).toContain(id);
    expect(step(g)).toBe('food/spear');

    // ---- Lesson 05: Food & Navigation
    g.addItem('fishingSpear');
    for (const e of ['food.fish.caught', 'food.fish.opaque', 'farm.harvested']) g.science(e);
    g.living.add('hiddenTrail');
    g.setFlag('finale');
    run(g, 0.5);
    expect(done).toEqual(['shelter', 'fire', 'water', 'tools', 'food']);
    expect(g.lessons.done).toBe(true);
    expect(g.focus()).toBeNull();
    expect(g.guiding()).toBe(false);

    // Everything survives a save and reload.
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.lessons.done).toBe(true);
    expect([...back.lessons.lessonDone]).toEqual(['shelter', 'fire', 'water', 'tools', 'food']);
  }, 120_000);
});
