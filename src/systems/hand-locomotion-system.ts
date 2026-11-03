// Hands-only movement. IWSDK's locomotion has hand micro-gestures (thumb on
// the side of the index finger: tap = teleport, swipe left/right = turn), but
// they start switched off and need a thumb swipe up to enable, which no player
// would guess. This turns them on as soon as the right hand is the active
// input, once per XR session, and says how to move. A swipe down still turns
// them off; the player's choice is then left alone for the session.

import { createSystem, LocomotionSystem, VisibilityState } from '@iwsdk/core';
import { getGame } from './shared.js';

interface MicroGestureConfig {
  config: { microGestureControlsEnabled: { value: boolean } };
}

export class HandLocomotionSystem extends createSystem({}) {
  private enabledThisSession = false;

  init(): void {
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        if (v === VisibilityState.NonImmersive) this.enabledThisSession = false;
      }),
    );
  }

  update(): void {
    if (this.enabledThisSession) return;
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    if (!this.input.xr.isPrimary('hand', 'right')) return;
    const loco = this.world.getSystem(LocomotionSystem) as unknown as {
      microGestureControlsEnabled?: boolean;
      turnSystem?: MicroGestureConfig;
      teleportSystem?: MicroGestureConfig;
    } | undefined;
    if (!loco) return;
    // These fields are not part of the public API (checked against @iwsdk/core 1.1.0-rc.2's
    // locomotion.js); guard each one so a future version simply leaves movement as it was.
    if (loco.turnSystem) loco.turnSystem.config.microGestureControlsEnabled.value = true;
    if (loco.teleportSystem) loco.teleportSystem.config.microGestureControlsEnabled.value = true;
    if ('microGestureControlsEnabled' in loco) loco.microGestureControlsEnabled = true;
    this.enabledThisSession = true;
    const game = getGame(this.world);
    game.log.add('hand movement gestures enabled');
    game.toast('To move: tap your right thumb on the side of your index finger. Swipe the thumb left or right to turn.', 'note');
  }
}
