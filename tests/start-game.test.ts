// The Start Game screen at the end of the first steps: it replaces "play simply carries on".
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { LESSONS, TutorialRunner } from '../src/game/tutorial-lessons.js';
import { clearProgress, hasSurvivalSave, type KeyStore, saveProgressRaw, SURVIVAL_SAVE_KEY, TUTORIAL_PROGRESS_KEY } from '../src/game/tutorial-mode.js';

function store(): KeyStore & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('Start Game screen', () => {
  it('has exactly two big choices: start (or continue) the game, redo the tutorial', () => {
    const t = readFileSync('public/ui/startgame.uikitml', 'utf8');
    expect(t).toContain('id="start-game"');
    expect(t).toContain('id="redo-tutorial"');
    expect(t).toContain('>Start the game<');
    expect(t).toContain('>Redo the tutorial<');
    expect((t.match(/<Button /g) ?? []).length).toBe(2);
    expect(t).toMatch(/\.big \{[^}]*height: (8\d|9\d)px/);
  });

  it('the tutorial is done after the last step, or when every step is skipped', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    expect(r.finished).toBe(false);
    r.skipAll();
    expect(r.finished).toBe(true);
    const r2 = new TutorialRunner(new Game());
    for (let i = 0; i < LESSONS.length; i++) r2.skipLesson();
    expect(r2.finished).toBe(true);
  });

  it('redo forgets the step progress (the next tutorial starts at step 1); the survival save is untouched', () => {
    const s = store();
    s.setItem(SURVIVAL_SAVE_KEY, '{"v":1}');
    saveProgressRaw(JSON.stringify({ done: ['stone'], current: 1, currentId: 'ring', finished: true }), s);
    clearProgress(s);
    expect(s.getItem(TUTORIAL_PROGRESS_KEY)).toBeNull();
    expect(s.getItem(SURVIVAL_SAVE_KEY)).toBe('{"v":1}');
    const r = new TutorialRunner(new Game(), null);
    expect(r.lesson.id).toBe(LESSONS[0].id);
  });

  it('says Continue when a survival game is already under way', () => {
    const s = store();
    expect(hasSurvivalSave(s)).toBe(false);
    s.setItem(SURVIVAL_SAVE_KEY, '{"v":1}');
    expect(hasSurvivalSave(s)).toBe(true);
  });
});
