// Curriculum Phase 1, C5: a fresh game played through all five lessons with the game's own actions.
// Lesson 01 is played entirely by real actions (gathering, building, crafting, lashing, the rain test).
// Later lessons use real actions where the mechanic is cheap to drive here and the same state flags the
// fire, water and food rules set (their mechanics have their own tests) where it is not.
import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, spotWorldPosition } from '../src/game/blueprint.js';
import { Game, type GameEvent } from '../src/game/game.js';
import { HOLD_DRY } from '../src/game/shelter.js';
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
  it('plays Lesson 01 (Shelter) by real actions, then Lessons 02 to 05 in order', () => {
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

    // ---- Lesson 02: Fire (the leftovers go into camp storage first, so the pockets have room)
    g.satchel.clear();
    g.stow();
    for (let i = 0; i < 3; i++) g.gather('twigs');
    // Logs take both hands and do not fit the pouch: carry each one and set it down by the fire.
    for (let i = 0; i < 2; i++) {
      g.gather('logs');
      g.dropItem('logs', -2 - i * 0.4, -2);
    }
    for (let i = 0; i < 2; i++) g.gather('dryGrass');
    for (const id of ['spindle', 'board', 'greenBranch'] as const) g.gather(id);
    run(g, 0.5);
    expect(step(g)).toBe('fire/bowDrill');
    for (const f of ['hasDrill', 'fireLayBuilt', 'emberMade', 'fireLit', 'charcoalMade'] as const) g.setFlag(f);
    g.structures.push({ id: 900, kind: 'firePit', x: -3, z: -3, rotY: 0, key: 'dryStone', spots: [], complete: true });
    run(g, 0.5);
    expect(done).toEqual(['shelter', 'fire']);
    expect(step(g)).toBe('water/pot');

    // ---- Lesson 03: Water
    g.setFlag('potFired');
    g.setFlag('waterSafe');
    run(g, 0.5);
    expect(done).toEqual(['shelter', 'fire', 'water']);
    expect(step(g)).toBe('tools/stoneTools');

    // ---- Lesson 04: Tools
    for (const e of ['tool.knap.flake', 'tool.edge.cut', 'tool.axe.made', 'tool.wedge.split']) g.science(e);
    run(g, 0.5);
    expect(done).toEqual(['shelter', 'fire', 'water', 'tools']);
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
  });
});
