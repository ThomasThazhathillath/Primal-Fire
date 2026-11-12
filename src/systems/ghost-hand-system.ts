// Ghost-hand demos: a small translucent hand that loops one gesture (pinch-grab, hold, release, two-hand carry, knap,
// saw a bow drill, twist cord, fan) beside the card that teaches it, and goes away when the step is done. Shown in VR
// only, one shared geometry + one material, no per-frame work while hidden.

import { BoxGeometry, createSystem, Group, Mesh, MeshBasicMaterial, Vector3, VisibilityState } from '@iwsdk/core';
import { cards, ghost, headYaw } from './shared.js';

export type GhostClip = 'grab' | 'hold' | 'release' | 'carry' | 'knap' | 'saw' | 'twist' | 'fan';

/** Which demo goes with which tutorial lesson / objective (absent = no demo). */
export const LESSON_CLIPS: Record<string, GhostClip> = {
  hands: 'grab',
  gather: 'grab',
  satchel: 'release',
  move: 'carry',
  place: 'release',
  build: 'carry',
  craft: 'knap',
  fire: 'saw',
};
export const OBJECTIVE_CLIPS: Record<string, GhostClip> = {
  firstStone: 'grab',
  moreStones: 'grab',
  flatStone: 'hold',
  stoneTools: 'knap',
  wood: 'carry',
  cutting: 'knap',
  tinder: 'grab',
  cord: 'twist',
  bowDrill: 'saw',
  firePit: 'release',
  fireLay: 'release',
  ember: 'fan',
  fireLit: 'fan',
};

const PERIOD = 2.4;

class Hand extends Group {
  readonly thumb: Mesh;
  readonly index: Mesh;
  constructor(geo: BoxGeometry, mat: MeshBasicMaterial) {
    super();
    const palm = new Mesh(geo, mat);
    palm.scale.set(0.07, 0.02, 0.08);
    this.add(palm);
    this.index = new Mesh(geo, mat);
    this.index.scale.set(0.016, 0.016, 0.07);
    this.thumb = new Mesh(geo, mat);
    this.thumb.scale.set(0.016, 0.016, 0.055);
    this.add(this.index, this.thumb);
  }
  /** pinch 0 = open, 1 = fingertips touching. */
  pose(pinch: number): void {
    const o = 0.55 * (1 - pinch);
    this.index.position.set(0.02, 0, -0.06);
    this.index.rotation.set(0, -o * 0.2, 0);
    this.thumb.position.set(-0.03, 0, -0.045);
    this.thumb.rotation.set(0, 0.5 - 0.3 * pinch + o * 0.6, 0);
    this.thumb.position.x = -0.03 + 0.03 * pinch + 0.02 * o;
  }
}

export class GhostHandSystem extends createSystem({}) {
  private root = new Group();
  private hands: [Hand, Hand] | null = null;
  private t = 0;
  private vr = false;
  private tmp = new Vector3();

  init(): void {
    const geo = new BoxGeometry(1, 1, 1);
    const mat = new MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.8, depthWrite: false });
    this.hands = [new Hand(geo, mat), new Hand(geo, mat)];
    this.root.add(this.hands[0], this.hands[1]);
    this.root.visible = false;
    this.root.scale.setScalar(1.6);
    this.world.scene.add(this.root);
    this.cleanupFuncs.push(this.world.visibilityState.subscribe((v) => (this.vr = v !== VisibilityState.NonImmersive)));
    (window as unknown as { __ghost?: unknown }).__ghost = ghost;
  }

  update(delta: number): void {
    const clip = this.vr ? ((ghost.clip ?? ghost.how) as GhostClip | null) : null;
    if (!clip || !this.hands) {
      this.root.visible = false;
      return;
    }
    // Beside the card that teaches it (to its right), else in front and below the eyes.
    const card = ghost.clip ? cards[ghost.card ?? ''] : cards.objective;
    const cam = this.camera;
    cam.getWorldPosition(this.tmp);
    const yaw = headYaw(cam);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    if (card && card.visible) {
      this.root.position.copy(card.position);
      // Beside the card; the tutorial card shares the view with the objective card, so its demo floats above-right instead.
      const side = ghost.clip && ghost.card === 'tutorial' ? 0.12 : 0.3;
      this.root.position.x += rx * side;
      this.root.position.z += rz * side;
      this.root.position.y += ghost.clip && ghost.card === 'tutorial' ? 0.1 : -0.02;
    } else {
      this.root.position.set(this.tmp.x + fx * 0.5 + rx * 0.3, this.tmp.y - 0.35, this.tmp.z + fz * 0.5 + rz * 0.3);
    }
    this.root.rotation.set(0.9, yaw, 0, 'YXZ'); // tipped up so the demo reads from eye height
    this.root.visible = true;
    this.t = (this.t + delta) % PERIOD;
    const u = this.t / PERIOD;
    const s = Math.sin(u * Math.PI * 2);
    const [a, b] = this.hands;
    a.visible = true;
    b.visible = clip === 'carry' || clip === 'saw' || clip === 'knap' || clip === 'twist';
    a.position.set(0, 0, 0);
    b.position.set(-0.12, 0, 0);
    a.rotation.set(0, 0, 0);
    b.rotation.set(0, 0, 0);
    let pa = 0;
    switch (clip) {
      case 'grab': // reach, close, lift
        a.position.set(0, 0.02 * (u > 0.5 ? 1 : 0), 0.08 * (u < 0.5 ? 1 - u * 2 : 0));
        pa = u < 0.35 ? 0 : 1;
        break;
      case 'hold':
        pa = 1;
        a.position.y = 0.01 * s;
        break;
      case 'release': // closed, then open and drop
        pa = u < 0.5 ? 1 : 0;
        a.position.y = u < 0.5 ? 0.03 : 0.03 - (u - 0.5) * 0.06;
        break;
      case 'carry':
        pa = 1;
        a.position.set(0.06, 0.02 * s, 0);
        b.position.set(-0.06, 0.02 * s, 0);
        break;
      case 'knap': // one hand holds, the other strikes down
        pa = 1;
        a.position.set(0.05, 0.03 * Math.max(0, s), 0);
        break;
      case 'saw': // back and forth along the bow
        pa = 1;
        a.position.set(0.1 * s, 0, 0);
        b.position.set(-0.1, 0.03, 0);
        break;
      case 'twist':
        pa = 1;
        a.position.set(0.05, 0, 0);
        a.rotation.z = s * 0.6;
        b.position.set(-0.05, 0, 0);
        b.rotation.z = -s * 0.6;
        break;
      case 'fan':
        pa = 0;
        a.position.set(0.05 * s, 0.03, 0);
        a.rotation.z = s * 0.5;
        break;
    }
    a.pose(pa);
    b.pose(clip === 'carry' || clip === 'knap' || clip === 'twist' || clip === 'saw' ? 1 : 0);
  }
}
