// Curriculum Phase 1, C9: the experiment framework, proved on the roof-layer test.
import { describe, expect, it } from 'vitest';
import { ROOF_LAYERS } from '../src/game/curriculum/lessons/shelter/experiments.js';
import { EXPERIMENTS } from '../src/game/curriculum/registry.js';
import { Game, type GameEvent } from '../src/game/game.js';
import { CONCEPTS } from '../src/game/science/concepts.js';
import { ExperimentTracker } from '../src/game/science/experiments.js';
import { jumpTo } from './helpers/lessons.js';

const tracker = () => {
  const events: string[] = [];
  const t = new ExperimentTracker([ROOF_LAYERS], (e) => events.push(`${e.id}:${e.phase}`));
  return { t, events };
};

describe('experiment definitions', () => {
  it('every experiment is complete and teaches a real concept', () => {
    for (const d of EXPERIMENTS) {
      expect(CONCEPTS.some((c) => c.id === d.concept), d.id).toBe(true);
      expect(d.predictions.length).toBeGreaterThanOrEqual(2);
      expect(d.variable.values.length).toBeGreaterThanOrEqual(2);
      expect(d.check.options.filter((o) => o.correct)).toHaveLength(1);
      for (const o of d.check.options) expect(o.why.length, d.id).toBeGreaterThan(10);
      for (const k of ['question', 'why', 'howTo', 'principle', 'apply', 'limits'] as const) expect(d[k].length, `${d.id}.${k}`).toBeGreaterThan(15);
    }
  });
});

describe('experiment tracker', () => {
  it('runs question -> prediction -> trials -> result -> check -> done', () => {
    const { t, events } = tracker();
    const g = new Game();
    expect(t.phase('roofLayers')).toBe('locked');
    jumpTo(g, 'roof');
    t.update(g);
    expect(t.phase('roofLayers')).toBe('predict');
    expect(t.predict('roofLayers', 'one')).toBe(true);
    t.trial('roofLayers', '1', 'leaks');
    expect(t.phase('roofLayers')).toBe('testing');
    t.trial('roofLayers', '2', 'dry');
    expect(t.phase('roofLayers')).toBe('result');
    expect(t.state('roofLayers').supported).toBe('two');
    expect(t.predictedRight('roofLayers')).toBe(false);
    t.acknowledge('roofLayers');
    expect(t.answer('roofLayers', 'move')).toMatchObject({ correct: false });
    expect(t.phase('roofLayers')).toBe('check');
    expect(t.answer('roofLayers', 'layer')).toMatchObject({ correct: true });
    expect(t.done('roofLayers')).toBe(true);
    expect(events).toEqual(['roofLayers:predict', 'roofLayers:testing', 'roofLayers:result', 'roofLayers:check', 'roofLayers:done']);
  });

  it('never invents a result: one tried value is not enough, unknown values are ignored', () => {
    const { t } = tracker();
    const g = new Game();
    jumpTo(g, 'roof');
    t.update(g);
    t.predict('roofLayers', 'two');
    t.trial('roofLayers', '2', 'dry');
    t.trial('roofLayers', '7', 'dry');
    t.trial('roofLayers', '1', 'flooded');
    expect(t.phase('roofLayers')).toBe('testing');
  });

  it('trials seen before the prediction still count once you predict', () => {
    const { t } = tracker();
    const g = new Game();
    jumpTo(g, 'roof');
    t.update(g);
    t.trial('roofLayers', '1', 'leaks');
    t.trial('roofLayers', '2', 'dry');
    expect(t.phase('roofLayers')).toBe('predict');
    t.predict('roofLayers', 'two');
    expect(t.phase('roofLayers')).toBe('result');
    expect(t.predictedRight('roofLayers')).toBe(true);
  });

  it('saves and restores', () => {
    const { t } = tracker();
    const g = new Game();
    jumpTo(g, 'roof');
    t.update(g);
    t.predict('roofLayers', 'two');
    t.trial('roofLayers', '1', 'leaks');
    const { t: t2 } = tracker();
    t2.restore(JSON.parse(JSON.stringify(t.snapshot())));
    expect(t2.phase('roofLayers')).toBe('testing');
    expect(t2.state('roofLayers').trials.get('1')).toBe('leaks');
    expect(t2.state('roofLayers').prediction).toBe('two');
  });
});

describe('in the game', () => {
  it('opens with the roof step and reports its phases as game events', () => {
    const g = new Game();
    const seen: GameEvent[] = [];
    g.on((e) => e.type === 'experiment' && seen.push(e));
    jumpTo(g, 'roof');
    for (let i = 0; i < 2; i++) g.tick(0.25);
    expect(g.experiments.phase('roofLayers')).toBe('predict');
    expect(seen).toContainEqual({ type: 'experiment', id: 'roofLayers', phase: 'predict' });
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.experiments.phase('roofLayers')).toBe('predict');
  });

  it('"Wait for rain" needs a roof to test', () => {
    expect(new Game().waitForRain()).toBe(false);
  });
});

describe('setting up the comparison', () => {
  it('a lean-to roof layer can be taken back to make a single-layer panel; poles cannot', async () => {
    const { BLUEPRINTS } = await import('../src/game/blueprint.js');
    const g = new Game();
    for (const [id, n] of [['pole', 3], ['greenBranch', 5], ['cord', 3], ['twigs', 4], ['bark', 3], ['leafLitter', 3]] as const) g.addItem(id, n);
    g.takeOut('pole');
    let s = null as ReturnType<Game['leanTo']>;
    for (const [x, z] of [[0, -1.6], [4, 2], [-4, 3]]) if (!s && g.placeBlueprint('leanTo', x, z, 0).ok) s = g.leanTo();
    const idx = (role: string) => BLUEPRINTS.leanTo.spots.map((sp, i) => (sp.role === role ? i : -1)).filter((i) => i >= 0);
    for (const role of ['upright', 'ridge', 'rib', 'cross']) for (const i of idx(role)) g.fillSpot(s!.id, i);
    for (const i of idx('lash')) g.lashJoint(s!.id, i, 1);
    for (const role of ['lattice', 'roofBark', 'roofLeaf']) for (const i of idx(role)) g.fillSpot(s!.id, i);
    const leaf0 = idx('roofLeaf')[0];
    expect(g.takeBack(s!.id, leaf0)).toBe(true);
    expect(s!.spots[leaf0]).toBeNull();
    expect(g.held).toBe('leafLitter');
    expect(g.takeBack(s!.id, idx('ridge')[0])).toBe(false);
  });
});
