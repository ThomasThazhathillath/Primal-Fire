// Lesson 04's Tool Yard by Split Rock (rules: game/curriculum/lessons/tools/engineering.ts, state: yard.ts).
// Draws the boulder on its flint seam, the lever pole and pivot stone, the test bough with its stone, and the
// stick frame, and turns hands or the mouse into the yard's actions:
//   touch (VR: look + pinch, or pinch right at it; desktop: click)
//     boulder      -> lay the pole you carry under it as a lever (or set it again after a roll)
//     a pivot mark -> move the pivot stone there
//     the seam     -> break out a flint nodule (needs a hammer)
//     the frame    -> set the next straight stick (posts, bar, then a brace), or stand a folded frame up
//   touch and move (VR: keep pinching and move the hand; desktop: press and drag)
//     the pole end -> push it down: the lever rule decides whether the boulder lifts and rolls
//     the stone    -> pull it up with the fibres or cord you hold: the tensile rule decides
//     the frame    -> push its top sideways: the racking rule decides
// Nothing completes on a click alone where a motion is the point; outcomes come only from the rules.
// Cost: nothing allocated per frame; meshes are only re-posed when the yard changes or a motion is live,
// and the whole update returns at once when the player is far away.

import {
  BoxGeometry,
  CircleGeometry,
  createSystem,
  CylinderGeometry,
  type Entity,
  Group,
  Hovered,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  RayInteractable,
  RingGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import {
  BOUGH,
  BOULDER_R,
  BOULDER_START,
  FRAME_SPOT,
  LEVER_DIR,
  LIFT_NEEDED,
  PIVOTS,
  pivotArm,
  type PivotId,
  POLE_LENGTH,
  YARD,
} from '../game/curriculum/lessons/tools/engineering.js';
import { collisionWorld } from '../game/collision.js';
import { groundHeight } from '../game/world-layout.js';
import { lambert } from '../scene-assets/materials.js';
import { hands, mouse, pulse } from './hand-input-system.js';
import { type GazeUiAdd, type GazeUiOwner, gazeUi, getGame, getUi, handClaims, interactionsPaused } from './shared.js';

/** The desktop pointer is over a yard object, or a yard motion is under way (other systems leave the press alone). */
export const yardPointer = { hover: false, holding: false };

type TargetId = 'boulder' | 'pivotNear' | 'pivotMiddle' | 'pivotFar' | 'poleEnd' | 'stone' | 'frame' | 'seam';
const TARGETS: readonly TargetId[] = ['boulder', 'pivotNear', 'pivotMiddle', 'pivotFar', 'poleEnd', 'stone', 'frame', 'seam'];
const PIVOT_OF: Partial<Record<TargetId, PivotId>> = { pivotNear: 'near', pivotMiddle: 'middle', pivotFar: 'far' };
/** Gaze radius (m) of each target, and how close (m) a pinching hand must be to take hold directly. */
const GAZE_R: Record<TargetId, number> = { boulder: 0.5, pivotNear: 0.14, pivotMiddle: 0.14, pivotFar: 0.14, poleEnd: 0.16, stone: 0.16, frame: 0.4, seam: 0.35 };
const NEAR_GRAB = 0.28;
/** You must stand this close (m) to a target to use it. */
const USE_REACH = 3;
/** The update does nothing beyond this distance (m) from the yard centre. */
const ACTIVE_RANGE = 14;
/** Desktop: metres of hand travel per pixel of drag (down for the lever, up for the stone, sideways for the frame). */
const DROP_PER_PX = 0.0035;
const LIFT_PER_PX = 0.0025;
const SIDE_PER_PX = 0.0025;

const STONE_R = 0.12;
const PIVOT_TOP = 0.26;
const TIP_Y = 0.05;
const POST_H = 0.9;
const POST_X = 0.35;
const BAR_Y = 1.3;

const boulderMat = lambert(0x8a857c);
const stoneMat = lambert(0x9b958a);
const flintMat = lambert(0x34343e);
const seamMat = lambert(0x2a2a30);
const woodMat = lambert(0x8a6a45);
const stickMat = lambert(0xc49a66);
const gripMat = lambert(0x5a4630);
const markMat = new MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.55, depthWrite: false });
const markOnMat = new MeshBasicMaterial({ color: 0x7fe08a, transparent: true, opacity: 0.7, depthWrite: false });
const focusMat = new MeshBasicMaterial({ color: 0xfff3d0, transparent: true, opacity: 0.8, depthWrite: false });
/** Invisible hit shapes: they take the mouse ray but draw nothing. */
const hitMat = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const FIBRE_COLOR = 0x7a9a42;
const CORD_COLOR = 0xc9b48a;

