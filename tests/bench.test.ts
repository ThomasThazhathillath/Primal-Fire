import { describe, expect, it } from 'vitest';
import { BENCH_RECIPES, BENCH_BY_ID } from '../src/game/bench.js';
import { Game } from '../src/game/game.js';
import { ITEMS, type ItemId } from '../src/game/items.js';
import { OBSERVATIONS } from '../src/game/observations.js';
import { GUIDE_MARKS } from '../src/game/guides.js';
import { isScienceEvent } from '../src/game/science-events.js';

function withBench(): { g: Game; id: number } {
  const g = new Game();
  g.addItem('slab');
  g.takeOut('slab');
  const s = g.placeBlueprint('workbench', -1, -2).structure!;
  g.addItem('dryStone', 3);
  s.spots.forEach((_, i) => g.fillSpot(s.id, i));
  g.placeKey(s.id, s.x, s.z, 2);
  expect(s.complete).toBe(true);
  return { g, id: s.id };
}

function give(g: Game, inputs: Partial<Record<ItemId, number>>) {
  for (const [id, n] of Object.entries(inputs)) g.addItem(id as ItemId, n ?? 0);
}

/** Perform every step with its own motion, in small strokes. */
function doAll(g: Game) {
  let guard = 0;
  while (g.bench && guard++ < 10000) g.benchWork(g.bench.step!.motion, 0.05);
}

describe('bench recipes (data)', () => {
  it('reference real items, marks, observations and science events', () => {
    for (const r of BENCH_RECIPES) {
      expect(ITEMS[r.output]).toBeDefined();
      for (const id of Object.keys(r.inputs)) expect(ITEMS[id as ItemId]).toBeDefined();
      if (r.observation) expect(OBSERVATIONS[r.observation]).toBeDefined();
      for (const e of r.science ?? []) expect(isScienceEvent(e)).toBe(true);
      expect(r.steps.length).toBeGreaterThan(0);
      for (const s of r.steps) if (s.mark) expect(GUIDE_MARKS).toContain(s.mark);
    }
  });
});

describe('workbench crafting', () => {
  it('choosing a recipe does not craft: it reserves the parts', () => {
    const { g, id } = withBench();
    give(g, BENCH_BY_ID.bowDrill.inputs);
    expect(g.startBench('bowDrill', id)).toBe(true);
    expect(g.count('bowDrill')).toBe(0);
    expect(g.count('board')).toBe(0); // on the bench now
    expect(g.bench?.step?.id).toBe('board');
  });

  it('needs every part', () => {
    const { g, id } = withBench();
    const seen: string[] = [];
    g.on((e) => e.type === 'interaction' && seen.push(e.code));
    g.addItem('board');
    expect(g.startBench('bowDrill', id)).toBe(false);
    expect(seen).toEqual(['bench.missingParts']);
  });

  it('only the right motion advances a step; the wrong one is reported', () => {
    const { g, id } = withBench();
    give(g, BENCH_BY_ID.bowDrill.inputs);
    g.startBench('bowDrill', id);
    const seen: string[] = [];
    g.on((e) => e.type === 'interaction' && seen.push(e.code));
    for (let i = 0; i < 20; i++) g.benchWork('scrape', 0.05); // the board step wants a press
    expect(g.bench!.stepIndex).toBe(0);
    expect(g.bench!.progress).toBe(0);
    expect(seen).toContain('bench.wrongMotion');
    g.benchWork('press', 0.2);
    expect(g.bench!.step!.id).toBe('notch');
  });

  it('no single action finishes a craft', () => {
    const { g, id } = withBench();
    give(g, BENCH_BY_ID.bowDrill.inputs);
    g.startBench('bowDrill', id);
    g.benchWork('press', 1000);
    expect(g.bench).not.toBeNull();
    expect(g.count('bowDrill')).toBe(0);
  });

  it('a full bow drill craft completes the Scavenger friction-tool step', () => {
    const { g, id } = withBench();
    give(g, BENCH_BY_ID.bowDrill.inputs);
    g.startBench('bowDrill', id);
    doAll(g);
    expect(g.bench).toBeNull();
    expect(g.count('bowDrill')).toBe(1);
    expect(g.flag('hasDrill')).toBe(true);
    expect(g.hasEvent('craft.bowdrill')).toBe(true);
    expect(g.notebook).toContain('g_bow');
  });

  it('cancel returns every part', () => {
    const { g, id } = withBench();
    give(g, BENCH_BY_ID.axe.inputs);
    g.startBench('axe', id);
    g.benchWork('strike', 1);
    g.cancelBench();
    expect(g.bench).toBeNull();
    expect(g.count('dryStone')).toBe(1);
    expect(g.count('spindle')).toBe(1);
    expect(g.count('cord')).toBe(2);
    expect(g.count('axe')).toBe(0);
  });

  it('marks guide steps as it goes and makes every recipe', () => {
    for (const r of BENCH_RECIPES) {
      const { g, id } = withBench();
      give(g, r.inputs);
      expect(g.startBench(r.id, id)).toBe(true);
      doAll(g);
      expect(g.count(r.output)).toBe(r.count ?? 1);
    }
    const { g, id } = withBench();
    give(g, BENCH_BY_ID.axe.inputs);
    g.startBench('axe', id);
    doAll(g);
    expect(g.hasEvent('tool.axe.made')).toBe(true);
  });

  it('a save mid-craft keeps the parts', () => {
    const { g, id } = withBench();
    give(g, BENCH_BY_ID.cord.inputs);
    g.startBench('cord', id);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.count('fibers')).toBe(3);
    expect(g2.bench).toBeNull();
  });

  it('a held part counts and is used', () => {
    const { g, id } = withBench();
    give(g, { fibers: 2 });
    g.addItem('fibers');
    g.takeOut('fibers');
    expect(g.startBench('cord', id)).toBe(true);
    expect(g.held).toBeNull();
  });
});

describe('guides follow the bench', () => {
  it('the bow-drill guide is complete after a bench craft', () => {
    const { g, id } = withBench();
    give(g, BENCH_BY_ID.bowDrill.inputs);
    g.startBench('bowDrill', id);
    let guard = 0;
    while (g.bench && guard++ < 10000) g.benchWork(g.bench.step!.motion, 0.05);
    const guide = (g as unknown as { guide: { isComplete(x: unknown): boolean } }).guide;
    expect(guide.isComplete(GUIDES_BY.bowDrill)).toBe(true);
  });
});
import { GUIDE_BY_ID as GUIDES_BY } from '../src/game/guides.js';
