import { describe, expect, it } from 'vitest';
import {
  ASSIST,
  catchesThrown,
  chooseTarget,
  diffHighlights,
  hintEffects,
  highlightPriority,
  magnetPull,
  MessageGate,
  nearestMark,
  openMarks,
  pickHighlights,
  placementIntent,
  punchActs,
  resolveTarget,
  snapVerdict,
  type Candidate,
  type Highlight,
} from '../src/game/assist.js';
import { Game } from '../src/game/game.js';

const cand = (id: string, dist: number, o: Partial<Candidate> = {}): Candidate => ({ id, dist, aimed: false, valid: true, matchesHeld: false, ...o });

function pit() {
  const g = new Game();
  g.addItem('dryStone', 6);
  const s = g.placeFromBook('firePit', 0, -1).structure!;
  return { g, s, marks: openMarks(g.structures) };
}

describe('target resolution', () => {
  it('the directly targeted object wins, even if farther', () => {
    const t = resolveTarget([cand('near', 0.3), cand('aimed', 1.5, { aimed: true }), cand('match', 0.4, { matchesHeld: true })]);
    expect(t!.id).toBe('aimed');
  });
  it('otherwise the nearest valid one; the held-item match only wins when about as near', () => {
    expect(resolveTarget([cand('a', 0.5), cand('b', 1.0)])!.id).toBe('a');
    expect(resolveTarget([cand('a', 0.5), cand('m', 0.7, { matchesHeld: true })])!.id).toBe('m');
    expect(resolveTarget([cand('a', 0.5), cand('m', 2, { matchesHeld: true })])!.id).toBe('a');
  });
  it('never picks something invalid or out of reach, so a stray gesture touches nothing', () => {
    expect(resolveTarget([cand('x', 0.1, { valid: false, aimed: true })])).toBeNull();
    expect(resolveTarget([])).toBeNull();
    expect(resolveTarget([cand('far', 4, { valid: false }), cand('ok', 2)])!.id).toBe('ok');
  });
  it('an empty hand never acts as a punch', () => {
    expect(punchActs(null)).toBe(false);
    expect(punchActs('dryStone')).toBe(true);
  });
});

describe('snap acceptance and rejection', () => {
  it('a correct stone within the forgiving radius is accepted, nearest mark first', () => {
    const { g, marks } = pit();
    const m = marks[0];
    const v = snapVerdict(g.structures, marks, 'dryStone', m.x + 0.5, m.z + 0.2);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.d).toBeLessThan(ASSIST.releaseRadius);
  });
  it('is not pixel-perfect: 1 m off still seats, but not on a mark that is far away', () => {
    const { g, marks } = pit();
    const m = marks[0];
    expect(snapVerdict(g.structures, marks, 'dryStone', m.x + 0.9, m.z).ok).toBe(true);
    const v = snapVerdict(g.structures, marks, 'dryStone', m.x + 5, m.z);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('tooFar');
  });
  it('the wrong material is rejected and the message says what the mark needs', () => {
    const { g, marks } = pit();
    const m = marks[0];
    const v = snapVerdict(g.structures, marks, 'twigs', m.x, m.z);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe('wrongMaterial');
      expect(v.message).toMatch(/stone/);
    }
  });
  it('a finished build says so; nothing near says nothing', () => {
    const g = new Game();
    g.addItem('dryStone', 6);
    const s = g.placeFromBook('firePit', 0, -1).structure!;
    s.complete = true;
    const v = snapVerdict(g.structures, openMarks(g.structures), 'dryStone', s.x, s.z);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('complete');
    const far = snapVerdict([], [], 'dryStone', 0, 0);
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.reason).toBe('none');
  });
  it('a filled mark is not offered again, and the key slot of a workbench waits for the supports', () => {
    const g = new Game();
    g.addItem('dryStone', 4);
    g.addItem('slab');
    const s = g.placeFromBook('workbench', 0, -1).structure!;
    expect(openMarks(g.structures).every((m) => m.index >= 0)).toBe(true); // slab slot not yet open
    const before = openMarks(g.structures).length;
    g.fillSpot(s.id, 0);
    expect(openMarks(g.structures).length).toBe(before - 1);
    g.fillSpot(s.id, 1);
    g.fillSpot(s.id, 2);
    const left = openMarks(g.structures);
    expect(left).toHaveLength(1);
    expect(left[0].index).toBe(-1);
    expect(nearestMark(left, 'slab', left[0].x, left[0].z, 0.1)).not.toBeNull();
    expect(nearestMark(left, 'dryStone', left[0].x, left[0].z, 5)).toBeNull();
  });
});

