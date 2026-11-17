// The five-lesson curriculum ("Survive through Science"): shared types.
//
// A lesson is data: its story, survival goal, the science it teaches, and an ordered list of steps.
// A step is the same shape the objective card has always shown (objectives.ts `Objective`), so the
// card, hints, picture hints, guides and help work for every step unchanged. Each lesson lives in its
// own folder under curriculum/lessons/<id>/ (lesson.ts + steps.ts, later experiments, assessments and
// notebook entries), so lessons can grow independently without touching each other.

import type { HintInfo } from '../hint-info.js';
import type { Objective } from '../objectives.js';

/** Stable lesson ids: saves store these, never lesson numbers, so lessons can be reordered safely. */
export type LessonId = 'shelter' | 'fire' | 'water' | 'tools' | 'food';

/** A step: one thing to do, shown on the objective card. */
export type Step = Objective;

export interface LessonDef {
  id: LessonId;
  /** Shown as "Lesson 01". Matches the lesson's place in LESSONS. */
  n: number;
  /** Short name ("Shelter"). */
  name: string;
  /** Full title ("Understanding Nature & Building Shelter"). */
  title: string;
  /** Why this lesson matters right now, in one or two sentences (the intro card). */
  story: string;
  /** The survival objective. */
  goal: string;
  /** The science the player will discover here (short phrases for the intro card and notebook tabs). */
  science: string[];
  /** Step ids, in order (from the step library, curriculum/registry.ts `stepById`). */
  steps: string[];
  /**
   * While this lesson is current, a held key part only offers the structure the current step builds
   * (so a pole cannot start some other plan). Later lessons only prefer it.
   */
  strictBuild?: boolean;
  /** What finishing the lesson opens up, for the lesson-complete card. */
  unlocks: string[];
  /** Said when the lesson is complete. */
  complete: string;
  /** Old quest titles whose progress belongs to this lesson (save migration only). */
  legacyQuests?: string[];
}

/** What a lesson module contributes: the lesson, any new steps, and picture hints for them. */
export interface LessonModule {
  lesson: LessonDef;
  steps?: Step[];
  hints?: Record<string, HintInfo>;
}
