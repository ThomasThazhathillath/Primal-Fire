// World housekeeping: fog, Quest frame-rate/foveation, pausing on blur,
// feeding the player's position to the game, and autosaving.

import { Color, createSystem, Fog, Vector3, VisibilityState } from '@iwsdk/core';
import { Game, type SaveData } from '../game/game.js';
import { getGame } from './shared.js';

const SAVE_KEY = 'primal-first-fire.save.v1';
const SAVE_EVERY = 10;

export function loadGame(): Game {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const g = Game.restore(JSON.parse(raw) as SaveData);
      g.log.add('restored save', 'ok');
      return g;
    }
  } catch {
    // Private mode, blocked storage or an old save: start fresh.
  }
  return new Game();
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

export class WorldSystem extends createSystem({}) {
  /** Game time only runs once you have woken up, and pauses on blur. */
  started = false;
  private paused = false;
  private posTimer = 0;
  private saveTimer = 0;
  private head = new Vector3();

  init(): void {
    // Linear-space match for the dome's horizon colour, so trees fade into it.
    this.scene.fog = new Fog(new Color(0.62, 0.72, 0.76), 16, 52);
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.paused = v === VisibilityState.VisibleBlurred || v === VisibilityState.Hidden;
        if (v === VisibilityState.Visible) {
          try {
            this.world.session?.updateTargetFrameRate?.(72);
            this.renderer.xr.setFoveation(1);
          } catch {
            // Not every browser supports these.
          }
        }
        if (this.paused) this.save();
      }),
    );
    const onHide = () => this.save();
    window.addEventListener('pagehide', onHide);
    this.cleanupFuncs.push(() => window.removeEventListener('pagehide', onHide));
  }

  save(): void {
    if (!this.started) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(getGame(this.world).snapshot()));
    } catch {
      // Storage can be unavailable; the game still plays.
    }
  }

  update(delta: number): void {
    if (!this.started || this.paused) return;
    const game = getGame(this.world);
    game.tick(delta);
    if ((this.posTimer += delta) > 0.25) {
      this.posTimer = 0;
      this.camera.getWorldPosition(this.head);
      game.setPlayerPosition(this.head.x, this.head.z);
    }
    if ((this.saveTimer += delta) > SAVE_EVERY) {
      this.saveTimer = 0;
      this.save();
    }
  }
}
