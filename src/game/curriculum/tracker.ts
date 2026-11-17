// LessonTracker: the one progression driver of the five-lesson curriculum.
//
// It replaces the beginner ObjectiveTracker and the linear quest chain as what the objective card, hints,
// picture hints, help and build gating follow. Every step is decided from state the game already keeps
// (gathered counts, structures, flags, science events), exactly as objectives always were, so a step
// done early or in an old save is simply recognised as done.
//
// Rules:
// - Lessons run in play order; steps inside a lesson run in order. Completed steps stay completed.
// - The current lesson is `resume` (a lesson the player chose, or the one an old save was in the middle
//   of) until it is finished, then the first unfinished lesson in play order.
// - When a step finishes: it is recorded at once (save-worthy), the card celebrates it briefly, then the
//   next step appears. When the last step of a lesson finishes, `lessonComplete` is emitted.

import { MessageGate, openMarks } from '../assist.js';
import { BLUEPRINTS, type StructureKind } from '../blueprint.js';
import type { Game, GameEvent } from '../game.js';
import {
  CELEBRATE_SECONDS,
  FEEDBACK_SECONDS,
  type InteractionId,
  nextActionLine,
  nextStepLine,
  type ObjectiveView,
  partsLine,
  readyToBuild,
  TEACH,
  whereFor,
} from '../objectives.js';
import { LESSON_IDS, LESSONS, lessonById, lessonIndex, stepById } from './registry.js';
import type { LessonDef, LessonId, Step } from './types.js';

export interface LessonsSave {
  v: 1;
  /** Step ids finished, in the order they finished. */
  completed: string[];
  lessonDone: LessonId[];
  /** The lesson being worked on before the first unfinished one (null = play order). */
  resume: LessonId | null;
  bases: Record<string, number>;
  learned: string[];
  hints: Record<string, number>;
  closed: boolean;
}

/** What the lesson-complete card needs about the next lesson. */
export interface NextLesson {
  id: LessonId;
  n: number;
  name: string;
  story: string;
}

export class LessonTracker {
  readonly completed = new Set<string>();
  readonly lessonDone = new Set<LessonId>();
  resume: LessonId | null = null;
  private bases: Record<string, number> = {};
  private learned = new Set<InteractionId>();
  private hints: Record<string, number> = {};
  /** The player closed the card (kept so a reload does not reopen it). */
  closed = false;
  private celebrate: { id: string; left: number } | null = null;
  private fxOff: string | null = null;
  /** Short, auto-dismissing contextual messages: one at a time, not repeated soon. */
  readonly gate = new MessageGate();
  private ctxT = 0;
  private feedback: { text: string; left: number } | null = null;
  /** Cached current position, recomputed whenever a step or lesson finishes. */
  private cur: { lesson: LessonDef; step: Step } | null = null;

  constructor(
    private readonly game: Game,
    private readonly emit: (e: GameEvent) => void,
  ) {
    this.recompute();
  }

  // ------------------------------------------------------------ position

  /** The lesson being worked on (null once every lesson is finished). */
  get lesson(): LessonDef | null {
    return this.cur?.lesson ?? null;
  }

  /** The step on the card (null once every lesson is finished). */
  get current(): Step | null {
    return this.cur?.step ?? null;
  }

  /** Every lesson finished: step-by-step guidance is over. */
  get done(): boolean {
    return this.cur === null;
  }

  /** The lesson to work on now: `resume` while it is unfinished, else the first unfinished lesson. */
  private activeLesson(): LessonDef | null {
    if (this.resume && !this.lessonDone.has(this.resume)) return lessonById(this.resume) ?? null;
    return LESSONS.find((l) => !this.lessonDone.has(l.id)) ?? null;
  }

  private recompute(): void {
    this.cur = null;
    for (let guard = 0; guard < LESSONS.length + 1; guard++) {
      const lesson = this.activeLesson();
      if (!lesson) return;
      const id = lesson.steps.find((s) => !this.completed.has(s));
      if (id === undefined) {
        // Every step was already done (migration, steps finished out of order): the lesson is finished.
        this.lessonDone.add(lesson.id);
        continue;
      }
      const step = stepById(id);
      if (!step) throw new Error(`Lesson ${lesson.id} names unknown step ${id}`);
      this.cur = { lesson, step };
      // Progress on a counted step starts from when it became current.
      if (this.bases[id] === undefined) this.bases[id] = step.baseline?.(this.game) ?? 0;
      return;
    }
  }

  /** Has the player got as far as this lesson (current, finished, or a later one current or finished)? */
  reached(id: LessonId): boolean {
    let furthest = this.lesson ? lessonIndex(this.lesson.id) : LESSON_IDS.length - 1;
    for (const d of this.lessonDone) furthest = Math.max(furthest, lessonIndex(d));
    return lessonIndex(id) <= furthest;
  }

