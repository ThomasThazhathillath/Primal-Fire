// Physical interactions: reads `hands` (VR) / `mouse` (desktop) from
// HandInputSystem, runs the pure rules in src/game/interact.ts, and draws the
// result. Each mode starts from what you hold:
//   branch / dry branch -> two-hand bend until it cracks and snaps
//   axe / hammer        -> swing: head speed, edge alignment and contact
//                          cut a growing notch; stone bounces, soil thuds
//   (empty hand) on a fallen log -> drag it along the ground with lag set by
//                          its mass; two hands pull faster; it never lifts
//   a part an unfinished build needs -> place: a preview follows your aim and
//                          the part seats only if released close to its mark;
//                          a slab needs both hands (VR: both grips; desktop: Shift) Results go through
// Game.completeAction / Game.work; failures through Game.interactionFailure.

import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  createSystem,
  CylinderGeometry,
  type Entity,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Points,
  PointsMaterial,
  Pressed,
  Quaternion,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { actionFor } from '../game/actions.js';
import {
  BendState,
  DragState,
  HANDLE_LENGTH,
  materialOf,
  Notch,
  strike,
  SWING_TOOLS,
  SWING_WEAK,
  TOUGHNESS,
  type GuideFailureCode,
  type Material,
} from '../game/interact.js';
import { ITEMS, type ItemId } from '../game/items.js';
import { BLUEPRINTS, DEFAULT_SPOT_TOLERANCE, spotWorldPosition } from '../game/blueprint.js';
import { itemMesh } from '../scene-assets/item-meshes.js';
import { Gatherable } from '../components/game-components.js';
import { lambert } from '../scene-assets/materials.js';
import { hands, mouse, pulse } from './hand-input-system.js';
import { DRAG_LOOK, REACH, ResourceSystem } from './resource-system.js';
import { camNudge, getGame, getUi, handPose } from './shared.js';

type Mode = 'none' | 'bend' | 'swing' | 'drag' | 'place';

const crackMat = lambert(0x2a1d12);
const halfGeo = new CylinderGeometry(0.016, 0.02, 0.32, 7);
halfGeo.rotateZ(Math.PI / 2);
const crackGeo = new BoxGeometry(0.012, 0.045, 0.045);
/** Two-hand grips must be within this distance (m) of each other to hold one piece. */
const TWO_HAND_REACH = 0.6;
/** Desktop: pixels of downward drag per radian of bend. */
const PX_PER_RAD = 170;
/** Desktop: metres per second of head speed per pixel/second of downward flick. */
const FLICK_SCALE = 0.0045;
const CHIPS = 24;
const previewGood = new MeshBasicMaterial({ color: 0x7fd37f, transparent: true, opacity: 0.55, depthWrite: false });
const previewFar = new MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.45, depthWrite: false });
/** Mass (kg) of a fallen log: far over what you can lift. */
const LOG_MASS = 35;
/** A press that moves less than this (px / m) before release is a click, not a drag. */
const CLICK_PX = 8;
const CLICK_M = 0.12;
const notchMat = lambert(0x3a2614);
const notchGeo = new BoxGeometry(0.1, 0.1, 1);
notchGeo.rotateZ(Math.PI / 4); // a diamond: the top half reads as a V cut into the wood
const bounds = new Box3();
const CHIP_COLOR: Record<Material, number> = { wood: 0xd8b07a, stone: 0xfff2b0, soil: 0x6b5236 };

