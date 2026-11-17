// The curriculum in play order, and the step library every lesson draws from.
//
// Steps come from two places: the beginner objectives (objectives.ts, kept as a content library) and
// the new steps each lesson module adds. A step id is unique across both.

import type { HintInfo } from '../hint-info.js';
import { OBJECTIVES } from '../objectives.js';
import { FIRE } from './lessons/fire/lesson.js';
import { FOOD } from './lessons/food/lesson.js';
import { SHELTER } from './lessons/shelter/lesson.js';
import { TOOLS } from './lessons/tools/lesson.js';
import { WATER } from './lessons/water/lesson.js';
import type { ExperimentDef } from '../science/experiments.js';
import type { LessonDef, LessonId, LessonModule, Step } from './types.js';

/** Play order: 01 Shelter, 02 Fire, 03 Water, 04 Tools, 05 Food & Navigation. */
export const LESSON_MODULES: readonly LessonModule[] = [SHELTER, FIRE, WATER, TOOLS, FOOD];
export const LESSONS: readonly LessonDef[] = LESSON_MODULES.map((m) => m.lesson);
export const LESSON_IDS: readonly LessonId[] = LESSONS.map((l) => l.id);

/**
 * The levels players can choose now (the title screen's level list) and that the lesson guide moves through. A lesson
 * outside it is still being built: finishing the last playable one ends step-by-step guidance instead of starting the
 * next lesson. All five unless the app narrows it (src/index.ts); tests play all five.
 */
let playable: readonly LessonId[] = LESSON_IDS;
export function setPlayableLessons(ids: readonly LessonId[]): void {
  playable = LESSON_IDS.filter((id) => ids.includes(id));
}
export const playableLessons = (): readonly LessonId[] => playable;
export const isPlayable = (id: LessonId): boolean => playable.includes(id);

const BY_ID = new Map<LessonId, LessonDef>(LESSONS.map((l) => [l.id, l]));
export const lessonById = (id: LessonId): LessonDef | undefined => BY_ID.get(id);
export const lessonIndex = (id: LessonId): number => LESSON_IDS.indexOf(id);

/** Every step any lesson can show, by id. */
export const STEP_LIBRARY: ReadonlyMap<string, Step> = new Map<string, Step>([
  ...OBJECTIVES.map((o) => [o.id, o] as const),
  ...LESSON_MODULES.flatMap((m) => (m.steps ?? []).map((s) => [s.id, s] as const)),
]);
export const stepById = (id: string): Step | undefined => STEP_LIBRARY.get(id);

/** Every experiment, in lesson order. */
export const EXPERIMENTS: readonly ExperimentDef[] = LESSON_MODULES.flatMap((m) => m.experiments ?? []);

/** Picture hints for steps the lessons added (the beginner objectives' live in hint-info.ts). */
export const LESSON_HINTS: Readonly<Record<string, HintInfo>> = Object.assign({}, ...LESSON_MODULES.map((m) => m.hints ?? {}));

/** The lesson a step belongs to (each step is in exactly one lesson). */
const LESSON_OF_STEP = new Map<string, LessonId>(LESSONS.flatMap((l) => l.steps.map((s) => [s, l.id] as const)));
export const lessonOfStep = (stepId: string): LessonId | undefined => LESSON_OF_STEP.get(stepId);

/** Steps of the old beginner sequence that no lesson uses any more (kept only so old saves load). */
export const RETIRED_STEPS: ReadonlySet<string> = new Set(OBJECTIVES.map((o) => o.id).filter((id) => !LESSON_OF_STEP.has(id)));
