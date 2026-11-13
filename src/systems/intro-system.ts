// The title menu: PRIMAL over the calm forest. Play / Continue, Tutorial, New Game, Enter VR (flat view) and Quit.
// Fingertip tap and gaze + pinch in the headset (PanelTouch), mouse in the browser. Big targets. In the headset it
// hangs in front of you until you press Play; nothing starts on its own.

import { createSystem, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { HudSystem } from './hud-system.js';
import { PanelTouch } from './panel-touch.js';
import { StorySystem } from './story-system.js';
import { getGame, getUi, hidePanel, StaticAnchor } from './shared.js';
import { clearSave, WorldSystem } from './world-system.js';

/** Panel units are ~1 cm; in the headset the 520-unit card is scaled to about 0.5 m wide. */
const VR_SCALE = 0.1;
const FLAT_SCALE = 0.26;
/** A second tap on New Game must come within this long (ms). */
const CONFIRM_MS = 4000;

export class IntroSystem extends createSystem({}) {
  private panel: UIKitMLAsset | undefined;
  private touch: PanelTouch | null = null;
  private anchor = new StaticAnchor(0.75, 0, 0.05, 0.6, 1);
  private vr = false;
  private newArmedAt = -1e9;
  private open = true;
  private flatPos: [number, number, number] | null = null;

  init(): void {
    const game = getGame(this.world);
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    this.panel = panel;
    const el = (id: string) => panel?.getElementById(id);
    if (!panel || !el('begin-button')) {
      this.begin();
      return;
    }
    this.flatPos = [panel.position.x, panel.position.y, panel.position.z];
    getUi(this.world).titleOpen = () => this.open;
    if (game.time > 0) panel.getElementById<UIKit.Text>('begin-label')?.setProperties({ text: 'Continue' });
    this.touch = new PanelTouch(this.world, panel, VR_SCALE, 'title');
    this.touch.setRequirePoint(false);
    const wire = (id: string, fn: () => void): void => {
      const b = el(id);
      if (!b) return;
      const click = () => {
        if (!this.vr) fn();
      };
      b.addEventListener('click', click);
      this.cleanupFuncs.push(() => b.removeEventListener('click', click));
      this.touch!.add(id, fn);
    };
    wire('begin-button', () => {
      getUi(this.world).titlePlay?.();
      this.begin();
    });
    wire('tutorial-button', () => getUi(this.world).titleTutorial?.());
    wire('new-button', () => this.newGame());
    wire('xr-button', () => void this.world.launchXR());
    wire('quit-button', () => this.quit());
    wire('settings-button', () => getUi(this.world).openSettings?.());
    (window as unknown as { __title?: unknown }).__title = { tap: (id: string) => this.touch?.tapById(id) ?? false, open: () => this.open };
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        // The flat view offers Enter VR; inside the headset it is pointless.
        el('xr-button')?.setProperties({ display: !this.vr && this.world.xrEnabled ? 'flex' : 'none' });
        // Quit closes the headset session (VR) or the tab (flat, where the browser may refuse: then it just says so).
        if (this.open && panel) {
          panel.scale.setScalar(this.vr ? VR_SCALE : FLAT_SCALE);
          this.anchor.reset();
          this.touch?.reset();
          if (!this.vr && this.flatPos) panel.position.set(...this.flatPos);
        }
      }),
    );
  }

  /** New Game: needs a second tap, then wipes the survival save and starts over. */
  private newGame(): void {
    const now = performance.now();
    const label = this.panel?.getElementById<UIKit.Text>('new-label');
    if (now - this.newArmedAt > CONFIRM_MS) {
      this.newArmedAt = now;
      label?.setProperties({ text: 'Tap again to erase' });
      return;
    }
    clearSave();
    try {
      localStorage.removeItem('primal-first-fire.mode.v1');
      localStorage.removeItem('primal-first-fire.tutorial.v1');
    } catch {
      /* ignore */
    }
    location.reload();
  }

  /** Quit: end the headset session; in the flat view close the tab (browsers only allow that for pages a script opened). */
  private quit(): void {
    getUi(this.world).saveNow?.();
    const session = this.renderer.xr.getSession();
    if (session) void session.end();
    else {
      window.close();
      this.panel?.getElementById<UIKit.Text>('quit-label')?.setProperties({ text: 'You can close this tab' });
    }
  }

  update(delta: number): void {
    if (!this.open || !this.panel || !this.touch) return;
    if (this.newArmedAt > 0 && performance.now() - this.newArmedAt > CONFIRM_MS) {
      this.newArmedAt = -1e9;
      this.panel.getElementById<UIKit.Text>('new-label')?.setProperties({ text: 'New Game' });
    }
    if (this.vr) {
      this.panel.visible = true;
      this.anchor.update(this.panel, this.camera);
      this.touch.update(delta);
    }
  }

  begin(): void {
    const world = this.world.getSystem(WorldSystem);
    if (!world || world.started) return;
    world.started = true;
    this.open = false;
    if (this.panel) hidePanel(this.panel);
    this.world.getSystem(HudSystem)?.show();
    const game = getGame(this.world);
    game.log.add('woke up', 'ok');
    const story = this.world.getSystem(StorySystem);
    if (game.time > 0 || !story) game.toast(game.time > 0 ? 'Welcome back.' : 'You wake with nothing. Look around.', 'note');
    // A new game: the awakening (dark fade-in and first thoughts), once.
    story?.awaken();
    game.checkQuests();
  }
}
