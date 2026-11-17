// Lesson 05: tells the field rules (curriculum/lessons/food/field.ts) where you are looking, so looking up
// at the sky reads the clouds and facing the sun reads its direction. Same in VR (your head) and on the
// desktop (the mouse-look camera). A few times a second is plenty; nothing here allocates.

import { createSystem, Vector3 } from '@iwsdk/core';
import { getGame } from './shared.js';
import { WorldSystem } from './world-system.js';

const STEP = 0.1;

export class FieldSystem extends createSystem({}) {
  private dir = new Vector3();
  private t = 0;

  update(delta: number): void {
    if ((this.t += delta) < STEP) return;
    const dt = this.t;
    this.t = 0;
    if (!(this.world.getSystem(WorldSystem)?.started ?? false)) return;
    this.camera.getWorldDirection(this.dir);
    const yaw = Math.atan2(-this.dir.x, -this.dir.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, this.dir.y)));
    getGame(this.world).field.observeView(yaw, pitch, dt);
  }
}
