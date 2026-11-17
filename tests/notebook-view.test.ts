// Curriculum Phase 1, C10: the Lab Notebook's pages.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { conceptsOf } from '../src/game/science/concepts.js';
import { conceptPage, lessonPage, openingLesson, pages, ROWS_PER_PAGE, SECTIONS_PER_PAGE, tabs } from '../src/game/science/notebook-view.js';
import { jumpTo } from './helpers/lessons.js';

describe('lesson pages', () => {
  it('five tabs; only the first lesson is reached in a new game', () => {
    const t = tabs(new Game());
    expect(t.map((x) => x.n)).toEqual([1, 2, 3, 4, 5]);
    expect(t.filter((x) => x.reached).map((x) => x.id)).toEqual(['shelter']);
  });

  it('lists every concept of the lesson, undiscovered ones as such, with what is left to do', () => {
    const g = new Game();
    const p = lessonPage(g, 'shelter');
    expect(p.rows.map((r) => r.id)).toEqual(conceptsOf('shelter').map((c) => c.id));
    expect(p.rows.every((r) => !r.discovered)).toBe(true);
    expect(p.challenges[0]).toBe('Find your first stone');
    expect(p.experiments.map((e) => e.id)).toEqual(['framePush', 'roofLayers', 'bedMaterials', 'nightShelter']);
  });

  it('recording an entry discovers its concept, marked new until the notebook is opened', () => {
    const g = new Game();
    g.observe('b_tripod');
    const row = lessonPage(g, 'shelter').rows.find((r) => r.id === 'structures')!;
    expect(row).toMatchObject({ discovered: true, found: 1, fresh: true });
    expect(openingLesson(g)).toBe('shelter');
    g.notebookSeen = g.notebook.length;
    expect(lessonPage(g, 'shelter').rows.find((r) => r.id === 'structures')!.fresh).toBe(false);
  });

  it('Lesson 05 lists the field tasks', () => {
    expect(lessonPage(new Game(), 'food').fieldTasks.length).toBeGreaterThan(3);
  });
});

describe('concept pages', () => {
  it('an undiscovered concept shows only a clue, never the answer', () => {
    const p = conceptPage(new Game(), 'drainage')!;
    expect(p.discovered).toBe(false);
    expect(p.sections).toHaveLength(1);
    expect(p.sections[0].text).toMatch(/^Clue:/);
  });

  it('a discovered concept has observation, principle, real life, limits and a question', () => {
    const g = new Game();
    g.observe('c2_slope');
    const labels = conceptPage(g, 'drainage')!.sections.map((s) => s.label);
    expect(labels[0]).toMatch(/^OBSERVED/);
    for (const l of ['PRINCIPLE', 'IN REAL LIFE', 'LIMITS']) expect(labels).toContain(l);
  });

  it('shows your prediction, the experiment and its result once you ran it', () => {
    const g = new Game();
    g.observe('c2_slope');
    jumpTo(g, 'roof');
    g.experiments.update(g);
    g.experiments.predict('roofLayers', 'one');
    g.experiments.trial('roofLayers', '1', 'leaks');
    g.experiments.trial('roofLayers', '2', 'dry');
    const s = conceptPage(g, 'drainage')!.sections;
    const pred = s.find((x) => x.label === 'YOUR PREDICTION')!;
    expect(pred.text).toMatch(/One layer/);
    expect(s.find((x) => x.label.startsWith('EXPERIMENT'))!.text).toMatch(/One layer: drips through/);
    expect(s.some((x) => x.label === 'RESULT')).toBe(true);
  });

  it('every section is short enough for a card in the headset', () => {
    const g = new Game();
    for (const id of ['s_bed', 'c2_slope', 'f_drill', 'w_microbes', 't_flake', 'fm_dig']) g.observe(id);
    for (const c of ['heat_conduction', 'drainage', 'friction_heat', 'microbes', 'fracture', 'plants']) {
      for (const sec of conceptPage(g, c)!.sections) expect(sec.text.length, `${c}: ${sec.label}`).toBeLessThanOrEqual(240);
    }
  });

  it('pages a long list and long pages', () => {
    expect(pages(8, ROWS_PER_PAGE)).toBe(2);
    expect(pages(0, SECTIONS_PER_PAGE)).toBe(1);
  });
});

describe('notebook state', () => {
  it('how much of the notebook was read is saved; older saves count everything as read', () => {
    const g = new Game();
    g.observe('b_tripod');
    g.observe('s_bed');
    g.notebookSeen = 1;
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    expect(Game.restore(snap).notebookSeen).toBe(1);
    delete snap.notebookSeen;
    expect(Game.restore(snap).notebookSeen).toBe(2);
  });

  it('the notebook panel has a tab per lesson and the rows the system fills', () => {
    const ui = readFileSync('public/ui/notebook.uikitml', 'utf8');
    for (let i = 0; i < 5; i++) expect(ui).toContain(`id="nb-tab-${i}"`);
    for (let i = 0; i < ROWS_PER_PAGE; i++) expect(ui).toContain(`id="nb-row-${i}"`);
  });
});
