// Onboarding: the title panel in front of you when you wake. "Enter VR"
// starts the immersive session; "Wake up" starts the chapter.

import { createSystem, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { HudSystem } from './hud-system.js';
import { getGame, hidePanel } from './shared.js';
import { WorldSystem } from './world-system.js';

export class IntroSystem extends createSystem({}) {
  private panel: UIKitMLAsset | undefined;

  init(): void {
    const game = getGame(this.world);
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    this.panel = panel;
    const xrButton = panel?.getElementById('xr-button');
    const beginButton = panel?.getElementById('begin-button');
    if (!panel || !xrButton || !beginButton) {
      this.begin();
      return;
    }
    if (game.time > 0) {
      panel.getElementById<UIKit.Text>('begin-label')?.setProperties({ text: 'Continue' });
    }
    const launchXR = () => this.world.launchXR();
    const begin = () => this.begin();
    xrButton.addEventListener('click', launchXR);
    beginButton.addEventListener('click', begin);
    this.cleanupFuncs.push(
      () => xrButton.removeEventListener('click', launchXR),
      () => beginButton.removeEventListener('click', begin),
      this.world.visibilityState.subscribe((v) => {
        const show = this.world.xrEnabled && v === VisibilityState.NonImmersive;
        xrButton.setProperties({ display: show ? 'flex' : 'none' });
      }),
    );
  }

  begin(): void {
    const world = this.world.getSystem(WorldSystem);
    if (!world || world.started) return;
    world.started = true;
    if (this.panel) hidePanel(this.panel);
    this.world.getSystem(HudSystem)?.show();
    const game = getGame(this.world);
    game.log.add('woke up', 'ok');
    game.toast(game.time > 0 ? 'Welcome back.' : 'You wake on the forest floor with nothing. Start with what you need for fire.', 'note');
    game.checkQuests();
  }
}
