// Curriculum Phase 1, C4: every frozen version-1 save lands in the right lesson and step.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deriveLessons, legacyResume } from '../src/game/curriculum/migrate.js';
import { LessonTracker } from '../src/game/curriculum/tracker.js';
import { Game, type SaveData } from '../src/game/game.js';

function migrated(name: string) {
  const data = JSON.parse(readFileSync(`tests/fixtures/saves/${name}.json`, 'utf8')) as SaveData;
  const g = Game.restore(data);
  const t = new LessonTracker(g, () => {});
  deriveLessons(t, g, { objectives: data.objectives, questIndex: data.questIndex, questsVersion: data.questsVersion });
  return { g, t, data };
}

/** fixture → [lesson, step, finished lessons] */
const EXPECT: Record<string, [string, string, string[]]> = {
  fresh: ['shelter', 'firstStone', []],
  'mid-stones': ['shelter', 'moreStones', []],
  'mid-workbench': ['shelter', 'workbench', []],
  'pre-objectives': ['shelter', 'workbench', []],
  // In the middle of the fire chain: carry on with fire, the shelter comes after.
  'at-ember': ['fire', 'ember', []],
  // About to build a shelter after fire, pottery, charcoal and water.
  'make-camp': ['shelter', 'pole', ['fire', 'water']],
  'pre-quests-version': ['shelter', 'pole', ['fire', 'water']],
  'ch2-mid-frame': ['shelter', 'frame', ['fire', 'water']],
  // Everything of the old game done: only the new roof experiment and the bed are left of Lesson 01.
  'rain-tested': ['shelter', 'roofLayers', ['fire', 'water']],
};

describe('version-1 saves migrate into lessons', () => {
  for (const [name, [lesson, step, done]] of Object.entries(EXPECT)) {
    it(`${name} → ${lesson}/${step}`, () => {
      const { t } = migrated(name);
      expect(t.lesson?.id).toBe(lesson);
      expect(t.current?.id).toBe(step);
      for (const d of done) expect(t.lessonDone.has(d as never), `${d} finished`).toBe(true);
      expect(t.lessonDone.size).toBe(done.length);
    });
  }

  it('a player in the middle of the fire chain goes back to the shelter when fire is done', () => {
    const { g, t } = migrated('at-ember');
    expect(t.completed.has('cord')).toBe(true);
    expect(t.completed.has('exploreBench')).toBe(true);
    for (const f of ['emberMade', 'fireLit', 'charcoalMade'] as const) g.setFlag(f);
    t.update();
    expect(t.lessonDone.has('fire')).toBe(true);
    expect(t.lesson?.id).toBe('shelter');
    expect(t.current?.id).toBe('pole');
  });

  it('the old lessons map to where the old save was', () => {
    expect(legacyResume({ questIndex: 1, questsVersion: 2 })).toBe('fire');
    expect(legacyResume({ questIndex: 999, questsVersion: 2 })).toBeNull();
    expect(legacyResume({ questIndex: 0, questsVersion: 2 })).toBeNull();
  });

  it('migration is silent and never throws on odd data', () => {
    const g = new Game();
    const t = new LessonTracker(g, () => {});
    expect(() => deriveLessons(t, g, { objectives: { v: 1, index: 999, completed: ['nope'], bases: {}, learned: [], hints: {}, done: false, closed: false }, questIndex: -5 })).not.toThrow();
    expect(t.current?.id).toBe('firstStone');
  });
});
