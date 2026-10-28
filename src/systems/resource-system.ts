// Gathering: every resource spot from the world layout becomes an entity you
// can point at and pinch (hand), trigger (controller) or click (browser).
// The item flies to your hip satchel.

import {
  createSystem,
  type Entity,
  Group,
  type Object3D,
  Pressed,
  RayInteractable,
  Vector3,
} from '@iwsdk/core';
import type { ItemId } from '../game/items.js';
import { RESOURCES, type ResourceSpot } from '../game/world-layout.js';
import { Gatherable } from '../components/game-components.js';
import { itemMesh, resourceMesh } from '../scene-assets/item-meshes.js';
import { getGame, hipPosition } from './shared.js';

/** Max distance (m) from your head to something you can gather. */
export const REACH = 4.5;
const FLIGHT_TIME = 0.4;

interface Flight {
  obj: Object3D;
  from: Vector3;
  t: number;
}

export class ResourceSystem extends createSystem({
  spots: { required: [Gatherable] },
  pressed: { required: [Gatherable, Pressed] },
}) {
  private bySpot = new Map<string, ResourceSpot>();
  private entityBySpot = new Map<string, Entity>();
  private fx!: Group;
  private flights: Flight[] = [];
  private head = new Vector3();
  private hip = new Vector3();
  private regrowTimer = 0;

  init(): void {
    const fxRoot = this.world.createTransformEntity(new Group());
    this.fx = fxRoot.object3D as Group;
    for (const spot of RESOURCES) {
      const obj = resourceMesh(spot.look);
      obj.position.set(spot.x, 0, spot.z);
      obj.rotation.y = spot.rotY;
      obj.name = `Resource_${spot.id}`;
      const e = this.world.createTransformEntity(obj);
      e.addComponent(Gatherable, { spotId: spot.id, charges: spot.charges, regrowAt: 0 });
      e.addComponent(RayInteractable);
      this.bySpot.set(spot.id, spot);
      this.entityBySpot.set(spot.id, e);
    }
    this.cleanupFuncs.push(this.queries.pressed.subscribe('qualify', (e) => this.tryGather(e)));
  }

  spot(id: string): ResourceSpot | undefined {
    return this.bySpot.get(id);
  }

  entityFor(spotId: string): Entity | undefined {
    return this.entityBySpot.get(spotId);
  }

  /** Nearest spot with charges left that offers one of `items`. */
  locate(items: ItemId[], from: { x: number; z: number }): { x: number; z: number } | null {
    let best: { x: number; z: number; d: number } | null = null;
    for (const e of this.queries.spots.entities) {
      if ((e.getValue(Gatherable, 'charges') ?? 0) <= 0) continue;
      const spot = this.bySpot.get(e.getValue(Gatherable, 'spotId') ?? '');
      if (!spot || !items.includes(spot.itemId)) continue;
      const d = Math.hypot(spot.x - from.x, spot.z - from.z);
      if (!best || d < best.d) best = { x: spot.x, z: spot.z, d };
    }
    return best;
  }

  /** Distance from the head to a spot, on the ground plane. */
  distanceTo(spot: ResourceSpot): number {
    this.camera.getWorldPosition(this.head);
    return Math.hypot(spot.x - this.head.x, spot.z - this.head.z);
  }

  tryGather(e: Entity): boolean {
    const game = getGame(this.world);
    const spot = this.bySpot.get(e.getValue(Gatherable, 'spotId') ?? '');
    const charges = e.getValue(Gatherable, 'charges') ?? 0;
    if (!spot || charges <= 0) return false;
    if (this.distanceTo(spot) > REACH) {
      game.toast('Too far away to reach - get closer.', 'bad');
      game.log.add(`gather ${spot.id}: out of reach`, 'bad');
      return false;
    }
    game.gather(spot.itemId, spot.id);
    this.launchFlight(spot.itemId, e.object3D!);
    const left = charges - 1;
    e.setValue(Gatherable, 'charges', left);
    if (left <= 0) {
      e.object3D!.visible = false;
      e.removeComponent(RayInteractable);
      e.setValue(Gatherable, 'regrowAt', spot.regrow > 0 ? game.time + spot.regrow : 0);
    }
    return true;
  }

  private launchFlight(item: ItemId, from: Object3D): void {
    const obj = itemMesh(item);
    from.getWorldPosition(obj.position);
    obj.position.y += 0.15;
    this.fx.add(obj);
    this.flights.push({ obj, from: obj.position.clone(), t: 0 });
  }

  update(delta: number): void {
    if (this.flights.length) {
      hipPosition(this.camera, this.hip);
      for (let i = this.flights.length - 1; i >= 0; i--) {
        const f = this.flights[i];
        f.t += delta / FLIGHT_TIME;
        const t = Math.min(1, f.t);
        f.obj.position.lerpVectors(f.from, this.hip, t * t);
        f.obj.position.y += Math.sin(t * Math.PI) * 0.25;
        f.obj.scale.setScalar(1 - t * 0.7);
        if (t >= 1) {
          f.obj.removeFromParent();
          this.flights.splice(i, 1);
        }
      }
    }
    this.regrowTimer += delta;
    if (this.regrowTimer < 1) return;
    this.regrowTimer = 0;
    const now = getGame(this.world).time;
    for (const e of this.queries.spots.entities) {
      const at = e.getValue(Gatherable, 'regrowAt') ?? 0;
      if (at <= 0 || now < at) continue;
      const spot = this.bySpot.get(e.getValue(Gatherable, 'spotId') ?? '');
      if (!spot) continue;
      e.setValue(Gatherable, 'charges', spot.charges);
      e.setValue(Gatherable, 'regrowAt', 0);
      e.object3D!.visible = true;
      e.addComponent(RayInteractable);
    }
  }
}
