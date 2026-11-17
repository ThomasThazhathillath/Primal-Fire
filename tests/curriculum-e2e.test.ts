// Curriculum Phase 1, C5: a fresh game played through all five lessons with the game's own actions.
// Lesson 01 is played entirely by real actions (gathering, building, crafting, lashing, the rain test).
// Later lessons use real actions where the mechanic is cheap to drive here and the same state flags the
// fire, water and food rules set (their mechanics have their own tests) where it is not.
import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, spotWorldPosition } from '../src/game/blueprint.js';
import { Game, type GameEvent } from '../src/game/game.js';
import { HOLD_DRY } from '../src/game/shelter.js';
import { FINAL_CHECK } from '../src/game/curriculum/lessons/food/field.js';
import { campOf } from '../src/game/directions.js';
import { FORAGE_PATCHES } from '../src/game/forage.js';
import type { ItemId } from '../src/game/items.js';
import { LANDMARK_BY_ID } from '../src/game/world-layout.js';

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

describe('a fresh game through the curriculum', () => {
  it('plays Lesson 01 (Shelter) by real actions, then Lessons 02 to 05 in order', { timeout: 120_000 }, () => {
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

    for (const [id, n] of [['pole', 3], ['greenBranch', 5], ['cord', 3], ['twigs', 4], ['bark', 3], ['leafLitter', 8], ['dryGrass', 8], ['diggingStick', 1]] as const) g.addItem(id, n);
    g.takeOut('pole');
    const s = placeOpen(g, 'leanTo');
    run(g, 0.5);
    expect(step(g)).toBe('shelter/frame');
    for (const role of ['upright', 'ridge', 'rib', 'cross']) for (const i of roles(role)) expect(g.fillSpot(s.id, i)).toBe(true);
    for (const i of roles('lash')) for (let k = 0; k < 40 && g.lashJoint(s.id, i, 0.05) < 1; k++);
    for (const i of roles('lattice')) expect(g.fillSpot(s.id, i)).toBe(true);
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
    g.addItem('leafLitter', 5);
    g.takeOut('leafLitter');
    const bed = g.placeBlueprint('bedding', s.x, s.z - 0.2, 0);
    expect(bed.ok, bed.ok ? '' : bed.message).toBe(true);
    for (let i = 0; i < BLUEPRINTS.bedding.spots.length; i++) g.fillSpot(bed.structure!.id, i);
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

    // ---- Lesson 05: Food, Navigation & Long-Term Survival. The new steps by real actions: judging plants,
    // eating, carrying food, picking patches, looking at the sky and the sun, the trek and the check.
    // (The running game updates the weather every frame; here `live` does it.)
    const live = (seconds: number, dt = 0.25) => {
      for (let t = 0; t < seconds; t += dt) {
        g.tick(dt);
        g.env.update(g.time, dt);
      }
    };
    const view = (yaw: number, pitch: number, seconds: number) => {
      for (let t = 0; t < seconds; t += 0.1) {
        g.field.observeView(yaw, pitch, 0.1);
        live(0.1, 0.1);
      }
    };
    const eat = (id: ItemId) => {
      g.addItem(id);
      g.takeOut(id);
      expect(g.food.perform(g.food.available(g.player, id)!)).toBe(true);
    };
    const predict = (id: string, choice: string) => {
      live(0.5);
      expect(step(g)).toBe(`food/${id}`);
      expect(g.experiments.predict(id, choice)).toBe(true);
    };
    const patches = FORAGE_PATCHES.filter((p) => p.truth === 'food');
    /** Walk to a patch, look closely, and judge it on the card. */
    const judge = (p: (typeof FORAGE_PATCHES)[number], option: number) => {
      g.setPlayerPosition(p.x, p.z);
      expect(g.food.perform(g.food.available(g.player, null)!)).toBe(true);
      expect(g.field.prompt?.key).toBe(`judge:${p.id}`);
      g.field.choose(option);
      expect(g.field.prompt?.action).toBe('Done');
      g.field.act();
    };
    const sunYaw = () => Math.atan2(-g.env.sunDir[0], -g.env.sunDir[2]);
    g.env.skipTo(g.time, 8);
    g.addItem('fishingSpear');
    for (const e of ['food.fish.caught', 'food.fish.opaque']) g.science(e);
    // Judge plants: a food plant (safe), a look-alike (not safe).
    predict('plantId', 'all');
    judge(patches[0], 0);
    judge(FORAGE_PATCHES.find((p) => p.truth === 'lookalike')!, 1);
    expect(g.experiments.phase('plantId')).toBe('result');
    g.experiments.acknowledge('plantId');
    g.experiments.answer('plantId', 'no');
    // Nutrition: eat berries, nuts and fish and let the body digest each.
    predict('nutrition', 'slow');
    eat('berries');
    live(20);
    eat('nuts');
    live(160);
    eat('cookedFish');
    live(130);
    expect(g.experiments.state('nutrition').supported).toBe('slow');
    g.experiments.acknowledge('nutrition');
    g.experiments.answer('nutrition', 'nuts');
    // Grow food (the farm has its own tests), then weave the basket.
    g.science('farm.harvested');
    live(0.5);
    expect(step(g)).toBe('food/basket');
    g.addItem('cane', 3);
    g.addItem('cord', 2);
    expect(g.upgradePack('basket')).toBe(true);
    // Fresh vs dried: carry both for the same time.
    predict('dryingTest', 'dry');
    g.addItem('fish');
    g.addItem('driedFish');
    live(230);
    expect(g.experiments.state('dryingTest').supported).toBe('dry');
    g.experiments.acknowledge('dryingTest');
    g.experiments.answer('dryingTest', 'wet');
    g.living.add('hiddenTrail');
    // Overharvest: one patch picked with care (the basket takes two handfuls), one stripped bare.
    predict('overharvest', 'less');
    judge(patches[1], 0);
    judge(patches[2], 0);
    g.food.perform(g.food.available(g.player, null)!);
    expect(g.food.stock[patches[2].id]).toBe(0);
    live(250);
    expect(g.experiments.state('overharvest').supported).toBe('less');
    g.experiments.acknowledge('overharvest');
    g.experiments.answer('overharvest', 'some');
    // The sky: a clear sky stays dry; then dark clouds build ("Watch the sky") and rain follows.
    g.env.skipTo(g.time, 9); // a night's sleep on the bed: the sky is read by day
    predict('skyTest', 'clouds');
    g.setPlayerPosition(0, 8);
    g.env.forceWeather = 'clear';
    view(0, 1, 2);
    live(95);
    g.env.forceWeather = null;
    live(1);
    expect(g.experiments.def('skyTest')!.testAction!.run(g)).toBeTruthy();
    live(45);
    view(0, 1, 2);
    live(40);
    expect(g.experiments.state('skyTest').supported).toBe('clouds');
    expect(g.notebook).toContain('x_sky');
    g.experiments.acknowledge('skyTest');
    g.experiments.answer('skyTest', 'cover');
    // The sun: face it in the morning and, after a rest, in the afternoon (once the shower has passed).
    live(140);
    expect(g.env.brew).toBeNull();
    g.env.skipTo(g.time, 8);
    predict('sunPath', 'eastWest');
    view(sunYaw(), 0.2, 2);
    g.experiments.def('sunPath')!.testAction!.run(g);
    live(0.5);
    view(sunYaw(), 0.2, 2);
    expect(g.experiments.state('sunPath').supported).toBe('eastWest');
    g.experiments.acknowledge('sunPath');
    g.experiments.answer('sunPath', 'east');
    // The long trek: the briefing opens, the compass is covered once you leave camp.
    g.env.skipTo(g.time, 8);
    live(0.5);
    expect(step(g)).toBe('food/trek');
    expect(g.field.prompt?.key).toBe('trek');
    g.field.act();
    const home = campOf(g);
    g.setPlayerPosition(home.x + 12, home.z);
    live(0.5);
    expect(g.field.compassCovered()).toBe(true);
    g.setPlayerPosition(LANDMARK_BY_ID.ruins.x, LANDMARK_BY_ID.ruins.z);
    live(0.5);
    judge(patches[3], 0);
    judge(patches[4], 0);
    eat('nuts');
    g.setPlayerPosition(home.x, home.z);
    live(0.5);
    expect(g.field.trek.phase).toBe('done');
    // The closing check opens by itself.
    live(2);
    expect(step(g)).toBe('food/finalCheck');
    for (let q = 0; q < FINAL_CHECK.length; q++) {
      expect(g.field.prompt?.key).toBe(`check:${q}`);
      g.field.choose(FINAL_CHECK[q].options.findIndex((o) => o.correct));
      g.field.act();
    }
    run(g, 0.5);
    for (const e of ['n_chain', 'fd_sugar', 'fd_driedkeeps', 'fd_overharvest', 'nv_sunrise', 'nv_home']) expect(g.notebook).toContain(e);
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