  /** Work on this lesson now (the Menu lesson list). Finished lessons cannot be resumed. */
  setResume(id: LessonId | null): void {
    this.resume = id && !this.lessonDone.has(id) ? id : null;
    this.feedback = null;
    this.recompute();
    this.emit({ type: 'objective', id: this.current?.id ?? null });
  }

  /**
   * Which structure a held key part should offer: in a strict lesson only the current step's structure
   * (null = none); in other lessons the current step's structure is preferred (undefined = no preference).
   */
  buildFocus(): StructureKind | null | undefined {
    const c = this.cur;
    if (!c) return undefined;
    return c.lesson.strictBuild ? (c.step.structure ?? null) : (c.step.structure ?? undefined);
  }

  // ------------------------------------------------------------ controls

  setClosed(closed: boolean): void {
    this.closed = closed;
  }

  hasLearned(id: InteractionId): boolean {
    return this.learned.has(id);
  }

  learnedList(): InteractionId[] {
    return [...this.learned];
  }

  learn(id: InteractionId): void {
    if (this.learned.has(id)) return;
    this.learned.add(id);
    this.game.log.add(`learned interaction: ${id}`);
    this.update();
  }

  /** Called with every game event: learns controls from what the player does. */
  observe(e: GameEvent): void {
    switch (e.type) {
      case 'gather':
        if (e.item === 'dryStone' || e.item === 'wetStone') this.gate.say(this.game.time, 'stoneGot', 'Stone collected!');
        this.learned.add('grab');
        if (e.tool) this.learned.add('tool');
        break;
      case 'held':
        if (e.item) this.learned.add('grab');
        break;
      case 'structure':
        this.learned.add('build');
        if (e.structure.spots.some((v) => v !== null) || e.structure.keyPlaced) this.learned.add('place');
        break;
      case 'bench':
        if (e.state === 'start') this.learned.add('bench');
        break;
      case 'fire':
        if (e.stage !== 'cold') this.learned.add('fire');
        break;
      case 'toast':
        if (e.kind === 'bad') {
          this.feedback = { text: e.text, left: FEEDBACK_SECONDS };
          this.gate.clear();
        }
        break;
    }
  }

  // ------------------------------------------------------------ progress

  private isDone(s: Step): boolean {
    return s.done(this.game, this.bases[s.id] ?? 0) || (s.implied?.(this.game) ?? false);
  }

  /** Check the current step; record finished steps and lessons at once. */
  update(): void {
    let celebrated = false;
    for (let guard = 0; guard < 64 && this.cur && this.isDone(this.cur.step); guard++) {
      const { lesson, step } = this.cur;
      this.completed.add(step.id);
      this.feedback = null;
      this.game.log.add(`step complete: ${lesson.id}/${step.id}`, 'ok');
      if (!celebrated) {
        celebrated = true;
        this.celebrate = { id: step.id, left: CELEBRATE_SECONDS };
        this.emit({ type: 'objectiveDone', id: step.id, message: step.doneMessage });
      }
      if (lesson.steps.every((s) => this.completed.has(s))) this.finishLesson(lesson);
      this.recompute();
    }
    if (celebrated) this.emit({ type: 'objective', id: this.current?.id ?? null });
  }

  private finishLesson(lesson: LessonDef): void {
    if (this.lessonDone.has(lesson.id)) return;
    this.lessonDone.add(lesson.id);
    if (this.resume === lesson.id) this.resume = null;
    const next = this.activeLesson();
    this.game.log.add(`lesson complete: ${lesson.id}`, 'ok');
    this.emit({
      type: 'lessonComplete',
      lesson: lesson.id,
      n: lesson.n,
      name: lesson.name,
      next: next ? { id: next.id, n: next.n, name: next.name, story: next.story } : null,
    });
  }

  tick(dt: number): void {
    if (this.feedback && (this.feedback.left -= dt) <= 0) this.feedback = null;
    this.gate.tick(dt);
    if ((this.ctxT -= dt) <= 0) {
      this.ctxT = 0.5;
      this.context();
    }
    if (this.celebrate && (this.celebrate.left -= dt) <= 0) {
      this.celebrate = null;
      this.emit({ type: 'objective', id: this.current?.id ?? null });
    }
  }

  /** Contextual messages from where you are and what you hold (at most one, each only now and then). */
  private context(): void {
    const g = this.game;
    const held = g.held;
    if (held === 'slab' && !g.structures.some((s) => s.kind === 'workbench')) this.gate.say(g.time, 'slabHeld', 'Find open ground.');
    for (const m of openMarks(g.structures)) {
      const d = Math.hypot(m.x - g.player.x, m.z - g.player.z);
      if (d > 4) continue;
      if (held && m.accepts.includes(held) && d < 2.5) {
        this.gate.say(g.time, `fits_${m.structure.id}`, 'Let go here.');
        return;
      }
      const s = m.structure;
      const open = BLUEPRINTS[s.kind].spots.filter((_, i) => s.spots[i] === null).length;
      if (open > 0 && !held) {
        this.gate.say(g.time, `needs_${s.id}`, `${open} more ${open === 1 ? 'part' : 'parts'} needed.`);
        return;
      }
    }
  }

