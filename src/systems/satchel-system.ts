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
import { RECIPES, type GameEvent } from '../game/game.js';
import { itemName, type ItemId } from '../game/items.js';
import { SatchelItem, SatchelPouch } from '../components/game-components.js';
import { BAG_HEIGHT, buildOpenBag } from '../scene-assets/bag.js';
import { heldItemMesh } from '../scene-assets/item-meshes.js';
import { lambert } from '../scene-assets/materials.js';
import { getGame, getUi, hidePanel, hipPosition, placeInFront } from './shared.js';

const SLOTS = 12;
const MAKE_SLOTS = 8;

export class SatchelSystem extends createSystem({
  pouchPressed: { required: [SatchelPouch, Pressed] },
  itemPressed: { required: [SatchelItem, Pressed] },
  itemHovered: { required: [SatchelItem, Hovered] },
}) {
  private pouch!: Object3D;
  private panel!: UIKitMLAsset;
  private panelEntity!: Entity;
  private open = false;
  private makeItems: Array<{ id: string; label: string; kind: 'bind' | 'pack' | 'store' | 'take' } | undefined> = [];
  private slotItems: Array<ItemId | null> = [];
  private heldObj: Object3D | null = null;
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

    for (let i = 0; i < SLOTS; i++) {
      const button = this.panel.requireElementById(`item-${i}`);
      const onClick = () => {
        const id = this.slotItems[i];
        if (id && game.takeOut(id)) this.setOpen(false);
      };
      button.addEventListener('click', onClick);
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
      this.cleanupFuncs.push(() => button.removeEventListener('click', onClick));
    }
    const wire = (id: string, fn: () => void) => {
      const el = this.panel.requireElementById(id);
      el.addEventListener('click', fn);
      this.cleanupFuncs.push(() => el.removeEventListener('click', fn));
    };
    wire('craft-cord', () => game.craft('cord'));
    wire('craft-drill', () => game.craft('bowDrill'));
    wire('stow-button', () => game.stow());
    wire('satchel-close', () => this.setOpen(false));

    getUi(this.world).toggleSatchel = () => this.toggle();
    this.cleanupFuncs.push(
      game.on((e: GameEvent) => {
        if (e.type === 'satchel' || e.type === 'held') this.refresh();
        if (e.type === 'held') this.showHeld(e.item);
      }),
      this.world.visibilityState.subscribe(() => this.showHeld(game.held)),
    );
    this.refresh();
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
      this.refresh();
      this.panel.visible = true;
      placeInFront(this.panel, this.camera, 0.95, -0.5, 0.05);
      this.openBag();
    } else {
      hidePanel(this.panel);
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
      this.panel.requireElementById(`item-${i}`).setProperties({ display: 'none' });
      if (entry) {
        this.panel
          .requireElementById<UIKit.Text>(`item-${i}-label`)
          .setProperties({ text: entry.count > 1 ? `${itemName(entry.id)} x${entry.count}` : itemName(entry.id) });
      }
    }
    this.fillBag(contents);
    const cap = game.capacity;
    const load = `${game.carriedWeight.toFixed(1)}/${cap.load} kg, ${game.carriedCount}/${cap.pockets} pockets`;
    const lim = game.moveLimits.encumbrance;
    this.makeItems = game.makeList();
    for (let i = 0; i < MAKE_SLOTS; i++) {
      const m = this.makeItems[i];
      this.panel.requireElementById(`make-${i}`).setProperties({ display: m ? 'flex' : 'none' });
      if (m) this.panel.requireElementById<UIKit.Text>(`make-${i}-label`).setProperties({ text: m.label });
    }
    this.panel.requireElementById('make-title').setProperties({ display: this.makeItems.length ? 'flex' : 'none' });
    const sub = contents.length
      ? `${load}${lim === 'light' ? '' : lim === 'loaded' ? ' - heavy, no running' : ' - OVERLOADED, slow'}. Pinch an item to take it.`
      : 'Empty. Point at things in the forest and pinch to gather them.';
    this.panel.requireElementById<UIKit.Text>('satchel-sub').setProperties({ text: sub });
    const bench = game.nearbyWorkbench() !== null;
    this.panel.requireElementById('craft-cord').setProperties({ display: bench && game.canCraft(RECIPES[0]) ? 'flex' : 'none' });
    this.panel.requireElementById('craft-drill').setProperties({ display: bench && game.canCraft(RECIPES[1]) ? 'flex' : 'none' });
    this.panel.requireElementById('stow-button').setProperties({ display: game.held ? 'flex' : 'none' });
    if (game.held) {
      this.panel.requireElementById<UIKit.Text>('stow-label').setProperties({ text: `Put back ${itemName(game.held).toLowerCase()}` });
    }
  }

  /** Shows the held item in your right hand (VR) or lower-right of view (browser). */
  private showHeld(item: ItemId | null): void {
    this.heldObj?.removeFromParent();
    this.heldObj = null;
    if (!item) return;
    const obj = heldItemMesh(item);
    const immersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    const hand = immersive ? this.player.gripSpaces.right : null;
    if (hand) {
      obj.position.set(0, -0.02, -0.06);
      hand.add(obj);
    } else {
      obj.position.set(0.22, -0.26, -0.55);
      obj.rotation.set(0.3, 0.4, 0);
      this.camera.add(obj);
    }
    this.heldObj = obj;
  }

  update(delta: number): void {
    if (this.open && this.bagT < 1) {
      this.bagT = Math.min(1, this.bagT + delta / 0.45);
      const t = 1 - (1 - this.bagT) * (1 - this.bagT);
      this.bag.position.lerpVectors(this.bagFrom, this.bagTo, t);
      this.bag.position.y += Math.sin(t * Math.PI) * 0.12;
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
