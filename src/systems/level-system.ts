// Lesson cards (curriculum Phase 1, C11). When a lesson starts: its number, name, story, survival goal and
// the science you will discover. When it ends: what you discovered, what it opens up, and the next lesson.
// A real card, once per lesson moment, never in the middle of a task: it closes with its button or by itself
// after AUTO_HIDE seconds, and its text also goes to the HUD message line. Desktop: in front of the camera,
// mouse. VR: the modal slot (StaticAnchor), fingertip / hand ray / gaze + pinch (PanelTouch).

import { createSystem, type Entity, RayInteractable, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { LESSONS, lessonById } from '../game/curriculum/registry.js';
import type { LessonDef, LessonId } from '../game/curriculum/types.js';
import type { GameEvent } from '../game/game.js';
import { conceptsOf, discovered } from '../game/science/concepts.js';
import { currentMode } from '../game/tutorial-mode.js';
import { PanelTouch } from './panel-touch.js';
import { PopIn } from './ui-fx.js';
import { getGame, getUi, hidePanel, placeInFront, StaticAnchor, uiText } from './shared.js';
import { WorldSystem } from './world-system.js';

/** Seconds before an unanswered card hides itself. */
const AUTO_HIDE = 25;
const SCALE = 0.07;
const VR_SCALE = 0.06;

const two = (n: number) => String(n).padStart(2, '0');

export class LevelSystem extends createSystem({}) {
  private panel: UIKitMLAsset | null = null;
  private entity!: Entity;
  private touch!: PanelTouch;
  private pop!: PopIn;
  private anchor = StaticAnchor.slot('modal');
  private wasStarted = false;
  private timer = 0;
  private shown = false;
  private vr = false;
  private queue: Array<() => void> = [];

  async init(): Promise<void> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('level-panel');
    panel.name = 'LessonCard';
    panel.scale.setScalar(SCALE);
    this.entity = this.world.createTransformEntity(panel);
    this.entity.addComponent(RayInteractable);
    hidePanel(panel);
    this.panel = panel;
    this.touch = new PanelTouch(this.world, panel, SCALE, 'lesson-card');
    this.pop = new PopIn(panel, () => panel.scale.x);
    const ok = panel.requireElementById('level-ok');
    const click = () => {
      if (!this.vr) this.next();
    };
    ok.addEventListener('click', click);
    this.touch.add('level-ok', () => this.next());
    this.cleanupFuncs.push(
      () => ok.removeEventListener('click', click),
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        const s = this.vr ? VR_SCALE : SCALE;
        panel.scale.setScalar(s);
        this.touch.setScale(s);
        PanelTouch.setRay(this.world, this.entity, this.vr);
        this.anchor.reset();
        this.touch.reset();
      }),
      getGame(this.world).on((e: GameEvent) => {
        if (e.type === 'lessonComplete') this.lessonDone(e.lesson, e.next?.id ?? null);
      }),
    );
    (window as unknown as { __lessonCard?: unknown }).__lessonCard = { panel, state: () => ({ shown: this.shown, queued: this.queue.length }), ok: () => this.next() };
  }

  update(delta: number): void {
    if (!this.panel) return;
    if (this.pop.busy) this.pop.update(delta);
    const started = this.world.getSystem(WorldSystem)?.started ?? false;
    if (started && !this.wasStarted) {
      this.wasStarted = true;
      const lesson = getGame(this.world).lessons.lesson;
      // Resumed saves have played time; a fresh start has at most a frame or two.
      if (lesson && currentMode() !== 'tutorial') this.titleCard(lesson, getGame(this.world).time > 1);
    }
    if (!this.shown) return;
    if (this.vr) {
      this.anchor.update(this.panel, this.camera);
      this.touch.update(delta);
    } else placeInFront(this.panel, this.camera, 0.7, 0, 0.02);
    if ((this.timer -= delta) <= 0) this.next();
  }

  private titleCard(l: LessonDef, resumed: boolean): void {
    const science = l.science.map((s) => `- ${s}`).join('\n');
    this.show(`LESSON ${two(l.n)} OF ${two(LESSONS.length)}`, l.name, resumed ? `Welcome back. ${l.goal}` : `${l.story}\nGoal: ${l.goal}`, 'YOU WILL DISCOVER', science, resumed ? 'Continue' : 'Begin');
  }

  private lessonDone(id: LessonId, next: LessonId | null): void {
    const l = lessonById(id)!;
    const g = getGame(this.world);
    const found = conceptsOf(id).filter((c) => discovered(c, g.notebook)).map((c) => `- ${c.name}`);
    const after = next ? lessonById(next) : null;
    // The last playable level with more still being built (registry.ts): the guide stops here for now, so it does not
    // promise the next lesson.
    const soon = !after && !g.lessons.allDone;
    const unlocks = soon ? l.unlocks.filter((u) => !/^Lesson \d/.test(u)) : l.unlocks;
    const opens = unlocks.length ? ` Opens: ${unlocks.join(', ')}.` : '';
    const more = soon ? ' More levels are coming soon. Keep exploring your camp.' : '';
    this.show(`LESSON ${two(l.n)} COMPLETE`, l.name, `${l.complete}${opens}${more}`, 'YOU DISCOVERED', found.join('\n') || '- Open the Lab Notebook to see what you found.', after ? 'Next lesson' : 'Done');
    if (after) this.queue.push(() => this.titleCard(after, false));
  }

  private show(eyebrow: string, title: string, body: string, label: string, list: string, button: string): void {
    const p = this.panel!;
    const text = (id: string, t: string) => p.requireElementById<UIKit.Text>(id).setProperties({ text: uiText(t) });
    text('level-eyebrow', eyebrow);
    text('level-title', title);
    text('level-body', body);
    text('level-learned-label', label);
    text('level-learned', list || '-');
    text('level-ok-label', button);
    getGame(this.world).toast(`${eyebrow}: ${title}.`, 'good');
    this.timer = AUTO_HIDE;
    const wasShown = this.shown;
    this.shown = true;
    p.visible = true;
    this.anchor.reset();
    this.touch.reset();
    if (!wasShown) this.pop.open();
    getUi(this.world).saveNow?.();
  }

  private next(): void {
    if (!this.panel || !this.shown) return;
    const more = this.queue.shift();
    if (more) {
      more();
      return;
    }
    this.shown = false;
    this.pop.close(() => hidePanel(this.panel!));
  }
}
