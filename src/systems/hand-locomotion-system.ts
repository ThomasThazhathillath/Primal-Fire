// Hands-only movement, two ways:
//  1. IWSDK's hand micro-gestures (thumb on the side of the index finger:
//     tap = teleport, swipe left/right = turn). They start switched off and
//     need a thumb swipe up to enable, which no player would guess, so they
//     are turned on as soon as the right hand is the active input (once per
//     XR session; a swipe down still turns them off).
//  2. Point-and-pinch teleport, for headsets or browsers where micro-gestures
//     don't register: point at open ground, pinch and
//     hold until a ring appears, then let go to move there. Blocked spots
//     (trees, rocks, structures) show the ring red and don't move you.

import {
  createSystem,
  Hovered,
  LocomotionSystem,
  Mesh,
  MeshBasicMaterial,
  TorusGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { actionFor } from '../game/actions.js';
import { collisionWorld } from '../game/collision.js';
import { SWING_TOOLS } from '../game/interact.js';
import { groundHeight, WORLD_RADIUS } from '../game/world-layout.js';
import { DesktopControlsSystem } from './desktop-controls-system.js';
import { hands } from './hand-input-system.js';
import { mayStart } from '../game/priority.js';
import { getGame, getUi, handBusy, handClaims } from './shared.js';

interface MicroGestureConfig {
  config: { microGestureControlsEnabled: { value: boolean } };
}

/** Hold the pinch this long (s) on open ground before it counts as a teleport aim. */
const HOLD = 0.35;
const MAX_DISTANCE = 9;
const PLAYER_RADIUS = 0.3;

const okMat = new MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.85, depthWrite: false });
const badMat = new MeshBasicMaterial({ color: 0xff6a5a, transparent: true, opacity: 0.85, depthWrite: false });

