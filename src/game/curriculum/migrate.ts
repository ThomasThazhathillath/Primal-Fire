// Save migration into the curriculum: work out lesson progress from an older save.
//
// Version-1 saves know nothing of lessons. Their progress is recovered from the state they already hold
// (the same predicates that decide every step), plus what the old beginner objectives and quest chain
// said the player was doing, so a player in the middle of something carries on with that same thing.
// Silent: no celebrations, no XP. Never throws: on any surprise it falls back to state alone.

import type { Game } from '../game.js';
import { migrateQuestIndex } from '../levels.js';
import { OBJECTIVES, type ObjectivesSave } from '../objectives.js';
import { QUESTS } from '../quests.js';
import { LESSONS, lessonOfStep, stepById } from './registry.js';
import type { LessonTracker } from './tracker.js';
import type { LessonId } from './types.js';

/** Old beginner objectives that no lesson uses, and the lesson their work belongs to now. */
const RETIRED_STEP_LESSON: Record<string, LessonId> = { shelter: 'shelter', cleanWater: 'water' };

export interface LegacyProgress {
  objectives?: ObjectivesSave;
  questIndex: number;
  questsVersion?: number;
}

/** The lesson an old save was in the middle of (null = just follow play order). */
export function legacyResume(legacy: LegacyProgress): LessonId | null {
  const o = legacy.objectives;
  if (o && !o.done) {
    const id = OBJECTIVES[o.index]?.id;
    if (id) return lessonOfStep(id) ?? RETIRED_STEP_LESSON[id] ?? null;
  }
  const title = QUESTS[migrateQuestIndex(legacy.questIndex, legacy.questsVersion)]?.title;
  if (!title) return null;
  return LESSONS.find((l) => l.legacyQuests?.includes(title))?.id ?? null;
}

/** Fill `t` (a fresh tracker on game `g`, after everything else was restored) from an old save. */
export function deriveLessons(t: LessonTracker, g: Game, legacy: LegacyProgress): void {
  const o = legacy.objectives;
  const learned = o?.learned ?? [];
  const hints = o?.hints ?? {};
  const closed = !!o?.closed;
  try {
    const bases: Record<string, number> = { ...(o?.bases ?? {}) };
    // Controls first: some steps are decided by what was learned (exploring the bench).
    t.load({ completed: [], resume: null, bases, learned, hints, closed });
    const completed = new Set<string>();
    for (const id of o?.completed ?? []) if (lessonOfStep(id)) completed.add(id);
    // Every step whose work is visibly done counts, in any order.
    for (const lesson of LESSONS) {
      for (const id of lesson.steps) {
        if (completed.has(id)) continue;
        const s = stepById(id)!;
        const base = bases[id] ?? s.legacyBase ?? 0;
        if (s.done(g, base) || s.implied?.(g)) completed.add(id);
      }
    }
    // A save from before the objectives: the controls of every finished step were clearly learned.
    const taught = new Set(learned);
    if (!o) for (const id of completed) {
      const teach = stepById(id)?.teach;
      if (teach) taught.add(teach);
    }
    for (const id of OBJECTIVES.map((x) => x.id)) if (!(id in bases) && completed.has(id)) bases[id] = 0;
    let resume = legacyResume(legacy);
    const resumeLesson = resume ? LESSONS.find((l) => l.id === resume) : undefined;
    if (resumeLesson && resumeLesson.steps.every((id) => completed.has(id))) resume = null;
    t.load({ completed: [...completed], resume, bases, learned: [...taught], hints, closed });
  } catch (err) {
    g.log.add(`lesson migration fell back to state only: ${String(err)}`, 'bad');
    t.load({ completed: [], resume: null, bases: {}, learned, hints, closed });
  }
}
