// "THE FIRST STEPS": the guided opening of PRIMAL (docs/TUTORIAL_USABILITY_SPEC.md,
// part A), told as your first afternoon in the forest rather than a training
// course. Two jobs:
//  - Survival page: the start choice. The welcome panel offers the guided
//    opening; a first-time player who goes straight into VR gets a small card.
//    A survival game started straight after the opening picks up the story and
//    the controls you learned (never items).
//  - Opening page (its own Game and save key, chosen in index.ts before the
//    world exists): narration, the dusk clock and a small story card.
//    TutorialRunner watches the real game; this system only says, shows and
//    handles Do again / Skip / step numbers (behind the Story menu icon).
//    In VR the card is tapped with a pointing fingertip (PanelTouch); in the
//    browser it is clicked.

import { createSystem, type Entity, RayInteractable, Types, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { START_HOUR } from '../game/environment.js';
import type { InteractionId } from '../game/objectives.js';
import { ghost } from './shared.js';
import { LESSON_CLIPS } from './ghost-hand-system.js';
import { CLOSING, guidedReveal, LESSONS, OPENING, storyHour, TutorialRunner, type TutorialSave } from '../game/tutorial-lessons.js';
import { choiceMade, chooseSurvival, loadProgressRaw, reloadInto, saveCarry, saveProgressRaw, takeCarry } from '../game/tutorial-mode.js';
import { PanelTouch } from './panel-touch.js';
import { assistFx, getGame, getUi, hidePanel, menu, reveal, StaticAnchor, uiText } from './shared.js';
import { groundHeight } from '../game/world-layout.js';
import { clearSave, WorldSystem } from './world-system.js';

const PANEL_SCALE = 0.045;
const POLL_SECONDS = 0.25;
const MAX_TASKS = 4;
/** Seconds between narration lines. */
const LINE_GAP = 4.5;
/** The opening's own clock: the sky moves with your progress, not the real minutes (a very long day). */
const STORY_DAY_SECONDS = 1e7;
/** How fast the sky catches up with the story hour (hours per second). */
const SKY_RATE = 0.15;

type CardMode = 'hidden' | 'choice' | 'lesson' | 'finished';

export class TutorialSystem extends createSystem({}, { tutorial: { type: Types.Boolean, default: false } }) {
  private panel: UIKitMLAsset | null = null;
  private entity: Entity | null = null;
  private touch: PanelTouch | null = null;
  /** Up and to the left, above the working space of the hands (an accidental brush must not change steps). */
  private anchor = new StaticAnchor(0.6, -0.42, 0.12, 1.0, 1.2).movable('tutorial', 520, 300);
  private runner: TutorialRunner | null = null;
  private mode: CardMode = 'hidden';
  /** The Story icon unfolds the card: every task, the tip, and the replay / skip controls. */
  private expanded = false;
  private vr = false;
  private poll = 0;
  private dirty = true;
  private choiceDone = false;
  private els: Record<string, UIKit.Text | null | undefined> = {};
  /** Narration waiting to be said, one line every LINE_GAP seconds. */
  private lines: string[] = [];
  private lineTimer = 1.5;
  private skyHour = -1;
  private shownQuarter = -1;

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
    for (const id of ['tut-label', 'tut-title', 'tut-say', 'tut-tip', 'tut-body', 'tut-ctrl', 'tut-nums', 'tut-cele', 'tut-cele-text', 'tut-start-t', 'tut-again-t', 'tut-why-t', 'tut-repeat', 'tut-leave']) {
      this.els[id] = panel.getElementById<UIKit.Text>(id);
    }
    for (let i = 0; i < MAX_TASKS; i++) this.els[`t${i}`] = panel.getElementById<UIKit.Text>(`tut-body-${i}`);
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
    wire('tut-why', () => {
      this.expanded = !this.expanded;
      this.dirty = true;
    });
    wire('tut-repeat', () => this.runner?.begin(this.runner.current));
    wire('tut-skip', () => this.runner?.skipLesson());
    wire('tut-leave', () => this.leave(false));
    wire('tut-start', () => (this.mode === 'choice' ? reloadInto('tutorial') : this.leave(true)));
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

  /** Welcome panel: the guided opening (survival page) or "Skip to survival" (opening page). */
  private wireWelcome(tutorial: boolean): void {
    const welcome = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    welcome?.getElementById<UIKit.Text>('tutorial-label')?.setProperties({ text: tutorial ? 'Skip tutorial' : 'Tutorial' });
    // The title menu (IntroSystem) calls these for fingertip, gaze and mouse alike.
    const ui = getUi(this.world);
    ui.titleTutorial = () => (tutorial ? this.leave(false) : reloadInto('tutorial'));
    // Pressing Play on the survival page is the skip choice.
    ui.titlePlay = () => {
      if (!tutorial) chooseSurvival();
    };
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
    // The sky follows the story: a very long day, its hour set from how far you have come.
    game.env.dayLength = STORY_DAY_SECONDS;
    this.runner = new TutorialRunner(game, save);
    if (!save) this.lines.push(...OPENING);
    getUi(this.world).toggleStory = () => {
      this.expanded = !this.expanded;
      if (this.mode === 'finished' && this.expanded) this.mode = 'lesson';
      this.dirty = true;
    };
    this.cleanupFuncs.push(
      () => this.runner?.dispose(),
      this.runner.on((e) => {
        this.dirty = true;
        if (e.type === 'lessonDone') game.log.add(`opening step ${LESSONS[e.index].id} done`, 'ok');
        if (e.type === 'known') {
          // Already shown: one word instead of the whole explanation again (NPE B).
          game.log.add(`opening step ${LESSONS[e.index].id} already known`, 'ok');
          this.lines.push(`You already know this one (${LESSONS[e.index].title.toLowerCase()}).`);
        }
        if (e.type === 'task' && LESSONS[e.index].id === 'stone' && e.task === 0) {
          // The first pickup: confirm it and say where it went (NPE B, stage 2).
          game.toast('Got it! It is in your pouch.', 'good');
        }
        if (e.type === 'science') this.lines.push(e.text);
        if (e.type === 'lesson') {
          this.lines.push(LESSONS[e.index].say);
          this.mode = 'lesson'; // a replay after finishing shows the step again
        }
        if (e.type === 'finished') {
          this.lines.push(...CLOSING);
          this.mode = 'finished';
          this.expanded = false;
        }
        this.saveProgress();
      }),
    );
    // The first step's line follows the opening narration.
    if (!this.runner.finished) this.lines.push(this.runner.lesson.say);
    this.mode = this.runner.finished ? 'finished' : 'lesson';
  }

  private saveProgress(): void {
    if (this.runner) saveProgressRaw(JSON.stringify(this.runner.snapshot()));
  }

  /** Go on to survival. `carry`: the opening was finished, so its learned controls (never items) come along. */
  private leave(carry: boolean): void {
    // Only the opening page can leave: clearSave() below must never run against the survival save.
    if (!this.config.tutorial.peek() || !this.runner) return;
    this.saveProgress();
    if (carry) {
      const learned = getGame(this.world).objectives.snapshot().learned;
      saveCarry({ learned });
      getGame(this.world).log.add(`story carry saved: ${learned.join(',') || 'nothing'}`, 'ok');
    }
    // In the opening the save key is its own: this drops its game and blocks the pagehide save.
    clearSave();
    reloadInto('survival');
  }

  /** Survival page: a fresh game straight after the opening picks up the story and the learned controls. */
  private applyCarry(): void {
    const carry = takeCarry();
    if (!carry) return;
    const game = getGame(this.world);
    if (game.time > 5 || game.structures.length > 0) {
      // An existing survival game keeps its own state.
      game.log.add(`story carry ignored: survival game already under way (${game.time.toFixed(0)}s)`);
      return;
    }
    for (const id of carry.learned) game.objectives.learn(id as InteractionId);
    // The opening already told the awakening: survival goes on from the morning after.
    game.story.markSeen('awake');
    game.log.add(`story carry: learned ${carry.learned.join(',') || 'nothing'}`, 'ok');
    this.lines.push("Morning. Last night's fire is ash, and you are somewhere new.", 'The mast is still there on the horizon. You know how to begin.');
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
      e['tut-title']?.setProperties({ text: 'Learn the basics?' });
      e['tut-cele-text']?.setProperties({ text: 'Seven quick steps. Your game is not touched.' });
      e['tut-start-t']?.setProperties({ text: 'Yes, show me' });
      e['tut-again-t']?.setProperties({ text: 'Skip' });
      show('tut-body', false);
      show('tut-cele', true);
      return;
    }
    const r = this.runner;
    if (!r) return;
    const g = getGame(this.world);
    this.shownQuarter = Math.floor(g.env.hour * 4);
    if (this.mode === 'finished') {
      e['tut-label']?.setProperties({ text: 'DONE' });
      e['tut-title']?.setProperties({ text: 'Well done!' });
      e['tut-cele-text']?.setProperties({ text: 'You are ready. Your goals will guide you.' });
      e['tut-start-t']?.setProperties({ text: 'Start the game' });
      e['tut-again-t']?.setProperties({ text: 'Practise more' });
      show('tut-body', false);
      show('tut-cele', true);
      return;
    }
    show('tut-body', true);
    show('tut-cele', false);
    const l = r.lesson;
    const x = this.expanded;
    // One instruction, verb first: the card's title. "Why?" opens the how-to; nothing else is on the card.
    e['tut-label']?.setProperties({ text: `STEP ${r.current + 1} OF ${LESSONS.length}` });
    e['tut-title']?.setProperties({ text: uiText(l.title) });
    e['tut-tip']?.setProperties({ text: uiText(l.tip) });
    e['tut-why-t']?.setProperties({ text: x ? 'Hide' : 'Why?' });
    show('tut-say', false);
    show('tut-tip', x);
    show('tut-ctrl', true);
    show('tut-repeat', x);
    show('tut-leave', x);
    show('tut-nums', false);
    for (let i = 0; i < MAX_TASKS; i++) e[`t${i}`]?.setProperties({ display: 'none' });
  }

  /**
   * Gradual reveal (NPE B): while the guided stages run, the menu appears once the bag is taught and the objective
   * card once the first discovery is made; before that the lesson card is the only guide on screen.
   */
  private applyReveal(): void {
    const r = this.runner;
    if (!r || r.finished || !this.config.tutorial.peek()) {
      reveal.menu = true;
      reveal.objective = true;
      return;
    }
    const v = guidedReveal(r.current, r.done, r.finished);
    reveal.menu = v.menu;
    reveal.objective = v.objective;
  }

  update(delta: number): void {
    const panel = this.panel;
    if (!panel) return;
    this.applyReveal();
    const started = this.world.getSystem(WorldSystem)?.started ?? false;
    if (!started) return;
    if (!this.runner && !this.choiceDone && this.mode === 'hidden') {
      this.applyCarry();
      // First-time players who skipped the welcome screen (straight into VR) get the choice here.
      if (choiceMade()) this.choiceDone = true;
      else {
        this.mode = 'choice';
        this.dirty = true;
      }
    }
    this.speak(delta);
    this.moveSky(delta);
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
    // Folded, the card is only something to read: nothing on it can be tapped by accident.
    if (this.vr) this.touch?.update(delta);
  }

  /** One narration line at a time, as a toast (the HUD shows and logs it). */
  private speak(delta: number): void {
    if (!this.lines.length || (this.lineTimer -= delta) > 0) return;
    this.lineTimer = LINE_GAP;
    getGame(this.world).toast(this.lines.shift()!, 'note');
  }

  /** Early afternoon at the start, dusk by the last step. */
  private moveSky(delta: number): void {
    const r = this.runner;
    if (!r) return;
    const g = getGame(this.world);
    const target = storyHour(r.finished && r.done.size === LESSONS.length && this.mode === 'finished' ? null : r.lesson.id);
    if (this.skyHour < 0) this.skyHour = target;
    const d = target - this.skyHour;
    if (Math.abs(d) > 1e-3) this.skyHour += Math.sign(d) * Math.min(Math.abs(d), SKY_RATE * delta);
    g.env.hourOffset = this.skyHour - START_HOUR - (g.time / g.env.dayLength) * 24;
  }

  /** The steps keep watching while the card is hidden (a hint or the notebook is what some steps are about). */
  private pollRunner(delta: number): void {
    if ((this.poll += delta) < POLL_SECONDS || !this.runner) return;
    this.poll = 0;
    const game = getGame(this.world);
    const ui = getUi(this.world);
    const cur = game.objectives.current;
    this.runner.poll({ hintLevel: cur ? game.objectives.hintLevel(cur.id) : 0, notebookOpen: ui.notebookOpen?.() ?? false, bagOpen: menu.current === 'bag', benchOpen: menu.current === 'bench' });
    // Always show where the next thing is: one arrow and ring on the exact target of this step.
    const t = this.runner.finished || this.mode !== 'lesson' ? null : (this.runner.lesson.target?.(game) ?? null);
    assistFx.exact = t ? { id: `tut_${t.id}`, x: t.x, y: groundHeight(t.x, t.z), z: t.z } : null;
    // The ghost hand shows the current lesson's gesture until its tasks are done.
    const lc = this.runner.finished || this.mode !== 'lesson' ? undefined : LESSON_CLIPS[this.runner.lesson.id];
    ghost.clip = lc && this.runner.nextTask() >= 0 ? lc : null;
    ghost.card = 'tutorial';
    // The time of day on the card, every quarter hour.
    if (Math.floor(game.env.hour * 4) !== this.shownQuarter) this.dirty = true;
  }

  private installDebug(): void {
    (window as unknown as { __tutorial?: unknown }).__tutorial = {
      state: () => ({
        mode: this.mode,
        expanded: this.expanded,
        lesson: this.runner?.current ?? -1,
        id: this.runner?.lesson.id ?? null,
        ticks: this.runner ? [...this.runner.ticks] : [],
        done: this.runner ? [...this.runner.done] : [],
        finished: this.runner?.finished ?? false,
        hour: getGame(this.world).env.hour,
        pending: this.lines.length,
      }),
      begin: (i: number) => this.runner?.begin(i),
      skip: () => this.runner?.skipLesson(),
      skipAll: () => this.runner?.skipAll(),
      tap: (id: string) => this.touch?.tapById(id),
    };
  }
}

/** 13.5 -> "1:30 PM" (plain ASCII for the bundled font). */
function clockText(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 4) * 15;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
