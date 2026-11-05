// What you hold, shown in your hand(s) at real size. The object springs to
// its grip pose with lag set by its mass (src/game/carry.ts): a stone snaps to
// the hand, an axe swings a little behind it, a slab trails between both
// hands. Picking something up animates it from where it was to your hand.
// Letting go throws it with the hand's recent velocity; DropSystem then lets
// it fall, bounce and settle.
//   VR: one-handed items sit at the right grip with the grip point (a tool's
//       handle end) in the palm; two-handed items span both hands. Releasing
//       the squeeze (grip button / fist) lets go.
//   Desktop: held low on the right (two-handed: across the bottom of the
//       view); G drops it, Shift+G throws it.

import { Box3, createSystem, Group, type Object3D, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { tiltDegrees } from '../game/gestures.js';
import { throwImpulse } from '../game/handmotion.js';
import { distanceToAxis, GripBlend, TwoHandGrip, TwoHandPose } from '../game/twohand.js';
import { followStiffness, springStep, VelocityTracker } from '../game/carry.js';
import type { GameEvent } from '../game/game.js';
import { carryRules, ITEM_PHYSICS, ITEMS, twoHanded, type ItemId } from '../game/items.js';
import { itemMesh } from '../scene-assets/item-meshes.js';
import { hands } from './hand-input-system.js';
import { releaseKind, restHeight } from '../game/pinch.js';
import { groundHeight } from '../game/world-layout.js';
import { spotWorldPosition } from '../game/blueprint.js';
import { getGame, getUi, handClaims, hipPosition, pendingRelease, pickupFrom } from './shared.js';
import { SWING_TOOLS } from '../game/interact.js';
import { actionFor } from '../game/actions.js';

/** Desktop hold poses in camera space. */
const DESK_ONE = new Vector3(0.235, -0.205, -0.54);
const DESK_TWO = new Vector3(0, -0.42, -0.75);
/** Seconds a pickup takes to arrive in the hand. */
const REACH_TIME = 0.25;

/** Held tools that only Put away / Drop lets go of (see the release loop). */
const STICKY: readonly ItemId[] = ['bowDrill', 'flake', 'knife', 'flint', 'diggingStick', 'pot'];

/** A part let go within this distance (m) of a build that wants it seats on its nearest free mark. */
const NEAR_BUILD = 3;

export class CarrySystem extends createSystem({}) {
  private root = new Group();
  /** Both hands held it at some point since it was picked up (letting go one hand first still counts as a two-hand lift). */
  private hadTwo = false;
  private obj: Object3D | null = null;
  private item: ItemId | null = null;
  private pos = new Vector3();
  private vel = new Vector3();
  private target = new Vector3();
  private targetQ = new Quaternion();
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private q = new Quaternion();
  private yAxis = new Vector3(0, 1, 0);
  private xAxis = new Vector3(1, 0, 0);
  /** Turns an object's +X (long axis) to point along the hand's forward (-Z). */
  private alongHand = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  /** Desktop one-hand pose in camera space: pointing forward, tipped up a little. */
  private deskR = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.6).multiply(this.alongHand);
  private tracker = new VelocityTracker();
  /** Which hands hold the carried thing, and the pose two hands give it. */
  private grip = new TwoHandGrip();
  private pose = new TwoHandPose();
  private axis = { x: 1, y: 0, z: 0 };
  private clock = 0;
  private reachT = 1;
  private hidden = false;
  /** Which hand holds it (the one that pinched it up); the other joins for two-handed things. */
  private hold: 0 | 1 = 1;
  private lastDown: 0 | 1 = 1;
  private box = new Box3();
  /** A hand pose has been read since pickup, so tracking loss can freeze at it. */
  private hasPose = false;
  private lastN = 1;
  private blend = new GripBlend();
  private dtNow = 1 / 72;

  init(): void {
    const game = getGame(this.world);
    this.root.name = 'Carried';
    this.world.createTransformEntity(this.root);
    getUi(this.world).setHeldVisible = (v: boolean) => {
      this.hidden = !v;
      if (this.obj) this.obj.visible = v;
    };
    // G: set down what you hold; Shift+G: throw it.
    getUi(this.world).dropHeld = (item: ItemId) => this.release(item, false, 'drop button');
    getUi(this.world).throwHeld = () => this.item && this.release(this.item, true, 'throw');
    this.cleanupFuncs.push(
      game.on((e: GameEvent) => {
        if (e.type === 'held') this.show(e.item);
      }),
    );
    if (game.held) this.show(game.held);
  }

  private immersive(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  /** A real-size mesh with its long axis on +X and its bounding box centred on the origin. */
  private build(item: ItemId): Object3D {
    const inner = itemMesh(item);
    const g = new Group();
    g.add(inner);
    this.box.setFromObject(inner);
    this.box.getSize(this.tmp);
    if (this.tmp.z > this.tmp.x && this.tmp.z >= this.tmp.y) inner.rotation.y = Math.PI / 2;
    else if (this.tmp.y > this.tmp.x && this.tmp.y > this.tmp.z) inner.rotation.z = Math.PI / 2;
    inner.updateMatrixWorld(true);
    this.box.setFromObject(inner).getCenter(this.tmp);
    inner.position.sub(this.tmp);
    return g;
  }

  private show(item: ItemId | null): void {
    if (item === this.item) return;
    if (this.obj) this.root.remove(this.obj);
    this.obj = null;
    this.item = item;
    if (!item) {
      handClaims.grabbing[0] = handClaims.grabbing[1] = false;
      return;
    }
    this.hold = performance.now() / 1000 - handClaims.grabAt < 1.5 ? handClaims.holdHand : this.lastDown;
    if (!hands[this.hold].tracked) this.hold = 1;
    handClaims.holdHand = this.hold;
    handClaims.grabbing[this.hold] = true;
    this.grip.reset(this.hold);
    this.hadTwo = false;
    this.pose.seed({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this.obj = this.build(item);
    this.obj.visible = !this.hidden;
    this.root.add(this.obj);
    // Start where it was picked up (the ground, or your hip pouch) and reach it to the hand.
    if (pickupFrom.valid && performance.now() / 1000 - pickupFrom.time < 0.6) this.pos.copy(pickupFrom.pos);
    else hipPosition(this.camera, this.pos);
    pickupFrom.valid = false;
    this.vel.set(0, 0, 0);
    this.reachT = 0;
    this.hasPose = false;
    this.blend.reset();
    this.tracker.reset();
    this.computeTarget();
    this.obj.position.copy(this.pos);
    this.obj.quaternion.copy(this.targetQ);
  }

  /** Where the held object should be: grip point in the palm, or spanning both hands. */
  private computeTarget(): number {
    const item = this.item!;
    const phys = ITEM_PHYSICS[item];
    const two = twoHanded(item);
    if (this.immersive()) {
      const r = hands[this.hold];
      const l = hands[1 - this.hold];
      // Tracking lost: stay frozen at the last pose (no gestures, no release) until it returns.
      if (!r.tracked && this.hasPose) return this.lastN;
      if (two && this.grip.count === 2 && l.tracked && r.tracked) {
        // Both hands on it: position and rotation from the two hand points (full 3D, no flips).
        this.pose.update(hands[0].pos, hands[1].pos);
        this.target.set(this.pose.mid.x, this.pose.mid.y, this.pose.mid.z);
        this.targetQ.set(this.pose.q.x, this.pose.q.y, this.pose.q.z, this.pose.q.w);
        this.hasPose = true;
        return (this.lastN = 2);
      }
      if (r.tracked) {
        // Object frame = hand frame turned so the long axis points forward; the grip point sits in the palm.
        // One hand left a two-hand hold: start from the pose it has now and ease to the grip.
        if (this.lastN === 2 && this.obj) this.blend.begin(r.quat, this.obj.quaternion);
        this.blend.target(this.dtNow, r.quat, this.alongHand, this.targetQ);
        const g = phys.grips[0];
        this.tmp.set(-g.x, -g.y, -g.z).applyQuaternion(this.targetQ);
        this.target.copy(r.pos).add(this.tmp);
        // A two-handed thing held in one hand hangs low and drags.
        if (two) this.target.y -= 0.15 * this.blend.progress;
        this.hasPose = true;
        return (this.lastN = 1);
      }
    }
    // Desktop: a camera-space pose; one-handed things put their grip point (not their middle) at the hand.
    this.camera.updateMatrixWorld();
    this.tmp.copy(two ? DESK_TWO : DESK_ONE);
    if (!two) {
      const g = phys.grips[0];
      this.tmp.sub(this.tmp2.set(g.x, g.y, g.z).applyQuaternion(this.deskR));
    }
    this.target.copy(this.tmp).applyMatrix4(this.camera.matrixWorld);
    this.camera.getWorldQuaternion(this.q);
    this.targetQ.copy(this.q);
    if (!two) this.targetQ.multiply(this.deskR);
    return two ? 2 : 1;
  }

  /** Let go: `throwIt` adds a forward toss. The object keeps the hand's momentum. */
  private release(item: ItemId, throwIt: boolean, via = 'pinch'): void {
    const game = getGame(this.world);
    game.log.add(`let go of ${item} (${via})`);
    if (!this.obj || this.item !== item) {
      // Not in hand (a bag item): it drops in front of you from about waist height.
      this.camera.getWorldPosition(this.tmp);
      this.camera.getWorldDirection(this.tmp2);
      const len = Math.hypot(this.tmp2.x, this.tmp2.z) || 1;
      pendingRelease.set(item, this.tmp.x + (this.tmp2.x / len) * 0.6, 1.0, this.tmp.z + (this.tmp2.z / len) * 0.6, 0, 0, 0);
      game.dropItem(item, pendingRelease.pos.x, pendingRelease.pos.z);
      return;
    }
    // VR: a controlled share of the hand's filtered velocity (scaled by mass, clamped); desktop: the held object's own.
    const handSpeed = this.immersive() ? hands[this.hold].motion.speed : 0;
    if (this.immersive()) throwImpulse(hands[this.hold].motion.vel, ITEMS[item].weight, this.tmp2);
    else this.tracker.velocity(this.tmp2);
    if (throwIt) {
      this.camera.getWorldDirection(this.tmp);
      // A seated throw: ~4 m/s along the view, a little upwards; lighter things go further.
      const k = Math.min(1, 1.5 / Math.max(0.2, ITEMS[item].weight));
      this.tmp2.addScaledVector(this.tmp, 4 * k);
      this.tmp2.y += 1.5 * k;
    }
    const p = this.obj.position;
    // Lowered onto a construction mark: it seats there (snap marks still apply), else it is just set down below.
    if (this.immersive() && !throwIt) {
      // Let go anywhere near a build that wants it: it seats on the nearest free mark.
      const t = game.placementTarget(item, p.x, p.z, 0.5) ?? game.placementTarget(item, p.x, p.z, NEAR_BUILD);
      if (t && game.held === item) {
        // Brought near a build point and let go: it snaps onto the mark (no fine positioning).
        const mark = spotWorldPosition(t.structure, t.index);
        const seated =
          t.index >= 0
            ? game.fillSpot(t.structure.id, t.index, undefined, { x: mark.x, z: mark.z })
            : game.placeKey(t.structure.id, mark.x, mark.z, this.grip.count >= 2 || this.hadTwo || carryRules.easy ? 2 : 1);
        if (seated) return;
      }
    }
    const sz = ITEM_PHYSICS[item].size;
    const half = Math.min(sz[0], sz[1], sz[2]) / 2;
    const ground = groundHeight(p.x, p.z);
    // VR: opening the pinch slowly near the ground sets it down right there; fast is a throw.
    const kind = throwIt ? 'throw' : this.immersive() ? releaseKind(handSpeed, p.y - half - ground) : 'drop';
    if (kind === 'place') {
      pendingRelease.set(item, p.x, restHeight(ground, half), p.z, 0, 0, 0);
      pendingRelease.place = true;
    } else {
      pendingRelease.set(item, p.x, p.y, p.z, this.tmp2.x, this.tmp2.y, this.tmp2.z);
    }
    pendingRelease.quat.copy(this.obj.quaternion);
    game.log.add(`release ${item} ${kind} hand=${handSpeed.toFixed(1)}m/s v=${this.tmp2.x.toFixed(1)},${this.tmp2.y.toFixed(1)},${this.tmp2.z.toFixed(1)}`);
    game.dropItem(item, this.obj.position.x, this.obj.position.z);
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    this.clock += dt;
    this.dtNow = dt;
    if (!this.obj || !this.item) return;
    const nHands = this.computeTarget();
    if (this.reachT < 1) {
      // The pickup: a short reach from where it was to the hand.
      this.reachT = Math.min(1, this.reachT + dt / REACH_TIME);
      const t = this.reachT * this.reachT * (3 - 2 * this.reachT);
      this.obj.position.lerpVectors(this.pos, this.target, t);
      this.obj.position.y += Math.sin(t * Math.PI) * 0.08;
      if (this.reachT >= 1) this.pos.copy(this.target);
    } else {
      springStep(this.pos, this.vel, this.target, followStiffness(ITEMS[this.item].weight, nHands), dt);
      this.obj.position.copy(this.pos);
    }
    // Rotation follows too, slower for heavy things.
    this.obj.quaternion.slerp(this.targetQ, Math.min(1, dt * (30 / (1 + ITEMS[this.item].weight))));
    this.tracker.push(this.obj.position, this.clock);
    const q = this.obj.quaternion;
    handClaims.heldPos.copy(this.obj.position);
    handClaims.heldTilt = this.item === 'pot' ? tiltDegrees(1 - 2 * (q.x * q.x + q.z * q.z)) : 0;
    if (!this.immersive()) return;
    const two = twoHanded(this.item);
    // The other hand pinches near a heavy / long thing: it takes hold too.
    const other = (1 - this.hold) as 0 | 1;
    const o = hands[other];
    if (two && o.gripDown && o.tracked) {
      this.axis.x = 1 - 2 * (q.y * q.y + q.z * q.z);
      this.axis.y = 2 * (q.x * q.y + q.z * q.w);
      this.axis.z = 2 * (q.x * q.z - q.y * q.w);
      const at = o.tipTracked ? o.pinchPos : o.pos;
      const d = distanceToAxis(at, this.obj.position, this.axis, ITEM_PHYSICS[this.item].size[0] / 2);
      if (this.grip.engage(other, true, d)) {
        handClaims.grabbing[other] = true;
        this.hadTwo = true;
        getGame(this.world).log.add(`second hand on ${this.item}`);
      }
    }
    // Opening a pinch lets go of that hand's hold; the other hand, if any, keeps it.
    // Tools you work with (bow drill, axe, hammer, flint, flake...) stay in your hand while you use
    // them: opening your fingers mid-stroke must not drop them. Put away or Drop (menu) lets go.
    const sticky = this.immersive() && (SWING_TOOLS.includes(this.item) || !!actionFor(this.item) || STICKY.includes(this.item));
    for (let h = 0; h < 2; h++) {
      if (sticky) break;
      if (!hands[h].squeezeUp || !this.grip.holding[h]) continue;
      if (this.grip.open(h as 0 | 1)) {
        this.release(this.item, false);
        return;
      }
      handClaims.grabbing[h] = false;
      getGame(this.world).log.add(`hand ${h} let go of ${this.item}, hand ${this.grip.primary} still holds it`);
      this.hold = this.grip.primary < 0 ? this.hold : (this.grip.primary as 0 | 1);
      handClaims.holdHand = this.hold;
    }
  }
}
