// The Lab Notebook's pages (curriculum Phase 1, C10), worked out from the game state. Pure: no rendering.
//
// Lesson tabs -> the lesson's concepts (discovered, or a clue to find them) with its experiments and the
// challenges still open -> a concept's page in short sections: what you observed, the principle, your
// prediction and the experiment, the result, real life, limits, and a question to check yourself.
// Every section is a label and a few lines, so a page fits a card in the headset.

import { LESSONS, lessonById, lessonIndex, stepById } from '../curriculum/registry.js';
import type { LessonDef, LessonId } from '../curriculum/types.js';
import type { Game } from '../game.js';
import { LIVING_QUESTS } from '../living-quests.js';
import { OBSERVATIONS } from '../observations.js';
import { type Concept, conceptById, conceptsOf, discovered } from './concepts.js';
import type { ExperimentPhase } from './experiments.js';

export interface NotebookTab {
  id: LessonId;
  n: number;
  name: string;
  reached: boolean;
  done: boolean;
  /** Concepts discovered / taught. */
  found: number;
  total: number;
}

export interface ConceptRow {
  id: string;
  name: string;
  discovered: boolean;
  /** Entries recorded / entries the concept has. */
  found: number;
  total: number;
  /** New since the notebook was last opened. */
  fresh: boolean;
}

export interface ExperimentRow {
  id: string;
  question: string;
  phase: ExperimentPhase;
}

export interface LessonPage {
  lesson: LessonDef;
  tabs: NotebookTab[];
  rows: ConceptRow[];
  experiments: ExperimentRow[];
  /** What is still to do in this lesson (step titles), first first. */
  challenges: string[];
  /** Field tasks (Lesson 05): "The Hidden Trail 1/3". */
  fieldTasks: string[];
}

export interface Section {
  label: string;
  text: string;
}

export interface ConceptPage {
  concept: Concept;
  discovered: boolean;
  sections: Section[];
}

/** Sections shown per page of a concept. */
export const SECTIONS_PER_PAGE = 2;
/** Concept rows per page of a lesson. */
export const ROWS_PER_PAGE = 6;

const notebookSet = (g: Game): Set<string> => new Set(g.notebook);

export function tabs(g: Game): NotebookTab[] {
  const nb = notebookSet(g);
  return LESSONS.map((l) => {
    const cs = conceptsOf(l.id);
    return { id: l.id, n: l.n, name: l.name, reached: g.lessons.reached(l.id), done: g.lessons.lessonDone.has(l.id), found: cs.filter((c) => discovered(c, nb)).length, total: cs.length };
  });
}

/** The lesson the notebook opens on: the newest unread entry's, else the current lesson. */
export function openingLesson(g: Game): LessonId {
  const unread = g.notebook.slice(g.notebookSeen);
  for (let i = unread.length - 1; i >= 0; i--) {
    const c = conceptOfEntryId(unread[i]);
    if (c) return c.lesson;
  }
  return g.lessons.lesson?.id ?? LESSONS[LESSONS.length - 1].id;
}

function conceptOfEntryId(entry: string): Concept | undefined {
  for (const l of LESSONS) for (const c of conceptsOf(l.id)) if (c.entries.includes(entry)) return c;
  return undefined;
}

export function lessonPage(g: Game, id: LessonId): LessonPage {
  const lesson = lessonById(id)!;
  const nb = notebookSet(g);
  const unread = new Set(g.notebook.slice(g.notebookSeen));
  const rows = conceptsOf(id).map((c) => ({
    id: c.id,
    name: c.name,
    discovered: discovered(c, nb),
    found: c.entries.filter((e) => nb.has(e)).length,
    total: c.entries.length,
    fresh: c.entries.some((e) => unread.has(e)),
  }));
  const experiments = EXPERIMENT_IDS(g, id).map((eid) => ({ id: eid, question: g.experiments.def(eid)!.question, phase: g.experiments.phase(eid) }));
  const challenges = lesson.steps.filter((s) => !g.lessons.completed.has(s)).map((s) => stepById(s)?.title ?? s);
  const fieldTasks =
    id === 'food'
      ? LIVING_QUESTS.map((q) => {
          const done = q.steps.filter((st) => st.done(g)).length;
          return `${g.living.has(q.id) ? '[x]' : '[ ]'} ${q.title} ${done}/${q.steps.length}`;
        })
      : [];
  return { lesson, tabs: tabs(g), rows, experiments, challenges, fieldTasks };
}

const EXPERIMENT_IDS = (g: Game, lesson: LessonId): string[] => {
  const out: string[] = [];
  for (const l of LESSONS) if (l.id === lesson) for (const s of l.steps) if (g.experiments.def(s)) out.push(s);
  return out;
};

/** A concept's page: short labelled sections, in reading order. */
export function conceptPage(g: Game, conceptId: string): ConceptPage | null {
  const c = conceptById(conceptId);
  if (!c) return null;
  const nb = notebookSet(g);
  if (!discovered(c, nb)) {
    return { concept: c, discovered: false, sections: [{ label: 'NOT DISCOVERED YET', text: `Clue: ${c.discover}` }] };
  }
  const found = g.notebook.filter((e) => c.entries.includes(e));
  const sections: Section[] = [];
  for (const e of found) {
    const o = OBSERVATIONS[e];
    if (o) sections.push({ label: `OBSERVED: ${o.title.toUpperCase()}`, text: o.obs });
  }
  sections.push({ label: 'PRINCIPLE', text: c.idea });
  // Experiments that teach this concept: your prediction, what you tested, the result.
  for (const l of LESSONS) {
    if (lessonIndex(l.id) !== lessonIndex(c.lesson)) continue;
    for (const s of l.steps) {
      const d = g.experiments.def(s);
      if (!d || d.concept !== c.id) continue;
      const st = g.experiments.state(d.id);
      if (st.phase === 'locked') continue;
      const predicted = d.predictions.find((p) => p.id === st.prediction)?.text;
      if (predicted) sections.push({ label: 'YOUR PREDICTION', text: predicted });
      if (st.trials.size) {
        const trials = d.variable.values.filter((v) => st.trials.has(v.id)).map((v) => `${v.text}: ${d.outcomes.find((o) => o.id === st.trials.get(v.id))?.text ?? '?'}`);
        sections.push({ label: `EXPERIMENT: ${d.question.toUpperCase()}`, text: trials.join('. ') + '.' });
      }
      if (st.supported) sections.push({ label: 'RESULT', text: d.principle });
    }
  }
  sections.push({ label: 'IN REAL LIFE', text: c.apply });
  const lim = found.map((e) => OBSERVATIONS[e]?.lim).find((x) => !!x);
  if (lim) sections.push({ label: 'LIMITS', text: lim });
  const why = found.map((e) => OBSERVATIONS[e]?.why).find((x) => !!x);
  if (why) sections.push({ label: 'CHECK YOURSELF', text: why });
  return { concept: c, discovered: true, sections };
}

/** How many pages a list of `n` items needs at `per` a page (at least one). */
export const pages = (n: number, per: number): number => Math.max(1, Math.ceil(n / per));
