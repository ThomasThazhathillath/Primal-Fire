// Always-there controls: a Pause button at the top right, the pause card it opens (Resume, Restart, Exit to Menu,
// Quit Game), and two small Turn buttons at the sides of the view (VR). All of them are big fingertip / gaze-pinch
// targets (PanelTouch); in the browser the Pause button sits in the top-right corner and Escape toggles the card.

import { createSystem, type Entity, RayInteractable, ScreenSpace, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { PanelTouch } from './panel-touch.js';
import { FAR_CARD_DISTANCE, FAR_CARD_DOWN, getGame, getUi, hidePanel, menu, StaticAnchor } from './shared.js';
import { clearSave, WorldSystem } from './world-system.js';

const SCALE = 0.085;
/** The pause card hangs out of reach (look at a button and pinch), so it is drawn larger: about 23° x 28° of the view. */
const CARD_SCALE = 0.105;
const CONFIRM_MS = 4000;
/** Snap turn per tap (degrees). */
const TURN = 45;

interface Part {
  panel: UIKitMLAsset;
  entity: Entity;
  touch: PanelTouch;
}

export class PauseSystem extends createSystem({}) {
  private btn!: Part;
  private card!: Part;
  private left!: Part;
  private right!: Part;
  // Top right of the view, just above eye level and within reach of a raised hand; turn buttons at the sides, level with the chest.
  private btnAnchor = new StaticAnchor(0.6, 0.28, -0.14, 0.9, 1);
  private cardAnchor = new StaticAnchor(FAR_CARD_DISTANCE, 0, FAR_CARD_DOWN, 0.9, 1);
  private leftAnchor = new StaticAnchor(0.55, -0.4, 0.03, 0.9, 1);
  private rightAnchor = new StaticAnchor(0.55, 0.4, 0.03, 0.9, 1);
  private vr = false;
  private ready = false;
  private shown = false;
  private open = false;
  private armed: Record<string, number> = {};
  private settingsWas = false;

  get userPaused(): boolean {
    return this.open;
  }

  private async make(id: string, name: string, scale: number, key: string): Promise<Part> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>(id);
    panel.name = name;
    panel.scale.setScalar(scale);
    const entity = this.world.createTransformEntity(panel);
    hidePanel(panel);
    const touch = new PanelTouch(this.world, panel, scale, key);
    touch.setRequirePoint(false);
    return { panel, entity, touch };
  }

  private wire(part: Part, id: string, fn: () => void): void {
    const el = part.panel.requireElementById(id);
    const click = () => {
      if (!this.vr) fn();
    };
    el.addEventListener('click', click);
    this.cleanupFuncs.push(() => el.removeEventListener('click', click));
    part.touch.add(id, fn);
  }

  async init(): Promise<void> {
    this.btn = await this.make('pausebtn-panel', 'PauseButton', SCALE, 'pause-button');
    this.card = await this.make('pausecard-panel', 'PauseCard', CARD_SCALE, 'pause-card');
    this.left = await this.make('turn-panel', 'TurnLeft', SCALE, 'turn-left');
    this.right = await this.make('turn-panel', 'TurnRight', SCALE, 'turn-right');
    this.left.panel.requireElementById('turn-r').setProperties({ display: 'none' });
    this.right.panel.requireElementById('turn-l').setProperties({ display: 'none' });
    this.wire(this.btn, 'pause-open', () => this.setOpen(true));
    this.wire(this.card, 'pause-resume', () => this.setOpen(false));
    this.wire(this.card, 'pause-restart', () => this.restart());
    this.wire(this.card, 'pause-menu', () => this.exitToMenu());
    this.wire(this.card, 'pause-quit', () => this.quit());
    this.wire(this.card, 'pause-settings', () => getUi(this.world).openSettings?.());
    this.wire(this.left, 'turn-l', () => getUi(this.world).snapTurn?.(TURN));
    this.wire(this.right, 'turn-r', () => getUi(this.world).snapTurn?.(-TURN));
    getUi(this.world).paused = () => this.open;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.shown) this.setOpen(!this.open);
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));
    this.cleanupFuncs.push(this.world.visibilityState.subscribe((v) => this.onVisibility(v)));
    this.ready = true;
    (window as unknown as { __pause?: unknown }).__pause = {
      open: () => this.setOpen(true),
      close: () => this.setOpen(false),
      state: () => ({ open: this.open, shown: this.shown, vr: this.vr }),
      parts: { btn: this.btn.panel, card: this.card.panel, left: this.left.panel, right: this.right.panel },
      tap: (id: string) => [this.btn, this.card, this.left, this.right].some((p) => p.touch.tapById(id)),
    };
  }

  private onVisibility(v: VisibilityState): void {
    this.vr = v !== VisibilityState.NonImmersive;
    for (const p of [this.btn, this.card, this.left, this.right]) {
      if (this.vr && p.entity.hasComponent(RayInteractable)) p.entity.removeComponent(RayInteractable);
      if (!this.vr && !p.entity.hasComponent(RayInteractable)) p.entity.addComponent(RayInteractable);
      p.touch.reset();
    }
    for (const a of [this.btnAnchor, this.cardAnchor, this.leftAnchor, this.rightAnchor]) a.reset();
    this.flatLayout();
  }

  /** Flat view: the button is a screen overlay in the top-right corner and the card one in the middle. */
  private flatLayout(): void {
    if (!this.shown) return;
    const set = (p: Part, on: boolean, props: Record<string, string | number>) => {
      if (p.entity.hasComponent(ScreenSpace)) p.entity.removeComponent(ScreenSpace);
      if (on) p.entity.addComponent(ScreenSpace, props as never);
    };
    set(this.btn, !this.vr, { width: '150px', height: '70px', top: '12px', right: '12px', left: 'auto', bottom: 'auto', zOffset: 0.25 });
    set(this.card, !this.vr && this.open, { width: '460px', height: '560px', top: 'calc(50% - 280px)', left: 'calc(50% - 230px)', right: 'auto', bottom: 'auto', zOffset: 0.2 });
  }

  setOpen(on: boolean): void {
    if (on === this.open) return;
    this.open = on;
    this.armed = {};
    this.card.panel.requireElementById<UIKit.Text>('pause-restart-label').setProperties({ text: 'Restart' });
    this.card.panel.requireElementById<UIKit.Text>('pause-quit-label').setProperties({ text: 'Quit Game' });
    if (on) {
      menu.back();
      this.cardAnchor.reset();
    } else hidePanel(this.card.panel);
    this.flatLayout();
    getGame(this.world).log.add(on ? 'paused' : 'resumed');
  }

  /** A destructive button: the first tap arms it (label changes), a second tap within a few seconds does it. */
  private confirm(key: string, label: UIKit.Text, ask: string, normal: string, run: () => void): void {
    const now = performance.now();
    if (!(now - (this.armed[key] ?? -1e9) <= CONFIRM_MS)) {
      this.armed[key] = now;
      label.setProperties({ text: ask });
      return;
    }
    this.armed[key] = -1e9;
    label.setProperties({ text: normal });
    run();
  }

  private restart(): void {
    this.confirm('restart', this.card.panel.requireElementById<UIKit.Text>('pause-restart-label'), 'Tap again to restart', 'Restart', () => {
      clearSave();
      location.reload();
    });
  }

  private exitToMenu(): void {
    getUi(this.world).saveNow?.();
    location.reload();
  }

  private quit(): void {
    this.confirm('quit', this.card.panel.requireElementById<UIKit.Text>('pause-quit-label'), 'Tap again to quit', 'Quit Game', () => {
      getUi(this.world).saveNow?.();
      const session = this.renderer.xr.getSession();
      if (session) void session.end();
      else window.close();
    });
  }

  update(delta: number): void {
    if (!this.ready) return;
    const started = this.world.getSystem(WorldSystem)?.started ?? false;
    const titleUp = getUi(this.world).titleOpen?.() ?? false;
    if (!started || titleUp) {
      if (this.shown) {
        this.shown = false;
        for (const p of [this.btn, this.card, this.left, this.right]) hidePanel(p.panel);
        this.flatLayout();
      }
      return;
    }
    if (!this.shown) {
      this.shown = true;
      this.onVisibility(this.world.visibilityState.peek());
    }
    // Expire a stale "tap again" prompt.
    for (const k of Object.keys(this.armed)) {
      if (performance.now() - this.armed[k] > CONFIRM_MS && this.armed[k] > 0) {
        this.armed[k] = -1e9;
        this.card.panel.requireElementById<UIKit.Text>(k === 'restart' ? 'pause-restart-label' : 'pause-quit-label').setProperties({ text: k === 'restart' ? 'Restart' : 'Quit Game' });
      }
    }
    if (!this.vr) {
      this.btn.panel.visible = true;
      this.card.panel.visible = this.open && !(getUi(this.world).settingsOpen?.() ?? false);
      return;
    }
    this.btn.panel.visible = true;
    this.btnAnchor.update(this.btn.panel, this.camera);
    this.btn.touch.update(delta);
    // The Settings card (opened from here) takes the pause card's place while it is up.
    const settings = getUi(this.world).settingsOpen?.() ?? false;
    if (this.settingsWas && !settings) this.cardAnchor.reset(); // back from Settings: put the card in front again
    this.settingsWas = settings;
    if (this.open && !settings) {
      this.card.panel.visible = true;
      this.cardAnchor.update(this.card.panel, this.camera);
      this.card.touch.update(delta);
    } else if (this.open && this.card.panel.visible) hidePanel(this.card.panel);
    // Turn buttons: always there while playing (hidden under the pause card).
    for (const [p, a] of [[this.left, this.leftAnchor], [this.right, this.rightAnchor]] as const) {
      p.panel.visible = !this.open;
      if (!this.open) {
        a.update(p.panel, this.camera);
        p.touch.update(delta);
      }
    }
  }
}
