// Hint = Find (Quest test 2026-11-17: "remove the card with information, just show a highlight all the way to the
// sky"). The Hint button, H and the bulb on the objective card open this card: one button for every item you can
// gather (game/find.ts), what the step on the card needs first, in orange. Choosing one closes the card and puts a sky
// beacon on every spot of that item on the map (BeaconSystem); Clear beacons turns them off. Hint again while it is
// open closes it. In VR the buttons are pressed by fingertip, hand ray or gaze + pinch (PanelTouch); in the browser by
// mouse. It closes on Back, on a choice, when VR starts or ends, and after a quiet minute and a half.

import { createSystem, type Entity, RayInteractable, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { stepById } from '../game/curriculum/registry.js';
import { FIND_SLOTS, findableItems, findOrder } from '../game/find.js';
import { type ItemId, itemName } from '../game/items.js';
import { RESOURCES } from '../game/world-layout.js';
import { PanelTouch } from './panel-touch.js';
import { PopIn } from './ui-fx.js';
import { getGame, getUi, hidePanel, menu, placeInFront, StaticAnchor, uiText } from './shared.js';

const PANEL_SCALE = 0.047;
const IDLE_CLOSE = 90;
/** Button colours (hint.uikitml): what the step needs now, and everything else. */
const NEEDED_BG = '#f0a54e';
const OTHER_BG = '#5e6e34';

export class HintPanelSystem extends createSystem({}) {
  private panel!: UIKitMLAsset;
  private entity!: Entity;
  private anchor = StaticAnchor.slot('panel').movable('hint', 600, 700);
  private ready = false;
  /** The step the card was opened for ('' = none), or null while closed. */
  private opened: string | null = null;
  private idle = 0;
  private vr = false;
  private touch!: PanelTouch;
  private pop!: PopIn;
  private items: ItemId[] = [];
  private order: Array<{ item: ItemId; needed: boolean }> = [];

  async init(): Promise<void> {
    const panel = await this.world.assets.instantiate<UIKitMLAsset>('hint-panel');
    this.panel = panel;
    panel.name = 'HintPanel';
    panel.scale.setScalar(PANEL_SCALE);
    this.entity = this.world.createTransformEntity(panel);
    hidePanel(panel);
    this.items = findableItems(RESOURCES);

    this.touch = new PanelTouch(this.world, panel, PANEL_SCALE, 'hint');
    this.pop = new PopIn(panel, () => PANEL_SCALE);
    const wire = (id: string, fn: () => void) => {
      const el = panel.requireElementById(id);
      const click = () => {
        if (!this.vr) fn();
      };
      el.addEventListener('click', click);
      this.cleanupFuncs.push(() => el.removeEventListener('click', click));
      this.touch.add(id, fn);
    };
    wire('hint-close', () => menu.back());
    wire('find-clear', () => this.clearBeacons());
    for (let i = 0; i < FIND_SLOTS; i++) wire(`find-${i}`, () => this.choose(i));
    menu.register('hint', () => this.close());

    const ui = getUi(this.world);
    ui.hintOpen = () => this.opened !== null;
    ui.openHint = (id: string) => (this.opened !== null ? menu.back() : this.open(id));
    this.cleanupFuncs.push(this.world.visibilityState.subscribe((v) => this.onVisibility(v)));
    this.ready = true;
    (window as unknown as { __hint?: unknown }).__hint = {
      panel,
      taps: this.touch.taps,
      state: () => ({ opened: this.opened, vr: this.vr, items: this.order.map((o) => o.item), needed: this.order.filter((o) => o.needed).map((o) => o.item) }),
      open: (id: string) => this.open(id),
      /** Choose an item by id, as its button does. */
      find: (item: ItemId) => {
        const i = this.order.findIndex((o) => o.item === item);
        if (i >= 0) this.choose(i);
        return i >= 0;
      },
    };
  }

  private onVisibility(v: VisibilityState): void {
    this.vr = v !== VisibilityState.NonImmersive;
    if (this.opened !== null) this.close(); // a mode change never leaves it open
    PanelTouch.setRay(this.world, this.entity, this.vr);
    if (!this.vr && !this.entity.hasComponent(RayInteractable)) this.entity.addComponent(RayInteractable);
  }

  /** Open the card; `stepId` is the step on the objective card ('' = none): what it needs is listed first. */
  open(stepId: string): void {
    if (!this.ready) return;
    const game = getGame(this.world);
    const step = stepId ? stepById(stepId) : undefined;
    const needed = step?.find?.(game) ?? [];
    this.order = findOrder(this.items, needed);
    menu.open('hint');
    this.opened = stepId;
    this.idle = 0;
    this.render(needed.length > 0 ? step?.title ?? '' : '');
    this.panel.visible = true;
    this.anchor.reset();
    this.touch.reset();
    this.place();
    this.pop.open();
  }

  close(): void {
    menu.closed('hint');
    this.opened = null;
    this.pop.close(() => hidePanel(this.panel));
  }

  /** An item button: beacons on every spot of it, then the card gets out of the way. */
  private choose(i: number): void {
    const o = this.order[i];
    if (!o) return;
    const game = getGame(this.world);
    const n = getUi(this.world).findItem?.(o.item) ?? 0;
    const name = itemName(o.item).toLowerCase();
    game.toast(n > 0 ? `${n} beacon${n === 1 ? '' : 's'}: ${name}. Follow the light. Hint again to change or clear.` : `No ${name} left on the map right now. Some grows back with time.`, n > 0 ? 'good' : 'note');
    menu.back();
  }

  private clearBeacons(): void {
    getUi(this.world).findClear?.();
    getGame(this.world).toast('Beacons off.', 'note');
    menu.back();
  }

  private render(stepTitle: string): void {
    const p = this.panel;
    const text = (id: string, t: string) => p.requireElementById<UIKit.Text>(id).setProperties({ text: uiText(t || ' ') });
    for (let i = 0; i < FIND_SLOTS; i++) {
      const o = this.order[i];
      const el = p.requireElementById(`find-${i}`);
      el.setProperties({ display: o ? 'flex' : 'none' });
      if (!o) continue;
      el.setProperties({ backgroundColor: o.needed ? NEEDED_BG : OTHER_BG } as never);
      text(`find-${i}-label`, itemName(o.item));
    }
    text('find-note', stepTitle ? `Orange: what "${stepTitle}" needs. Every one on the map gets a beacon.` : 'Pick one: every one on the map gets a beacon you can see from far away.');
    const showing = getUi(this.world).findShowing?.() ?? null;
    p.requireElementById('find-clear').setProperties({ display: showing ? 'flex' : 'none' });
    if (showing) text('find-clear-label', `Clear beacons (${itemName(showing).toLowerCase()})`);
  }

  private place(): void {
    if (this.vr) this.anchor.update(this.panel, this.camera);
    else placeInFront(this.panel, this.camera, 0.45, 0, 0.06); // big enough to read the item names, below the top HUD
  }

  update(delta: number): void {
    if (this.pop?.busy) this.pop.update(delta);
    if (!this.ready || this.opened === null) return;
    if ((this.idle += delta) > IDLE_CLOSE) return void menu.back();
    this.place();
    if (this.vr) this.touch.update(delta);
  }
}
