// "THE FIRST STEPS — Learning to Survive" (docs/TUTORIAL_USABILITY_SPEC.md,
// part A). Two jobs:
//  - Survival page: the start choice. The welcome panel gets "Learn the
//    basics"; a first-time player who goes straight into VR sees a small card
//    with "Tutorial" / "Skip to survival".
//  - Tutorial page (its own Game and save key, chosen in index.ts before the
//    world exists): the compact lesson tracker. TutorialRunner watches the real
//    game; this system only draws the card and handles Repeat / Skip / Leave /
//    lesson numbers. In VR the card is tapped with a fingertip (PanelTouch); in
//    the browser it is clicked.

import { createSystem, type Entity, RayInteractable, Types, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { LESSONS, TutorialRunner, type TutorialSave } from '../game/tutorial-lessons.js';
import { choiceMade, chooseSurvival, loadProgressRaw, reloadInto, saveProgressRaw } from '../game/tutorial-mode.js';
import { PanelTouch } from './panel-touch.js';
import { getGame, getUi, hidePanel, menu, StaticAnchor, uiText } from './shared.js';
import { clearSave, WorldSystem } from './world-system.js';

const PANEL_SCALE = 0.045;
const POLL_SECONDS = 0.25;
const MAX_TASKS = 4;

type CardMode = 'hidden' | 'choice' | 'lesson' | 'finished';

export class TutorialSystem extends createSystem({}, { tutorial: { type: Types.Boolean, default: false } }) {
  private panel: UIKitMLAsset | null = null;
  private entity: Entity | null = null;
  private touch: PanelTouch | null = null;
  /** Up and to the left, above the working space of the hands (an accidental brush must not change lessons). */
  private anchor = new StaticAnchor(0.6, -0.42, -0.08, 1.0, 1.2);
  private runner: TutorialRunner | null = null;
  private mode: CardMode = 'hidden';
  private vr = false;
  private poll = 0;
  private dirty = true;
  private choiceDone = false;
  private els: Record<string, UIKit.Text | null | undefined> = {};

  async init(): Promise<void> {
    const tutorial = this.config.tutorial.peek();
    this.wireWelcome(tutorial);
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('tutorial-panel');
    this.panel = panel;
    panel.name = 'TutorialPanel';
    panel.scale.setScalar(PANEL_SCALE);
    this.entity = this.world.createTransformEntity(panel);
    this.entity.addComponent(RayInteractable);
    hidePanel(panel);
    for (const id of ['tut-label', 'tut-title', 'tut-say', 'tut-tip', 'tut-body', 'tut-cele', 'tut-cele-text', 'tut-start-t', 'tut-again-t', 'tut-repeat', 'tut-skip', 'tut-leave']) {
      this.els[id] = panel.getElementById<UIKit.Text>(id);
    }
    for (let i = 0; i < MAX_TASKS; i++) this.els[`t${i}`] = panel.getElementById<UIKit.Text>(`tut-task-${i}`);
    for (let i = 0; i < LESSONS.length; i++) this.els[`l${i}`] = panel.getElementById<UIKit.Text>(`tut-l${i}`);

    this.touch = new PanelTouch(this.world, panel, PANEL_SCALE, 'tutorial');
    // The card stays up while both hands work nearby: only a deliberate pointing finger taps it (as at the bench).
    this.touch.setRequirePoint(true);
    const wire = (id: string, fn: () => void) => {
      const el = panel.getElementById(id);
      if (!el) return;
      const click = () => {
        if (!this.vr) fn();
      };
      el.addEventListener('click', click);
      this.cleanupFuncs.push(() => el.removeEventListener('click', click));
      this.touch!.add(id, fn);
    };
    wire('tut-repeat', () => this.runner?.begin(this.runner.current));
    wire('tut-skip', () => this.runner?.skipLesson());
    wire('tut-leave', () => this.leave());
    wire('tut-start', () => (this.mode === 'choice' ? reloadInto('tutorial') : this.leave()));
    wire('tut-again', () => (this.mode === 'choice' ? this.skipChoice() : this.practise()));
    for (let i = 0; i < LESSONS.length; i++) wire(`tut-l${i}`, () => this.runner?.begin(i));

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        if (this.entity) PanelTouch.setRay(this.world, this.entity, this.vr);
        this.anchor.reset();
        this.touch?.reset();
        this.dirty = true;
      }),
    );

    if (tutorial) this.startRunner();
    this.installDebug();
  }

  /** Welcome panel: "Learn the basics" (survival) or "Leave tutorial" (tutorial). */
  private wireWelcome(tutorial: boolean): void {
    const welcome = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    const btn = welcome?.getElementById('tutorial-button');
    if (!welcome || !btn) return;
    if (tutorial) welcome.getElementById<UIKit.Text>('tutorial-label')?.setProperties({ text: 'Leave tutorial' });
    const click = () => {
      if (tutorial) this.leave();
      else reloadInto('tutorial');
    };
    btn.addEventListener('click', click);
    this.cleanupFuncs.push(() => btn.removeEventListener('click', click));
    // Pressing "Wake up" on the survival page is the skip choice.
    if (!tutorial) {
      const begin = welcome.getElementById('begin-button');
      const skip = () => chooseSurvival();
      begin?.addEventListener('click', skip);
      this.cleanupFuncs.push(() => begin?.removeEventListener('click', skip));
    }
  }

  private startRunner(): void {
    let save: TutorialSave | null = null;
    try {
      const raw = loadProgressRaw();
      if (raw) save = JSON.parse(raw) as TutorialSave;
    } catch {
      save = null;
    }
    const game = getGame(this.world);
    this.runner = new TutorialRunner(game, save);
    this.cleanupFuncs.push(
      () => this.runner?.dispose(),
      this.runner.on((e) => {
        this.dirty = true;
        if (e.type === 'task') game.toast(`Done: ${LESSONS[e.index].tasks[e.task].text}.`, 'good');
        if (e.type === 'lessonDone') game.log.add(`tutorial lesson ${LESSONS[e.index].id} done`, 'ok');
        if (e.type === 'lesson') {
          game.toast(LESSONS[e.index].say, 'note');
          this.mode = 'lesson'; // a replay after finishing shows the lesson again
        }
        if (e.type === 'finished') {
          game.toast('THE FIRST STEPS complete. You are ready to survive.', 'good');
          this.mode = 'finished';
        }
        this.saveProgress();
      }),
    );
    this.mode = this.runner.finished ? 'finished' : 'lesson';
  }

  private saveProgress(): void {
    if (this.runner) saveProgressRaw(JSON.stringify(this.runner.snapshot()));
  }

  private leave(): void {
    // Only the tutorial page can leave: clearSave() below must never run against the survival save.
    if (!this.config.tutorial.peek() || !this.runner) return;
    this.saveProgress();
    // In tutorial mode the save key is the tutorial's: this drops its game and blocks the pagehide save.
    clearSave();
    reloadInto('survival');
  }

  private practise(): void {
    this.mode = 'lesson';
    this.dirty = true;
  }

  private skipChoice(): void {
    chooseSurvival();
    this.choiceDone = true;
    this.mode = 'hidden';
    if (this.panel) hidePanel(this.panel);
  }

  private render(): void {
    const e = this.els;
    const show = (id: string, on: boolean) => e[id]?.setProperties({ display: on ? 'flex' : 'none' });
    if (this.mode === 'choice') {
      e['tut-label']?.setProperties({ text: 'NEW HERE?' });
      e['tut-title']?.setProperties({ text: 'THE FIRST STEPS' });
      e['tut-cele-text']?.setProperties({ text: 'Learn the basics in a small training camp first. Your survival game is not touched.' });
      e['tut-start-t']?.setProperties({ text: 'Tutorial' });
      e['tut-again-t']?.setProperties({ text: 'Skip to survival' });
      show('tut-body', false);
      show('tut-cele', true);
      return;
    }
    const r = this.runner;
    if (!r) return;
    if (this.mode === 'finished') {
      e['tut-label']?.setProperties({ text: 'THE FIRST STEPS - COMPLETE' });
      e['tut-title']?.setProperties({ text: 'Well done.' });
      e['tut-cele-text']?.setProperties({ text: 'You gathered, built, crafted and made fire. The real forest is waiting.' });
      e['tut-start-t']?.setProperties({ text: 'Start survival' });
      e['tut-again-t']?.setProperties({ text: 'Stay and practise' });
      show('tut-body', false);
      show('tut-cele', true);
      return;
    }
    show('tut-body', true);
    show('tut-cele', false);
    const l = r.lesson;
    e['tut-label']?.setProperties({ text: `THE FIRST STEPS - LESSON ${r.current + 1} OF ${LESSONS.length}` });
    e['tut-title']?.setProperties({ text: uiText(l.title.replace(/^\d+\.\s*/, '')) });
    e['tut-say']?.setProperties({ text: uiText(l.say) });
    e['tut-tip']?.setProperties({ text: uiText(l.tip) });
    const next = r.nextTask();
    for (let i = 0; i < MAX_TASKS; i++) {
      const el = e[`t${i}`];
      const t = l.tasks[i];
      if (!t) {
        el?.setProperties({ display: 'none' });
        continue;
      }
      const done = r.ticks[i];
      el?.setProperties({
        display: 'flex',
        text: `${done ? '[x]' : i === next ? '>' : '[ ]'} ${uiText(t.text)}`,
        color: done ? '#86dc97' : i === next ? '#ffc283' : '#d3c4a6',
      });
    }
    for (let i = 0; i < LESSONS.length; i++) {
      const doneL = r.done.has(LESSONS[i].id);
      e[`l${i}`]?.setProperties({ backgroundColor: i === r.current ? '#ff8a3d' : doneL ? '#2c6a3d' : 'rgba(255, 200, 140, 0.13)' });
    }
  }

  update(delta: number): void {
    const panel = this.panel;
    if (!panel) return;
    const started = this.world.getSystem(WorldSystem)?.started ?? false;
    if (!started) return;
    // First-time players who skipped the welcome screen (straight into VR) get the choice here.
    if (!this.runner && this.mode === 'hidden' && !this.choiceDone) {
      if (choiceMade()) this.choiceDone = true;
      else {
        this.mode = 'choice';
        this.dirty = true;
      }
    }
    if (this.mode === 'hidden') return;
    // Another panel (bag, bench, notebook, hint) is open: step aside so the two never overlap.
    const ui = getUi(this.world);
    if (menu.current !== null || (ui.notebookOpen?.() ?? false) || (ui.hintOpen?.() ?? false)) {
      if (panel.visible) hidePanel(panel);
      this.pollRunner(delta);
      return;
    }
    if (!panel.visible) {
      panel.visible = true;
      this.anchor.reset();
      this.dirty = true;
    }
    this.anchor.update(panel, this.camera);
    this.pollRunner(delta);
    if (this.dirty) {
      this.dirty = false;
      this.render();
    }
    if (this.vr) this.touch?.update(delta);
  }

  /** The lessons keep watching while the card is hidden (a hint or the notebook is what some lessons are about). */
  private pollRunner(delta: number): void {
    if ((this.poll += delta) < POLL_SECONDS || !this.runner) return;
    this.poll = 0;
    const game = getGame(this.world);
    const ui = getUi(this.world);
    const cur = game.objectives.current;
    this.runner.poll({ hintLevel: cur ? game.objectives.hintLevel(cur.id) : 0, notebookOpen: ui.notebookOpen?.() ?? false });
  }

  private installDebug(): void {
    (window as unknown as { __tutorial?: unknown }).__tutorial = {
      state: () => ({
        mode: this.mode,
        lesson: this.runner?.current ?? -1,
        id: this.runner?.lesson.id ?? null,
        ticks: this.runner ? [...this.runner.ticks] : [],
        done: this.runner ? [...this.runner.done] : [],
        finished: this.runner?.finished ?? false,
      }),
      begin: (i: number) => this.runner?.begin(i),
      skip: () => this.runner?.skipLesson(),
      skipAll: () => this.runner?.skipAll(),
      tap: (id: string) => this.touch?.tapById(id),
    };
  }
}
