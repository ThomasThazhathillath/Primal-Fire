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
import { throwImpulse } from '../game/handmotion.js';
import { followStiffness, springStep, VelocityTracker } from '../game/carry.js';
import type { GameEvent } from '../game/game.js';
import { ITEM_PHYSICS, ITEMS, twoHanded, type ItemId } from '../game/items.js';
import { itemMesh } from '../scene-assets/item-meshes.js';
import { hands } from './hand-input-system.js';
import { releaseKind, restHeight } from '../game/pinch.js';
import { groundHeight } from '../game/world-layout.js';
import { getGame, getUi, handClaims, hipPosition, pendingRelease, pickupFrom } from './shared.js';

/** Desktop hold poses in camera space. */
const DESK_ONE = new Vector3(0.235, -0.205, -0.54);
const DESK_TWO = new Vector3(0, -0.42, -0.75);
/** Seconds a pickup takes to arrive in the hand. */
const REACH_TIME = 0.25;

export class CarrySystem extends createSystem({}) {
  private root = new Group();
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
  private clock = 0;
  private reachT = 1;
  private hidden = false;
  /** Which hand holds it (the one that pinched it up); the other joins for two-handed things. */
  private hold: 0 | 1 = 1;
  private lastDown: 0 | 1 = 1;
  private box = new Box3();

  init(): void {
    const game = getGame(this.world);
    this.root.name = 'Carried';
    this.world.createTransformEntity(this.root);
    getUi(this.world).setHeldVisible = (v: boolean) => {
      this.hidden = !v;
      if (this.obj) this.obj.visible = v;
    };
    // G: set down what you hold; Shift+G: throw it.
    getUi(this.world).dropHeld = (item: ItemId) => this.release(item, false);
    getUi(this.world).throwHeld = () => this.item && this.release(this.item, true);
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
    this.obj = this.build(item);
    this.obj.visible = !this.hidden;
    this.root.add(this.obj);
    // Start where it was picked up (the ground, or your hip pouch) and reach it to the hand.
    if (pickupFrom.valid && performance.now() / 1000 - pickupFrom.time < 0.6) this.pos.copy(pickupFrom.pos);
    else hipPosition(this.camera, this.pos);
    pickupFrom.valid = false;
    this.vel.set(0, 0, 0);
    this.reachT = 0;
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
      if (two && l.tracked && r.tracked) {
        this.target.addVectors(l.pos, r.pos).multiplyScalar(0.5);
        this.tmp.subVectors(hands[1].pos, hands[0].pos).setY(0);
        if (this.tmp.lengthSq() < 1e-4) this.tmp.set(1, 0, 0);
        this.targetQ.setFromUnitVectors(this.xAxis, this.tmp.normalize());
        return 2;
      }
      if (r.tracked) {
        // Object frame = hand frame turned so the long axis points forward; the grip point sits in the palm.
        this.targetQ.copy(r.quat).multiply(this.alongHand);
        const g = phys.grips[0];
        this.tmp.set(-g.x, -g.y, -g.z).applyQuaternion(this.targetQ);
        this.target.copy(r.pos).add(this.tmp);
        // A two-handed thing held in one hand hangs low and drags.
        if (two) this.target.y -= 0.15;
        return 1;
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
  private release(item: ItemId, throwIt: boolean): void {
    const game = getGame(this.world);
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
      const t = game.placementTarget(item, p.x, p.z, 0.5);
      if (t && game.held === item) {
        const seated =
          t.index >= 0
            ? game.fillSpot(t.structure.id, t.index, undefined, { x: p.x, z: p.z })
            : game.placeKey(t.structure.id, p.x, p.z, hands[0].grip && hands[1].grip ? 2 : 1);
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
    // VR: opening the squeeze lets go (throws with the hand's speed).
    if (this.immersive()) {
      const two = twoHanded(this.item);
      if (hands[this.hold].squeezeUp || (two && hands[1 - this.hold].squeezeUp)) this.release(this.item, false);
    }
  }
}
