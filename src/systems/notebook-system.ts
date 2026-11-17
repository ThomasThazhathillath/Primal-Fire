// The Lab Notebook (curriculum Phase 1, C10): lesson tabs, each lesson's concepts (discovered, or a clue
// to find them), its experiments and what is left to do, and a page per concept in short sections
// (game/science/notebook-view.ts). Back and Next page through it; "Work on this lesson" picks the lesson
// the objective card follows (the lesson list). Opened from the Notes icon or N. Desktop: in front of the
// camera, mouse clicks. VR: a world panel held by StaticAnchor, pressed by fingertip, hand ray or gaze +
// pinch (PanelTouch). Replaces the old one-entry-at-a-time notebook card.

import { createSystem, type Entity, RayInteractable, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { LESSON_IDS } from '../game/curriculum/registry.js';
import type { LessonId } from '../game/curriculum/types.js';
import { conceptPage, lessonPage, openingLesson, pages, ROWS_PER_PAGE, SECTIONS_PER_PAGE } from '../game/science/notebook-view.js';
import { PanelTouch } from './panel-touch.js';
import { PopIn } from './ui-fx.js';
import { getGame, getUi, hidePanel, menu, placeInFront, StaticAnchor, uiText } from './shared.js';

/** Desktop: about 40 cm wide at 0.6 m, readable on a laptop screen. VR keeps arm's-length card size. */
const SCALE = 0.065;
const VR_SCALE = 0.042;
const TABS = 5;
const ON = '#f0a54e';
const OFF = '#5e6e34';
const DIM = '#3a3a2a';

type Mode = { kind: 'list'; lesson: LessonId; page: number } | { kind: 'page'; lesson: LessonId; concept: string; page: number };

export class NotebookSystem extends createSystem({}) {
  private panel!: UIKitMLAsset;
  private entity!: Entity;
  private touch!: PanelTouch;
  private pop!: PopIn;
  private anchor = StaticAnchor.slot('panel').movable('notebook', 620, 780);
  private ready = false;
  private vr = false;
  private open = false;
  private mode: Mode = { kind: 'list', lesson: 'shelter', page: 0 };

  async init(): Promise<void> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('notebook-panel');
    this.panel = panel;
    panel.name = 'LabNotebook';
    panel.scale.setScalar(SCALE);
    this.entity = this.world.createTransformEntity(panel);
    hidePanel(panel);
    this.touch = new PanelTouch(this.world, panel, SCALE, 'notebook');
    this.pop = new PopIn(panel, () => panel.scale.x);
    const wire = (id: string, fn: () => void) => {
      const el = panel.requireElementById(id);
      const click = () => {
        if (!this.vr) fn();
      };
      el.addEventListener('click', click);
      this.cleanupFuncs.push(() => el.removeEventListener('click', click));
      this.touch.add(id, fn);
    };
    for (let i = 0; i < TABS; i++) wire(`nb-tab-${i}`, () => this.showLesson(LESSON_IDS[i]));
    for (let i = 0; i < ROWS_PER_PAGE; i++) wire(`nb-row-${i}`, () => this.pickRow(i));
    wire('nb-prev', () => this.prev());
    wire('nb-next', () => this.next());
    wire('nb-resume', () => this.resume());
    wire('nb-close', () => menu.back());
    menu.register('notebook', () => this.close());

    const ui = getUi(this.world);
    ui.openNotebook = () => (this.open ? menu.back() : this.openBook());
    ui.notebookOpen = () => this.open;
    ui.newNotes = () => {
      const g = getGame(this.world);
      return Math.max(0, g.notebook.length - g.notebookSeen);
    };
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        if (this.vr && this.entity.hasComponent(RayInteractable)) this.entity.removeComponent(RayInteractable);
        if (!this.vr && !this.entity.hasComponent(RayInteractable)) this.entity.addComponent(RayInteractable);
        const s = this.vr ? VR_SCALE : SCALE;
        panel.scale.setScalar(s);
        this.touch.setScale(s);
        this.anchor.reset();
        this.touch.reset();
      }),
      getGame(this.world).on((e) => {
        if (this.open && (e.type === 'observation' || e.type === 'experiment' || e.type === 'objective')) this.render();
      }),
    );
    (window as unknown as { __notebook?: unknown }).__notebook = {
      panel,
      state: () => ({ open: this.open, mode: { ...this.mode } }),
      open: () => this.openBook(),
      lesson: (id: LessonId) => this.showLesson(id),
      row: (i: number) => this.pickRow(i),
      next: () => this.next(),
      prev: () => this.prev(),
    };
    this.ready = true;
  }

  private openBook(): void {
    if (!this.ready) return;
    const g = getGame(this.world);
    this.mode = { kind: 'list', lesson: openingLesson(g), page: 0 };
    this.open = true;
    menu.open('notebook');
    this.render();
    // Opening marks everything as read (the badge on the Notes icon clears); "new" rows still show this time.
    g.notebookSeen = g.notebook.length;
    getUi(this.world).saveNow?.();
    this.panel.visible = true;
    this.anchor.reset();
    this.touch.reset();
    this.place();
    this.pop.open();
  }

  private close(): void {
    this.open = false;
    menu.closed('notebook');
    this.pop.close(() => hidePanel(this.panel));
  }

  private showLesson(id: LessonId | undefined): void {
    if (!id) return;
    this.mode = { kind: 'list', lesson: id, page: 0 };
    this.render();
  }

  private pickRow(i: number): void {
    if (this.mode.kind !== 'list') return;
    const page = lessonPage(getGame(this.world), this.mode.lesson);
    const row = page.rows[this.mode.page * ROWS_PER_PAGE + i];
    if (!row) return;
    this.mode = { kind: 'page', lesson: this.mode.lesson, concept: row.id, page: 0 };
    this.render();
  }

  private count(): number {
    const g = getGame(this.world);
    if (this.mode.kind === 'list') return pages(lessonPage(g, this.mode.lesson).rows.length, ROWS_PER_PAGE);
    return pages(conceptPage(g, this.mode.concept)?.sections.length ?? 1, SECTIONS_PER_PAGE);
  }

  private next(): void {
    if (this.mode.page + 1 < this.count()) this.mode.page++;
    else if (this.mode.kind === 'list') {
      // Past the last page of a lesson: the next lesson's tab.
      const i = LESSON_IDS.indexOf(this.mode.lesson);
      if (i + 1 < LESSON_IDS.length) this.mode = { kind: 'list', lesson: LESSON_IDS[i + 1], page: 0 };
    }
    this.render();
  }

  /** Back: the previous page, else from a concept to its lesson, else close. */
  private prev(): void {
    if (this.mode.page > 0) this.mode.page--;
    else if (this.mode.kind === 'page') this.mode = { kind: 'list', lesson: this.mode.lesson, page: 0 };
    else {
      menu.back();
      return;
    }
    this.render();
  }

  /** The lesson list: follow this lesson on the objective card now. */
  private resume(): void {
    const g = getGame(this.world);
    const id = this.mode.lesson;
    if (g.lessons.lessonDone.has(id)) return;
    if (!g.lessons.reached(id)) {
      g.toast('Finish the lessons before it first: each one gives you what the next needs.', 'note');
      return;
    }
    g.lessons.setResume(id);
    g.toast(`Now following Lesson ${String(g.lessons.lesson?.n ?? 0).padStart(2, '0')}: ${g.lessons.lesson?.name ?? ''}.`, 'good');
    getUi(this.world).saveNow?.();
    this.render();
  }

  private render(): void {
    const g = getGame(this.world);
    const p = this.panel;
    const text = (id: string, t: string) => p.requireElementById<UIKit.Text>(id).setProperties({ text: uiText(t || ' ') });
    const show = (id: string, on: boolean) => p.requireElementById(id).setProperties({ display: on ? 'flex' : 'none' });
    const lp = lessonPage(g, this.mode.lesson);
    // Tabs: the open lesson lit, lessons not reached yet dimmed.
    lp.tabs.forEach((t, i) => {
      text(`nb-tab-${i}-label`, `${t.done ? '[x] ' : ''}${String(t.n).padStart(2, '0')}`);
      p.requireElementById(`nb-tab-${i}`).setProperties({ backgroundColor: t.id === this.mode.lesson ? ON : t.reached ? OFF : DIM } as never);
    });
    const tab = lp.tabs.find((t) => t.id === this.mode.lesson)!;
    const total = this.count();
    text('nb-page', `${this.mode.page + 1} / ${total}`);
    if (this.mode.kind === 'list') {
      text('nb-label', `LAB NOTEBOOK - LESSON ${String(lp.lesson.n).padStart(2, '0')} - ${tab.found} OF ${tab.total} DISCOVERED`);
      text('nb-title', lp.lesson.name);
      show('nb-list', true);
      show('nb-detail', false);
      const rows = lp.rows.slice(this.mode.page * ROWS_PER_PAGE, (this.mode.page + 1) * ROWS_PER_PAGE);
      for (let i = 0; i < ROWS_PER_PAGE; i++) {
        const r = rows[i];
        show(`nb-row-${i}`, !!r);
        if (!r) continue;
        text(`nb-row-${i}-label`, r.discovered ? `${r.fresh ? 'NEW  ' : ''}${r.name}  (${r.found}/${r.total})` : '???  Not discovered yet - tap for a clue');
        p.requireElementById(`nb-row-${i}`).setProperties({ backgroundColor: r.discovered ? '#3a2716' : '#2a2420' } as never);
      }
      const foot: string[] = [];
      for (const e of lp.experiments) foot.push(`Experiment: ${e.question} ${e.phase === 'done' ? '[done]' : e.phase === 'locked' ? '[later]' : '[in progress]'}`);
      if (lp.challenges.length) foot.push(`Still to do: ${lp.challenges.slice(0, 2).join('; ')}${lp.challenges.length > 2 ? ` (+${lp.challenges.length - 2} more)` : ''}`);
      else foot.push('Every step of this lesson is done.');
      if (lp.fieldTasks.length) foot.push(`Field tasks: ${lp.fieldTasks.slice(0, 3).join('; ')}`);
      text('nb-foot', foot.join('\n'));
      const following = g.lessons.lesson?.id === this.mode.lesson;
      show('nb-resume', !tab.done);
      text('nb-resume-label', following ? 'You are on this lesson' : tab.reached ? 'Work on this lesson' : 'Not open yet');
      text('nb-prev-label', this.mode.page > 0 ? 'Back' : 'Close');
    } else {
      const cp = conceptPage(g, this.mode.concept)!;
      text('nb-label', `LAB NOTEBOOK - LESSON ${String(lp.lesson.n).padStart(2, '0')}`);
      text('nb-title', cp.discovered ? cp.concept.name : 'Not discovered yet');
      show('nb-list', false);
      show('nb-detail', true);
      show('nb-resume', false);
      const secs = cp.sections.slice(this.mode.page * SECTIONS_PER_PAGE, (this.mode.page + 1) * SECTIONS_PER_PAGE);
      text('nb-sec-0-label', secs[0]?.label ?? '');
      text('nb-sec-0-text', secs[0]?.text ?? '');
      show('nb-sec-1', !!secs[1]);
      if (secs[1]) {
        text('nb-sec-1-label', secs[1].label);
        text('nb-sec-1-text', secs[1].text);
      }
      text('nb-prev-label', 'Back');
    }
  }

  private place(): void {
    if (this.vr) this.anchor.update(this.panel, this.camera);
    else placeInFront(this.panel, this.camera, 0.6, 0, 0.04);
  }

  update(delta: number): void {
    if (this.pop?.busy) this.pop.update(delta);
    if (!this.ready || !this.open) return;
    this.place();
    if (this.vr) this.touch.update(delta);
  }
}
