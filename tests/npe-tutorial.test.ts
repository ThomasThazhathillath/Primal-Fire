// NPE milestone B: the first five minutes. Stage order, gradual reveal, no repeated explanations, persistence.
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { guidedReveal, LESSON_IDS, LESSONS, OLD_ORDER, OPENING, savedLessonIndex, TutorialRunner } from '../src/game/tutorial-lessons.js';

const ui = { hintLevel: 0, notebookOpen: false };
const idx = (id: string) => LESSON_IDS.indexOf(id as never);

describe('the first five minutes follow the spec stages', () => {
  it('wake and move, first pickup, satchel, first crafting, first discovery come first, in order', () => {
    expect(LESSON_IDS.slice(0, 7)).toEqual(['glide', 'hands', 'satchel', 'gather', 'build', 'craft', 'notebook']);
    expect(LESSONS[idx('hands')].say).toBe('Look at a stone and pinch to pick it up.');
    expect(OPENING[0]).toBe('You awaken in an unfamiliar wilderness. Everything you need to survive must be discovered.');
  });

  it('a stage does not advance until the player has done it (unless they skip)', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.begin(idx('hands'));
    r.poll(ui);
    expect(r.lesson.id).toBe('hands');
    g.gather('dryStone', 'tutorial');
    expect(r.lesson.id).toBe('hands');
    g.gather('twigs', 'tutorial');
    expect(r.lesson.id).toBe('satchel');
  });
});

describe('gradual reveal of the HUD', () => {
  it('only the lesson card at first; the menu with the bag; the objective card after the first discovery', () => {
    const none = new Set<never>();
    expect(guidedReveal(idx('glide'), none, false)).toEqual({ menu: false, objective: false });
    expect(guidedReveal(idx('hands'), none, false)).toEqual({ menu: false, objective: false });
    expect(guidedReveal(idx('satchel'), none, false)).toEqual({ menu: true, objective: false });
    expect(guidedReveal(idx('craft'), none, false).objective).toBe(false);
    expect(guidedReveal(idx('look'), none, false)).toEqual({ menu: true, objective: true });
    expect(guidedReveal(0, none, true)).toEqual({ menu: true, objective: true });
  });
});

describe('a mechanic already shown is not explained again', () => {
  it('the bearings lesson is passed once teleport and turn were shown in the first stage', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    const known: number[] = [];
    r.on((e) => e.type === 'known' && known.push(e.index));
    g.setPlayerPosition(1.5, 0);
    r.poll(ui);
    g.facingYaw = 1;
    r.poll(ui);
    expect(r.skills.has('teleport') && r.skills.has('turn')).toBe(true);
    // Jump to just before 'move' and finish it: 'move' is passed with a word, not taught again.
    r.begin(idx('look'));
    r.skipLesson();
    expect(known).toContain(idx('move'));
    expect(r.done.has('move')).toBe(true);
    expect(r.lesson.id).toBe('place');
  });

  it('a lesson the player chooses to replay is still played (never auto-passed)', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.skills.add('teleport');
    r.skills.add('turn');
    r.begin(idx('move'));
    expect(r.lesson.id).toBe('move');
  });
});

describe('tutorial persistence', () => {
  it('saves the open lesson by id and the skills shown', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    g.gather('dryStone', 'tutorial');
    r.begin(idx('satchel'));
    const save = JSON.parse(JSON.stringify(r.snapshot()));
    expect(save.currentId).toBe('satchel');
    expect(save.skills).toContain('pickup');
    const r2 = new TutorialRunner(new Game(), save);
    expect(r2.lesson.id).toBe('satchel');
    expect(r2.skills.has('pickup')).toBe(true);
  });

  it('an old save (index into the old order, no id) resumes the same lesson', () => {
    for (let i = 0; i < OLD_ORDER.length; i++) {
      expect(LESSON_IDS[savedLessonIndex({ current: i })]).toBe(OLD_ORDER[i]);
    }
    const r = new TutorialRunner(new Game(), { done: ['hands', 'look', 'gather'], current: 3, finished: false });
    expect(r.lesson.id).toBe('satchel');
  });
});
