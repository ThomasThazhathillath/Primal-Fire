// Reads hand motion for the held item's hand action (src/game/actions.ts):
//   rub:  one hand moving fast below chest height (rubbing on the thigh)
//   knap: sharp downward strikes (speed peaks)
// Browser fallback: tap F once per stroke. Snapping moved to InteractionSystem.

import { createSystem, type Object3D, Vector3, VisibilityState } from '@iwsdk/core';
import { actionFor } from '../game/actions.js';
import { getGame } from './shared.js';

const RUB_MIN_SPEED = 0.4;
const RUB_MAX_HEIGHT = 1.0;
const STRIKE_SPEED = 1.6;
const MAX_STEP = 0.5; // ignore teleporting tracking glitches

export class ActionSystem extends createSystem({}) {
  private pos = [new Vector3(), new Vector3()];
  private prev = [new Vector3(), new Vector3()];
  private has = [false, false];
  private prevSpeed = [0, 0];

  init(): void {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF' || this.world.visibilityState.peek() !== VisibilityState.NonImmersive) return;
      const game = getGame(this.world);
      const a = actionFor(game.held);
      if (a && a.motion !== 'snap') game.work(a.motion === 'knap' ? 1 : a.work / 8);
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));
  }

  update(delta: number): void {
    if (delta <= 0 || this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    const game = getGame(this.world);
    const a = actionFor(game.held);
    const spaces: Array<Object3D | undefined> = [this.player.gripSpaces.left, this.player.gripSpaces.right];
    for (let i = 0; i < 2; i++) {
      const sp = spaces[i];
      this.has[i] = !!sp;
      if (sp) sp.getWorldPosition(this.pos[i]);
    }
    if (a && (a.motion === 'rub' || a.motion === 'knap')) {
      for (let i = 0; i < 2; i++) {
        if (!this.has[i]) continue;
        const step = this.pos[i].distanceTo(this.prev[i]);
        if (step > MAX_STEP) continue;
        const speed = step / delta;
        if (a.motion === 'rub' && speed > RUB_MIN_SPEED && this.pos[i].y < RUB_MAX_HEIGHT) game.work(step);
        if (a.motion === 'knap' && speed > STRIKE_SPEED && this.prevSpeed[i] <= STRIKE_SPEED) game.work(1);
        this.prevSpeed[i] = speed;
      }
    }
    for (let i = 0; i < 2; i++) this.prev[i].copy(this.pos[i]);
  }
}
