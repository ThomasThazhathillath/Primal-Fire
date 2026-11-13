import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { afterGather, afterRegrow } from '../src/game/resource-state.js';
import { LESSONS } from '../src/game/tutorial-lessons.js';
import { CAMP_CHARGES, CAMP_REGROW, tutorialSpots } from '../src/game/tutorial-layout.js';
import { CLIP_LABEL, LESSON_CLIPS, MOVE_CLIPS, OBJECTIVE_CLIPS } from '../src/systems/ghost-hand-system.js';

const ui = (n: string): string => readFileSync(`public/ui/${n}.uikitml`, 'utf8');

describe('tutorial regrowth is realistic', () => {
  it('a camp spot holds a few charges and takes minutes, not seconds, to refill one', () => {
    expect(CAMP_REGROW).toBeGreaterThanOrEqual(120);
    expect(CAMP_CHARGES).toBeLessThanOrEqual(3);
    for (const s of tutorialSpots()) {
      expect(s.regrow).toBe(CAMP_REGROW);
      expect(s.charges).toBe(CAMP_CHARGES);
    }
  });

  it('taking every charge never refills instantly', () => {
    const rule = { charges: CAMP_CHARGES, regrow: CAMP_REGROW };
    let st = afterGather(undefined, rule, 0);
    for (let i = 1; i < CAMP_CHARGES; i++) st = afterGather(st, rule, i);
    expect(st.c).toBe(0);
    expect(afterRegrow(st, rule, 30)).toBe('wait');
    expect(afterRegrow(st, rule, CAMP_REGROW - 1)).toBe('wait');
    expect(afterRegrow(st, rule, CAMP_REGROW + 1)).not.toBe('wait');
  });
});

describe('VR movement is taught', () => {
  it('has its own movement step, early, with the thumb gesture under Why?', () => {
    const ids = LESSONS.map((l) => l.id);
    expect(ids.indexOf('ring')).toBe(1);
    const l = LESSONS[ids.indexOf('ring')];
    expect(l.tip.toLowerCase()).toContain('thumb');
  });
});

describe('projected hand signs', () => {
  const wanted = ['pinch', 'grab', 'release', 'teleport', 'turn', 'point', 'carry', 'saw', 'twist'] as const;
  it('every action the player was promised has a sign with a label', () => {
    for (const c of wanted) expect(CLIP_LABEL[c], c).toBeTruthy();
    expect(MOVE_CLIPS).toEqual(['teleport', 'turn']);
  });
  it('lessons and objective How? cards only name signs that exist', () => {
    for (const c of [...Object.values(LESSON_CLIPS), ...Object.values(OBJECTIVE_CLIPS)]) expect(CLIP_LABEL[c], c).toBeTruthy();
    const ids = new Set(LESSONS.map((l) => l.id as string));
    for (const k of Object.keys(LESSON_CLIPS)) expect(ids.has(k), k).toBe(true);
    expect(LESSON_CLIPS.ring).toBe('teleport');
  });
  it('the tutorial card has a lesson button for every lesson but the last', () => {
    const t = ui('tutorial');
    for (let i = 0; i < LESSONS.length - 1; i++) expect(t.includes(`id="tut-l${i}"`), `tut-l${i}`).toBe(true);
  });
});

describe('title menu, pause card and turn buttons', () => {
  it('the title offers Play/Continue, New Game, Tutorial and Quit with big targets', () => {
    const t = ui('welcome');
    for (const id of ['begin-button', 'new-button', 'tutorial-button', 'quit-button']) expect(t.includes(`id="${id}"`), id).toBe(true);
    expect(t).toContain('PRIMAL');
    expect(t).toMatch(/\.big \{[^}]*height: (6\d|7\d|8\d)px/);
  });
  it('the pause card has Resume, a labelled Restart, Exit to Menu and Quit Game', () => {
    const t = ui('pausecard');
    for (const id of ['pause-resume', 'pause-restart', 'pause-menu', 'pause-quit']) expect(t.includes(`id="${id}"`), id).toBe(true);
    expect(t).toContain('>Restart<');
    expect(t).toContain('Exit to Menu');
    expect(t).toContain('Quit Game');
  });
  it('Restart and the turn buttons are no longer in the action menu', () => {
    const src = readFileSync('src/systems/icon-bar-system.ts', 'utf8');
    expect(src).toMatch(/id: 'restart', show: \(\) => false/);
    expect(src).toMatch(/id: 'turn-left', show: \(\) => false/);
    expect(src).toMatch(/id: 'turn-right', show: \(\) => false/);
    const turn = ui('turn');
    expect(turn).toContain('id="turn-l"');
    expect(turn).toContain('id="turn-r"');
  });
});
