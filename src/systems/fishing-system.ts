// Fish in the stream (rules in game/food.ts). Each fish is drawn as a dark
// shape at its APPARENT position: light bending at the surface makes it look
// shallower than it is. A spear thrust is a straight line, so aim below it.
//   VR:      hold the fishing spear and thrust your hand down fast; the line
//            runs from your eyes through your hand.
//   Browser: hold the spear and click; the line runs along your view.

import { createSystem, Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3, VisibilityState } from '@iwsdk/core';
import { apparentDepth, FISH_COUNT, WATER_Y } from '../game/food.js';
import { getGame } from './shared.js';

/** Hand speed (m/s, mostly downward) that counts as a thrust in VR. */
const THRUST_SPEED = 1.6;
const POOL = FISH_COUNT + 2;

export class FishingSystem extends createSystem({}) {
  private root = new Group();
  private meshes: Mesh[] = [];
  private eye = new Vector3();
  private dir = new Vector3();
  private hand = new Vector3();
  private prev = new Vector3();
  private hasPrev = false;
  private cooldown = 0;

  init(): void {
    this.root.name = 'Fish';
    this.world.createTransformEntity(this.root);
    const geo = new SphereGeometry(0.11, 10, 6);
    const mat = new MeshBasicMaterial({ color: 0x1d2a2e, transparent: true, opacity: 0.75, depthWrite: false });
    for (let i = 0; i < POOL; i++) {
      const m = new Mesh(geo, mat);
      m.scale.set(0.55, 0.35, 1.4);
      m.visible = false;
      this.root.add(m);
      this.meshes.push(m);
    }
    const canvas = this.renderer.domElement;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || getGame(this.world).held !== 'fishingSpear') return;
      if (this.world.visibilityState.peek() !== VisibilityState.NonImmersive) return;
      this.camera.getWorldPosition(this.eye);
      this.camera.getWorldDirection(this.dir);
      getGame(this.world).food.thrust(this.eye, this.dir);
    };
    canvas.addEventListener('pointerdown', onDown);
    this.cleanupFuncs.push(() => canvas.removeEventListener('pointerdown', onDown));
  }

  update(delta: number): void {
    const g = getGame(this.world);
    const fish = g.food.fish;
    for (let i = 0; i < POOL; i++) {
      const m = this.meshes[i];
      const f = fish[i];
      m.visible = !!f;
      if (!f) continue;
      m.position.set(f.x, WATER_Y - apparentDepth(f.depth), f.z);
      m.rotation.y = f.heading;
    }
    this.cooldown = Math.max(0, this.cooldown - delta);
    if (g.held !== 'fishingSpear' || this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.hasPrev = false;
      return;
    }
    const grip = this.player.gripSpaces.right ?? this.player.gripSpaces.left;
    if (!grip) return;
    grip.getWorldPosition(this.hand);
    if (this.hasPrev && delta > 0 && this.cooldown === 0) {
      const vy = (this.hand.y - this.prev.y) / delta;
      const v = this.hand.distanceTo(this.prev) / delta;
      if (v > THRUST_SPEED && vy < -THRUST_SPEED * 0.5) {
        this.camera.getWorldPosition(this.eye);
        this.dir.subVectors(this.hand, this.eye).normalize();
        g.food.thrust(this.eye, this.dir);
        this.cooldown = 0.8;
      }
    }
    this.prev.copy(this.hand);
    this.hasPrev = true;
  }
}
