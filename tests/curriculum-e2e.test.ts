// Curriculum Phase 1, C5: a fresh game played through all five lessons with the game's own actions.
// Lessons 01 (Shelter) and 03 (Water) are played entirely by real actions (gathering, building, crafting,
// lashing, the rain test; test cups, firing, the filter's layers, settling and boiling). Other lessons use
// real actions where the mechanic is cheap to drive here and the same state flags the fire and food rules
// set (their mechanics have their own tests) where it is not.
import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, spotWorldPosition } from '../src/game/blueprint.js';
import { LAYER_SPOTS } from '../src/game/curriculum/lessons/water/filter.js';
import { Game, type GameEvent } from '../src/game/game.js';
import type { ItemId } from '../src/game/items.js';
import { HOLD_DRY } from '../src/game/shelter.js';

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
    expect(step(g)).toBe('water/clayTemper');

    // ---- Lesson 03: Water, by real actions: clay test cups, the pot, stream and rain, the filter's order,
    // settle / filter / boil, and the closing check. Every result comes from the water and clay rules.
    g.fire.stage = 'burning';
    g.fire.burnLeft = 1e6;
    const pit = g.structures.find((t) => t.kind === 'firePit')!;
    const atPit = () => g.setPlayerPosition(pit.x + 0.8, pit.z);
    const atBench = () => g.setPlayerPosition(bench.x, bench.z + 0.8);
    const stream = { x: 4.4, z: 3 };
    const act = (id: Parameters<Game['water']['perform']>[0], at = g.player) => expect(g.water.perform(id, at), id).toBe(true);
    const craft = (id: string) => {
      atBench();
      expect(g.startBench(id, bench.id)).toBe(true);
      for (let i = 0; g.bench && i < 10000; i++) g.benchWork(g.bench.step!.motion, 0.05);
    };
    run(g, 0.5);
    expect(g.experiments.phase('clayTemper')).toBe('predict');
    expect(g.experiments.predict('clayTemper', 'sand')).toBe(true);
    run(g, 0.5);
    // The firing test opens right after, so the same test cups serve both.
    expect(g.experiments.phase('potFiring')).toBe('predict');
    expect(g.experiments.predict('potFiring', 'dry')).toBe(true);
    g.satchel.clear();
    g.addItem('clay', 4);
    g.addItem('sand', 2);
    craft('clayTest');
    expect(g.water.clay.pieces.map((p) => p.kind)).toEqual(['plain', 'temper', 'temper']);
    // A damp sand cup goes straight into the fire: steam bursts it.
    atPit();
    expect(g.water.available(g.player, null)?.id).toBe('fireTest');
    act('fireTest');
    run(g, 3);
    expect(g.experiments.state('potFiring').trials.get('damp')).toBe('burst');
    // The clay-only cup cracks as it dries (its clay comes back); the other sand cup dries whole.
    run(g, 30);
    expect(g.experiments.state('clayTemper').trials.get('none')).toBe('cracked');
    expect(g.experiments.phase('clayTemper')).toBe('result');
    expect(g.experiments.predictedRight('clayTemper')).toBe(true);
    expect(g.hasEvent('pottery.untempered.crack')).toBe(true);
    expect(g.count('clay')).toBe(3);
    act('fireTest');
    run(g, 7);
    expect(g.experiments.phase('potFiring')).toBe('result');
    for (const id of ['clayTemper', 'potFiring']) g.experiments.acknowledge(id);
    expect(g.experiments.answer('clayTemper', 'fire')?.correct).toBe(false);
    expect(g.experiments.answer('clayTemper', 'temper')?.correct).toBe(true);
    expect(g.experiments.answer('potFiring', 'wait')?.correct).toBe(true);
    run(g, 0.5);
    expect(step(g)).toBe('water/pot');
    // The pot: tempered, dried in the bag, fired in the fire.
    craft('pot');
    run(g, 46);
    expect(g.flag('potDry')).toBe(true);
    g.takeOut('pot');
    atPit();
    act('firePot');
    run(g, 16);
    expect(g.flag('potFired')).toBe(true);
    run(g, 0.5);
    expect(step(g)).toBe('water/waterSource');
    // Stream water is muddy; rain off the roof is clearer.
    expect(g.experiments.predict('waterSource', 'rain')).toBe(true);
    act('fillPot', stream);
    expect(g.water.potWater).toBe('raw');
    act('pourOut');
    expect(g.experiments.def('waterSource')!.testAction!(g)!.label).toBe('Wait for rain');
    g.experiments.def('waterSource')!.testAction!(g)!.run();
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
    run(g, 0.5);
    expect(g.experiments.phase('waterSource')).toBe('result');
    g.experiments.acknowledge('waterSource');
    expect(g.experiments.answer('waterSource', 'boil')?.correct).toBe(true);
    act('pourOut');
    run(g, 0.5);
    expect(step(g)).toBe('water/filterOrder');
    // The filter: legs and spout, then the layers in the order they go in (bottom first).
    expect(g.experiments.predict('filterOrder', 'coarse')).toBe(true);
    g.addItem('forkedStick', 3);
    g.addItem('cane');
    for (const [id, n] of [['cloth', 1], ['charcoal', 1], ['sand', 1], ['gravel', 1]] as const) g.addItem(id, n);
    g.takeOut('forkedStick');
    const f = placeOpen(g, 'filter');
    for (let i = 0; i < 3; i++) expect(g.fillSpot(f.id, i)).toBe(true);
    const layer = (k: number, id: ItemId) => expect(g.fillSpot(f.id, LAYER_SPOTS[k], id)).toBe(true);
    // First try: sand on top of the gravel.
    (['cloth', 'charcoal', 'gravel', 'sand'] as const).forEach((id, k) => layer(k, id));
    expect(f.complete).toBe(true);
    const pour = () => {
      act('fillPot', stream);
      act('pourFilter', { x: f.x, z: f.z });
    };
    pour();
    expect(g.water.lastFilter?.flow).toBe('clogged');
    expect(g.notebook).toContain('w_clog');
    // Swap the top two layers: gravel above sand.
    for (const k of [3, 2]) expect(g.takeBack(f.id, LAYER_SPOTS[k])).toBe(true);
    g.stow();
    layer(2, 'sand');
    layer(3, 'gravel');
    pour();
    expect(g.water.potWater).toBe('filtered');
    run(g, 0.5);
    expect(g.experiments.phase('filterOrder')).toBe('result');
    expect(g.experiments.predictedRight('filterOrder')).toBe(true);
    g.experiments.acknowledge('filterOrder');
    expect(g.experiments.answer('filterOrder', 'clear')?.correct).toBe(false);
    expect(g.experiments.answer('filterOrder', 'boil')?.correct).toBe(true);
    act('pourOut');
    run(g, 0.5);
    expect(step(g)).toBe('water/treatment');
    // Settle, filter, boil unfiltered, then filter and boil.
    expect(g.experiments.predict('treatment', 'each')).toBe(true);
    act('fillPot', stream);
    g.stow();
    run(g, 16);
    expect(g.water.potWater).toBe('settled');
    g.takeOut('pot');
    atPit();
    act('boil');
    run(g, 13);
    expect(g.water.potWater).toBe('boiledRaw');
    pour();
    expect(g.water.potWater).toBe('filtered');
    atPit();
    act('boil');
    run(g, 13);
    expect(g.water.potWater).toBe('safe');
    expect(g.flag('waterSafe')).toBe(true);
    run(g, 0.5);
    expect(g.experiments.phase('treatment')).toBe('result');
    expect(g.experiments.predictedRight('treatment')).toBe(true);
    g.experiments.acknowledge('treatment');
    expect(g.experiments.answer('treatment', 'mud')?.correct).toBe(true);
    run(g, 0.5);
    expect(step(g)).toBe('water/waterSupply');
    // The closing check opens straight to its question once the setup works.
    run(g, 0.5);
    expect(g.experiments.phase('waterSupply')).toBe('check');
    expect(g.experiments.answer('waterSupply', 'clear')?.correct).toBe(false);
    expect(g.experiments.answer('waterSupply', 'limits')?.correct).toBe(true);
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
  }, 60_000);
});