export class ToolYardSystem extends createSystem({
  hovered: { required: [RayInteractable, Hovered] },
}) {
  private gy = 0;
  private vr = false;
  private shownVersion = -1;
  // meshes
  private boulder!: Mesh;
  private seam = new Group();
  private nodules: Mesh[] = [];
  private pivotStone!: Mesh;
  private marks: Mesh[] = [];
  private pole = new Group();
  private stone!: Mesh;
  private strand!: Mesh;
  private strandMat = new MeshBasicMaterial({ color: CORD_COLOR });
  private frame = new Group();
  private posts: Mesh[] = [];
  private bar!: Mesh;
  private brace!: Mesh;
  private focus!: Mesh;
  /** Hit shapes for the mouse, and where each target is in the world. */
  private hits = new Map<Entity, TargetId>();
  private hitObj = {} as Record<TargetId, Object3D>;
  private at = {} as Record<TargetId, Vector3>;
  private hoverId: TargetId | null = null;
  private gazeId: TargetId | null = null;
  // the motion in progress
  private hold: TargetId | null = null;
  private holdHand: 0 | 1 = 1;
  private holdFrom = new Vector3();
  private holdActed = false;
  private lastActAt = -10;
  // animation state
  private delta = 0; // pole rotation (rad) pushed down from rest
  private shake = 0;
  private hangLeft = 0;
  private lift = 0;
  private fold = 0; // frame lean (rad)
  private foldTarget = 0;
  private wobble = 0;
  private clock = 0;
  private blockX = NaN;
  private blockZ = NaN;
  // scratch
  private tmp = new Vector3();
  private axis = new Vector3();
  private q = new Quaternion();

  init(): void {
    this.gy = groundHeight(YARD.x, YARD.z);
    for (const id of TARGETS) this.at[id] = new Vector3();
    const add = (o: Object3D): Entity => this.world.createTransformEntity(o);
    // The boulder: a weathered lump, wider than tall.
    this.boulder = new Mesh(new IcosahedronGeometry(BOULDER_R, 1), boulderMat);
    this.boulder.scale.set(1.05, 0.72, 0.95);
    this.boulder.name = 'YardBoulder';
    this.hit('boulder', add(this.boulder), this.boulder);
    // The flint seam under it: a dark patch with nodules.
    const patch = new Mesh(new CircleGeometry(0.5, 14), seamMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.y = 0.012;
    this.seam.add(patch);
    const nodGeo = new IcosahedronGeometry(0.06, 0);
    for (let i = 0; i < 5; i++) {
      const n = new Mesh(nodGeo, flintMat);
      const a = i * 1.3;
      n.position.set(Math.cos(a) * 0.25 * (0.5 + (i % 3) * 0.3), 0.03, Math.sin(a) * 0.22);
      n.scale.set(1, 0.6, 0.8);
      this.nodules.push(n);
      this.seam.add(n);
    }
    this.seam.position.set(BOULDER_START.x, this.gy, BOULDER_START.z);
    this.seam.name = 'YardSeam';
    add(this.seam);
    const seamHit = new Mesh(new CircleGeometry(0.5, 10), hitMat);
    seamHit.rotation.x = -Math.PI / 2;
    seamHit.position.set(BOULDER_START.x, this.gy + 0.05, BOULDER_START.z);
    this.hit('seam', add(seamHit), seamHit);
    // Pivot stone and its three marks.
    this.pivotStone = new Mesh(new IcosahedronGeometry(0.15, 1), stoneMat);
    this.pivotStone.scale.set(1.1, 0.75, 1);
    this.pivotStone.name = 'YardPivot';
    add(this.pivotStone);
    const ringGeo = new RingGeometry(0.11, 0.15, 20);
    const discGeo = new CircleGeometry(0.16, 10);
    for (const id of ['pivotNear', 'pivotMiddle', 'pivotFar'] as const) {
      const ring = new Mesh(ringGeo, markMat);
      ring.rotation.x = -Math.PI / 2;
      ring.name = `YardMark_${id}`;
      add(ring);
      this.marks.push(ring);
      const disc = new Mesh(discGeo, hitMat);
      disc.rotation.x = -Math.PI / 2;
      this.hit(id, add(disc), disc);
    }
    // The lever pole, built along +X from its tip, with a grip wrap at the far end.
    const shaft = new Mesh(new CylinderGeometry(0.035, 0.045, POLE_LENGTH, 7), woodMat);
    shaft.rotation.z = -Math.PI / 2;
    shaft.position.x = POLE_LENGTH / 2;
    this.pole.add(shaft);
    const grip = new Mesh(new CylinderGeometry(0.05, 0.05, 0.28, 7), gripMat);
    grip.rotation.z = -Math.PI / 2;
    grip.position.x = POLE_LENGTH - 0.2;
    this.pole.add(grip);
    this.pole.name = 'YardPole';
    add(this.pole);
    const endHit = new Mesh(new BoxGeometry(0.5, 0.3, 0.3), hitMat);
    this.hit('poleEnd', add(endHit), endHit);
    // The test bough: two forked posts, a bar, a stone and the strand you lift it with.
    const bough = new Group();
    const postGeo = new CylinderGeometry(0.045, 0.055, BAR_Y, 7);
    for (const s of [-1, 1]) {
      const p = new Mesh(postGeo, woodMat);
      p.position.set(s * 0.55, BAR_Y / 2, 0);
      bough.add(p);
    }
    const boughBar = new Mesh(new CylinderGeometry(0.04, 0.04, 1.3, 7), woodMat);
    boughBar.rotation.z = Math.PI / 2;
    boughBar.position.y = BAR_Y;
    bough.add(boughBar);
    bough.position.set(BOUGH.x, this.gy, BOUGH.z);
    bough.name = 'YardBough';
    add(bough);
    this.stone = new Mesh(new IcosahedronGeometry(STONE_R, 1), stoneMat);
    this.stone.scale.set(1, 0.8, 0.9);
    this.stone.name = 'YardTestStone';
    this.hit('stone', add(this.stone), this.stone);
    this.strand = new Mesh(new CylinderGeometry(0.008, 0.008, 1, 5), this.strandMat);
    this.strand.visible = false;
    add(this.strand);
    // The stick frame (pieces appear as they are set) and its ground mark.
    const fpost = new CylinderGeometry(0.022, 0.025, POST_H, 6);
    fpost.translate(0, POST_H / 2, 0);
    for (let i = 0; i < 2; i++) {
      const p = new Mesh(fpost, stickMat);
      this.posts.push(p);
      this.frame.add(p);
    }
    this.bar = new Mesh(new CylinderGeometry(0.02, 0.02, 1, 6), stickMat);
    this.brace = new Mesh(new CylinderGeometry(0.02, 0.02, 1, 6), stickMat);
    this.frame.add(this.bar, this.brace);
    const fring = new Mesh(new RingGeometry(0.42, 0.47, 28), markMat);
    fring.rotation.x = -Math.PI / 2;
    fring.position.y = 0.015;
    this.frame.add(fring);
    this.frame.position.set(FRAME_SPOT.x, this.gy, FRAME_SPOT.z);
    this.frame.name = 'YardFrame';
    add(this.frame);
    const frameHit = new Mesh(new BoxGeometry(1.0, 1.0, 0.4), hitMat);
    frameHit.position.set(FRAME_SPOT.x, this.gy + 0.5, FRAME_SPOT.z);
    this.hit('frame', add(frameHit), frameHit);
    this.at.frame.set(FRAME_SPOT.x, this.gy + POST_H, FRAME_SPOT.z);
    this.at.stone.set(BOUGH.x, this.gy + STONE_R, BOUGH.z);
    this.at.seam.set(BOULDER_START.x, this.gy + 0.05, BOULDER_START.z);
    // One soft ring under whatever the pointer or gaze is on.
    this.focus = new Mesh(new RingGeometry(0.2, 0.24, 28), focusMat);
    this.focus.rotation.x = -Math.PI / 2;
    this.focus.visible = false;
    add(this.focus);

    this.queries.hovered.subscribe('qualify', (e) => {
      const id = this.hits.get(e);
      if (id) this.hoverId = id;
    });
    this.queries.hovered.subscribe('disqualify', (e) => {
      if (this.hits.get(e) === this.hoverId) this.hoverId = null;
    });
    const ui = getUi(this.world);
    const prev = ui.capturesPointer;
    ui.capturesPointer = () => yardPointer.hover || yardPointer.holding || (prev?.() ?? false);
    const owner: GazeUiOwner = {
      gazeActivate: (i) => this.activate(TARGETS[i], -1),
      gazeHover: (i, on) => {
        this.gazeId = on ? TARGETS[i] : this.gazeId === TARGETS[i] ? null : this.gazeId;
      },
    };
    gazeUi.push({ collectGaze: (addUi) => this.collectGaze(addUi, owner) });
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        // Desktop clicks use the mouse ray; in VR the yard is reached by gaze + pinch or a direct pinch.
        for (const e of this.hits.keys()) {
          if (this.vr && e.hasComponent(RayInteractable)) e.removeComponent(RayInteractable);
          if (!this.vr && !e.hasComponent(RayInteractable)) e.addComponent(RayInteractable);
        }
        this.endHold();
      }),
    );
    this.pose();
  }

  private hit(id: TargetId, e: Entity, o: Object3D): void {
    e.addComponent(RayInteractable);
    this.hits.set(e, id);
    this.hitObj[id] = o;
  }

  // ------------------------------------------------------------ targets

  /** Targets that do something right now (others are not offered to gaze). */
  private live(id: TargetId): boolean {
    const yard = getGame(this.world).yard;
    switch (id) {
      case 'seam':
        return yard.seamOpen();
      case 'poleEnd':
        return yard.pole !== 'none';
      default:
        return true;
    }
  }

  private collectGaze(add: GazeUiAdd, owner: GazeUiOwner): void {
    if (!this.vr) return;
    const g = getGame(this.world);
    if (!g.yard.near(g.player.x, g.player.z, YARD.r + 2)) return;
    for (let i = 0; i < TARGETS.length; i++) {
      const id = TARGETS[i];
      if (!this.live(id)) continue;
      const p = this.at[id];
      add('yard:', id, p.x, p.y, p.z, GAZE_R[id], owner, i);
    }
  }

  private closeEnough(id: TargetId): boolean {
    const g = getGame(this.world);
    const p = this.at[id];
    if (Math.hypot(p.x - g.player.x, p.z - g.player.z) <= USE_REACH) return true;
    g.toast('Step closer to use it.', 'note');
    return false;
  }

  /** A touch on a target: one-shot actions happen now; motions start a hold. `hand` -1 = whichever is pinching. */
  private activate(id: TargetId, hand: 0 | 1 | -1): void {
    const now = performance.now() / 1000;
    if (this.hold || now - this.lastActAt < 0.35 || interactionsPaused(this.world)) return;
    if (!this.live(id) || !this.closeEnough(id)) return;
    this.lastActAt = now;
    const h: 0 | 1 = hand >= 0 ? (hand as 0 | 1) : hands[1].grip || !hands[0].grip ? 1 : 0;
    if (this.vr) handClaims.actedAt[h] = now;
    const g = getGame(this.world);
    const yard = g.yard;
    const pivot = PIVOT_OF[id];
    if (pivot) {
      yard.setPivot(pivot);
      return;
    }
    switch (id) {
      case 'boulder':
        yard.rigLever();
        return;
      case 'seam':
        yard.takeFlint();
        return;
      case 'poleEnd':
        if (yard.pole !== 'set') yard.rigLever();
        else if (yard.beginPush()) this.startHold('poleEnd', h);
        return;
      case 'stone':
        if (!yard.strandInHand()) {
          g.toast('Hold loose fibres or cord to tie the stone on (take it out of your bag).', 'note');
          return;
        }
        this.strandMat.color.setHex(yard.strandInHand() === 'loose' ? FIBRE_COLOR : CORD_COLOR);
        this.startHold('stone', h);
        return;
      case 'frame': {
        const f = yard.frame;
        const squareTested = g.experiments.state('frameBracing').trials.has('none');
        if (f.folded || !yard.bracing()) yard.addFramePiece();
        else if (!f.brace && g.held === 'spindle' && squareTested) yard.addFramePiece();
        else {
          if (!f.brace && g.held === 'spindle') g.toast('Push the square frame first, then brace it.', 'note');
          this.startHold('frame', h);
        }
        return;
      }
    }
  }

  private startHold(id: TargetId, h: 0 | 1): void {
    this.hold = id;
    this.holdHand = h;
    this.holdActed = false;
    yardPointer.holding = true;
    if (this.vr) this.holdFrom.copy(hands[h].pos);
  }

  private endHold(): void {
    this.hold = null;
    yardPointer.holding = false;
    this.strand.visible = this.hangLeft > 0;
  }

  // ------------------------------------------------------------ the motion in progress

  /** Hand travel since the hold began: down (+), up (+) and sideways (m). */
  private travel(): { down: number; up: number; side: number } {
    if (this.vr) {
      const p = hands[this.holdHand].pos;
      const dy = p.y - this.holdFrom.y;
      return { down: -dy, up: dy, side: Math.hypot(p.x - this.holdFrom.x, p.z - this.holdFrom.z) };
    }
    return { down: mouse.dragY * DROP_PER_PX, up: -mouse.dragY * LIFT_PER_PX, side: Math.abs(mouse.dragX) * SIDE_PER_PX };
  }

  private updateHold(dt: number): void {
    const id = this.hold!;
    const holding = this.vr ? hands[this.holdHand].tracked && hands[this.holdHand].grip : mouse.down;
    if (!holding) return this.endHold();
    const g = getGame(this.world);
    const t = this.travel();
    if (id === 'poleEnd') {
      const r = g.yard.push(t.down);
      if (!r) return this.endHold(); // rolled: the pole is down
      const b = POLE_LENGTH - pivotArm(g.yard.pivot);
      if (r.moves) {
        this.delta = Math.min(r.drop / b, 0.6);
        this.lift = r.lift;
      } else {
        // Stuck: the pole only shivers under your weight.
        this.delta = Math.min(Math.max(0, t.down), 0.02) / b;
        this.shake = t.down > 0.03 ? 1 : 0;
      }
      if (this.vr && t.down > 0.03) pulse(this.renderer.xr.getSession(), this.holdHand, r.moves ? 0.15 : 0.45, 20);
      this.pose();
    } else if (id === 'stone') {
      this.lift = Math.max(0, Math.min(t.up, LIFT_NEEDED));
      this.strand.visible = true;
      if (!this.holdActed && t.up >= LIFT_NEEDED) {
        this.holdActed = true;
        const r = g.yard.liftTestStone();
        if (r === 'holds') this.hangLeft = 2.5;
        this.lift = r === 'holds' ? 0.35 : 0;
        if (this.vr) pulse(this.renderer.xr.getSession(), this.holdHand, r === 'snaps' ? 0.8 : 0.3, 60);
        this.endHold();
      }
      this.pose();
    } else if (id === 'frame') {
      if (!this.holdActed) this.fold = g.yard.frame.brace ? 0 : Math.min(0.25, t.side * 2);
      if (!this.holdActed && t.side > 0) {
        const r = g.yard.pushFrame(t.side);
        if (r) {
          this.holdActed = true;
          this.foldTarget = r === 'folds' ? 1.25 : 0;
          if (r === 'holds') this.wobble = 0.4;
          if (this.vr) pulse(this.renderer.xr.getSession(), this.holdHand, r === 'folds' ? 0.6 : 0.3, 50);
          this.endHold();
        }
      }
      this.pose();
    }
    void dt;
  }

  // ------------------------------------------------------------ drawing

  /** Pose every mesh from the yard state and the live animation values. */
  private pose(): void {
    const g = getGame(this.world);
    const yard = g.yard;
    const gy = this.gy;
    const D = LEVER_DIR;
    const bx = yard.boulder.x;
    const bz = yard.boulder.z;
    // Boulder: tips about its far edge while the lever lifts it.
    const tilt = this.lift > 0 && this.hold === 'poleEnd' ? Math.min(0.5, this.lift / (2 * BOULDER_R)) : 0;
    this.axis.set(-D.z, 0, D.x); // horizontal, across the lever
    this.q.setFromAxisAngle(this.axis, tilt);
    this.tmp.set(D.x * BOULDER_R, 0.33, D.z * BOULDER_R).applyQuaternion(this.q);
    this.boulder.position.set(bx - D.x * BOULDER_R + this.tmp.x, gy + this.tmp.y, bz - D.z * BOULDER_R + this.tmp.z);
    this.boulder.quaternion.copy(this.q);
    this.at.boulder.set(bx, gy + 0.35, bz);
    // Seam: nodules left to break out.
    const open = yard.seamOpen();
    for (let i = 0; i < this.nodules.length; i++) this.nodules[i].visible = !open || i < yard.seamCharges + 2;
    // Lever geometry: the tip under the boulder's near edge, the pivot a load arm further out.
    const tipX = bx + D.x * (BOULDER_R - 0.12);
    const tipZ = bz + D.z * (BOULDER_R - 0.12);
    for (let i = 0; i < PIVOTS.length; i++) {
      const p = PIVOTS[i];
      const m = this.marks[i];
      m.position.set(tipX + D.x * p.arm, gy + 0.02, tipZ + D.z * p.arm);
      m.material = p.id === yard.pivot ? markOnMat : markMat;
      m.visible = p.id !== yard.pivot;
      const id = TARGETS[1 + i];
      this.at[id].set(m.position.x, gy + 0.05, m.position.z);
      this.hitObj[id].position.copy(m.position);
    }
    const a = pivotArm(yard.pivot);
    const px = tipX + D.x * a;
    const pz = tipZ + D.z * a;
    this.pivotStone.position.set(px, gy + 0.11, pz);
    this.pole.visible = yard.pole !== 'none';
    const yaw = Math.atan2(-D.z, D.x);
    if (yard.pole === 'down') {
      // Lying on the ground beside the lever line, waiting to be set again.
      this.pole.position.set(tipX + D.x * 0.3 + D.z * 0.35, gy + 0.04, tipZ + D.z * 0.3 - D.x * 0.35);
      this.pole.rotation.set(0, yaw, 0);
    } else {
      // Resting over the pivot with its tip on the ground: rest angle, then pushed down by `delta`.
      const rest = Math.atan2(PIVOT_TOP - TIP_Y, a);
      const ang = rest - this.delta + (this.shake ? Math.sin(this.clock * 60) * 0.004 : 0);
      const tx = px - D.x * Math.cos(ang) * a;
      const tz = pz - D.z * Math.cos(ang) * a;
      const ty = gy + PIVOT_TOP - Math.sin(ang) * a;
      this.pole.position.set(tx, ty, tz);
      this.pole.rotation.set(0, yaw, ang, 'YZX');
    }
    // The grip at the far end: where a hand (or the mouse) takes hold.
    this.tmp.set(POLE_LENGTH - 0.2, 0, 0).applyEuler(this.pole.rotation).add(this.pole.position);
    this.at.poleEnd.copy(this.tmp);
    this.hitObj.poleEnd.position.copy(this.tmp);
    if (bx !== this.blockX || bz !== this.blockZ) {
      this.blockX = bx;
      this.blockZ = bz;
      collisionWorld().setDynamic('yard_boulder', bx, bz, BOULDER_R);
    }
    // Test stone: lifted, hanging or on the ground; the strand runs up over the bough.
    const sy = gy + STONE_R * 0.8 + (this.hold === 'stone' || this.hangLeft > 0 ? this.lift : 0);
    this.stone.position.set(BOUGH.x, sy, BOUGH.z);
    this.at.stone.set(BOUGH.x, sy, BOUGH.z);
    if (this.strand.visible) {
      const top = gy + BAR_Y;
      const len = Math.max(0.05, top - sy);
      this.strand.position.set(BOUGH.x, sy + len / 2, BOUGH.z);
      this.strand.scale.set(1, len, 1);
    }
    // Frame: posts, bar and brace as set, leaning by `fold` about their feet.
    const f = yard.frame;
    const lean = f.folded ? Math.max(this.fold, 0) : this.fold + (this.wobble > 0 ? Math.sin(this.clock * 40) * 0.02 * this.wobble : 0);
    const dx = Math.sin(lean) * POST_H;
    const top = Math.cos(lean) * POST_H;
    for (let i = 0; i < 2; i++) {
      const p = this.posts[i];
      p.visible = f.posts > i;
      p.position.set(i === 0 ? -POST_X : POST_X, 0, 0);
      p.rotation.set(0, 0, -lean);
    }
    this.bar.visible = f.bar;
    this.bar.position.set(dx, top, 0);
    this.bar.scale.set(1, POST_X * 2, 1);
    this.bar.rotation.set(0, 0, Math.PI / 2);
    this.brace.visible = f.brace;
    if (f.brace) {
      // From the left foot to the right top.
      const x0 = -POST_X;
      const x1 = POST_X + dx;
      const len = Math.hypot(x1 - x0, top);
      this.brace.position.set((x0 + x1) / 2, top / 2, 0.03);
      this.brace.scale.set(1, len, 1);
      this.brace.rotation.set(0, 0, -Math.atan2(x1 - x0, top));
    }
    this.at.frame.set(FRAME_SPOT.x + dx, this.gy + Math.max(0.3, top), FRAME_SPOT.z);
    this.shownVersion = yard.version;
  }

  private placeFocus(): void {
    const id = this.vr ? this.gazeId : this.hoverId;
    if (!id || this.hold) {
      this.focus.visible = false;
      return;
    }
    const p = this.at[id];
    this.focus.visible = true;
    this.focus.position.set(p.x, this.gy + 0.03, p.z);
    const s = id === 'boulder' ? 2.6 : id === 'frame' ? 2.2 : id === 'seam' ? 2.2 : 0.9;
    this.focus.scale.setScalar(s);
  }

  // ------------------------------------------------------------ frame

  update(delta: number): void {
    const g = getGame(this.world);
    const far = Math.hypot(g.player.x - YARD.x, g.player.z - YARD.z) > ACTIVE_RANGE;
    if (far && !this.hold) {
      yardPointer.hover = false;
      return;
    }
    const dt = Math.min(delta, 0.05);
    this.clock += dt;
    yardPointer.hover = !this.vr && !!this.hoverId;
    if (interactionsPaused(this.world)) return;
    if (this.hold) this.updateHold(dt);
    else {
      // Start: desktop click on a hovered target; VR pinch right at a target.
      if (!this.vr && mouse.pressed && this.hoverId) this.activate(this.hoverId, -1);
      if (this.vr) {
        for (const h of [0, 1] as const) {
          const hand = hands[h];
          if (!hand.tracked || !hand.gripDown || (g.held && handClaims.holdHand === h)) continue;
          for (const id of ['poleEnd', 'stone', 'frame'] as const) {
            if (this.live(id) && hand.pinchPos.distanceTo(this.at[id]) < NEAR_GRAB) {
              this.activate(id, h);
              break;
            }
          }
        }
      }
    }
    // Easing back after a motion.
    let animating = false;
    if (!this.hold) {
      if (this.delta > 0) {
        this.delta = Math.max(0, this.delta - dt * 1.5);
        animating = true;
      }
      if (this.lift > 0 && this.hangLeft <= 0) {
        this.lift = Math.max(0, this.lift - dt * 0.8);
        animating = true;
      }
      this.shake = 0;
    }
    if (this.hangLeft > 0) {
      this.hangLeft -= dt;
      if (this.hangLeft <= 0) this.strand.visible = false;
      animating = true;
    }
    const target = g.yard.frame.folded ? this.foldTarget || 1.25 : 0;
    if (!this.hold && Math.abs(this.fold - target) > 1e-3) {
      this.fold += Math.sign(target - this.fold) * Math.min(Math.abs(target - this.fold), dt * 3);
      animating = true;
    }
    if (this.wobble > 0) {
      this.wobble = Math.max(0, this.wobble - dt);
      animating = true;
    }
    if (animating || this.shownVersion !== g.yard.version) this.pose();
    this.placeFocus();
  }
}
