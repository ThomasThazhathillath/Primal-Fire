import { describe, expect, it } from 'vitest';
import { spotWorldPosition } from '../src/game/blueprint.js';
import { Game } from '../src/game/game.js';
import { CELEBRATE_SECONDS, cardView, OBJECTIVES } from '../src/game/objectives.js';

const cur = (g: Game) => g.objectives.current?.id;
const finish = (g: Game) => g.tick(CELEBRATE_SECONDS + 0.1);
const stones = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) g.gather('dryStone');
};
/** Build the workbench for real: three supports, then the slab with both hands. */
const buildBench = (g: Game) => {
  const s = g.placeFromBook('workbench', 0, -1).structure!;
  for (let i = 0; i < 3; i++) {
    const p = spotWorldPosition(s, i);
    g.fillSpot(s.id, i, undefined, { x: p.x, z: p.z });
  }
  g.takeOut('slab');
  g.placeKey(s.id, s.x, s.z, 2);
  return s;
};

describe('beginner objectives', () => {
  it('test 1: a new game shows only the first stone objective', () => {
    const g = new Game();
    const v = g.objectives.view()!;
    expect(v.id).toBe('firstStone');
    expect(v.title).toBe('Find your first stone');
    expect(v.progress).toEqual({ have: 0, need: 1 });
    expect(g.objectives.completed).toHaveLength(0);
    // Nothing of the future leaks into the card.
    expect(JSON.stringify(v)).not.toMatch(/workbench|flat stone/i);
  });

  it('test 2: one stone completes it, celebrates, then the next appears', () => {
    const g = new Game();
    const events: string[] = [];
    g.on((e) => e.type === 'objectiveDone' && events.push(e.message));
    stones(g, 1);
    expect(events).toEqual(["Good. You've found your first resource."]);
    expect(g.objectives.completed).toEqual(['firstStone']);
    // The achievement is shown before the next objective replaces it.
    expect(g.objectives.view()!.celebrating?.message).toMatch(/first resource/);
    g.tick(1);
    expect(g.objectives.view()!.celebrating).not.toBeNull();
    finish(g);
    const v = g.objectives.view()!;
    expect(v.celebrating).toBeNull();
    expect(v.id).toBe('moreStones');
  });

  it('test 3: three further stones update progress 0..3 and unlock the flat stone', () => {
    const g = new Game();
    stones(g, 1);
    finish(g);
    expect(g.objectives.view()!.progress).toEqual({ have: 0, need: 3 });
    stones(g, 1);
    expect(g.objectives.view()!.progress).toEqual({ have: 1, need: 3 });
    stones(g, 1);
    expect(g.objectives.view()!.progress).toEqual({ have: 2, need: 3 });
    expect(cur(g)).toBe('moreStones');
    stones(g, 1);
    expect(g.objectives.completed).toContain('moreStones');
    finish(g);
    expect(cur(g)).toBe('flatStone');
  });

  it('only the real flat slab satisfies the flat stone objective', () => {
    const g = new Game();
    stones(g, 4);
    finish(g);
    expect(cur(g)).toBe('flatStone');
    stones(g, 3);
    g.gather('flint');
    expect(cur(g)).toBe('flatStone');
    g.gather('slab');
    expect(g.objectives.completed).toContain('flatStone');
  });

  it('tests 5-6: closing and reopening the card changes nothing', () => {
    const g = new Game();
    stones(g, 2);
    finish(g);
    const before = JSON.stringify({ v: g.objectives.view(), i: g.objectives.index, c: g.objectives.completed });
    g.objectives.setClosed(true);
    expect(g.objectives.closed).toBe(true);
    // Progress keeps being tracked while closed.
    stones(g, 1);
    g.tick(10);
    expect(g.objectives.view()!.progress).toEqual({ have: 2, need: 3 });
    g.objectives.setClosed(false);
    expect(g.objectives.closed).toBe(false);
    expect(cur(g)).toBe('moreStones');
    expect(before).toContain('moreStones');
    expect(g.objectives.view()!.progress!.have).toBe(2);
  });

  it('test 7: the real finished workbench completes the objective and unlocks the next', () => {
    const g = new Game();
    stones(g, 4);
    g.gather('slab');
    finish(g);
    expect(cur(g)).toBe('workbench');
    expect(g.objectives.view()!.substeps.map((s) => s.done)).toEqual([false, false, false]);
    const s = g.placeFromBook('workbench', 0, -1).structure!;
    expect(g.objectives.view()!.substeps.map((x) => x.done)).toEqual([true, false, false]);
    for (let i = 0; i < 3; i++) {
      const p = spotWorldPosition(s, i);
      g.fillSpot(s.id, i, undefined, { x: p.x, z: p.z });
    }
    expect(g.objectives.view()!.substeps.map((x) => x.done)).toEqual([true, true, false]);
    expect(cur(g)).toBe('workbench');
    g.takeOut('slab');
    expect(g.placeKey(s.id, s.x, s.z, 2)).toBe(true);
    expect(s.complete).toBe(true);
    expect(g.objectives.completed).toContain('workbench');
    finish(g);
    expect(cur(g)).toBe('exploreBench');
  });

  it('explains a failed placement on the card', () => {
    const g = new Game();
    stones(g, 4);
    g.gather('slab');
    finish(g);
    const s = g.placeFromBook('workbench', 0, -1).structure!;
    g.takeOut('slab');
    g.placeKey(s.id, s.x, s.z, 2); // supports missing
    expect(g.objectives.view()!.feedback).toMatch(/support|first/i);
  });

  it('test 8: save and reload restores the current objective, progress and learned controls', () => {
    const g = new Game();
    stones(g, 3);
    finish(g);
    g.objectives.setClosed(true);
    g.objectives.unlockHint('moreStones');
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(cur(back)).toBe('moreStones');
    expect(back.objectives.view()!.progress).toEqual({ have: 2, need: 3 });
    expect(back.objectives.completed).toEqual(['firstStone']);
    expect(back.objectives.closed).toBe(true);
    expect(back.objectives.hasLearned('grab')).toBe(true);
    expect(back.objectives.hintLevel('moreStones')).toBe(1);
    stones(back, 1);
    expect(back.objectives.completed).toContain('moreStones');
  });

  it('test 9: later objectives cannot be completed early', () => {
    const g = new Game();
    for (let i = 0; i < 3; i++) g.gather('twigs');
    g.gather('logs');
    g.gathered.set('logs', 2);
    g.gathered.set('slab', 1);
    g.checkQuests();
    expect(cur(g)).toBe('firstStone');
    expect(g.objectives.completed).toHaveLength(0);
    // Once the chain reaches them, what you already gathered is recognised, still in order.
    g.satchel.clear();
    stones(g, 4);
    expect(g.objectives.completed.slice(0, 3)).toEqual(['firstStone', 'moreStones', 'flatStone']);
    expect(cur(g)).toBe('workbench');
  });

  it('the first objectives keep a detailed how-to on the card', () => {
    const g = new Game();
    expect(g.objectives.view()!.tip).toMatch(/pinch/i);
    stones(g, 1);
    finish(g);
    // Gathering more stones still explains the pinch (and moving), step by step.
    expect(g.objectives.view()!.tip).toMatch(/pinch/i);
  });

  it('migrates an old save: finished steps stay finished and the tutorial does not restart', () => {
    const g = new Game();
    stones(g, 4);
    g.gather('slab');
    buildBench(g);
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    delete snap.objectives;
    const old = Game.restore(snap);
    expect(old.objectives.completed).toEqual(['firstStone', 'moreStones', 'flatStone', 'workbench']);
    expect(old.objectives.view()!.celebrating).toBeNull();
    expect(['exploreBench', 'stoneTools']).toContain(cur(old));
    // A save from late in the game is past the whole tutorial.
    const late = JSON.parse(JSON.stringify(g.snapshot()));
    delete late.objectives;
    late.flags.push('fireLit', 'potFired', 'charcoalMade', 'waterSafe', 'finale');
    late.events.push('shelter.site.chosen', 'shelter.roof.covered', 'shelter.bed.insulated', 'shelter.wind.blocked');
    const done = Game.restore(late);
    expect(done.objectives.done).toBe(true);
    expect(done.objectives.view()).toBeNull();
    expect(cardView(done)).not.toBeNull(); // the quest chain carries on
  });

  it('every objective has a four-level hint and a unique id', () => {
    expect(new Set(OBJECTIVES.map((o) => o.id)).size).toBe(OBJECTIVES.length);
    for (const o of OBJECTIVES) {
      expect(o.hint.levels).toHaveLength(4);
      for (const t of o.hint.levels) expect(t.length).toBeGreaterThan(5);
    }
  });

  it('hint levels unlock one at a time up to four', () => {
    const g = new Game();
    const levels = [1, 2, 3, 4, 4].map(() => g.objectives.unlockHint('firstStone'));
    expect(levels).toEqual([1, 2, 3, 4, 4]);
  });
});
