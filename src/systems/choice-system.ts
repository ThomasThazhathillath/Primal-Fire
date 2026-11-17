// The choice card (Lesson 05): shows game.field.prompt, a question with up to three answers: judging a wild
// plant against the field guide, the long-trek briefing, the closing check. It opens by itself whenever the
// prompt changes and closes when the prompt is cleared. The rules live in curriculum/lessons/food/field.ts.
// Desktop: a panel in front of the camera, clicked with the mouse (or keys 1-3, Enter). VR: a world panel held
// by StaticAnchor, pressed by fingertip, hand ray or gaze + pinch (PanelTouch), like the experiment card.

import { createSystem, type Entity, RayInteractable, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import type { ChoicePrompt } from '../game/curriculum/lessons/food/field.js';
import { FORAGE_PATCHES } from '../game/forage.js';
import { currentMode } from '../game/tutorial-mode.js';
import { PanelTouch } from './panel-touch.js';
import { PopIn } from './ui-fx.js';
import { getGame, getUi, hidePanel, menu, placeInFront, StaticAnchor, uiText } from './shared.js';

const SCALE = 0.06;
const OPTS = 3;

export class ChoiceSystem extends createSystem({}) {
  private panel!: UIKitMLAsset;
  private entity!: Entity;
  private touch!: PanelTouch;
  private pop!: PopIn;
  private anchor = StaticAnchor.slot('panel').movable('choice', 600, 760);
  private ready = false;
  private vr = false;
  private open = false;
  private seen = -1;

  async init(): Promise<void> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('choice-panel');
    this.panel = panel;
    panel.name = 'ChoiceCard';
    panel.scale.setScalar(SCALE);
    this.entity = this.world.createTransformEntity(panel);
    hidePanel(panel);
    this.touch = new PanelTouch(this.world, panel, SCALE, 'choice');
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
    const field = () => getGame(this.world).field;
    for (let i = 0; i < OPTS; i++) wire(`ch-opt-${i}`, () => this.choose(i));
    wire('ch-action', () => {
      field().act();
      getUi(this.world).saveNow?.();
    });
    wire('ch-close', () => menu.back());
    menu.register('choice', () => {
      // Closing the card from the menu (Close, Escape, another card) clears the prompt.
      this.hide();
      field().dismiss();
    });
    const onKey = (e: KeyboardEvent) => {
      if (!this.open || this.vr || e.repeat) return;
      const p = field().prompt;
      if (!p) return;
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (n >= 0 && n < p.options.length) this.choose(n);
      else if (e.code === 'Enter' && p.action) field().act();
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(
      () => window.removeEventListener('keydown', onKey),
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        if (this.vr && this.entity.hasComponent(RayInteractable)) this.entity.removeComponent(RayInteractable);
        if (!this.vr && !this.entity.hasComponent(RayInteractable)) this.entity.addComponent(RayInteractable);
        this.anchor.reset();
        this.touch.reset();
      }),
    );
    (window as unknown as { __choice?: unknown }).__choice = {
      panel,
      state: () => ({ open: this.open, prompt: field().prompt }),
      choose: (i: number) => this.choose(i),
      act: () => field().act(),
      patches: () => FORAGE_PATCHES.map((q) => ({ id: q.id, kind: q.kind, truth: q.truth, x: q.x, z: q.z })),
    };
    this.ready = true;
  }

  private choose(i: number): void {
    getGame(this.world).field.choose(i);
    getUi(this.world).saveNow?.();
  }

  private show(): void {
    menu.open('choice');
    this.panel.visible = true;
    this.open = true;
    this.anchor.reset();
    this.touch.reset();
    this.place();
    this.pop.open();
  }

  private hide(): void {
    if (!this.open) return;
    this.open = false;
    menu.closed('choice');
    this.pop.close(() => hidePanel(this.panel));
  }

  private render(p: ChoicePrompt): void {
    const el = this.panel;
    const text = (id: string, t: string) => el.requireElementById<UIKit.Text>(id).setProperties({ text: uiText(t || ' ') });
    const display = (id: string, on: boolean) => el.requireElementById(id).setProperties({ display: on ? 'flex' : 'none' });
    text('ch-label', p.label);
    text('ch-title', p.title);
    display('ch-body', !!p.body);
    if (p.body) text('ch-body', p.body);
    display('ch-cols', !!p.cols);
    if (p.cols) {
      for (let i = 0; i < 2; i++) {
        text(`ch-col-${i}-head`, p.cols[i]?.head ?? '');
        text(`ch-col-${i}-text`, p.cols[i]?.text ?? '');
      }
    }
    for (let i = 0; i < OPTS; i++) {
      display(`ch-opt-${i}`, i < p.options.length);
      if (p.options[i]) text(`ch-opt-${i}-label`, p.options[i]);
    }
    display('ch-note', !!p.note);
    if (p.note) text('ch-note', p.note);
    display('ch-action', !!p.action);
    if (p.action) text('ch-action-label', p.action);
  }

  private place(): void {
    if (this.vr) this.anchor.update(this.panel, this.camera);
    else placeInFront(this.panel, this.camera, 0.5, 0, 0.06);
  }

  update(delta: number): void {
    if (this.pop?.busy) this.pop.update(delta);
    if (!this.ready) return;
    const field = getGame(this.world).field;
    if (field.version !== this.seen) {
      this.seen = field.version;
      const p = field.prompt;
      if (p && currentMode() !== 'tutorial') {
        this.render(p);
        if (!this.open) this.show();
      } else this.hide();
    }
    if (!this.open) return;
    this.place();
    if (this.vr) this.touch.update(delta);
  }
}
