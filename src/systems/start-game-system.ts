// The Start Game screen: the moment the first steps are done (tutorial page only), it covers the view. In the
// headset the world behind is dimmed almost to black and one card hangs straight ahead; on the desktop the same
// card sits in front of the camera over the dimmed scene. Everything else hides and game time stands still, so
// the tutorial does not simply carry on. Two choices: start the real game (Continue, when one is under way),
// or redo the tutorial from step 1. Fingertip, pinch-press and look-and-pinch in the headset; the mouse on the
// desktop. It also comes back after a reload while the tutorial page is finished.

import {
  BackSide,
  createSystem,
  type Entity,
  Mesh,
  MeshBasicMaterial,
  RayInteractable,
  SphereGeometry,
  type UIKit,
  type UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { hasSurvivalSave } from '../game/tutorial-mode.js';
import { PanelTouch } from './panel-touch.js';
import { cover, getGame, getUi, hidePanel, menu, StaticAnchor } from './shared.js';
import { WorldSystem } from './world-system.js';

/** Panel units are ~1 cm; the 560-unit card is about 0.56 m wide at this scale. */
const SCALE = 0.1;
/** How far ahead (m) the card hangs, and how far below the eyes. */
const DISTANCE = 0.9;
const DOWN = 0.04;

export class StartGameSystem extends createSystem({}) {
  private panel: UIKitMLAsset | null = null;
  private entity: Entity | null = null;
  private touch: PanelTouch | null = null;
  private backdrop!: Mesh;
  private vr = false;
  private shown = false;
  private head = new Vector3();
  /** Straight ahead, a little below the eyes; re-placed only after a big turn (never glued to the head). */
  private anchor = StaticAnchor.slot('start', 0.9, 1.2);

  async init(): Promise<void> {
    // A dark shell around the head: the forest stays faintly there, but nothing in it asks for attention.
    this.backdrop = new Mesh(
      new SphereGeometry(1.4, 24, 16),
      new MeshBasicMaterial({ color: 0x0b0906, transparent: true, opacity: 0.92, side: BackSide, depthWrite: false }),
    );
    this.backdrop.name = 'StartGameBackdrop';
    this.backdrop.renderOrder = 40;
    this.backdrop.frustumCulled = false;
    this.backdrop.visible = false;
    this.world.createTransformEntity(this.backdrop);

    const panel = await this.world.assets.instantiate<UIKitMLAsset>('startgame-panel');
    this.panel = panel;
    panel.name = 'StartGameCard';
    panel.scale.setScalar(SCALE);
    this.entity = this.world.createTransformEntity(panel);
    // Drawn after the dark shell, so the card stays bright in front of it.
    panel.traverse((o) => {
      o.renderOrder = 50;
    });
    hidePanel(panel);
    const touch = new PanelTouch(this.world, panel, SCALE, 'startgame');
    touch.setRequirePoint(false);
    this.touch = touch;
    const wire = (id: string, fn: () => void): void => {
      const el = panel.requireElementById(id);
      const click = () => {
        if (!this.vr) fn();
      };
      el.addEventListener('click', click);
      this.cleanupFuncs.push(() => el.removeEventListener('click', click));
      touch.add(id, fn);
    };
    wire('start-game', () => this.choose('start'));
    wire('redo-tutorial', () => this.choose('redo'));
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        if (this.entity) {
          if (this.vr && this.entity.hasComponent(RayInteractable)) this.entity.removeComponent(RayInteractable);
          if (!this.vr && !this.entity.hasComponent(RayInteractable)) this.entity.addComponent(RayInteractable);
        }
        this.touch?.reset();
      }),
    );
    (window as unknown as { __startGame?: unknown }).__startGame = {
      shown: () => this.shown,
      tap: (id: string) => this.touch?.tapById(id) ?? false,
      panel,
    };
  }

  private choose(which: 'start' | 'redo'): void {
    const ui = getUi(this.world);
    getGame(this.world).log.add(`start game screen: ${which}`, 'ok');
    if (which === 'start') ui.startGame?.();
    else ui.redoTutorial?.();
  }

  private show(on: boolean): void {
    if (on === this.shown || !this.panel) return;
    this.shown = on;
    cover.on = on;
    this.backdrop.visible = on;
    if (on) {
      // Any open card (the workbench card the last step opened) closes: nothing behind the screen.
      if (menu.current !== null) menu.back();
      menu.gridOpen = false;
      this.panel.getElementById<UIKit.Text>('start-game-label')?.setProperties({ text: hasSurvivalSave() ? 'Continue your game' : 'Start the game' });
      this.panel.visible = true;
      this.anchor.reset();
      this.touch?.reset();
      getGame(this.world).log.add('start game screen shown', 'ok');
    } else hidePanel(this.panel);
  }

  update(delta: number): void {
    if (!this.panel) return;
    const started = this.world.getSystem(WorldSystem)?.started ?? false;
    const ui = getUi(this.world);
    this.show(started && !(ui.titleOpen?.() ?? false) && (ui.tutorialDone?.() ?? false));
    if (!this.shown) return;
    // The dark shell is centred on the head; the card hangs ahead of it.
    this.camera.getWorldPosition(this.head);
    this.backdrop.position.copy(this.head);
    // Desktop: the mouse turns the view freely, so the card stays straight ahead of the camera there. In the
    // headset it stays put and is re-placed only after a big turn.
    if (!this.vr) this.anchor.reset();
    this.anchor.update(this.panel, this.camera);
    this.panel.visible = true;
    if (this.vr) this.touch?.update(delta);
  }
}
