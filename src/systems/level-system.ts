// Level title cards: "Level N: name" when a level starts, and a
// level-complete card with a recap of the science learned in it.

import { createSystem, RayInteractable, type UIKit, type UIKitMLAsset } from '@iwsdk/core';
import type { GameEvent } from '../game/game.js';
import { GAME_LEVELS, type GameLevel } from '../game/levels.js';
import { QUESTS } from '../game/quests.js';
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
        if (e.type === 'levelComplete') this.levelDone(e.level, e.next);
      }),
    );
  }

  update(delta: number): void {
    if (!this.panel) return;
    const started = this.world.getSystem(WorldSystem)?.started ?? false;
    if (started && !this.wasStarted) {
      this.wasStarted = true;
      this.titleCard(getGame(this.world).gameLevel, getGame(this.world).time > 0);
    }
    if (this.panel.visible && (this.timer -= delta) <= 0) this.next();
  }

  private titleCard(lv: GameLevel, resumed: boolean): void {
    this.show(`LEVEL ${lv.n} OF ${GAME_LEVELS.length}`, lv.name, resumed ? `Welcome back. ${lv.intro}` : lv.intro, '', resumed ? 'Continue' : 'Begin');
  }

  private levelDone(n: number, next: GameLevel | null): void {
    const lv = GAME_LEVELS[n - 1];
    const learned = lv.quests
      .map((t) => QUESTS.find((q) => q.title === t)?.recap)
      .filter(Boolean)
      .map((r) => `- ${r}`)
      .join('\n');
    this.show(`LEVEL ${n} COMPLETE  +${lv.xp} XP`, lv.name, next ? `Next: Level ${next.n}, ${next.name}.` : 'You have finished all three levels of Chapter 1.', learned, 'Continue');
    if (next) this.queue.push(() => this.titleCard(next, false));
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
    p.visible = true;
    placeInFront(p, this.camera, 1.1, 0, 0.05);
    this.timer = AUTO_HIDE;
  }

  private next(): void {
    if (!this.panel) return;
    hidePanel(this.panel);
    this.queue.shift()?.();
  }
}
