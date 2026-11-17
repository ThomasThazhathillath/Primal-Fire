// The experiment card (curriculum Phase 1, C9): shows an experiment (game/science/experiments.ts) phase by
// phase. It opens by itself when there is something to do (a prediction to make, a result to read, a check
// question) and from the objective card's Why? button on the experiment's step. While you test, it can stay
// closed: the objective card tracks the trials. Desktop: a panel in front of the camera, clicked with the
// mouse. VR: a world panel held by StaticAnchor, pressed by fingertip, hand ray or gaze + pinch (PanelTouch).

import { createSystem, type Entity, RayInteractable, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { lessonById } from '../game/curriculum/registry.js';
import type { ExperimentDef } from '../game/science/experiments.js';
import { currentMode } from '../game/tutorial-mode.js';
import { PanelTouch } from './panel-touch.js';
import { PopIn } from './ui-fx.js';
import { getGame, getUi, hidePanel, menu, placeInFront, StaticAnchor, uiText } from './shared.js';

/** Desktop: readable at 0.5 m; VR uses the same card at arm's length through StaticAnchor. */
const SCALE = 0.06;
const OPTS = 3;
/** Trial rows on the card (one per value of the variable). */
const TRIALS = 4;

export class ExperimentSystem extends createSystem({}) {
  private panel!: UIKitMLAsset;
  private entity!: Entity;
  private touch!: PanelTouch;
  private pop!: PopIn;
  private anchor = StaticAnchor.slot('panel').movable('experiment', 600, 700);
  private ready = false;
  private vr = false;
  private opened: string | null = null;
  /** The check question's last answer feedback ("Right: ..." / "Not quite: ..."). */
  private feedback: string | null = null;
  /** The live readout line shown in the note while testing (refreshed twice a second, set only when it changes). */
  private shownNote = '';
  private noteT = 0;

  async init(): Promise<void> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('experiment-panel');
    this.panel = panel;
    panel.name = 'ExperimentCard';
    panel.scale.setScalar(SCALE);
    this.entity = this.world.createTransformEntity(panel);
    hidePanel(panel);
    this.touch = new PanelTouch(this.world, panel, SCALE, 'experiment');
    this.pop = new PopIn(panel, () => SCALE);
    const wire = (id: string, fn: () => void) => {
      const el = panel.requireElementById(id);
      const click = () => {
        if (!this.vr) fn();
      };
      el.addEventListener('click', click);
      this.cleanupFuncs.push(() => el.removeEventListener('click', click));
      this.touch.add(id, fn);
    };
    for (let i = 0; i < OPTS; i++) wire(`exp-opt-${i}`, () => this.choose(i));
    wire('exp-action', () => this.action());
    wire('exp-close', () => menu.back());
    menu.register('experiment', () => this.close());

    const game = getGame(this.world);
    getUi(this.world).openExperiment = (id: string) => this.open(id);
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        if (this.vr && this.entity.hasComponent(RayInteractable)) this.entity.removeComponent(RayInteractable);
        if (!this.vr && !this.entity.hasComponent(RayInteractable)) this.entity.addComponent(RayInteractable);
        this.anchor.reset();
        this.touch.reset();
      }),
      game.on((e) => {
        if (e.type !== 'experiment' || currentMode() === 'tutorial') return;
        // Something to do: the card comes up by itself. Otherwise just refresh it if it is open.
        if (e.phase === 'predict' || e.phase === 'result') this.open(e.id);
        else if (this.opened === e.id) this.render();
      }),
    );
    (window as unknown as { __experiment?: unknown }).__experiment = {
      panel,
      state: () => ({ opened: this.opened, phase: this.opened ? getGame(this.world).experiments.phase(this.opened) : null, feedback: this.feedback }),
      choose: (i: number) => this.choose(i),
      action: () => this.action(),
      open: (id: string) => this.open(id),
    };
    this.ready = true;
  }

  private def(): ExperimentDef | null {
    return this.opened ? (getGame(this.world).experiments.def(this.opened) ?? null) : null;
  }

  open(id: string): void {
    if (!this.ready || !getGame(this.world).experiments.def(id)) return;
    this.opened = id;
    this.feedback = null;
    menu.open('experiment');
    this.render();
    this.panel.visible = true;
    this.anchor.reset();
    this.touch.reset();
    this.place();
    this.pop.open();
  }

  close(): void {
    menu.closed('experiment');
    this.opened = null;
    this.pop.close(() => hidePanel(this.panel));
  }

  /** An option button: a prediction, or an answer to the check question. */
  private choose(i: number): void {
    const d = this.def();
    if (!d) return;
    const exps = getGame(this.world).experiments;
    const phase = exps.phase(d.id);
    if (phase === 'predict') {
      const p = d.predictions[i];
      if (p && exps.predict(d.id, p.id)) getUi(this.world).saveNow?.();
    } else if (phase === 'check') {
      const o = d.check.options[i];
      const r = o ? exps.answer(d.id, o.id) : null;
      if (r) {
        this.feedback = `${r.correct ? 'Right' : 'Not quite'}: ${r.why}`;
        getUi(this.world).saveNow?.();
      }
    }
    this.render();
  }

  /** The big button: the experiment's own test action or Keep testing (testing), Continue (result), Done. */
  private action(): void {
    const d = this.def();
    if (!d) return;
    const g = getGame(this.world);
    const phase = g.experiments.phase(d.id);
    if (phase === 'testing') {
      const said = d.testAction?.run(g) ?? null;
      if (said) g.toast(said, 'note');
      menu.back();
      return;
    }
    if (phase === 'result') {
      g.experiments.acknowledge(d.id);
      this.render();
      return;
    }
    menu.back();
  }

  private render(): void {
    const d = this.def();
    if (!d) return;
    const g = getGame(this.world);
    const s = g.experiments.state(d.id);
    const p = this.panel;
    const text = (id: string, t: string) => p.requireElementById<UIKit.Text>(id).setProperties({ text: uiText(t || ' ') });
    const show = (id: string, on: boolean) => p.requireElementById(id).setProperties({ display: on ? 'flex' : 'none' });
    const lesson = lessonById(d.lesson);
    text('exp-label', `EXPERIMENT - LESSON ${String(lesson?.n ?? 0).padStart(2, '0')}`);
    text('exp-title', d.question);
    const outcomeText = (o: string) => d.outcomes.find((x) => x.id === o)?.text ?? o;
    const predicted = d.predictions.find((x) => x.id === s.prediction)?.text ?? '';
    let body = '';
    let note = '';
    let options: string[] = [];
    let action: string | null = null;
    const trials = d.variable.values.map((v) => (s.trials.has(v.id) ? `[x] ${v.text}: ${outcomeText(s.trials.get(v.id)!)}` : `[ ] ${v.text}: not seen yet`));
    let showTrials = false;
    switch (s.phase) {
      case 'predict':
        body = `${d.why} What do you predict?`;
        options = d.predictions.map((x) => x.text);
        break;
      case 'testing':
        body = `Your prediction: ${predicted} ${d.howTo}`;
        showTrials = true;
        action = d.testAction?.label(g) ?? 'Keep testing';
        note = d.readout?.(g) ?? '';
        break;
      case 'result': {
        const right = g.experiments.predictedRight(d.id);
        const supported = d.predictions.find((x) => x.id === s.supported)?.text ?? '';
        body = `${right ? 'Your prediction was right.' : 'The evidence says otherwise.'} Result: ${supported} ${d.principle}`;
        showTrials = true;
        action = 'Continue';
        note = d.readout?.(g) ?? '';
        break;
      }
      case 'check':
        body = d.check.question;
        options = d.check.options.map((x) => x.text);
        note = this.feedback ?? '';
        break;
      case 'done':
        body = `In real life: ${d.apply}`;
        note = `${this.feedback ? `${this.feedback} ` : ''}Limits: ${d.limits}`;
        action = 'Done';
        break;
      default:
        body = d.why;
    }
    text('exp-body', body);
    for (let i = 0; i < TRIALS; i++) {
      show(`exp-trial-${i}`, showTrials && i < trials.length);
      if (showTrials && trials[i]) text(`exp-trial-${i}`, trials[i]);
    }
    for (let i = 0; i < OPTS; i++) {
      show(`exp-opt-${i}`, i < options.length);
      if (options[i]) text(`exp-opt-${i}-label`, options[i]);
    }
    show('exp-note', !!note);
    if (note) text('exp-note', note);
    this.shownNote = note;
    show('exp-action', !!action);
    if (action) text('exp-action-label', action);
  }

  private place(): void {
    if (this.vr) this.anchor.update(this.panel, this.camera);
    else placeInFront(this.panel, this.camera, 0.5, 0, 0.06);
  }

  /** Keep the readout current while the card is open (only the note changes, and only when its text does). */
  private refreshReadout(): void {
    const d = this.def();
    if (!d?.readout) return;
    const g = getGame(this.world);
    const phase = g.experiments.phase(d.id);
    if (phase !== 'testing' && phase !== 'result') return;
    const note = d.readout(g) ?? '';
    if (note === this.shownNote) return;
    this.shownNote = note;
    this.panel.requireElementById('exp-note').setProperties({ display: note ? 'flex' : 'none' });
    if (note) this.panel.requireElementById<UIKit.Text>('exp-note').setProperties({ text: uiText(note) });
  }

  update(delta: number): void {
    if (this.pop?.busy) this.pop.update(delta);
    if (!this.ready || !this.opened) return;
    this.place();
    if (this.vr) this.touch.update(delta);
    if ((this.noteT += delta) >= 0.5) {
      this.noteT = 0;
      this.refreshReadout();
    }
  }
}