describe('magnet and catch', () => {
  it('pulls toward the mark, never past it, strongest at the edge and nothing outside', () => {
    const o = { x: 0, z: 0 };
    expect(magnetPull(o, 1 / 60, 0.6, 0, 0, 0)).toBe(false);
    expect(o.x).toBe(0);
    magnetPull(o, 1 / 60, 0.5, 0, 0, 0);
    const edge = Math.abs(o.x);
    magnetPull(o, 1 / 60, 0.1, 0, 0, 0);
    expect(Math.abs(o.x)).toBeLessThan(edge);
    expect(o.x).toBeLessThan(0); // towards the mark at the origin
    magnetPull(o, 10, 0.2, 0, 0, 0); // a huge step still stops at the mark
    expect(o.x).toBeCloseTo(-0.2);
  });
  it('catches a gentle throw into the radius of a correct mark, not a hard one or a wrong part', () => {
    const { marks } = pit();
    const m = marks[0];
    expect(catchesThrown(marks, 'dryStone', m.x + 0.4, m.z, 3)).toBe(m);
    expect(catchesThrown(marks, 'dryStone', m.x + 0.4, m.z, 12)).toBeNull();
    expect(catchesThrown(marks, 'dryStone', m.x + 3, m.z, 3)).toBeNull();
    expect(catchesThrown(marks, 'twigs', m.x, m.z, 1)).toBeNull();
  });
  it('every way of placing reaches the same intent set, driven by what the hand did', () => {
    const base = { distance: 0.1, speed: 0.1, downSpeed: 0, thrown: false, letGo: false };
    expect(placementIntent({ ...base, letGo: true })).toBe('release');
    expect(placementIntent({ ...base, letGo: true, speed: 2 })).toBe('drop');
    expect(placementIntent({ ...base, thrown: true, speed: 3 })).toBe('throw');
    expect(placementIntent({ ...base, thrown: true, speed: 20 })).toBeNull();
    expect(placementIntent({ ...base, downSpeed: 2.5, distance: 0.2 })).toBe('strike');
    expect(placementIntent({ ...base, distance: 0.1 })).toBe('touch');
    expect(placementIntent({ ...base, distance: 0.5 })).toBeNull();
    expect(placementIntent({ ...base, letGo: true, distance: 9 })).toBeNull();
  });
});

describe('highlights stay few and clean up', () => {
  const H = (id: string, kind: Highlight['kind'], dist = 1): Highlight => ({ id, kind, x: 0, y: 0, z: 0, priority: highlightPriority(kind, dist) });
  it('keeps only the budget, best first, one per id', () => {
    const all = [H('a', 'blocked'), H('b', 'target'), H('c', 'fits', 2), H('d', 'hint'), H('e', 'fits', 1), H('f', 'hint', 4), H('g', 'blocked', 3), H('h', 'exact'), H('b', 'blocked')];
    const out = pickHighlights(all);
    expect(out).toHaveLength(ASSIST.highlightBudget);
    expect(out[0].id).toBe('b');
    expect(out[0].kind).toBe('target');
    expect(new Set(out.map((o) => o.id)).size).toBe(out.length);
    expect(out.map((o) => o.id)).not.toContain('a');
    const small = pickHighlights(all, 2);
    expect(small.map((o) => o.id)).toEqual(['b', 'h']);
  });
  it('says what to add and what to remove when the set changes', () => {
    const shown = new Set(['a', 'b', 'c']);
    const d = diffHighlights(shown, [H('b', 'fits'), H('d', 'fits')]);
    expect(d.removed.sort()).toEqual(['a', 'c']);
    expect(d.added).toEqual(['d']);
    // Nothing wanted: everything is cleaned up.
    expect(diffHighlights(shown, []).removed.sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('hint levels escalate', () => {
  it('1 clue, 2 pulse, 3 beacon, 4 exact marker', () => {
    expect(hintEffects(0)).toEqual({ clue: false, pulse: false, beacon: false, exact: false });
    expect(hintEffects(1)).toEqual({ clue: true, pulse: false, beacon: false, exact: false });
    expect(hintEffects(2)).toEqual({ clue: true, pulse: true, beacon: false, exact: false });
    expect(hintEffects(3)).toEqual({ clue: true, pulse: true, beacon: true, exact: false });
    expect(hintEffects(4)).toEqual({ clue: true, pulse: false, beacon: true, exact: true });
    expect(hintEffects(9)).toEqual(hintEffects(4));
  });
  it('the beacon picks the nearest spot of something still needed, never an item you have enough of', () => {
    const spots = [
      { id: 's1', x: 10, z: 0, item: 'dryStone' as const },
      { id: 's2', x: 3, z: 0, item: 'dryGrass' as const },
      { id: 's3', x: 20, z: 0, item: 'dryStone' as const },
    ];
    expect(chooseTarget(spots, ['dryStone'], 0, 0)!.id).toBe('s1');
    expect(chooseTarget(spots, ['dryStone', 'dryGrass'], 0, 0)!.id).toBe('s2');
    expect(chooseTarget(spots, ['dryStone'], 19, 0)!.id).toBe('s3');
    expect(chooseTarget(spots, ['cane'], 0, 0)).toBeNull();
  });
});

describe('contextual messages', () => {
  it('one at a time, not repeated soon, and they disappear', () => {
    const m = new MessageGate(20, 4);
    expect(m.say(0, 'stone', 'Stone collected.')).toBe(true);
    expect(m.say(1, 'other', 'Something else')).toBe(false); // one at a time
    expect(m.say(2, 'other', 'Urgent', true)).toBe(true);
    m.tick(5);
    expect(m.text).toBe('');
    expect(m.say(10, 'stone', 'Stone collected.')).toBe(false); // too soon
    expect(m.say(30, 'stone', 'Stone collected.')).toBe(true);
  });
});
