// NPE: the first steps. Seven one-instruction steps, gradual reveal, no repeated explanations, persistence.
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { guidedReveal, LESSON_IDS, LESSONS, OPENING, savedLessonIndex, TutorialRunner } from '../src/game/tutorial-lessons.js';

const ui = { hintLevel: 0, notebookOpen: false };
const idx = (id: string) => LESSON_IDS.indexOf(id as never);

describe('the first steps', () => {
  it('pickup, moving, building the bench, the bag, the bench, in that order', () => {
    expect(LESSON_IDS).toEqual(['stone', 'ring', 'marks', 'slab', 'top', 'bag', 'bench']);
    expect(LESSONS[0].title).toBe('Pinch the glowing stone');
    expect(OPENING.length).toBe(1);
  });

  it('a step does not advance until the player has done it (unless they skip)', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.poll(ui);
    expect(r.lesson.id).toBe('stone');
    g.gather('dryStone', 'tutorial');
    expect(r.lesson.id).toBe('ring');
  });
});

describe('gradual reveal of the HUD', () => {
  it('only the step card at first; the menu at the bag step; the goal card once the steps are done', () => {
    const none = new Set<never>();
    expect(guidedReveal(idx('stone'), none, false)).toEqual({ menu: false, objective: false });
    expect(guidedReveal(idx('top'), none, false)).toEqual({ menu: false, objective: false });
    expect(guidedReveal(idx('bag'), none, false)).toEqual({ menu: true, objective: false });
    expect(guidedReveal(idx('bench'), none, false)).toEqual({ menu: true, objective: false });
    expect(guidedReveal(0, none, true)).toEqual({ menu: true, objective: true });
  });
});

describe('a mechanic already shown is not explained again', () => {
  it('the walking step is passed when the player already moved before reaching it', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    const known: number[] = [];
    r.on((e) => e.type === 'known' && known.push(e.index));
    g.setPlayerPosition(1.5, 0);
    r.poll(ui);
    expect(r.skills.has('teleport')).toBe(true);
    g.gather('dryStone', 'tutorial');
    expect(known).toContain(idx('ring'));
    expect(r.lesson.id).toBe('marks');
  });

  it('a step the player chooses to replay is still played (never auto-passed)', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.skills.add('teleport');
    r.begin(idx('ring'));
    expect(r.lesson.id).toBe('ring');
  });
});

describe('tutorial persistence', () => {
  it('saves the open step by id and the skills shown', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    g.gather('dryStone', 'tutorial');
    r.begin(idx('marks'));
    const save = JSON.parse(JSON.stringify(r.snapshot()));
    expect(save.currentId).toBe('marks');
    expect(save.skills).toContain('pickup');
    const r2 = new TutorialRunner(new Game(), save);
    expect(r2.lesson.id).toBe('marks');
    expect(r2.skills.has('pickup')).toBe(true);
  });

  it('a save from the old, longer tutorial starts the new steps from the first one', () => {
    expect(savedLessonIndex({ current: 5 })).toBe(0);
    expect(savedLessonIndex({ current: 3, currentId: 'glide' as never })).toBe(0);
    const r = new TutorialRunner(new Game(), { done: ['hands', 'look'] as never, current: 3, finished: false });
    expect(r.lesson.id).toBe('stone');
  });
});