  // ------------------------------------------------------------ the card

  private stepNumber(lesson: LessonDef, id: string): number {
    return lesson.steps.indexOf(id) + 1;
  }

  /** What the card shows now, or null once every lesson is finished. */
  view(): ObjectiveView | null {
    const g = this.game;
    if (this.celebrate) {
      const s = stepById(this.celebrate.id)!;
      const lesson = LESSONS.find((l) => l.steps.includes(s.id)) ?? this.lesson;
      return {
        id: s.id,
        title: s.title,
        instruction: '',
        progress: null,
        substeps: [],
        tip: null,
        where: null,
        next: null,
        message: null,
        feedback: null,
        celebrating: { title: s.title, message: s.doneMessage },
        step: lesson ? this.stepNumber(lesson, s.id) : 1,
        total: lesson?.steps.length ?? 1,
        hintLevel: this.hintLevel(s.id),
        lesson: lesson ? { id: lesson.id, n: lesson.n, name: lesson.name } : undefined,
      };
    }
    const c = this.cur;
    if (!c) return null;
    const o = c.step;
    const substeps = o.substeps ? o.substeps(g) : [];
    const next = nextStepLine(g) ?? readyToBuild(g);
    const message = this.gate.left > 0 ? this.gate.text : null;
    return {
      id: o.id,
      title: o.title,
      instruction: typeof o.instruction === 'function' ? o.instruction(g) : o.instruction,
      progress: o.progress ? o.progress(g, this.bases[o.id] ?? 0) : null,
      short: typeof o.short === 'function' ? o.short(g) : (o.short ?? o.title),
      parts: partsLine(o, g),
      nextAction: nextActionLine(o, g, message, next, substeps),
      substeps,
      tip: o.howTo?.(g) ?? (o.teach && !this.learned.has(o.teach) ? TEACH[o.teach] : null),
      where: whereFor(o, g),
      next,
      message,
      feedback: this.feedback?.text ?? null,
      celebrating: null,
      step: this.stepNumber(c.lesson, o.id),
      total: c.lesson.steps.length,
      hintLevel: this.hintLevel(o.id),
      lesson: { id: c.lesson.id, n: c.lesson.n, name: c.lesson.name },
    };
  }

  // ------------------------------------------------------------ hints

  hintLevel(id: string): number {
    return this.hints[id] ?? 0;
  }

  /** Unlock the next hint level (1..4) of a step and return the level now open. */
  unlockHint(id: string): number {
    const level = Math.min(4, this.hintLevel(id) + 1);
    this.hints[id] = level;
    this.fxOff = null;
    this.emit({ type: 'hintGiven', level });
    return level;
  }

  /** The hint level whose world effects should show now: 0 once dismissed or for another step. */
  hintFxLevel(): number {
    const o = this.current;
    return o && this.fxOff !== o.id ? this.hintLevel(o.id) : 0;
  }

  dismissHintFx(): void {
    this.fxOff = this.current?.id ?? null;
  }

  // ------------------------------------------------------------ save / load

  snapshot(): LessonsSave {
    return {
      v: 1,
      completed: [...this.completed],
      lessonDone: [...this.lessonDone],
      resume: this.resume,
      bases: { ...this.bases },
      learned: [...this.learned],
      hints: { ...this.hints },
      closed: this.closed,
    };
  }

  /** Restore saved lesson progress (unknown step and lesson ids from other versions are ignored). */
  restore(s: LessonsSave): void {
    this.completed.clear();
    this.lessonDone.clear();
    for (const id of s.completed) if (stepById(id)) this.completed.add(id);
    for (const id of s.lessonDone) if (lessonById(id)) this.lessonDone.add(id);
    // A lesson whose every step is done is finished, whichever lesson is current.
    for (const l of LESSONS) if (l.steps.every((x) => this.completed.has(x))) this.lessonDone.add(l.id);
    this.resume = s.resume && lessonById(s.resume) ? s.resume : null;
    this.bases = { ...s.bases };
    this.learned = new Set(s.learned as InteractionId[]);
    this.hints = { ...s.hints };
    this.closed = !!s.closed;
    this.celebrate = null;
    this.feedback = null;
    this.recompute();
    // State may have moved on (steps done by actions since); settle silently.
    this.settle();
  }

  /** Mark every step that is done now as completed, without celebrations (loading, migration). */
  settle(): void {
    for (let guard = 0; guard < 64 && this.cur && this.isDone(this.cur.step); guard++) {
      const { lesson, step } = this.cur;
      this.completed.add(step.id);
      if (lesson.steps.every((x) => this.completed.has(x))) {
        this.lessonDone.add(lesson.id);
        if (this.resume === lesson.id) this.resume = null;
      }
      this.recompute();
    }
  }

  /** Migration hook: start from this state (used by deriveLessons). */
  load(s: Omit<LessonsSave, 'v' | 'lessonDone'>): void {
    this.restore({ v: 1, lessonDone: [], ...s });
  }
}
