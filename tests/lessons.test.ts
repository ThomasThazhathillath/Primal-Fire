// Curriculum Phase 1, C4: the five lessons, the step library and the LessonTracker (not wired yet).
import { describe, expect, it } from 'vitest';
import { BLUEPRINTS } from '../src/game/blueprint.js';
import { LESSON_HINTS, LESSON_IDS, LESSONS, lessonOfStep, STEP_LIBRARY, stepById } from '../src/game/curriculum/registry.js';
import { LessonTracker } from '../src/game/curriculum/tracker.js';
import { Game, type GameEvent } from '../src/game/game.js';
import { HINT_INFO } from '../src/game/hint-info.js';
import { ITEMS, type ItemId } from '../src/game/items.js';
import { OBJECTIVES } from '../src/game/objectives.js';

function tracked() {
  const g = new Game();
  const events: GameEvent[] = [];
  const t = new LessonTracker(g, (e) => events.push(e));
  return { g, t, events };
}

describe('curriculum data', () => {
  it('has five lessons in the agreed order, numbered 1 to 5', () => {
    expect(LESSON_IDS).toEqual(['shelter', 'fire', 'water', 'tools', 'food']);
    LESSONS.forEach((l, i) => expect(l.n).toBe(i + 1));
  });

  it('every lesson has a story, a goal, science to discover and steps', () => {
    for (const l of LESSONS) {
      expect(l.story.length, l.id).toBeGreaterThan(30);
      expect(l.goal.length, l.id).toBeGreaterThan(20);
      expect(l.science.length, l.id).toBeGreaterThan(2);
      expect(l.steps.length, l.id).toBeGreaterThan(1);
      expect(l.unlocks.length, l.id).toBeGreaterThan(0);
    }
  });

  it('every step exists, belongs to exactly one lesson, and new step ids do not shadow objectives', () => {
    const seen = new Set<string>();
    for (const l of LESSONS) for (const id of l.steps) {
      expect(stepById(id), id).toBeDefined();
      expect(seen.has(id), `${id} is in two lessons`).toBe(false);
      seen.add(id);
      expect(lessonOfStep(id)).toBe(l.id);
    }
    expect(STEP_LIBRARY.size).toBe(new Set([...OBJECTIVES.map((o) => o.id), ...STEP_LIBRARY.keys()]).size);
  });

  it('every step has four hint levels and a picture hint', () => {
    for (const l of LESSONS) for (const id of l.steps) {
      const s = stepById(id)!;
      expect(s.hint.levels.length, id).toBe(4);
      for (const t of s.hint.levels) expect(t.length, id).toBeGreaterThan(10);
      const info = HINT_INFO[id] ?? LESSON_HINTS[id];
      expect(info, `${id} has no picture hint`).toBeDefined();
      expect(info.views.length, id).toBeGreaterThan(0);
      for (const v of info.views) for (const p of v.pieces) if (p.kind === 'item') expect(ITEMS[p.id as ItemId], `${id}: ${p.id}`).toBeDefined();
    }
  });

  it('steps only name real items and structures', () => {
    const g = new Game();
    for (const s of STEP_LIBRARY.values()) {
      if (s.structure) expect(BLUEPRINTS[s.structure], s.id).toBeDefined();
      if (s.hint.ref) expect(ITEMS[s.hint.ref], s.id).toBeDefined();
      for (const id of s.find?.(g) ?? []) expect(ITEMS[id], `${s.id} finds ${id}`).toBeDefined();
    }
  });

  it('Lesson 01 is strict about what you build, later lessons are not', () => {
    expect(LESSONS[0].strictBuild).toBe(true);
    for (const l of LESSONS.slice(1)) expect(l.strictBuild).toBeFalsy();
  });
});

describe('LessonTracker', () => {
  it('a new game starts Lesson 01 at the first stone', () => {
    const { t } = tracked();
    expect(t.lesson?.id).toBe('shelter');
    expect(t.current?.id).toBe('firstStone');
    expect(t.reached('shelter')).toBe(true);
    expect(t.reached('fire')).toBe(false);
    expect(t.buildFocus()).toBeNull();
    const v = t.view()!;
    expect(v.lesson).toEqual({ id: 'shelter', n: 1, name: 'Shelter' });
    expect(v.step).toBe(1);
    expect(v.total).toBe(LESSONS[0].steps.length);
  });

  it('advances as the work is done and celebrates each step', () => {
    const { g, t, events } = tracked();
    g.gather('dryStone');
    t.update();
    expect(t.completed.has('firstStone')).toBe(true);
    expect(t.current?.id).toBe('moreStones');
    expect(events.some((e) => e.type === 'objectiveDone' && e.id === 'firstStone')).toBe(true);
    for (let i = 0; i < 3; i++) g.gather('dryStone');
    t.update();
    expect(t.current?.id).toBe('flatStone');
  });

  it('finishing the last step of a lesson completes it and names the next lesson', () => {
    const { t, events } = tracked();
    t.load({ completed: LESSONS[0].steps.slice(0, -1), resume: null, bases: {}, learned: [], hints: {}, closed: false });
    expect(t.current?.id).toBe('bed');
    // The bed is built.
    (t as unknown as { game: Game }).game.structures.push({ id: 9, kind: 'bedding', x: 0, z: 0, rotY: 0, key: 'leafLitter', spots: [], complete: true });
    t.update();
    const done = events.find((e) => e.type === 'lessonComplete');
    expect(done).toMatchObject({ type: 'lessonComplete', lesson: 'shelter', n: 1, next: { id: 'fire', n: 2 } });
    expect(t.lesson?.id).toBe('fire');
    expect(t.reached('fire')).toBe(true);
    expect(t.buildFocus()).toBeUndefined();
  });

  it('can resume another lesson and comes back to play order when it is done', () => {
    const { t } = tracked();
    t.setResume('water');
    expect(t.current?.id).toBe('clayTemper');
    expect(t.reached('water')).toBe(true);
    t.setResume(null);
    expect(t.current?.id).toBe('firstStone');
  });

  it('saves and restores, ignoring ids it does not know', () => {
    const { t, g } = tracked();
    g.gather('dryStone');
    t.update();
    t.unlockHint('moreStones');
    const snap = t.snapshot();
    snap.completed.push('noSuchStep');
    const t2 = new LessonTracker(g, () => {});
    t2.restore(snap);
    expect(t2.completed.has('firstStone')).toBe(true);
    expect(t2.completed.has('noSuchStep')).toBe(false);
    expect(t2.current?.id).toBe('moreStones');
    expect(t2.hintLevel('moreStones')).toBe(1);
  });
});
