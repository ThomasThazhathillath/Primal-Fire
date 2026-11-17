// Lesson cards: "Lesson 0N: name" when a lesson starts (story and survival goal), and a lesson-complete
// card with the science discovered in it and what it opens up. For now both go to the HUD message line.

import { createSystem, RayInteractable, type UIKit, type UIKitMLAsset } from '@iwsdk/core';
import type { GameEvent } from '../game/game.js';
import { LESSONS, lessonById } from '../game/curriculum/registry.js';
import type { LessonDef, LessonId } from '../game/curriculum/types.js';
import { getGame, hidePanel, placeInFront, uiText } from './shared.js';
import { WorldSystem } from './world-system.js';

/** Seconds before an unanswered card hides itself. */
const AUTO_HIDE = 20;

export class LevelSystem extends createSystem({}) {
  private panel: UIKitMLAsset | null = null;
  private wasStarted = false;
  private timer = 0;
  private queue: Array<() => void> = [];

  async init(): Promise<void> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('level-panel');
    panel.name = 'LevelCard';
    panel.scale.setScalar(0.09);
    this.world.createTransformEntity(panel).addComponent(RayInteractable);
    hidePanel(panel);
    this.panel = panel;
    const ok = panel.requireElementById('level-ok');
    const next = () => this.next();
    ok.addEventListener('click', next);
    this.cleanupFuncs.push(
      () => ok.removeEventListener('click', next),
      getGame(this.world).on((e: GameEvent) => {
        if (e.type === 'lessonComplete') this.lessonDone(e.lesson, e.next?.id ?? null);
      }),
    );
  }

  update(delta: number): void {
    if (!this.panel) return;
    const started = this.world.getSystem(WorldSystem)?.started ?? false;
    if (started && !this.wasStarted) {
      this.wasStarted = true;
      // Resumed saves have played time; a fresh start has at most a frame or two.
      const lesson = getGame(this.world).lessons.lesson;
      if (lesson) this.titleCard(lesson, getGame(this.world).time > 1);
    }
    if (this.pending && (this.timer -= delta) <= 0) {
      this.pending = false;
      this.next();
    }
  }

  private titleCard(l: LessonDef, resumed: boolean): void {
    const num = `LESSON ${String(l.n).padStart(2, '0')} OF ${String(LESSONS.length).padStart(2, '0')}`;
    this.show(num, l.name, resumed ? `Welcome back. ${l.goal}` : `${l.story} Goal: ${l.goal}`, '', resumed ? 'Continue' : 'Begin');
  }

  private lessonDone(id: LessonId, next: LessonId | null): void {
    const l = lessonById(id)!;
    const learned = l.science.map((s) => `- ${s}`).join('\n');
    const after = next ? lessonById(next) : null;
    this.show(`LESSON ${String(l.n).padStart(2, '0')} COMPLETE`, l.name, `${l.complete}${after ? ` Next: Lesson ${String(after.n).padStart(2, '0')}, ${after.name}.` : ' Every lesson is complete.'}`, learned, 'Continue');
    if (after) this.queue.push(() => this.titleCard(after, false));
  }

  private show(eyebrow: string, title: string, body: string, learned: string, button: string): void {
    const p = this.panel!;
    const text = (id: string, t: string) => p.requireElementById<UIKit.Text>(id).setProperties({ text: uiText(t) });
    text('level-eyebrow', eyebrow);
    text('level-title', title);
    text('level-body', body);
    text('level-learned', learned || '-');
    text('level-ok-label', button);
    p.requireElementById('level-learned-label').setProperties({ display: learned ? 'flex' : 'none' });
    p.requireElementById('level-learned').setProperties({ display: learned ? 'flex' : 'none' });
    // No floating card: the level news goes to the HUD's message line; the next one follows after a pause.
    getGame(this.world).toast(`${eyebrow}: ${title}. ${body}${learned ? ` You learned: ${learned}` : ''}`, 'good');
    this.timer = AUTO_HIDE;
    this.pending = true;
  }
  private pending = false;

  private next(): void {
    if (!this.panel) return;
    hidePanel(this.panel);
    this.queue.shift()?.();
  }
}
