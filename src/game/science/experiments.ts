// Experiments (curriculum Phase 1, C9): question -> prediction -> trials -> result -> principle -> check.
//
// An experiment is fed by the real simulation: the code that runs a mechanic reports what actually
// happened as a trial (`game.experiments.trial(id, value, outcome)`); the tracker never invents outcomes.
// One variable is changed per experiment (the thing the player varies); once enough different values
// have been tried, the evidence decides which prediction it supports, and the player sees their own
// prediction next to the result. A short check question (assessments.ts) closes the experiment.
//
// Experiments live with their lesson (curriculum/lessons/<id>/experiments.ts).

import type { LessonId } from '../curriculum/types.js';
import type { Game } from '../game.js';
import type { Assessment } from './assessments.js';

export interface Choice {
  id: string;
  text: string;
}

export interface ExperimentDef {
  id: string;
  lesson: LessonId;
  /** The concept it teaches (science/concepts.ts). */
  concept: string;
  /** Card title ("How many roof layers keep rain out?"). */
  question: string;
  /** Why it matters, one sentence. */
  why: string;
  /** What you can predict (2-3). */
  predictions: Choice[];
  /** The thing you change, and its values. */
  variable: { name: string; values: Choice[] };
  /** What can happen in a trial. */
  outcomes: Choice[];
  /** How to run a trial (shown while testing). */
  howTo: string;
  /** The prediction the evidence supports, once every needed value has been tried (null before). */
  conclude: (trials: ReadonlyMap<string, string>) => string | null;
  /** The principle, one or two sentences. */
  principle: string;
  /** Where it applies in real life. */
  apply: string;
  /** What this test cannot tell you. */
  limits: string;
  /** The check question after the result. */
  check: Assessment;
  /** When the experiment is offered (it opens by itself). */
  opens: (g: Game) => boolean;
}

export type ExperimentPhase = 'locked' | 'predict' | 'testing' | 'result' | 'check' | 'done';

export interface ExperimentState {
  phase: ExperimentPhase;
  prediction: string | null;
  /** Variable value -> outcome, latest per value. */
  trials: Map<string, string>;
  /** The prediction the evidence supported. */
  supported: string | null;
  /** Check question: answers given (option ids), in order. */
  answers: string[];
}

export interface ExperimentsSave {
  v: 1;
  states: Record<string, { phase: ExperimentPhase; prediction: string | null; trials: Record<string, string>; supported: string | null; answers: string[] }>;
}

export type ExperimentEvent = { type: 'experiment'; id: string; phase: ExperimentPhase };

const fresh = (): ExperimentState => ({ phase: 'locked', prediction: null, trials: new Map(), supported: null, answers: [] });

export class ExperimentTracker {
  private readonly states = new Map<string, ExperimentState>();

  constructor(
    private readonly defs: readonly ExperimentDef[],
    private readonly emit: (e: ExperimentEvent) => void,
  ) {}

  def(id: string): ExperimentDef | undefined {
    return this.defs.find((d) => d.id === id);
  }

  state(id: string): ExperimentState {
    let s = this.states.get(id);
    if (!s) {
      s = fresh();
      this.states.set(id, s);
    }
    return s;
  }

  phase(id: string): ExperimentPhase {
    return this.states.get(id)?.phase ?? 'locked';
  }

  /** Has the experiment been run to its conclusion (result seen; the check may still be open)? */
  concluded(id: string): boolean {
    const p = this.phase(id);
    return p === 'result' || p === 'check' || p === 'done';
  }

  done(id: string): boolean {
    return this.phase(id) === 'done';
  }

  /** The experiment waiting for the player right now (a prediction, a result, a check), if any. */
  active(): string | null {
    for (const d of this.defs) {
      const p = this.phase(d.id);
      if (p === 'predict' || p === 'result' || p === 'check') return d.id;
    }
    return null;
  }

  /** The experiment being tested right now (for the card and hints). */
  testing(): string | null {
    for (const d of this.defs) if (this.phase(d.id) === 'testing') return d.id;
    return null;
  }

  private set(id: string, phase: ExperimentPhase): void {
    const s = this.state(id);
    if (s.phase === phase) return;
    s.phase = phase;
    this.emit({ type: 'experiment', id, phase });
  }

  /** Open experiments whose moment has come (called from the slow tick). */
  update(g: Game): void {
    for (const d of this.defs) if (this.phase(d.id) === 'locked' && d.opens(g)) this.set(d.id, 'predict');
  }

  /** The player's prediction: testing starts. Trials seen before it still count. */
  predict(id: string, choice: string): boolean {
    const d = this.def(id);
    const s = this.state(id);
    if (!d || s.phase !== 'predict' || !d.predictions.some((p) => p.id === choice)) return false;
    s.prediction = choice;
    this.set(id, 'testing');
    this.tryConclude(id);
    return true;
  }

  /**
   * The simulation reports what happened: the variable had `value` and the result was `outcome`.
   * Recorded from the moment the experiment is offered; ignored before that and after the result.
   */
  trial(id: string, value: string, outcome: string): void {
    const d = this.def(id);
    const s = this.state(id);
    if (!d || (s.phase !== 'predict' && s.phase !== 'testing')) return;
    if (!d.variable.values.some((v) => v.id === value) || !d.outcomes.some((o) => o.id === outcome)) return;
    if (s.trials.get(value) === outcome) return;
    s.trials.set(value, outcome);
    this.tryConclude(id);
  }

  private tryConclude(id: string): void {
    const d = this.def(id)!;
    const s = this.state(id);
    if (s.phase !== 'testing') return;
    const supported = d.conclude(s.trials);
    if (!supported) return;
    s.supported = supported;
    this.set(id, 'result');
  }

  /** The result was read: on to the check question. */
  acknowledge(id: string): void {
    if (this.phase(id) === 'result') this.set(id, 'check');
  }

  /** Answer the check question. A wrong answer explains why and can be tried again. */
  answer(id: string, option: string): { correct: boolean; why: string } | null {
    const d = this.def(id);
    const s = this.state(id);
    if (!d || s.phase !== 'check') return null;
    const o = d.check.options.find((x) => x.id === option);
    if (!o) return null;
    s.answers.push(option);
    if (o.correct) this.set(id, 'done');
    return { correct: !!o.correct, why: o.why };
  }

  /** Was the player's prediction the one the evidence supported? */
  predictedRight(id: string): boolean | null {
    const s = this.states.get(id);
    return s?.supported ? s.prediction === s.supported : null;
  }

  snapshot(): ExperimentsSave {
    const states: ExperimentsSave['states'] = {};
    for (const [id, s] of this.states) {
      if (s.phase === 'locked' && !s.trials.size) continue;
      states[id] = { phase: s.phase, prediction: s.prediction, trials: Object.fromEntries(s.trials), supported: s.supported, answers: [...s.answers] };
    }
    return { v: 1, states };
  }

  restore(save: ExperimentsSave | undefined): void {
    this.states.clear();
    if (!save) return;
    const phases: ExperimentPhase[] = ['locked', 'predict', 'testing', 'result', 'check', 'done'];
    for (const [id, s] of Object.entries(save.states ?? {})) {
      if (!this.def(id)) continue;
      this.states.set(id, {
        phase: phases.includes(s.phase) ? s.phase : 'locked',
        prediction: s.prediction ?? null,
        trials: new Map(Object.entries(s.trials ?? {})),
        supported: s.supported ?? null,
        answers: [...(s.answers ?? [])],
      });
    }
  }
}
