// Dropped items: each one lies on the ground at real size with a pulsing
// highlight and is picked up with a pinch or click. Something let go from
// your hand starts exactly where your hand released it, with its momentum:
// it flies, bounces by material, rolls a little and settles where it lands
// (src/game/carry.ts), with a material contact sound and particles on each
// impact. G drops what you hold (or the bag item you point at), Shift+G
// throws it, F stashes it in nearby storage. Persisted through Game.drops.

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
import { bounceOff, stepBody, type Body } from '../game/carry.js';
import { nudgeOut } from '../game/collision.js';
import { ITEM_PHYSICS, type ItemId, type Material } from '../game/items.js';
import { groundHeight, STREAM_BANK, streamDistance } from '../game/world-layout.js';
import { WorldDropItem } from '../components/game-components.js';
import { itemMesh } from '../scene-assets/item-meshes.js';
import { getGame, getUi, glowMaterial, handClaims, pendingRelease } from './shared.js';

const hitGeo = new SphereGeometry(0.3, 8, 6);
const hitMat = new MeshBasicMaterial({ visible: false });
const glowGeo = new CircleGeometry(0.28, 20);

interface Falling {
  obj: Group;
  dropId: number;
  item: ItemId;
  body: Body;
}

/** What the ground is made of at (x, z): the stream's water, or forest soil. */
export function groundMaterial(x: number, z: number): Material {
  return streamDistance(x, z) < STREAM_BANK * 0.6 ? 'water' : 'soil';
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
        if (performance.now() / 1000 - handClaims.grabAt < 0.3) return;
        const id = e.getValue(WorldDropItem, 'dropId') ?? 0;
        const d = game.drops.find((x) => x.id === id);
        if (d && Math.hypot(d.x - game.player.x, d.z - game.player.z) > 4.5) game.toast('Too far away to reach - get closer.', 'bad');
        else game.pickUpDrop(id);
      }),
    );
    this.sync(false);
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
      const m = itemMesh(d.item);
      m.position.y = 0.02;
      const glow = new Mesh(glowGeo, glowMaterial);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      const hit = new Mesh(hitGeo, hitMat);
      hit.position.y = 0.2;
      g.add(m, glow, hit);
      g.position.set(d.x, groundHeight(d.x, d.z), d.z);
      const e = this.world.createTransformEntity(g);
      e.addComponent(WorldDropItem, { dropId: d.id });
      e.addComponent(RayInteractable);
      this.views.set(d.id, e);
      if (!animate) continue;
      // Just let go: start at the hand with the hand's velocity (else fall from waist height).
      const fromHand = pendingRelease.valid && pendingRelease.item === d.item;
      const body: Body = {
        pos: fromHand ? { x: pendingRelease.pos.x, y: pendingRelease.pos.y, z: pendingRelease.pos.z } : { x: d.x, y: groundHeight(d.x, d.z) + 0.9, z: d.z },
        vel: fromHand ? { x: pendingRelease.vel.x, y: pendingRelease.vel.y, z: pendingRelease.vel.z } : { x: 0, y: 0, z: 0 },
        spin: (Math.random() - 0.5) * 6,
        settled: false,
      };
      if (fromHand) g.quaternion.copy(pendingRelease.quat);
      const placed = fromHand && pendingRelease.place;
      pendingRelease.valid = false;
      pendingRelease.place = false;
      if (placed) {
        // Set down by hand: it stays exactly where it was lowered, flat, with a soft contact sound.
        body.vel.x = body.vel.y = body.vel.z = 0;
        body.pos.y = 0;
        body.spin = 0;
        g.position.set(body.pos.x, 0, body.pos.z);
        g.rotation.x = g.rotation.z = 0;
        const gy = groundHeight(body.pos.x, body.pos.z);
        g.position.y = gy;
        getGame(this.world).contact(ITEM_PHYSICS[d.item].material, groundMaterial(body.pos.x, body.pos.z), body.pos.x, gy + 0.02, body.pos.z, 0.5);
        continue;
      }
      g.position.set(body.pos.x, body.pos.y, body.pos.z);
      this.falling.push({ obj: g, dropId: d.id, item: d.item, body });
    }
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    const game = getGame(this.world);
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      const b = f.body;
      const gy = groundHeight(b.pos.x, b.pos.z);
      const ev = stepBody(b, f.item, dt, gy);
      // Flying into a trunk, rock or structure: stop going in and bounce off it.
      if (!b.settled && b.pos.y < 2.5) {
        const sz = ITEM_PHYSICS[f.item].size;
        const p = nudgeOut(b.pos.x, b.pos.z, Math.max(sz[0], sz[1], sz[2]) / 2);
        if (p.x !== b.pos.x || p.z !== b.pos.z) {
          const hit = bounceOff(b, p.x - b.pos.x, p.z - b.pos.z);
          b.pos.x = p.x;
          b.pos.z = p.z;
          if (hit > 0.8) game.contact(ITEM_PHYSICS[f.item].material, 'wood', b.pos.x, b.pos.y, b.pos.z, hit);
        }
      }
      f.obj.position.set(b.pos.x, b.pos.y, b.pos.z);
      f.obj.rotation.y += b.spin * dt;
      // Lying down: tip flat as it lands.
      if (b.pos.y <= gy + 0.001) {
        f.obj.rotation.x *= 0.85;
        f.obj.rotation.z *= 0.85;
      }
      if (ev?.kind === 'impact') {
        game.contact(ITEM_PHYSICS[f.item].material, groundMaterial(b.pos.x, b.pos.z), b.pos.x, gy + 0.02, b.pos.z, ev.speed);
      }
      if (ev?.kind === 'settled' || b.settled) {
        // Never come to rest inside a tree, rock or structure.
        const sz = ITEM_PHYSICS[f.item].size;
        const p = nudgeOut(b.pos.x, b.pos.z, Math.max(sz[0], sz[1], sz[2]) / 2);
        b.pos.x = p.x;
        b.pos.z = p.z;
        f.obj.position.x = p.x;
        f.obj.position.z = p.z;
        const d = game.drops.find((x) => x.id === f.dropId);
        if (d) {
          d.x = b.pos.x;
          d.z = b.pos.z;
        }
        // Rest exactly on the local ground wherever it ended up.
        b.pos.y = f.obj.position.y = groundHeight(b.pos.x, b.pos.z);
        f.obj.rotation.x = f.obj.rotation.z = 0;
        this.falling.splice(i, 1);
      }
    }
  }
}