export class HandLocomotionSystem extends createSystem({
  hovered: { required: [Hovered] },
}) {
  private enabledThisSession = false;
  private holdHand = -1;
  private holdTime = 0;
  private valid = false;
  private marker!: Mesh;
  private origin = new Vector3();
  private dir = new Vector3();
  private target = new Vector3();
  private head = new Vector3();

  init(): void {
    getUi(this.world).snapTurn = (deg) => this.snapTurn(deg);
    this.marker = new Mesh(new TorusGeometry(0.28, 0.025, 6, 28), okMat);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.world.createTransformEntity(this.marker);
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        if (v === VisibilityState.NonImmersive) {
          this.enabledThisSession = false;
          this.cancel();
        }
      }),
      // Anything picked up or built during the pinch means it wasn't a move.
      getGame(this.world).on((e) => {
        if (e.type === 'gather' || e.type === 'held' || e.type === 'structure') this.cancel();
      }),
    );
  }

  update(delta: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    this.enableMicroGestures();
    this.updatePinchTeleport(delta);
  }

  private enableMicroGestures(): void {
    if (this.enabledThisSession || !this.input.xr.isPrimary('hand', 'right')) return;
    const loco = this.world.getSystem(LocomotionSystem) as unknown as {
      microGestureControlsEnabled?: boolean;
      turnSystem?: MicroGestureConfig;
      teleportSystem?: MicroGestureConfig;
    } | undefined;
    if (!loco) return;
    // These fields are not part of the public API (checked against @iwsdk/core 1.1.0-rc.2's
    // locomotion.js); guard each one so a future version simply leaves movement as it was.
    if (loco.turnSystem) loco.turnSystem.config.microGestureControlsEnabled.value = true;
    if (loco.teleportSystem) loco.teleportSystem.config.microGestureControlsEnabled.value = true;
    if ('microGestureControlsEnabled' in loco) loco.microGestureControlsEnabled = true;
    this.enabledThisSession = true;
    const game = getGame(this.world);
    game.log.add('hand movement gestures enabled');
    game.toast('To move: point at the ground, pinch and hold, then let go. Or tap your thumb on your index finger.', 'note');
  }

  private updatePinchTeleport(delta: number): void {
    const game = getGame(this.world);
    // A pinch that grabbed something is a grab, never a move.
    if (this.holdHand >= 0 && handClaims.grabbing[this.holdHand]) this.cancel();
    if (this.holdHand < 0) {
      // Start only on a fresh pinch, not pointing at anything interactive. Carrying a part is
      // fine (a pinch that places an outline cancels the move); a tool that uses the pinch is not.
      const held = game.held;
      if ((held && (SWING_TOOLS.includes(held) || actionFor(held))) || this.queries.hovered.entities.size > 0) return;
      // Near a build that wants what you hold, the pinch sets the part down instead.
      if (held && game.wantsItem(held, game.player.x, game.player.z, 3)) return;
      for (let h = 0; h < 2; h++) {
        if (hands[h].tracked && hands[h].gripDown && mayStart('move', { ...handBusy(this.world, h as 0 | 1), grab: handClaims.grabbing[h] })) {
          handClaims.moving[h] = true;
          this.holdHand = h;
          this.holdTime = 0;
          break;
        }
      }
      return;
    }
    const hf = hands[this.holdHand];
    if (!hf.tracked) {
      this.cancel();
      return;
    }
    this.holdTime += delta;
    const aiming = this.holdTime >= HOLD && this.aimAtGround(this.holdHand);
    this.marker.visible = aiming;
    if (aiming) this.marker.material = this.valid ? okMat : badMat;
    if (hf.grip) return;
    // Pinch released: move if the ring was showing on free ground.
    if (aiming && this.valid) this.teleport();
    this.cancel();
  }

  /** Where the hand's ray meets the ground; sets `target`, `valid` and the marker. */
  private aimAtGround(hand: number): boolean {
    const space = this.player.raySpaces[hand === 0 ? 'left' : 'right'];
    if (!space) return false;
    space.getWorldPosition(this.origin);
    space.getWorldDirection(this.dir).negate(); // XR ray spaces point down -Z
    if (this.dir.y > -0.05) return false;
    const t = (this.origin.y - groundHeight(this.origin.x, this.origin.z)) / -this.dir.y;
    if (t <= 0 || t > MAX_DISTANCE * 1.5) return false;
    this.target.copy(this.origin).addScaledVector(this.dir, t);
    this.target.y = groundHeight(this.target.x, this.target.z);
    this.camera.getWorldPosition(this.head);
    const far = Math.hypot(this.target.x - this.head.x, this.target.z - this.head.z) > MAX_DISTANCE;
    const outside = Math.hypot(this.target.x, this.target.z) > WORLD_RADIUS;
    this.valid = !far && !outside && !collisionWorld().isBlocked(this.target.x, this.target.z, PLAYER_RADIUS);
    this.marker.position.set(this.target.x, this.target.y + 0.03, this.target.z);
    return true;
  }

  private teleport(): void {
    // Put your head (not the rig's origin) where you pointed.
    this.camera.getWorldPosition(this.head);
    const rig = this.player.position;
    this.target.x -= this.head.x - rig.x;
    this.target.z -= this.head.z - rig.z;
    this.target.y = rig.y;
    this.world.getSystem(LocomotionSystem)?.setPlayerPosition(this.target);
    getGame(this.world).log.add(`hand teleport to ${this.target.x.toFixed(1)},${this.target.z.toFixed(1)}`);
  }

  /** Snap turn (HUD buttons): rotate the rig about your head, so you turn in place. */
  snapTurn(deg: number): void {
    const a = (deg * Math.PI) / 180;
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.world.getSystem(DesktopControlsSystem)?.turn(a);
      return;
    }
    this.camera.getWorldPosition(this.head);
    const rig = this.player.position;
    const dx = rig.x - this.head.x;
    const dz = rig.z - this.head.z;
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.target.set(this.head.x + dx * c + dz * s, rig.y, this.head.z - dx * s + dz * c);
    this.player.rotation.y += a;
    this.world.getSystem(LocomotionSystem)?.setPlayerPosition(this.target);
  }

  private cancel(): void {
    handClaims.moving[0] = handClaims.moving[1] = false;
    this.holdHand = -1;
    this.holdTime = 0;
    if (this.marker) this.marker.visible = false;
  }
}
