// Curriculum Phase 1, C5: a fresh game played through all five lessons with the game's own actions.
// Lesson 01 is played entirely by real actions (gathering, building, crafting, lashing, the rain test).
// Lesson 04 is played by real actions too (knapping blows, the Tool Yard experiments, bench crafts, the lever).
// Later lessons use real actions where the mechanic is cheap to drive here and the same state flags the
// fire, water and food rules set (their mechanics have their own tests) where it is not.
import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, spotWorldPosition } from '../src/game/blueprint.js';
import { Game, type GameEvent } from '../src/game/game.js';
import { HOLD_DRY } from '../src/game/shelter.js';
import { knap } from '../src/game/interact.js';
import { YARD } from '../src/game/curriculum/lessons/tools/engineering.js';

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
    expect(step(g)).toBe('water/pot');

    // ---- Lesson 03: Water
    g.setFlag('potFired');
    g.setFlag('waterSafe');
    run(g, 0.5);
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
  });
});
