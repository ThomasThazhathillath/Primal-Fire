// In-hand crafting by gesture (rules in src/game/interact.ts):
//   flint  -> knapping: core in the off hand, hammerstone in the other; where
//             and how hard you strike decides flake / crushed edge / nothing.
//             A good flake flies off, then floats up for you to inspect its
//             conchoidal ripples.
//   fibres / vine -> cordage: pull the bundle apart into strands, then roll
//             your wrists in opposite directions to twist them into cord.
// Desktop: knap = press, raise, flick diagonally onto the core and release
// on it; twist = hold and drag sideways to pull apart and keep tension, mouse
// wheel to twist. Progress only ever comes from the correct motion.

import {
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  createSystem,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { actionFor } from '../game/actions.js';
import { Core, KNAP_EDGE, TwistState, type GuideFailureCode } from '../game/interact.js';
import { ITEMS } from '../game/items.js';
import { lambert } from '../scene-assets/materials.js';
import { hands, mouse, pulse } from './hand-input-system.js';
import { getGame, getUi, handPose } from './shared.js';

const CORE_R = 0.045;
const SCARS = 4;
/** Desktop: m/s of blow per px/s of flick. */
const KNAP_FLICK = 0.0035;
/** Desktop: metres of hand separation per pixel of sideways drag. */
const PULL_PER_PX = 0.0016;
/** Desktop: radians of wrist roll per wheel unit (each hand, opposite ways). */
const ROLL_PER_WHEEL = 0.004;

const flintMat = lambert(0x3f3f4a);
const scarMat = new MeshLambertMaterial({ color: 0x9a9aa8, side: DoubleSide });
const coreGeo = new IcosahedronGeometry(CORE_R, 1);
const hammerGeo = new IcosahedronGeometry(0.035, 0);
const scarGeo = new CircleGeometry(0.016, 7);
const flakeGeo = new IcosahedronGeometry(0.025, 0);
const rippleGeo = new TorusGeometry(0.012, 0.0012, 3, 16);

/** A strand helix along +X from 0 to 1 (scaled to the hand gap at run time). */
function helix(phase: number): BufferGeometry {
  const pts: Vector3[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const a = t * Math.PI * 2 * 5 + phase;
    pts.push(new Vector3(t - 0.5, Math.cos(a) * 0.006, Math.sin(a) * 0.006));
  }
  return new TubeGeometry(new CatmullRomCurve3(pts), 64, 0.0035, 5, false);
}

export class CraftGestureSystem extends createSystem({}) {
  private mode: 'none' | 'knap' | 'twist' = 'none';
  private vr = false;
  // knapping
  private core = new Core(2);
  private coreObj = new Group();
  private hammer!: Mesh;
  private scars: Mesh[] = [];
  private scarCount = 0;
  private flake = new Group();
  private flakeT = -1;
  private flakeFrom = new Vector3();
  private inContact = false;
  private peakVy = 0;
  private peakVx = 0;
  private rel = new Vector3();
  private local = new Vector3();
  private center = new Vector3();
  private inv = new Quaternion();
  private ray = new Vector3();
  // twisting
  private twist: TwistState | null = null;
  private strands = new Group();
  private strandMat = lambert(0x7a9a42);
  private spin = 0;
  private lastCode: GuideFailureCode | null = null;
  private codeTimer = 0;
  private lastWorkProgress = 0;
  private worldRoot: Group | null = null;

  init(): void {
    const core = new Mesh(coreGeo, flintMat);
    core.scale.set(1, 0.75, 1);
    this.coreObj.add(core);
    for (let i = 0; i < SCARS; i++) {
      const s = new Mesh(scarGeo, scarMat);
      s.visible = false;
      this.scars.push(s);
      this.coreObj.add(s);
    }
    this.hammer = new Mesh(hammerGeo, lambert(0xa39a8a));
    this.coreObj.visible = false;
    this.hammer.visible = false;
    this.world.createTransformEntity(this.coreObj);
    this.world.createTransformEntity(this.hammer);
    this.worldRoot = this.coreObj.parent as Group;
    // The flake you knocked off: a thin shard with ripple rings on its face.
    const shard = new Mesh(flakeGeo, scarMat);
    shard.scale.set(1, 0.25, 0.7);
    this.flake.add(shard);
    for (let i = 0; i < 3; i++) {
      const ring = new Mesh(rippleGeo, flintMat);
      ring.scale.setScalar(1 + i * 0.6);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(-0.012, 0.007, 0);
      this.flake.add(ring);
    }
    this.flake.visible = false;
    this.world.createTransformEntity(this.flake);

    for (let i = 0; i < 2; i++) this.strands.add(new Mesh(helix(i * Math.PI), this.strandMat));
    this.strands.visible = false;
    this.world.createTransformEntity(this.strands);
  }

  private immersive(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  private fail(code: GuideFailureCode | null): void {
    if (!code || (code === this.lastCode && this.codeTimer > 0)) return;
    this.lastCode = code;
    this.codeTimer = 2.5;
    getGame(this.world).interactionFailure(code);
  }

  /** Parent `obj` to the camera (desktop) or the world (VR). */
  private mount(obj: Group | Mesh, desktop: boolean): void {
    if (desktop) this.camera.add(obj);
    else this.worldRoot?.add(obj);
  }

  private enter(mode: 'knap' | 'twist', vr: boolean): void {
    this.mode = mode;
    this.vr = vr;
    getUi(this.world).setHeldVisible?.(false);
    if (mode === 'knap') {
      this.core = new Core(2);
      this.scarCount = 0;
      for (const s of this.scars) s.visible = false;
      this.mount(this.coreObj, !vr);
      this.mount(this.hammer, !vr);
      this.coreObj.visible = this.hammer.visible = true;
      if (!vr) {
        this.coreObj.position.set(-0.03, -0.12, -0.4);
        this.coreObj.rotation.set(0.3, 0.4, 0);
      }
    } else {
      this.twist = new TwistState();
      this.lastWorkProgress = 0;
      this.spin = 0;
      this.strandMat.color.setHex(ITEMS[getGame(this.world).held!].color);
      this.mount(this.strands, !vr);
      this.strands.visible = true;
    }
  }

  private exit(): void {
    this.mode = 'none';
    this.coreObj.visible = this.hammer.visible = this.strands.visible = false;
    this.twist = null;
    handPose.mode = 'free';
    getUi(this.world).setHeldVisible?.(true);
  }

  // --------------------------------------------------------------- knapping

  private resolveKnap(speed: number, edgeDist: number, angle: number, hitDir: Vector3): void {
    const game = getGame(this.world);
    const r = this.core.strike(speed, edgeDist, angle);
    if (this.vr) pulse(this.renderer.xr.getSession(), 1, r.outcome === 'flake' ? 0.8 : 0.4, 50);
    this.coreObj.getWorldPosition(this.flakeFrom);
    // Hammerstone on flint: a sharp knap with sparks on a good flake, a dull crunch on a crushed edge.
    if (r.outcome !== 'nothing' || speed > 0.5) {
      game.contact(r.outcome === 'flake' ? 'flint' : 'stone', 'stone', this.flakeFrom.x, this.flakeFrom.y, this.flakeFrom.z, speed);
    }
    if (r.outcome === 'flake') {
      // A pale scar where the flake came off.
      const scar = this.scars[this.scarCount++ % SCARS];
      scar.visible = true;
      scar.position.copy(hitDir).multiplyScalar(CORE_R * 0.98);
      scar.lookAt(this.local.copy(hitDir).multiplyScalar(CORE_R * 2));
      this.flakeT = 0;
      this.flake.visible = true;
      game.work(1);
    }
    this.fail(r.code);
    if (!actionFor(game.held)) this.exit(); // the core is used up: flakes are in the satchel
  }

  private updateKnapVR(): void {
    const l = hands[0];
    const r = hands[1];
    if (!l.tracked || !r.tracked) return;
    // Core in the left hand, a little in front of the palm; hammerstone in the right.
    this.coreObj.position.set(0, 0, -0.05).applyQuaternion(l.quat).add(l.pos);
    this.coreObj.quaternion.copy(l.quat);
    this.hammer.position.copy(r.pos);
    this.center.copy(this.coreObj.position);
    const d = r.pos.distanceTo(this.center);
    if (d > CORE_R + 0.06) {
      this.inContact = false;
      return;
    }
    if (this.inContact || d > CORE_R + 0.035) return;
    this.inContact = true;
    // Filtered hand velocities (handmotion.ts), so one jittery frame is not a hard blow.
    this.rel.set(r.motion.vel.x - l.motion.vel.x, r.motion.vel.y - l.motion.vel.y, r.motion.vel.z - l.motion.vel.z);
    const speed = this.rel.length();
    // Where on the core, and at what angle to its striking platform (local XZ plane).
    this.inv.copy(l.quat).invert();
    this.local.subVectors(r.pos, this.center).applyQuaternion(this.inv).normalize();
    const vLocal = this.rel.applyQuaternion(this.inv).normalize();
    const edgeDist = Math.abs(this.local.y) * KNAP_EDGE * 3;
    const angle = (Math.asin(Math.min(1, Math.abs(vLocal.y))) * 180) / Math.PI;
    this.resolveKnap(speed, edgeDist, angle, this.local);
  }

  private updateKnapDesktop(): void {
    if (mouse.pressed) this.peakVy = this.peakVx = 0;
    // The hammerstone follows the cursor just in front of the core.
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((mouse.x - rect.left) / rect.width) * 2 - 1;
    const ny = -((mouse.y - rect.top) / rect.height) * 2 + 1;
    const cam = this.camera as unknown as { fov: number; aspect: number };
    const t = Math.tan(((cam.fov ?? 70) * Math.PI) / 360);
    this.ray.set(nx * t * (cam.aspect ?? 1.6), ny * t, -1).normalize();
    this.hammer.position.copy(this.ray).multiplyScalar(0.36);
    const raise = mouse.down ? Math.max(0, Math.min(1, -mouse.dragY / 120)) : 0;
    handPose.mode = 'knap';
    handPose.amount = raise;
    handPose.x = this.hammer.position.x;
    handPose.y = this.hammer.position.y + 0.12;
    if (mouse.down && mouse.vy > this.peakVy) {
      this.peakVy = mouse.vy;
      this.peakVx = mouse.vx;
    }
    if (!mouse.released) return;
    // Ray-sphere test against the core (camera space).
    const c = this.coreObj.position;
    const b = this.ray.dot(c);
    const disc = b * b - (c.lengthSq() - CORE_R * CORE_R);
    const speed = this.peakVy * KNAP_FLICK;
    if (disc < 0 || speed < 0.3) return; // released off the core, or no blow at all
    const hit = this.local.copy(this.ray).multiplyScalar(b - Math.sqrt(disc)).sub(c).normalize();
    const edgeDist = Math.abs(hit.y) * KNAP_EDGE * 3;
    const angle = (Math.atan2(this.peakVy, Math.abs(this.peakVx)) * 180) / Math.PI;
    this.resolveKnap(speed, edgeDist, angle, hit);
  }

  /** The flake springs off, then floats up in front of you to be inspected. */
  private animateFlake(dt: number): void {
    if (this.flakeT < 0) return;
    this.flakeT += dt;
    const t = this.flakeT;
    if (t < 0.25) {
      this.flake.position.copy(this.flakeFrom);
      this.flake.position.x += t * 0.6;
      this.flake.position.y += t * 0.5;
    } else {
      // Inspect: hold it up near your eyes, turning slowly to show the ripples.
      this.camera.getWorldPosition(this.center);
      this.camera.getWorldDirection(this.rel);
      this.flake.position.copy(this.center).addScaledVector(this.rel, 0.3);
      this.flake.position.y -= 0.04;
      this.flake.rotation.set(0.9, t * 1.5, 0);
    }
    if (t > 2) {
      this.flakeT = -1;
      this.flake.visible = false;
    }
  }

  // ---------------------------------------------------------------- twisting

  private updateTwist(): void {
    const tw = this.twist!;
    let sep: number;
    let dL: number;
    let dR: number;
    if (this.vr) {
      const l = hands[0];
      const r = hands[1];
      // Tracking lost: pause (no rolling, no progress) and pick up again when the hands return.
      if (!l.tracked || !r.tracked) return;
      if (!l.grip || !r.grip) {
        this.exit();
        return;
      }
      sep = l.pos.distanceTo(r.pos);
      dL = l.roll;
      dR = r.roll;
      this.strands.position.addVectors(l.pos, r.pos).multiplyScalar(0.5);
      this.rel.subVectors(r.pos, l.pos).normalize();
      this.strands.quaternion.setFromUnitVectors(this.local.set(1, 0, 0), this.rel);
    } else {
      // Holding the button = both hands gripping the bundle; sideways drag = pulling apart.
      sep = mouse.down ? 0.08 + Math.abs(mouse.dragX) * PULL_PER_PX : 0.04;
      const w = mouse.wheel * ROLL_PER_WHEEL;
      // Shift+wheel rolls both wrists the same way (shows why that does not work).
      dL = mouse.shift ? w : -w;
      dR = w;
      this.strands.position.set(0, -0.15, -0.45);
      this.strands.rotation.set(0.2, 0, 0);
      handPose.mode = 'twist';
      handPose.amount = this.spin;
      handPose.x = sep / 2 - 0.05;
    }
    const ev = tw.update(sep, dL, dR);
    this.fail(tw.lastCode);
    const game = getGame(this.world);
    if (ev === 'split') game.fx('crack', 0.3);
    if (ev === 'progress' || ev === 'done') {
      this.spin += Math.abs(dL - dR) * 0.5;
      game.fx('twist', tw.progress);
      const a = actionFor(game.held);
      if (a) {
        game.work((tw.progress - this.lastWorkProgress) * a.work);
        this.lastWorkProgress = tw.progress;
      }
      if (this.vr && ev === 'progress') pulse(this.renderer.xr.getSession(), 0, 0.1, 15);
    }
    // Strands: spread apart until split, then wind tighter and darker as they twist.
    const spread = tw.split ? 1 - tw.progress * 0.6 : 2.2;
    this.strands.scale.set(Math.max(0.05, sep), spread, spread);
    this.strands.children[0].rotation.x = this.spin;
    this.strands.children[1].rotation.x = this.spin;
    if (ev === 'done' || !actionFor(game.held)) this.exit();
  }

  // ------------------------------------------------------------------ frame

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    if (this.codeTimer > 0) this.codeTimer -= dt;
    this.animateFlake(dt);
    const game = getGame(this.world);
    const a = actionFor(game.held);
    const vr = this.immersive();
    if (this.mode === 'none') {
      if (a?.motion === 'knap') this.enter('knap', vr);
      else if (a?.motion === 'rub') {
        if (vr) {
          const l = hands[0];
          const r = hands[1];
          if (l.tracked && r.tracked && l.grip && r.grip && l.pos.distanceTo(r.pos) < 0.3) this.enter('twist', true);
        } else if (mouse.pressed) this.enter('twist', false);
      }
    } else if (!a || (this.mode === 'knap' && a.motion !== 'knap') || (this.mode === 'twist' && a.motion !== 'rub')) {
      this.exit();
    }
    if (this.mode === 'knap') {
      if (this.vr) this.updateKnapVR();
      else this.updateKnapDesktop();
    } else if (this.mode === 'twist') {
      if (!this.vr && !mouse.down && this.twist && !this.twist.split) this.exit();
      else this.updateTwist();
    }
  }
}
