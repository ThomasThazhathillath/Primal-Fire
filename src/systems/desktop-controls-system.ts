// Browser (non-VR) controls, for desk testing and visitors without a headset:
// WASD / arrows to walk, Q/E or right-drag to look, click to use.
// H hint · Tab satchel · N notebook · R put back what you hold.
// In VR none of this runs: you teleport and use your hands.

import { createSystem, LocomotionSystem, Vector3, VisibilityState } from '@iwsdk/core';
import { WORLD_RADIUS } from '../game/world-layout.js';
import { getGame, getUi } from './shared.js';

const EYE_HEIGHT = 1.6;
const WALK = 3;
const RUN = 6;
const TURN = 1.8;

export class DesktopControlsSystem extends createSystem({}) {
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = -0.08;
  private dragging = false;
  private move = new Vector3();
  private target = new Vector3();

  init(): void {
    const canvas = this.renderer.domElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.active()) return;
      this.keys.add(e.code);
      const ui = getUi(this.world);
      if (e.code === 'Tab') {
        e.preventDefault();
        ui.toggleSatchel?.();
      } else if (e.code === 'KeyH') ui.showHint?.();
      else if (e.code === 'KeyN') ui.openNotebook?.();
      else if (e.code === 'KeyR') getGame(this.world).stow();
    };
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    const onDown = (e: PointerEvent) => {
      if (e.button === 2) this.dragging = true;
    };
    const onUp = (e: PointerEvent) => {
      if (e.button === 2) this.dragging = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!this.dragging || !this.active()) return;
      this.yaw -= e.movementX * 0.004;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - e.movementY * 0.004));
    };
    const noMenu = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);
    canvas.addEventListener('contextmenu', noMenu);
    this.cleanupFuncs.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('contextmenu', noMenu);
    });
  }

  private active(): boolean {
    return this.world.visibilityState.peek() === VisibilityState.NonImmersive;
  }

  /**
   * Moves the player (browser or VR rig) to stand at (x, z). Locomotion owns
   * the rig's position, so this goes through it rather than writing directly.
   */
  goTo(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.player.position.copy(this.target);
    this.world.getSystem(LocomotionSystem)?.setPlayerPosition(this.target);
  }

  /** Turns to look at (x, z) from where you stand. */
  face(x: number, z: number): void {
    const dx = x - this.player.position.x;
    const dz = z - this.player.position.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = -0.35;
  }

  update(delta: number): void {
    if (!this.active()) return;
    const k = this.keys;
    if (k.has('KeyQ') || k.has('ArrowLeft')) this.yaw += TURN * delta;
    if (k.has('KeyE') || k.has('ArrowRight')) this.yaw -= TURN * delta;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (f || s) {
      const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK) * delta;
      this.move.set(s, 0, -f).normalize().applyAxisAngle(this.camera.up, this.yaw).multiplyScalar(speed);
      const p = this.target.copy(this.player.position).add(this.move);
      const r = Math.hypot(p.x, p.z);
      if (r > WORLD_RADIUS) p.multiplyScalar(WORLD_RADIUS / r);
      this.goTo(p.x, p.z);
    }
    this.player.rotation.set(0, this.yaw, 0);
    this.camera.position.set(0, EYE_HEIGHT, 0);
    this.camera.rotation.set(this.pitch, 0, 0, 'YXZ');
  }
}
