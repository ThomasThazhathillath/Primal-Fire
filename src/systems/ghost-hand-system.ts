// Projected hand signs: a holographic hand floats in front of you showing the gesture a lesson teaches (pinch, grab,
// release, tap, teleport thumb tap, turn thumb swipe, two-hand carry, knap, saw, twist, fan), with its name written
// above it. It loops until the step is done and is always there from a "How?" card. Shown in the headset only; one
// shared geometry, material and label texture; no work at all while hidden.

import {
  BoxGeometry,
  CanvasTexture,
  createSystem,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { assistFx, ghost, headYaw } from './shared.js';

export type GhostClip = 'pinch' | 'grab' | 'hold' | 'release' | 'point' | 'teleport' | 'turn' | 'carry' | 'knap' | 'saw' | 'twist' | 'fan';

/** What each sign is called on the label. */
export const CLIP_LABEL: Record<GhostClip, string> = {
  pinch: 'PINCH: thumb and finger together',
  grab: 'GRAB: reach, pinch, lift',
  hold: 'HOLD: keep pinching',
  release: 'RELEASE: open your hand',
  point: 'TAP: point and poke',
  teleport: 'TELEPORT: tap thumb on index',
  turn: 'TURN: swipe thumb along index',
  carry: 'CARRY: both hands, pinch and lift',
  knap: 'STRIKE: hold one, hit with the other',
  saw: 'SAW: pull the bow back and forth',
  twist: 'TWIST: roll the cord between fingers',
  fan: 'FAN: wave an open hand',
};

/** Which sign goes with which tutorial lesson (absent = none). */
export const LESSON_CLIPS: Record<string, GhostClip> = {
  stone: 'pinch',
  ring: 'teleport',
  marks: 'pinch',
  slab: 'grab',
  top: 'release',
  bag: 'point',
  bench: 'pinch',
};
/** The sign shown when a "How?" card is opened for this objective. */
export const OBJECTIVE_CLIPS: Record<string, GhostClip> = {
  firstStone: 'pinch',
  moreStones: 'grab',
  flatStone: 'hold',
  workbench: 'point',
  exploreBench: 'point',
  stoneTools: 'knap',
  wood: 'carry',
  cutting: 'knap',
  tinder: 'grab',
  cord: 'twist',
  frictionParts: 'knap',
  bowDrill: 'saw',
  firePit: 'release',
  fireLay: 'release',
  ember: 'fan',
  fireLit: 'fan',
  pot: 'carry',
  shelter: 'carry',
};
/** The VR movement signs, for the menu / hint to show on request. */
export const MOVE_CLIPS: GhostClip[] = ['teleport', 'turn'];

const PERIOD = 2.4;
const TWO_HANDED: ReadonlySet<GhostClip> = new Set(['carry', 'saw', 'knap', 'twist']);

class Hand extends Group {
  readonly index: Mesh;
  readonly thumb: Mesh;
  readonly rest: Mesh;
  constructor(geo: BoxGeometry, mat: MeshBasicMaterial) {
    super();
    const palm = new Mesh(geo, mat);
    palm.scale.set(0.07, 0.03, 0.08);
    this.rest = new Mesh(geo, mat); // the three curled fingers
    this.rest.scale.set(0.045, 0.02, 0.05);
    this.index = new Mesh(geo, mat);
    this.index.scale.set(0.02, 0.02, 0.07);
    this.thumb = new Mesh(geo, mat);
    this.thumb.scale.set(0.02, 0.02, 0.05);
    this.add(palm, this.rest, this.index, this.thumb);
  }
  /** pinch 0 = open, 1 = thumb and index touching. `extend` straightens the index (pointing). */
  pose(pinch: number, extend = 0): void {
    const open = 1 - pinch;
    this.rest.position.set(0.02, 0, -0.06);
    this.rest.rotation.x = 0.9 * (1 - extend * 0.5) + (extend ? 0.4 : 0);
    this.index.position.set(0.032, 0.01 * pinch, -0.075 + 0.02 * pinch);
    this.index.rotation.set(0.5 * pinch * (1 - extend), -0.1 * open, 0);
    this.thumb.position.set(-0.03 + 0.045 * pinch, 0.01, -0.045 - 0.01 * pinch);
    this.thumb.rotation.set(0, 0.55 * open + 0.2 * pinch, 0);
  }
}

export class GhostHandSystem extends createSystem({}) {
  private root = new Group();
  private hands: [Hand, Hand] | null = null;
  private label!: Sprite;
  private labelCtx: CanvasRenderingContext2D | null = null;
  private labelTex!: CanvasTexture;
  private labelFor = '';
  private mat!: MeshBasicMaterial;
  private t = 0;
  private vr = false;
  private tmp = new Vector3();

  init(): void {
    const geo = new BoxGeometry(1, 1, 1);
    this.mat = new MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.9, depthWrite: false });
    this.hands = [new Hand(geo, this.mat), new Hand(geo, this.mat)];
    // A soft ring under the hand, like a projector's pool of light.
    const ring = new Mesh(new RingGeometry(0.1, 0.12, 40), new MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.1;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    this.labelCtx = canvas.getContext('2d');
    this.labelTex = new CanvasTexture(canvas);
    this.label = new Sprite(new SpriteMaterial({ map: this.labelTex, transparent: true, depthWrite: false, depthTest: false }));
    this.label.scale.set(0.17, 0.0212, 1);
    this.label.position.set(0, 0.11, 0);
    this.label.renderOrder = 10;
    this.root.add(this.hands[0], this.hands[1], ring, this.label);
    this.root.visible = false;
    this.root.scale.setScalar(2);
    this.world.scene.add(this.root);
    this.cleanupFuncs.push(this.world.visibilityState.subscribe((v) => (this.vr = v !== VisibilityState.NonImmersive)));
    (window as unknown as { __ghost?: unknown }).__ghost = ghost;
  }

  private setLabel(clip: GhostClip): void {
    if (this.labelFor === clip || !this.labelCtx) return;
    this.labelFor = clip;
    const c = this.labelCtx;
    c.clearRect(0, 0, 512, 64);
    c.fillStyle = 'rgba(20, 40, 50, 0.7)';
    c.fillRect(0, 8, 512, 48);
    c.fillStyle = '#c8f2ff';
    c.font = 'bold 26px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(CLIP_LABEL[clip], 256, 33, 496);
    this.labelTex.needsUpdate = true;
  }

  update(delta: number): void {
    if (assistFx.signFor > 0) assistFx.signFor -= delta;
    const help = assistFx.signFor > 0 ? assistFx.sign : null;
    // Help for what the player is stuck on right now wins over the lesson's own sign while it lasts (NPE C).
    const clip = this.vr ? ((help ?? ghost.clip ?? ghost.how) as GhostClip | null) : null;
    if (!clip || !this.hands) {
      this.root.visible = false;
      return;
    }
    // Projected in front of you, to the right, at chest-to-eye height: where you naturally look while doing it.
    const cam = this.camera;
    cam.getWorldPosition(this.tmp);
    const yaw = headYaw(cam);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    this.root.position.set(this.tmp.x + fx * 0.55 + rx * 0.24, this.tmp.y - 0.17, this.tmp.z + fz * 0.55 + rz * 0.24);
    this.root.rotation.set(1.15, yaw, 0, 'YXZ');
    this.root.visible = true;
    this.setLabel(clip);
    this.t = (this.t + delta) % PERIOD;
    const u = this.t / PERIOD;
    const s = Math.sin(u * Math.PI * 2);
    // A gentle hologram shimmer.
    this.mat.opacity = 0.8 + 0.1 * Math.sin(this.t * 7);
    const [a, b] = this.hands;
    const two = TWO_HANDED.has(clip);
    a.visible = true;
    b.visible = two;
    a.position.set(two ? 0.07 : 0, 0, 0);
    b.position.set(-0.07, 0, 0);
    a.rotation.set(0, 0, 0);
    b.rotation.set(0, 0, 0);
    let pa = 0;
    let ext = 0;
    switch (clip) {
      case 'pinch': // open, close, open
        pa = u < 0.2 ? 0 : u < 0.7 ? 1 : 0;
        break;
      case 'grab': // reach, close, lift
        a.position.set(0, u > 0.5 ? 0.03 : 0, u < 0.5 ? 0.09 * (1 - u * 2) : 0);
        pa = u < 0.35 ? 0 : 1;
        break;
      case 'hold':
        pa = 1;
        a.position.y = 0.008 * s;
        break;
      case 'release': // closed, then open and drop
        pa = u < 0.5 ? 1 : 0;
        a.position.y = u < 0.5 ? 0.03 : 0.03 - (u - 0.5) * 0.06;
        break;
      case 'point': // index out, poke forward and back
        ext = 1;
        pa = 0;
        a.position.z = -0.05 * Math.max(0, s);
        break;
      case 'teleport': // thumb taps the side of the index: pinch pulse
        pa = u < 0.3 ? 0 : u < 0.5 ? 1 : 0;
        a.rotation.z = -0.3;
        break;
      case 'turn': // thumb swipes along the index: slides left then right while "touching"
        pa = 0.85;
        a.rotation.z = -0.3;
        a.rotation.y = 0.5 * s;
        a.position.x = 0.03 * s;
        break;
      case 'carry':
        pa = 1;
        a.position.set(0.07, 0.025 * s, 0);
        b.position.set(-0.07, 0.025 * s, 0);
        break;
      case 'knap': // one hand holds, the other strikes down
        pa = 1;
        a.position.set(0.08, 0.04 * Math.max(0, s), 0);
        break;
      case 'saw': // back and forth along the bow
        pa = 1;
        a.position.set(0.1 * s, 0, 0);
        b.position.set(-0.1, 0.03, 0);
        break;
      case 'twist':
        pa = 1;
        a.position.set(0.06, 0, 0);
        a.rotation.z = s * 0.6;
        b.position.set(-0.06, 0, 0);
        b.rotation.z = -s * 0.6;
        break;
      case 'fan':
        pa = 0;
        a.position.set(0.05 * s, 0.03, 0);
        a.rotation.z = s * 0.5;
        break;
    }
    a.pose(pa, ext);
    b.pose(two ? 1 : 0);
  }
}
