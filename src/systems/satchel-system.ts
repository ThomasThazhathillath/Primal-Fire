// The satchel: a pouch on your hip (pinch it to open), a panel listing what
// you carry, and the item in your hand. Crafting buttons appear while you
// stand at a finished workbench.

import {
  BoxGeometry,
  createSystem,
  type Entity,
  Group,
  Mesh,
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
import { SatchelPouch } from '../components/game-components.js';
import { heldItemMesh } from '../scene-assets/item-meshes.js';
import { lambert } from '../scene-assets/materials.js';
import { getGame, getUi, hidePanel, hipPosition, placeInFront } from './shared.js';

const SLOTS = 12;

export class SatchelSystem extends createSystem({
  pouchPressed: { required: [SatchelPouch, Pressed] },
}) {
  private pouch!: Object3D;
  private panel!: UIKitMLAsset;
  private panelEntity!: Entity;
  private open = false;
  private slotItems: Array<ItemId | null> = [];
  private heldObj: Object3D | null = null;
  private hip = new Vector3();
  private craftTimer = 0;

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

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    if (!this.panel) return;
    this.open = open;
    if (open) {
      this.refresh();
      this.panel.visible = true;
      placeInFront(this.panel, this.camera, 0.6, 0.2, 0.2);
    } else {
      hidePanel(this.panel);
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
      this.panel.requireElementById(`item-${i}`).setProperties({ display: entry ? 'flex' : 'none' });
      if (entry) {
        this.panel
          .requireElementById<UIKit.Text>(`item-${i}-label`)
          .setProperties({ text: entry.count > 1 ? `${itemName(entry.id)} x${entry.count}` : itemName(entry.id) });
      }
    }
    const sub = contents.length
      ? 'Pinch an item to take it in hand.'
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
