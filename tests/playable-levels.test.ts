// Levels on offer one at a time (title screen level list): with only Level 1 playable, finishing it ends the guide
// instead of starting Lesson 02, and nothing can resume an unfinished lesson that is not playable yet.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { isPlayable, LESSON_IDS, LESSONS, playableLessons, setPlayableLessons } from '../src/game/curriculum/registry.js';
import { LessonTracker } from '../src/game/curriculum/tracker.js';
import { Game, type GameEvent } from '../src/game/game.js';

function tracked() {
  const g = new Game();
  const events: GameEvent[] = [];
  const t = new LessonTracker(g, (e) => events.push(e));
  return { g, t, events };
}

/** Lesson 01 down to its last step, then the night test answered and passed (as in lessons.test.ts). */
function finishShelter(t: LessonTracker): void {
  t.load({ completed: LESSONS[0].steps.slice(0, -1), resume: null, bases: {}, learned: [], hints: {}, closed: false });
  const game = (t as unknown as { game: Game }).game;
  game.experiments.restore({ v: 1, states: { nightShelter: { phase: 'done', prediction: 'less', trials: { open: 'fast', shelter: 'steady' }, supported: 'less', answers: ['shelter'] } } });
  game.science('shelter.night.warm');
  t.update();
}

describe('playable levels', () => {
  afterEach(() => setPlayableLessons(LESSON_IDS));

  it('all five are playable unless the app narrows it, in play order whatever order they are named in', () => {
    expect(playableLessons()).toEqual(LESSON_IDS);
    setPlayableLessons(['water', 'shelter']);
    expect(playableLessons()).toEqual(['shelter', 'water']);
    expect(isPlayable('fire')).toBe(false);
  });

  it('a new game starts on Level 1 when only Level 1 is playable', () => {
    setPlayableLessons(['shelter']);
    const { t } = tracked();
    expect(t.lesson?.id).toBe('shelter');
    expect(t.current?.id).toBe(LESSONS[0].steps[0]);
  });

  it('finishing Level 1 ends the guide: no next lesson, not every lesson done', () => {
    setPlayableLessons(['shelter']);
    const { t, events } = tracked();
    finishShelter(t);
    expect(events.find((e) => e.type === 'lessonComplete')).toMatchObject({ lesson: 'shelter', next: null });
    expect(t.lessonDone.has('shelter')).toBe(true);
    expect(t.lesson).toBeNull();
    expect(t.current).toBeNull();
    expect(t.done).toBe(true);
    expect(t.allDone).toBe(false);
  });

  it('an unplayable lesson cannot be resumed (the notebook lesson list), and a save already in one waits', () => {
    setPlayableLessons(['shelter']);
    const { t } = tracked();
    t.setResume('fire');
    expect(t.lesson?.id).toBe('shelter');
    // A save from before (resume = fire, Level 1 done): no step until Fire is playable again.
    t.load({ completed: LESSONS[0].steps, resume: 'fire', bases: {}, learned: [], hints: {}, closed: false });
    expect(t.lesson).toBeNull();
    setPlayableLessons(LESSON_IDS);
    t.load({ completed: LESSONS[0].steps, resume: 'fire', bases: {}, learned: [], hints: {}, closed: false });
    expect(t.lesson?.id).toBe('fire');
  });

  it('with every lesson playable, finishing Level 1 still leads into Lesson 02', () => {
    const { t, events } = tracked();
    finishShelter(t);
    expect(events.find((e) => e.type === 'lessonComplete')).toMatchObject({ lesson: 'shelter', next: { id: 'fire' } });
    expect(t.lesson?.id).toBe('fire');
  });
});

describe('title card level list (welcome.uikitml)', () => {
  const ui = readFileSync('public/ui/welcome.uikitml', 'utf8');
  it('has a row, button, label and note for every lesson, the tutorial row, Back, and the title buttons to swap with', () => {
    const ids = ['title-menu', 'levels', 'levels-back', 'lvl-row-tutorial', 'lvl-tutorial', 'begin-button'];
    for (const id of LESSON_IDS) ids.push(`lvl-row-${id}`, `lvl-${id}`, `lvl-${id}-label`, `lvl-${id}-note`);
    for (const id of ids) expect(ui.includes(`id="${id}"`), id).toBe(true);
  });
});