export class InteractionSystem extends createSystem({
  hoverGather: { required: [Gatherable, Hovered] },
  spots: { required: [Gatherable] },
  pressedGather: { required: [Gatherable, Pressed] },
}) {
  private mode: Mode = 'none';
  private viaVR = false;
  private bend: BendState | null = null;
  private stick = new Group();
  private halves: [Group, Group] = [new Group(), new Group()];
  private crack!: Mesh;
  private fallT = -1;
  /** Left-to-right hand rotation when the two-hand grip closed. */
  private relQ0 = new Quaternion();
  private tmpQ = new Quaternion();
  private mid = new Vector3();
  private axis = new Vector3();
  private xAxis = new Vector3(1, 0, 0);
  private worldRoot: Group | null = null;
  // swing
  private notches = new Map<string, Notch>();
  private head = new Vector3();
  private prevHead = new Vector3();
  private headVel = new Vector3();
  private down = new Vector3();
  private hadHead = false;
  private contact: Entity | null = null;
  private groundContact = false;
  private peakVy = 0;
  /** Desktop: what you aimed at when you started the swing. */
  private swingTarget: Entity | null = null;
  private peakVx = 0;
  private followT = -1;
  private lastCode: GuideFailureCode | null = null;
  private lastCodeAt = 0;
  private clock = 0;
  private tmp = new Vector3();
  // drag
  private dragTarget: Entity | null = null;
  private drag: DragState | null = null;
  private dragActive = false;
  private dragStart = new Vector3();
  /** Where on the log you took hold, relative to its origin (on the ground). */
  private grabOffset = new Vector3();
  private strainTimer = 0;
  private rayDir = new Vector3();
  private eye = new Vector3();
  // place
  private preview: Object3D | null = null;
  private previewItem: ItemId | null = null;
  // chips (pooled particles)
  private chips!: Points;
  private chipPos = new Float32Array(CHIPS * 3);
  private chipVel = new Float32Array(CHIPS * 3);
  private chipLife = new Float32Array(CHIPS);

  init(): void {
    this.buildStick();
    this.cleanupFuncs.push(this.queries.pressedGather.subscribe('qualify', (e) => this.maybeStartDrag(e)));
    getUi(this.world).capturesPointer = () => this.capturesPointer();
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.chipPos, 3));
    this.chips = new Points(geo, new PointsMaterial({ color: 0xd8b07a, size: 0.03, transparent: true, depthWrite: false }));
    this.chips.frustumCulled = false;
    for (let i = 0; i < CHIPS; i++) this.chipPos[i * 3 + 1] = -50;
    this.world.createTransformEntity(this.chips);
  }

  private buildStick(): void {
    this.stick.name = 'BendStick';
    this.stick.visible = false;
    for (let i = 0; i < 2; i++) {
      const half = new Mesh(halfGeo, lambert(0x7a5a3a));
      half.position.x = i === 0 ? -0.16 : 0.16;
      this.halves[i].add(half);
      this.stick.add(this.halves[i]);
    }
    this.crack = new Mesh(crackGeo, crackMat);
    this.crack.visible = false;
    this.stick.add(this.crack);
    this.world.createTransformEntity(this.stick);
    this.worldRoot = this.stick.parent as Group;
  }

  private get session() {
    return this.renderer.xr.getSession();
  }

  private immersive(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  // ------------------------------------------------------------------ bend

  private startBend(vr: boolean): void {
    const game = getGame(this.world);
    const held = game.held!;
    this.mode = 'bend';
    this.viaVR = vr;
    this.bend = new BendState(TOUGHNESS[held] ?? 0.7);
    (this.halves[0].children[0] as Mesh).material = lambert(ITEMS[held].color);
    (this.halves[1].children[0] as Mesh).material = (this.halves[0].children[0] as Mesh).material;
    this.stick.visible = true;
    this.crack.visible = false;
    this.fallT = -1;
    this.halves[0].position.set(0, 0, 0);
    this.halves[1].position.set(0, 0, 0);
    getUi(this.world).setHeldVisible?.(false);
    if (vr) {
      this.worldRoot?.add(this.stick);
      this.relQ0.copy(hands[0].quat).invert().multiply(hands[1].quat);
    } else {
      // Held across the body in both desktop hands.
      this.camera.add(this.stick);
      this.stick.position.set(0, -0.17, -0.48);
      this.stick.rotation.set(0.25, 0, 0);
    }
  }

  private endBend(): void {
    const game = getGame(this.world);
    const b = this.bend;
    this.mode = 'none';
    handPose.mode = 'free';
    if (b && !b.snapped) {
      const code = b.releaseCode();
      // A plain click with no bend is not an attempt.
      if (code && (b.flex > 0.1 || code === 'bend.released')) game.interactionFailure(code);
      this.stick.visible = false;
      getUi(this.world).setHeldVisible?.(true);
    }
    this.bend = null;
  }

  private updateBend(dt: number): void {
    const b = this.bend!;
    let angle: number;
    if (this.viaVR) {
      if (!hands[0].grip || !hands[1].grip) return this.endBend();
      // Bend = how far the hands have turned RELATIVE to each other since the grab
      // (both wrists turning the same way just rotates the stick).
      this.tmpQ.copy(hands[0].quat).invert().multiply(hands[1].quat);
      angle = 2 * Math.acos(Math.min(1, Math.abs(this.tmpQ.dot(this.relQ0))));
      this.mid.addVectors(hands[0].pos, hands[1].pos).multiplyScalar(0.5);
      this.axis.subVectors(hands[1].pos, hands[0].pos).normalize();
      this.stick.position.copy(this.mid);
      this.stick.quaternion.setFromUnitVectors(this.xAxis, this.axis);
    } else {
      if (!mouse.down) return this.endBend();
      angle = Math.max(0, mouse.dragY) / PX_PER_RAD;
    }
    const ev = b.update(angle, dt);
    const game = getGame(this.world);
    // The visible bend lags slightly behind the input: wood resists.
    const f = b.flex * 0.55;
    this.halves[0].rotation.z = f;
    this.halves[1].rotation.z = -f;
    this.crack.visible = b.cracks > 0;
    this.crack.scale.set(1, 0.5 + b.cracks * 0.5, 1);
    handPose.mode = 'bend';
    handPose.amount = b.flex;
    if (ev === 'creak') {
      game.fx('creak', b.stress);
      if (this.viaVR) {
        pulse(this.session, 0, 0.15 + b.stress * 0.3, 30);
        pulse(this.session, 1, 0.15 + b.stress * 0.3, 30);
      }
    } else if (ev === 'crack') {
      game.fx('crack', b.cracks / 2);
      if (this.viaVR) {
        pulse(this.session, 0, 0.6, 60);
        pulse(this.session, 1, 0.6, 60);
      }
    } else if (ev === 'snap') {
      game.fx('snap', 1);
      if (this.viaVR) {
        pulse(this.session, 0, 1, 120);
        pulse(this.session, 1, 1, 120);
      }
      game.completeAction();
      this.fallT = 0;
      this.mode = 'none';
      handPose.mode = 'free';
      this.bend = null;
    }
  }

  /** The two halves spring apart and drop after a snap. */
  private animateSnap(dt: number): void {
    if (this.fallT < 0) return;
    this.fallT += dt;
    const t = this.fallT;
    this.halves[0].position.set(-0.08 * t * 3, -2 * t * t, 0);
    this.halves[1].position.set(0.08 * t * 3, -2 * t * t, 0);
    this.halves[0].rotation.z = 0.5 + t * 4;
    this.halves[1].rotation.z = -0.5 - t * 4;
    this.crack.visible = false;
    if (t > 0.6) {
      this.fallT = -1;
      this.stick.visible = false;
      this.halves[0].rotation.z = this.halves[1].rotation.z = 0;
      getUi(this.world).setHeldVisible?.(true);
    }
  }

  // ------------------------------------------------------------------ swing

  /** Report a failure, but not the same one over and over while you keep trying. */
  private fail(code: GuideFailureCode): void {
    if (code === this.lastCode && this.clock - this.lastCodeAt < 2.5) return;
    this.lastCode = code;
    this.lastCodeAt = this.clock;
    getGame(this.world).interactionFailure(code);
  }

  private burstChips(at: Vector3, material: Material, amount: number): void {
    (this.chips.material as PointsMaterial).color.setHex(CHIP_COLOR[material]);
    (this.chips.material as PointsMaterial).blending = material === 'stone' ? AdditiveBlending : 1;
    let n = Math.round(6 + amount * 18);
    for (let i = 0; i < CHIPS && n > 0; i++) {
      if (this.chipLife[i] > 0) continue;
      n--;
      const o = i * 3;
      this.chipLife[i] = 0.4 + Math.random() * 0.4;
      this.chipPos[o] = at.x;
      this.chipPos[o + 1] = at.y;
      this.chipPos[o + 2] = at.z;
      this.chipVel[o] = (Math.random() - 0.5) * 2;
      this.chipVel[o + 1] = 0.8 + Math.random() * 1.5;
      this.chipVel[o + 2] = (Math.random() - 0.5) * 2;
    }
  }

  private updateChips(dt: number): void {
    for (let i = 0; i < CHIPS; i++) {
      if (this.chipLife[i] <= 0) continue;
      const o = i * 3;
      this.chipLife[i] -= dt;
      this.chipVel[o + 1] -= 9.8 * dt;
      this.chipPos[o] += this.chipVel[o] * dt;
      this.chipPos[o + 1] = Math.max(0.01, this.chipPos[o + 1] + this.chipVel[o + 1] * dt);
      this.chipPos[o + 2] += this.chipVel[o + 2] * dt;
      if (this.chipLife[i] <= 0) this.chipPos[o + 1] = -50;
    }
    this.chips.geometry.attributes.position.needsUpdate = true;
  }

  /** One blow of the tool head on `target` (null = bare ground). */
  private blow(target: Entity | null, speed: number, align: number, at: Vector3, vr: boolean): void {
    const game = getGame(this.world);
    const tool = game.held as ItemId;
    const resources = this.world.getSystem(ResourceSystem);
    const spot = target ? resources?.spot(target.getValue(Gatherable, 'spotId') ?? '') : undefined;
    const { material, hardness } = spot ? materialOf(spot.look) : { material: 'soil' as Material, hardness: 1 };
    const r = strike(speed, align, material, tool);
    const fx = r.outcome === 'chop' ? 'chop' : r.outcome === 'weak' ? 'thud' : r.outcome;
    game.fx(fx, r.jolt);
    if (vr) pulse(this.session, 1, 0.2 + r.jolt * 0.8, 40 + r.jolt * 80);
    else camNudge.pitch = -0.012 - r.jolt * 0.03;
    this.burstChips(at, material, r.outcome === 'chop' ? r.damage * 3 : r.outcome === 'bounce' ? 0.6 : 0.2);
    if (r.code) this.fail(r.code);
    if (!target || !spot || material !== 'wood' || r.damage <= 0) return;
    let notch = this.notches.get(spot.id);
    if (!notch) {
      notch = new Notch();
      this.notches.set(spot.id, notch);
    }
    const done = notch.hit(r.damage, hardness);
    this.showNotch(target, notch.depth);
    if (done) {
      this.notches.delete(spot.id);
      this.showNotch(target, 0);
      game.fx('crack', 1);
      resources?.tryGather(target);
    }
  }

  /** A dark wedge cut into the wood that deepens with every good blow. */
  private showNotch(target: Entity, depth: number): void {
    const obj = target.object3D;
    if (!obj) return;
    let m = obj.getObjectByName('Notch') as Mesh | undefined;
    if (!m && depth > 0) {
      // Measure the wood itself (not the glow or hit proxy) once, in its own frame.
      // Bounds in the object's own frame: clear its transform while measuring.
      this.tmpQ.copy(obj.quaternion);
      this.tmp.copy(obj.position);
      obj.quaternion.identity();
      obj.position.set(0, 0, 0);
      obj.updateMatrixWorld(true);
      bounds.makeEmpty();
      for (const c of obj.children) if (c.name !== 'HitProxy' && c.name !== 'Glow') bounds.expandByObject(c);
      obj.quaternion.copy(this.tmpQ);
      obj.position.copy(this.tmp);
      obj.updateMatrixWorld(true);
      const alongX = bounds.max.x - bounds.min.x > bounds.max.z - bounds.min.z;
      m = new Mesh(notchGeo, notchMat);
      m.name = 'Notch';
      m.position.set((bounds.min.x + bounds.max.x) / 2, bounds.max.y, (bounds.min.z + bounds.max.z) / 2);
      // Cut across the grain.
      m.rotation.y = alongX ? 0 : Math.PI / 2;
      m.userData.width = Math.min(bounds.max.y - bounds.min.y, 0.4) * 1.2;
      m.userData.top = bounds.max.y;
      obj.add(m);
    }
    if (!m) return;
    m.visible = depth > 0;
    const w = (m.userData.width as number) ?? 0.2;
    const k = 0.4 + depth * 1.2;
    m.scale.set(k, k, w);
    // Sunk into the wood so only a dark slit shows, widening as the cut deepens.
    m.position.y = (m.userData.top as number) - 0.058 * k;
  }

  private updateSwingVR(dt: number): void {
    const r = hands[1];
    if (!r.tracked) {
      this.hadHead = false;
      return;
    }
    // Head = grip + handle along the hand's pointing axis (-Z); cutting direction = hand's down (-Y).
    this.tmp.set(0, 0, -HANDLE_LENGTH).applyQuaternion(r.quat);
    this.head.copy(r.pos).add(this.tmp);
    this.down.set(0, -1, 0).applyQuaternion(r.quat);
    if (this.hadHead) this.headVel.subVectors(this.head, this.prevHead).divideScalar(dt);
    this.prevHead.copy(this.head);
    this.hadHead = true;
    const speed = this.headVel.length();
    // Leave the current target before the next blow can land.
    if (this.contact?.object3D) {
      this.contact.object3D.getWorldPosition(this.tmp);
      if (Math.hypot(this.head.x - this.tmp.x, this.head.z - this.tmp.z) > 0.5 || this.head.y > 0.8) this.contact = null;
    }
    if (this.groundContact && this.head.y > 0.08) this.groundContact = false;
    if (this.contact || speed < 0.5) return;
    for (const e of this.queries.spots.entities) {
      const o = e.object3D;
      if (!o || !o.visible) continue;
      o.getWorldPosition(this.tmp);
      if (Math.hypot(this.head.x - this.tmp.x, this.head.z - this.tmp.z) < 0.3 && this.head.y < 0.6) {
        this.contact = e;
        const align = speed > 0 ? Math.abs(this.headVel.dot(this.down)) / speed : 0;
        this.blow(e, speed, align, this.head, true);
        return;
      }
    }
    if (!this.groundContact && this.head.y < 0.02) {
      this.groundContact = true;
      this.blow(null, speed, 1, this.head, true);
    }
  }

  private updateSwingDesktop(): void {
    if (mouse.pressed) {
      this.mode = 'swing';
      this.peakVy = this.peakVx = 0;
      // You aim first, then swing: the target is locked when you press.
      this.swingTarget = null;
      for (const e of this.queries.hoverGather.entities) {
        this.swingTarget = e;
        break;
      }
    }
    if (this.mode !== 'swing') return;
    if (mouse.down) {
      // Drag up to raise the tool, flick down to swing.
      const raise = Math.max(0, Math.min(1, -mouse.dragY / 140));
      handPose.mode = 'swing';
      handPose.amount = raise;
      handPose.x = 0;
      handPose.y = raise * 0.1;
      if (mouse.vy > this.peakVy) {
        this.peakVy = mouse.vy;
        this.peakVx = mouse.vx;
      }
      return;
    }
    // Released: the blow lands on whatever you aimed at.
    this.mode = 'none';
    this.followT = 0;
    const speed = this.peakVy * FLICK_SCALE;
    const align = this.peakVy > 0 ? this.peakVy / Math.hypot(this.peakVx, this.peakVy) : 0;
    if (speed < 0.3) {
      handPose.mode = 'free';
      return; // just a click: not a swing
    }
    const resources = this.world.getSystem(ResourceSystem);
    let target: Entity | null = null;
    const e = this.swingTarget;
    const spot = e ? resources?.spot(e.getValue(Gatherable, 'spotId') ?? '') : undefined;
    if (e && spot && resources!.distanceTo(spot) <= REACH) target = e;
    this.swingTarget = null;
    if (target?.object3D) {
      target.object3D.getWorldPosition(this.tmp);
      this.tmp.y += 0.15;
      this.blow(target, speed, align, this.tmp, false);
    } else if (speed >= SWING_WEAK) {
      getGame(this.world).fx('swish', Math.min(1, speed / 5));
    }
  }

  // ------------------------------------------------------------------- drag

  private maybeStartDrag(e: Entity): void {
    const game = getGame(this.world);
    if (this.mode !== 'none' || (game.held && SWING_TOOLS.includes(game.held))) return;
    const spot = this.world.getSystem(ResourceSystem)?.spot(e.getValue(Gatherable, 'spotId') ?? '');
    if (!spot || spot.look !== DRAG_LOOK || !e.object3D) return;
    this.mode = 'drag';
    this.viaVR = this.immersive();
    this.dragTarget = e;
    this.dragActive = false;
    this.drag = new DragState(e.object3D.position.x, e.object3D.position.z, LOG_MASS, 1);
    if (this.viaVR) this.groundPoint(this.dragStart);
  }

  /** Where the pointer (mouse ray, or right-hand ray in VR) meets the ground (or the plane at `planeY`). */
  private groundPoint(out: Vector3, planeY = 0): boolean {
    if (this.viaVR) {
      const sp = this.player.raySpaces.right;
      if (!sp) return false;
      sp.getWorldPosition(out);
      sp.getWorldDirection(this.rayDir).negate();
    } else {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.camera.getWorldPosition(out);
      this.rayDir
        .set(((mouse.x - rect.left) / rect.width) * 2 - 1, -((mouse.y - rect.top) / rect.height) * 2 + 1, 0.5)
        .unproject(this.camera)
        .sub(out)
        .normalize();
    }
    if (this.rayDir.y > -0.02) return false;
    out.addScaledVector(this.rayDir, (planeY - out.y) / this.rayDir.y);
    // Never further than you can reach.
    this.camera.getWorldPosition(this.eye);
    const dx = out.x - this.eye.x;
    const dz = out.z - this.eye.z;
    const d = Math.hypot(dx, dz);
    if (d > REACH) {
      out.x = this.eye.x + (dx / d) * REACH;
      out.z = this.eye.z + (dz / d) * REACH;
    }
    return true;
  }

  private endDrag(click: boolean): void {
    const e = this.dragTarget;
    this.mode = 'none';
    this.dragTarget = null;
    this.drag = null;
    handPose.mode = 'free';
    // A press without a pull breaks off a short piece, as before.
    if (click && e) this.world.getSystem(ResourceSystem)?.tryGather(e);
  }

  private updateDrag(dt: number): void {
    const e = this.dragTarget;
    const d = this.drag;
    if (!e?.object3D || !d) return this.endDrag(false);
    const holding = this.viaVR ? e.hasComponent(Pressed) || hands[1].grip : mouse.down;
    if (!holding) return this.endDrag(!this.dragActive);
    if (!this.groundPoint(this.tmp)) return;
    if (!this.dragActive) {
      const moved = this.viaVR ? this.tmp.distanceTo(this.dragStart) > CLICK_M : Math.hypot(mouse.dragX, mouse.dragY) > CLICK_PX;
      if (!moved) return;
      this.dragActive = true;
      // You take hold where the pointer is: keep that point under your hand.
      d.x = e.object3D.position.x;
      d.z = e.object3D.position.z;
      this.grabOffset.set(this.tmp.x - d.x, 0, this.tmp.z - d.z);
    }
    this.tmp.sub(this.grabOffset);
    // Both hands (VR: both grips; desktop: Shift) pull harder.
    d.hands = this.viaVR ? (hands[0].grip && hands[1].grip ? 2 : 1) : mouse.bothHands ? 2 : 1;
    if (!d.update(this.tmp.x, this.tmp.z, dt)) {
      this.fail('drag.tooHeavy');
      return this.endDrag(false);
    }
    e.object3D.position.x = d.x;
    e.object3D.position.z = d.z;
    // Twist it round with the wheel (desktop) or by swinging the ray sideways (VR follows the point).
    if (!this.viaVR && mouse.wheel) e.object3D.rotation.y += mouse.wheel * 0.002;
    const spot = this.world.getSystem(ResourceSystem)?.spot(e.getValue(Gatherable, 'spotId') ?? '');
    if (spot) {
      spot.x = d.x;
      spot.z = d.z;
    }
    const strain = d.strain(this.tmp.x, this.tmp.z);
    handPose.mode = 'drag';
    handPose.amount = strain;
    handPose.y = -strain * 0.05;
    if ((this.strainTimer -= dt) <= 0) {
      this.strainTimer = 0.45;
      getGame(this.world).fx('strain', strain);
      if (this.viaVR) pulse(this.session, 1, 0.1 + strain * 0.4, 40);
    }
  }

  // ------------------------------------------------------------------ place

  private startPlace(vr: boolean): void {
    const held = getGame(this.world).held!;
    this.mode = 'place';
    this.viaVR = vr;
    if (this.previewItem !== held) {
      if (this.preview) this.preview.removeFromParent();
      this.preview = itemMesh(held);
      this.preview.traverse((o) => {
        if ((o as Mesh).isMesh) (o as Mesh).material = previewGood;
      });
      this.worldRoot?.add(this.preview);
      this.previewItem = held;
    }
    this.preview!.visible = true;
  }

  private setPreviewMat(mat: MeshBasicMaterial): void {
    this.preview?.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).material = mat;
    });
  }

  private updatePlace(): void {
    const game = getGame(this.world);
    const held = game.held;
    const releasing = this.viaVR ? !hands[1].grip : !mouse.down;
    // A slab is aimed at its resting height (you look at where it will sit, not at the ground below).
    const pending = held ? game.placementTarget(held, game.player.x, game.player.z, 6) : null;
    const planeY = pending && pending.index < 0 ? BLUEPRINTS[pending.structure.kind].key.y : 0;
    if (!held || !this.preview || !this.groundPoint(this.tmp, planeY)) {
      if (releasing) this.endPlace();
      return;
    }
    const target = game.placementTarget(held, this.tmp.x, this.tmp.z);
    // Preview: where it will land, green when it would seat on its mark.
    let seats = false;
    if (target) {
      const def = BLUEPRINTS[target.structure.kind];
      const mark = target.index >= 0 ? spotWorldPosition(target.structure, target.index) : { x: target.structure.x, z: target.structure.z };
      const tol = target.index >= 0 ? (def.spotTolerance ?? DEFAULT_SPOT_TOLERANCE) : 0.15;
      seats = Math.hypot(mark.x - this.tmp.x, mark.z - this.tmp.z) <= tol;
      this.preview.position.set(this.tmp.x, target.index < 0 ? def.key.y : 0.02, this.tmp.z);
      this.preview.rotation.y = target.structure.rotY;
    } else {
      this.preview.position.set(this.tmp.x, 0.02, this.tmp.z);
    }
    this.setPreviewMat(seats ? previewGood : previewFar);
    handPose.mode = 'place';
    handPose.amount = 0;
    handPose.x = 0;
    handPose.y = -0.05;
    if (!releasing) return;
    const x = this.tmp.x;
    const z = this.tmp.z;
    this.endPlace();
    if (!target) {
      this.fail('place.tooFar');
      return;
    }
    if (target.index >= 0) game.fillSpot(target.structure.id, target.index, undefined, { x, z });
    else {
      // Desktop: a mouse has no second hand to grip with, so setting a slab down counts as a two-hand lift.
      const both = this.viaVR ? hands[0].grip : true;
      game.placeKey(target.structure.id, x, z, both ? 2 : 1);
    }
  }

  private endPlace(): void {
    this.mode = 'none';
    handPose.mode = 'free';
    if (this.preview) this.preview.visible = false;
  }

  /** True when a left press now would start a hand interaction rather than a look-drag. */
  private capturesPointer(): boolean {
    const game = getGame(this.world);
    const held = game.held;
    if (held) {
      if (actionFor(held) || SWING_TOOLS.includes(held)) return true;
      if (game.wantsItem(held, game.player.x, game.player.z)) return true;
    }
    const resources = this.world.getSystem(ResourceSystem);
    for (const e of this.queries.hoverGather.entities) {
      if (resources?.spot(e.getValue(Gatherable, 'spotId') ?? '')?.look === DRAG_LOOK) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ frame

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    this.clock += dt;
    this.animateSnap(dt);
    const game = getGame(this.world);
    const action = actionFor(game.held);
    const vr = this.immersive();

    // Holding a part an unfinished build nearby needs: set it down by hand.
    const wanted = !!game.held && game.wantsItem(game.held, game.player.x, game.player.z);
    if (this.mode === 'none' && wanted) {
      if (vr ? hands[1].gripDown : mouse.pressed && this.queries.hoverGather.entities.size === 0) this.startPlace(vr);
    }
    if (this.mode === 'place') this.updatePlace();

    if (this.mode === 'none' && !wanted && this.fallT < 0 && action?.motion === 'snap') {
      if (vr) {
        const l = hands[0];
        const r = hands[1];
        const together = l.tracked && r.tracked && l.pos.distanceTo(r.pos) < TWO_HAND_REACH;
        if (together && l.grip && r.grip && (l.gripDown || r.gripDown)) this.startBend(true);
      } else if (mouse.pressed && this.queries.hoverGather.entities.size === 0) {
        this.startBend(false);
      }
    }
    if (this.mode === 'bend') this.updateBend(dt);
    if (this.mode === 'drag') this.updateDrag(dt);

    const swinging = !!game.held && SWING_TOOLS.includes(game.held);
    if (swinging) {
      if (vr) this.updateSwingVR(dt);
      else this.updateSwingDesktop();
    } else if (this.mode === 'swing') {
      this.mode = 'none';
      handPose.mode = 'free';
    }
    // Follow-through after a desktop blow.
    if (this.followT >= 0) {
      this.followT += dt;
      handPose.mode = 'swing';
      handPose.amount = Math.max(-0.6, 1 - this.followT * 9);
      handPose.y = -this.followT * 0.4;
      if (this.followT > 0.25) {
        this.followT = -1;
        handPose.mode = 'free';
        handPose.y = 0;
      }
    }
    this.updateChips(dt);
  }
}

