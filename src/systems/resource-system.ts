// Gathering: every resource spot from the world layout becomes an entity you
// can point at and pinch (hand), trigger (controller) or click (browser).
// The item flies to your hip satchel.

import {
  createSystem,
  type Entity,
  CircleGeometry,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  VisibilityState,
  type Object3D,
  Pressed,
  RayInteractable,
  Vector3,
} from '@iwsdk/core';
import type { ItemId } from '../game/items.js';
import { SWING_TOOLS } from '../game/interact.js';
import { groundHeight, RESOURCES, type ResourceSpot } from '../game/world-layout.js';
import { Gatherable } from '../components/game-components.js';
import { itemMesh, resourceMesh } from '../scene-assets/item-meshes.js';
import { getGame, glowMaterial, glowMaterialHot, hipPosition } from './shared.js';

/** Max distance (m) from your head to something you can gather. */
export const REACH = 4.5;
/** Resource look that is dragged rather than lifted. */
export const DRAG_LOOK = 'fallenLog';
/** Radius (m) of the invisible hit sphere around each resource: sticks and pebbles are far too thin to click. */
const HIT_RADIUS = 0.4;
const hitGeo = new SphereGeometry(HIT_RADIUS, 8, 6);
const hitMat = new MeshBasicMaterial({ visible: false });
const glowGeo = new CircleGeometry(0.22, 20);
const FLIGHT_TIME = 0.4;
/** Spots farther than this (m) are hidden: they sit in full fog and cost draw calls. */
const CULL_DISTANCE = 30;

interface Flight {
  obj: Object3D;
  from: Vector3;
  t: number;
}

export class ResourceSystem extends createSystem({
  spots: { required: [Gatherable] },
  pressed: { required: [Gatherable, Pressed] },
  hovered: { required: [Gatherable, Hovered] },
}) {
  private bySpot = new Map<string, ResourceSpot>();
  private entityBySpot = new Map<string, Entity>();
  private fx!: Group;
  private flights: Flight[] = [];
  private head = new Vector3();
  private hip = new Vector3();
  private regrowTimer = 0;
  private crosshair: HTMLDivElement | null = null;
  private litObj: Object3D | null = null;
  private pulse = 0;

  init(): void {
    const fxRoot = this.world.createTransformEntity(new Group());
    this.fx = fxRoot.object3D as Group;
    for (const spot of RESOURCES) {
      const obj = resourceMesh(spot.look);
      obj.position.set(spot.x, groundHeight(spot.x, spot.z), spot.z);
      obj.rotation.y = spot.rotY;
      obj.name = `Resource_${spot.id}`;
      const hit = new Mesh(hitGeo, hitMat);
      hit.name = 'HitProxy';
      hit.position.y = HIT_RADIUS * 0.8;
      obj.add(hit);
      const glow = new Mesh(glowGeo, glowMaterial);
      glow.name = 'Glow';
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.025;
      obj.add(glow);
      const e = this.world.createTransformEntity(obj);
      e.addComponent(Gatherable, { spotId: spot.id, charges: spot.charges, regrowAt: 0 });
      e.addComponent(RayInteractable);
      this.bySpot.set(spot.id, spot);
      this.entityBySpot.set(spot.id, e);
    }
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (e) => {
        // With an axe or hammer in hand you swing at things (InteractionSystem) instead of picking them.
        const held = getGame(this.world).held;
        if (held && SWING_TOOLS.includes(held)) return;
        // Fallen logs are too heavy to pick up: InteractionSystem drags them (a plain click still breaks off a piece).
        if (this.bySpot.get(e.getValue(Gatherable, 'spotId') ?? '')?.look === DRAG_LOOK) return;
        this.tryGather(e);
      }),
    );
    // Desktop crosshair: white = nothing, green = collectable, orange = too far.
    const ch = document.createElement('div');
    ch.style.cssText = 'position:fixed;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid #fff;border-radius:50%;pointer-events:none;z-index:5;opacity:.8;box-shadow:0 0 3px #000;transition:border-color .1s,transform .1s';
    document.body.appendChild(ch);
    this.crosshair = ch;
    const onMove = (ev: PointerEvent) => {
      ch.style.left = `${ev.clientX}px`;
      ch.style.top = `${ev.clientY}px`;
    };
    window.addEventListener('pointermove', onMove);
    this.cleanupFuncs.push(() => {
      ch.remove();
      window.removeEventListener('pointermove', onMove);
    });
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
    if (!game.gather(spot.itemId, spot.id)) return false;
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

  private setGlow(obj: Object3D | null, mat: typeof glowMaterial): void {
    const glow = obj?.getObjectByName('Glow') as Mesh | undefined;
    if (glow) glow.material = mat;
  }

  /** Highlights the hovered resource (a gentle scale-up) and colours the crosshair by reach. */
  private updateHover(): void {
    let target: Object3D | null = null;
    let near = false;
    for (const e of this.queries.hovered.entities) {
      if ((e.getValue(Gatherable, 'charges') ?? 0) <= 0) continue;
      target = e.object3D ?? null;
      const spot = this.bySpot.get(e.getValue(Gatherable, 'spotId') ?? '');
      near = !!spot && this.distanceTo(spot) <= REACH;
      break;
    }
    if (target !== this.litObj) {
      this.litObj?.scale.setScalar(1);
      this.setGlow(this.litObj, glowMaterial);
      this.setGlow(target, glowMaterialHot);
      this.litObj = target;
    }
    target?.scale.setScalar(near ? 1.12 : 1.04);
    if (this.crosshair) {
      const desktop = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
      this.crosshair.style.display = desktop ? 'block' : 'none';
      this.crosshair.style.borderColor = target ? (near ? '#6fe07a' : '#ff9a3c') : '#fff';
      this.crosshair.style.transform = target ? 'scale(1.5)' : 'scale(1)';
    }
  }

  update(delta: number): void {
    this.pulse += delta;
    glowMaterial.opacity = 0.14 + 0.1 * Math.sin(this.pulse * 3);
    glowMaterialHot.opacity = 0.45 + 0.15 * Math.sin(this.pulse * 6);
    this.updateHover();
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
    this.camera.getWorldPosition(this.head);
    for (const e of this.queries.spots.entities) {
      const at = e.getValue(Gatherable, 'regrowAt') ?? 0;
      if ((e.getValue(Gatherable, 'charges') ?? 0) > 0) {
        const o = e.object3D!;
        o.visible = Math.hypot(o.position.x - this.head.x, o.position.z - this.head.z) < CULL_DISTANCE;
      }
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
