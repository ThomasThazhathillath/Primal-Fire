// Test helper: put a game's lesson tracker at a given step (everything before it counts as done).
import { LESSONS } from '../../src/game/curriculum/registry.js';
import type { Game } from '../../src/game/game.js';

export function jumpTo(g: Game, stepId: string): void {
  const li = LESSONS.findIndex((l) => l.steps.includes(stepId));
  if (li < 0) throw new Error(`no lesson has step ${stepId}`);
  const completed = [...LESSONS.slice(0, li).flatMap((l) => l.steps), ...LESSONS[li].steps.slice(0, LESSONS[li].steps.indexOf(stepId))];
  g.lessons.load({ completed, resume: LESSONS[li].id, bases: {}, learned: g.learnedControls(), hints: {}, closed: false });
}

/** Every lesson finished: no step on the card, no build focus. */
export function finishAll(g: Game): void {
  g.lessons.load({ completed: LESSONS.flatMap((l) => l.steps), resume: null, bases: {}, learned: g.learnedControls(), hints: {}, closed: false });
}
