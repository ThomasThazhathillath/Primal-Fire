// Keeps the VR player out of trees, rocks, logs and structures. IWSDK
// locomotion (slide/teleport) moves the rig without knowing about them, so
// after it moves we resolve the step and, if needed, hand a corrected
// position back through LocomotionSystem.setPlayerPosition. Only rig moves
// are resolved: head movement inside the rig (seated or room-scale leaning)
// never pushes the player.

import { createSystem, LocomotionSystem, Vector3, VisibilityState } from '@iwsdk/core';
import { collisionWorld, PLAYER_RADIUS } from '../game/collision.js';
import { getGame } from './shared.js';

/** A rig jump longer than this in one frame is a teleport, not a slide. */
const TELEPORT_JUMP = 1;

export class PlayerCollisionSystem extends createSystem({}) {
  private last = { x: 0, z: 0 };
  private now = { x: 0, z: 0 };
  private out = { x: 0, z: 0 };
  private fix = new Vector3();
  private tracking = false;

  update(): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      // Desktop controls resolve their own moves; restart tracking on entry.
      this.tracking = false;
      return;
    }
    const p = this.player.position;
    if (!this.tracking) {
      this.tracking = true;
      this.last.x = p.x;
      this.last.z = p.z;
      return;
    }
    const dx = p.x - this.last.x;
    const dz = p.z - this.last.z;
    if (dx * dx + dz * dz < 1e-8) return;
    const world = collisionWorld();
    world.setStructures(getGame(this.world).structures);
    this.now.x = p.x;
    this.now.z = p.z;
    if (dx * dx + dz * dz > TELEPORT_JUMP * TELEPORT_JUMP) {
      world.nudgeOut(p.x, p.z, PLAYER_RADIUS, this.out);
    } else {
      world.resolveMove(this.last, this.now, PLAYER_RADIUS, this.out);
    }
    if (Math.abs(this.out.x - p.x) > 1e-4 || Math.abs(this.out.z - p.z) > 1e-4) {
      this.fix.set(this.out.x, p.y, this.out.z);
      this.world.getSystem(LocomotionSystem)?.setPlayerPosition(this.fix);
      p.x = this.out.x;
      p.z = this.out.z;
    }
    this.last.x = this.out.x;
    this.last.z = this.out.z;
  }
}
