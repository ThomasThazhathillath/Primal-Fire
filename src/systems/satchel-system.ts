// The satchel: a pouch on your hip (pinch it to open), a panel listing what
// you carry, and the item in your hand. Crafting buttons appear while you
// stand at a finished workbench.

import {
  BoxGeometry,
  createSystem,
  type Entity,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Pressed,
  RayInteractable,
  SphereGeometry,
  type UIKit,
  type UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { actionFor } from '../game/actions.js';
import { RECIPES, type GameEvent } from '../game/game.js';
import { carryRules, ITEMS, itemName, type ItemId } from '../game/items.js';
import { SatchelItem, SatchelPouch } from '../components/game-components.js';
import { BAG_HEIGHT, buildOpenBag } from '../scene-assets/bag.js';
import { heldItemMesh } from '../scene-assets/item-meshes.js';
import { lambert } from '../scene-assets/materials.js';
import { PanelTouch } from './panel-touch.js';
import { itemPicture, RowThumbs } from './row-thumbs.js';
import { PopIn } from './ui-fx.js';
import { getGame, getUi, hidePanel, hipPosition, menu, PANEL_DISTANCE, PANEL_DOWN, placeInFront, uiText } from './shared.js';

const SLOTS = 18;
const MAKE_SLOTS = 8;

export class SatchelSystem extends createSystem({
  pouchPressed: { required: [SatchelPouch, Pressed] },
  itemPressed: { required: [SatchelItem, Pressed] },
  itemHovered: { required: [SatchelItem, Hovered] },
}) {
  private pouch!: Object3D;
  private panel!: UIKitMLAsset;
  private panelEntity!: Entity;
  private touch!: PanelTouch;
  private thumbs!: RowThumbs;
  private pop!: PopIn;
  private thumbTimer = 0;
  private vr = false;
  private open = false;
  private makeItems: Array<{ id: string; label: string; kind: 'bind' | 'pack' | 'store' | 'take' } | undefined> = [];
  private slotItems: Array<ItemId | null> = [];
  private hip = new Vector3();
  private craftTimer = 0;
  private bag!: Group;
  private bagSlots: Entity[] = [];
  private bagT = 1;
  private bagFrom = new Vector3();
  private bagTo = new Vector3();
  private bagYaw = 0;
  private reachTimer = 0;
  private shoulder = new Vector3();
  private handPos = new Vector3();

  async init(): Promise<void> {
    const game = getGame(this.world);
    this.pouch = buildPouch();
    const pouchEntity = this.world.createTransformEntity(this.pouch);
    pouchEntity.addComponent(SatchelPouch);
    pouchEntity.addComponent(RayInteractable);
    this.cleanupFuncs.push(
      this.queries.pouchPressed.subscribe('qualify', () => {
        if (game.held) game.stow();
        else this.toggle();
      }),
    );

    const onKey = (ev: KeyboardEvent) => {
      if (this.world.visibilityState.peek() !== VisibilityState.NonImmersive) return;
      const item = this.targetItem();
      if (!item) return;
      if (ev.code === 'KeyG') {
        if (ev.shiftKey && item === game.held) getUi(this.world).throwHeld?.();
        else getUi(this.world).dropHeld?.(item);
      }
      else if (ev.code === 'KeyF' && !actionFor(game.held)) game.stashItem(item);
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));
    this.bag = buildOpenBag();
    this.bag.visible = false;
    this.world.createTransformEntity(this.bag);
    for (let i = 0; i < SLOTS; i++) {
      const slot = new Group();
      slot.name = `BagItem_${i}`;
      const hit = new Mesh(new SphereGeometry(0.06, 6, 5), new MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.05;
      slot.add(hit);
      const a = (i / SLOTS) * Math.PI * 2;
      const ring = i < 4 ? 0 : 0.11;
      slot.position.set(i < 4 ? (i - 1.5) * 0.06 : Math.cos(a) * ring, BAG_HEIGHT * 0.85, i < 4 ? 0 : Math.sin(a) * ring);
      const e = this.world.createTransformEntity(slot);
      e.addComponent(SatchelItem, { index: i });
      e.addComponent(RayInteractable);
      this.bag.add(slot);
      slot.visible = false;
      this.bagSlots.push(e);
    }
    this.cleanupFuncs.push(
      this.queries.itemPressed.subscribe('qualify', (e) => {
        const id = this.slotItems[e.getValue(SatchelItem, 'index') ?? 0];
        if (id && game.takeOut(id)) {
          game.reach();
          this.setOpen(false);
        }
      }),
    );

    this.panel = await this.world.assets.instantiate<UIKitMLAsset>('satchel-panel');
    this.panel.name = 'SatchelPanel';
    this.panel.scale.setScalar(0.1);
    this.panelEntity = this.world.createTransformEntity(this.panel);
    this.panelEntity.addComponent(RayInteractable);
    hidePanel(this.panel);
    // In VR the rows and buttons are fingertip targets only (no ray or pinch click).
    this.touch = new PanelTouch(this.world, this.panel, 0.1, 'bag');
    this.thumbs = new RowThumbs(this.panel, this.renderer, SLOTS);
    this.pop = new PopIn(this.panel, () => 0.1);
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        PanelTouch.setRay(this.world, this.panelEntity, this.vr);
      }),
    );
    menu.register('bag', () => this.setOpen(false));

    for (let i = 0; i < SLOTS; i++) {
      const button = this.panel.requireElementById(`item-${i}`);
      const onClick = () => {
        const id = this.slotItems[i];
        if (id && game.takeOut(id)) this.setOpen(false);
      };
      button.addEventListener('click', onClick);
      this.touch.add(`item-${i}`, onClick);
      this.cleanupFuncs.push(() => button.removeEventListener('click', onClick));
    }
    for (let i = 0; i < MAKE_SLOTS; i++) {
      const button = this.panel.requireElementById(`make-${i}`);
      const onClick = () => {
        const m = this.makeItems[i];
        if (!m) return;
        if (m.kind === 'bind') game.bind(m.id);
        else if (m.kind === 'pack') game.upgradePack(m.id);
        else if (m.kind === 'store') for (const c of game.satchelContents()) game.stash(c.id, c.count);
        else {
          const box = game.nearbyStorage();
          for (const id of Object.keys(box?.store ?? {}) as ItemId[]) game.withdraw(id, box?.store?.[id] ?? 0);
        }
      };
      button.addEventListener('click', onClick);
      this.touch.add(`make-${i}`, onClick);
      this.cleanupFuncs.push(() => button.removeEventListener('click', onClick));
    }
    const wire = (id: string, fn: () => void) => {
      const el = this.panel.requireElementById(id);
      this.touch.add(id, fn);
      el.addEventListener('click', fn);
      this.cleanupFuncs.push(() => el.removeEventListener('click', fn));
    };
    wire('stow-button', () => game.stow());
    wire('satchel-close', () => menu.back());

    getUi(this.world).toggleSatchel = () => this.toggle();
    // What you hold is drawn by CarrySystem.
    this.cleanupFuncs.push(
      game.on((e: GameEvent) => {
        if (e.type === 'satchel' || e.type === 'held') this.refresh();
      }),
    );
    this.refresh();
  }

  /** The item in bag slot `i` (for tooltips). */
  bagItemAt(i: number): ItemId | null {
    return this.slotItems[i] ?? null;
  }

  /** What G / F act on: the bag item you point at, else what you hold. */
  private targetItem(): ItemId | null {
    for (const e of this.queries.itemHovered.entities) {
      const id = this.slotItems[e.getValue(SatchelItem, 'index') ?? 0];
      if (id) return id;
    }
    return getGame(this.world).held;
  }

  /** VR: holding a hand behind your right shoulder for a moment opens the bag. */
  private watchShoulder(delta: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    const hand = this.player.gripSpaces.right ?? this.player.gripSpaces.left;
    if (!hand) return;
    this.camera.getWorldPosition(this.shoulder);
    this.shoulder.y -= 0.2;
    const yaw = Math.atan2(this.camera.matrixWorld.elements[8], this.camera.matrixWorld.elements[10]);
    this.shoulder.x += Math.sin(yaw) * 0.2 + Math.cos(yaw) * 0.25;
    this.shoulder.z += Math.cos(yaw) * 0.2 - Math.sin(yaw) * 0.25;
    hand.getWorldPosition(this.handPos);
    if (this.handPos.distanceTo(this.shoulder) < 0.22) {
      if ((this.reachTimer += delta) > 0.4 && !this.open) this.setOpen(true);
    } else this.reachTimer = 0;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    if (!this.panel) return;
    this.open = open;
    if (open) {
      menu.open('bag');
      this.refresh();
      this.panel.visible = true;
      // A plain list card straight ahead, a little below eye level, in seated reach for a fingertip.
      placeInFront(this.panel, this.camera, this.vr ? PANEL_DISTANCE : 0.62, 0, this.vr ? PANEL_DOWN : 0.12);
      this.touch.reset();
      this.pop.open();
    } else {
      menu.closed('bag');
      this.pop.close(() => hidePanel(this.panel));
      this.bag.visible = false;
      for (const e of this.bagSlots) if (e.object3D) e.object3D.visible = false;
    }
  }


  /** The bag slides from your hip to a spot in front of you and its contents appear inside. */
  private openBag(): void {
    this.hip.copy(this.pouch.position);
    this.bagFrom.copy(this.hip);
    placeInFront(this.bag, this.camera, 0.85, 0.12, 0.38);
    this.bag.scale.setScalar(0.8);
    this.bag.rotation.set(0, this.bag.rotation.y, 0);
    this.bagTo.copy(this.bag.position);
    this.bagYaw = this.bag.rotation.y;
    this.bagT = 0;
    this.bag.visible = true;
    this.bag.position.copy(this.bagFrom);
    getGame(this.world).reach();
  }

  /** Lays the satchel's contents out inside the bag as stacks of little item models. */
  private fillBag(contents: Array<{ id: ItemId; count: number }>): void {
    for (let i = 0; i < SLOTS; i++) {
      const obj = this.bagSlots[i].object3D;
      if (!obj) continue;
      for (let k = obj.children.length - 1; k >= 1; k--) obj.remove(obj.children[k]);
      const entry = contents[i];
      obj.visible = !!entry && this.open;
      if (!entry) continue;
      const copies = Math.min(3, entry.count);
      for (let c = 0; c < copies; c++) {
        const m = heldItemMesh(entry.id);
        m.position.set(c * 0.012, c * 0.025, c * 0.01);
        m.rotation.y = c * 0.9;
        obj.add(m);
      }
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  private refresh(): void {
    if (!this.panel) return;
    const game = getGame(this.world);
    const contents = game.satchelContents();
    for (let i = 0; i < SLOTS; i++) {
      const entry = contents[i];
      this.slotItems[i] = entry?.id ?? null;
      // The list card is the bag now: one row per kind of item you carry.
      this.panel.requireElementById(`item-${i}`).setProperties({ display: entry ? 'flex' : 'none' });
      if (entry) {
        this.panel
          .requireElementById<UIKit.Text>(`item-${i}-label`)
          .setProperties({ text: uiText(`${itemName(entry.id)}${entry.count > 1 ? ` x${entry.count}` : ''}: ${ITEMS[entry.id].usedFor}`) });
      }
    }
    this.fillBag(contents);
    // A small picture of the real item beside each row.
    if (this.open) this.thumbs.setRows(contents.map((c, i) => ({ el: `item-${i}`, pic: itemPicture(c.id) })));
    const cap = game.capacity;
    const load = carryRules.easy
      ? `${game.carriedCount} item${game.carriedCount === 1 ? '' : 's'}`
      : `${game.carriedWeight.toFixed(1)}/${cap.load} kg, ${game.carriedCount}/${cap.pockets} pockets`;
    const lim = game.moveLimits.encumbrance;
    // Tools are made at the workbench now (by hand, step by step): no instant buttons for them here.
    this.makeItems = game.makeList().filter((m) => m.kind !== 'bind');
    for (let i = 0; i < MAKE_SLOTS; i++) {
      const m = this.makeItems[i];
      this.panel.requireElementById(`make-${i}`).setProperties({ display: m ? 'flex' : 'none' });
      if (m) this.panel.requireElementById<UIKit.Text>(`make-${i}-label`).setProperties({ text: m.label });
    }
    this.panel.requireElementById('make-title').setProperties({ display: this.makeItems.length ? 'flex' : 'none' });
    const sub = contents.length
      ? `${load}${lim === 'light' ? '' : lim === 'loaded' ? ' - heavy, no running' : ' - OVERLOADED, slow'}. Tap an item to take it.`
      : 'Empty. Point at things in the forest and pinch to gather them.';
    this.panel.requireElementById<UIKit.Text>('satchel-sub').setProperties({ text: sub });
    // Cord and the bow drill are made at the workbench (click it): the old instant buttons stay hidden.
    this.panel.requireElementById('stow-button').setProperties({ display: game.held ? 'flex' : 'none' });
    if (game.held) {
      this.panel.requireElementById<UIKit.Text>('stow-label').setProperties({ text: `Put back ${itemName(game.held).toLowerCase()}` });
    }
  }

  update(delta: number): void {
    if (this.open && this.bagT < 1) {
      this.bagT = Math.min(1, this.bagT + delta / 0.45);
      const t = 1 - (1 - this.bagT) * (1 - this.bagT);
      this.bag.position.lerpVectors(this.bagFrom, this.bagTo, t);
      this.bag.position.y += Math.sin(t * Math.PI) * 0.12;
    }
    if (this.pop.busy) this.pop.update(delta);
    if (this.open && this.vr) this.touch.update(delta);
    if (this.open && (this.thumbTimer += delta) > 0.25) {
      this.thumbTimer = 0;
      this.thumbs.update();
    }
    if (this.open) for (const e of this.bagSlots) e.object3D?.scale.setScalar(1);
    if (this.open) for (const e of this.queries.itemHovered.entities) e.object3D?.scale.setScalar(1.3);
    this.watchShoulder(delta);
    hipPosition(this.camera, this.hip);
    this.pouch.position.copy(this.hip);
    this.pouch.rotation.y = Math.atan2(this.camera.matrixWorld.elements[8], this.camera.matrixWorld.elements[10]);
    // Crafting buttons depend on where you stand: refresh the open panel now and then.
    if (this.open && (this.craftTimer += delta) > 0.5) {
      this.craftTimer = 0;
      this.refresh();
    }
  }
}

function buildPouch(): Group {
  const g = new Group();
  g.name = 'SatchelPouch';
  const leather = lambert(0x7a5432);
  const body = new Mesh(new SphereGeometry(0.09, 10, 8), leather);
  body.scale.set(1, 0.85, 0.6);
  const flap = new Mesh(new BoxGeometry(0.15, 0.06, 0.03), lambert(0x5f3f24));
  flap.position.set(0, 0.05, 0.045);
  const strap = new Mesh(new BoxGeometry(0.02, 0.2, 0.02), lambert(0x5f3f24));
  strap.position.set(0, 0.14, 0);
  g.add(body, flap, strap);
  return g;
}
