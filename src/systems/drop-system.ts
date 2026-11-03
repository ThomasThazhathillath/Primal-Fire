// Dropped items: each one lies on the ground as a small model with a pulsing
// highlight, falls and settles when dropped, and is picked up with a pinch or
// click. G drops what you hold (or the bag item you point at), F stashes it
// in nearby storage. Persisted in the save through Game.drops.

import {
  CircleGeometry,
  createSystem,
  type Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  AdditiveBlending,
  Pressed,
  RayInteractable,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import type { GameEvent } from '../game/game.js';
import type { ItemId } from '../game/items.js';
import { nudgeOut } from '../game/collision.js';
import { WorldDropItem } from '../components/game-components.js';
import { heldItemMesh } from '../scene-assets/item-meshes.js';
import { getGame, getUi, glowMaterial } from './shared.js';

const hitGeo = new SphereGeometry(0.3, 8, 6);
const hitMat = new MeshBasicMaterial({ visible: false });
const glowGeo = new CircleGeometry(0.28, 20);
const GRAVITY = 9.8;

interface Falling {
  obj: Group;
  vy: number;
}

export class DropSystem extends createSystem({
  pressed: { required: [WorldDropItem, Pressed] },
}) {
  private views = new Map<number, Entity>();
  private falling: Falling[] = [];
  private head = new Vector3();

  init(): void {
    const game = getGame(this.world);
    this.cleanupFuncs.push(
      game.on((e: GameEvent) => {
        if (e.type === 'drops') this.sync(true);
      }),
      this.queries.pressed.subscribe('qualify', (e) => {
        const id = e.getValue(WorldDropItem, 'dropId') ?? 0;
        const d = game.drops.find((x) => x.id === id);
        if (d && Math.hypot(d.x - game.player.x, d.z - game.player.z) > 4.5) game.toast('Too far away to reach - get closer.', 'bad');
        else game.pickUpDrop(id);
      }),
    );
    getUi(this.world).dropHeld = (item: ItemId) => this.dropInFront(item);
    this.sync(false);
  }

  /** Drops `item` about 0.7 m in front of you. */
  dropInFront(item: ItemId): void {
    this.camera.getWorldPosition(this.head);
    const dir = this.camera.getWorldDirection(new Vector3());
    const len = Math.hypot(dir.x, dir.z) || 1;
    const at = nudgeOut(this.head.x + (dir.x / len) * 0.7, this.head.z + (dir.z / len) * 0.7, 0.15);
    getGame(this.world).dropItem(item, at.x, at.z);
  }

  private sync(animate: boolean): void {
    const game = getGame(this.world);
    const live = new Set(game.drops.map((d) => d.id));
    for (const [id, e] of this.views) {
      if (!live.has(id)) {
        e.dispose();
        this.views.delete(id);
      }
    }
    for (const d of game.drops) {
      if (this.views.has(d.id)) continue;
      const g = new Group();
      g.name = `Drop_${d.id}`;
      const m = heldItemMesh(d.item);
      m.position.y = 0.05;
      const glow = new Mesh(glowGeo, glowMaterial);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      const hit = new Mesh(hitGeo, hitMat);
      hit.position.y = 0.2;
      g.add(m, glow, hit);
      g.position.set(d.x, animate ? 1.0 : 0, d.z);
      const e = this.world.createTransformEntity(g);
      e.addComponent(WorldDropItem, { dropId: d.id });
      e.addComponent(RayInteractable);
      this.views.set(d.id, e);
      if (animate) this.falling.push({ obj: g, vy: 0 });
    }
  }

  update(delta: number): void {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.vy -= GRAVITY * delta;
      f.obj.position.y += f.vy * delta;
      if (f.obj.position.y <= 0) {
        // One small bounce, then settle.
        if (f.vy < -1.5) {
          f.obj.position.y = 0;
          f.vy *= -0.3;
        } else {
          f.obj.position.y = 0;
          this.falling.splice(i, 1);
        }
      }
    }
  }
}
