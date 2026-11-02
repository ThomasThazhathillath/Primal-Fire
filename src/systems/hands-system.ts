// First-person hands and arms for browser play (in VR the headset's tracked
// hands/controllers are used instead). Procedural and cheap: ~12 meshes,
// two materials, no per-frame allocation. They idle with a gentle sway and
// act out what you do: reach to gather, swing when a tool helps, snap a
// branch with both hands, rub, and strike. Impacts nudge the camera and
// spit a few sparks.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  createSystem,
  Group,
  Mesh,
  Points,
  PointsMaterial,
  VisibilityState,
} from '@iwsdk/core';
import { ACTIONS } from '../game/actions.js';
import type { GameEvent } from '../game/game.js';
import { lambert } from '../scene-assets/materials.js';
import { camNudge, getGame, handPose } from './shared.js';

type Anim = 'idle' | 'reach' | 'swing' | 'snap' | 'rub' | 'knap';
const SPARKS = 10;
const skin = lambert(0xd9a77f);
const sleeve = lambert(0x5d4a36);
const forearmGeo = new CylinderGeometry(0.032, 0.04, 0.34, 8);
forearmGeo.rotateX(Math.PI / 2);
const handGeo = new BoxGeometry(0.085, 0.03, 0.1);
const fingerGeo = new BoxGeometry(0.075, 0.022, 0.06);
const thumbGeo = new BoxGeometry(0.025, 0.022, 0.06);

function buildArm(side: 1 | -1): Group {
  const g = new Group();
  const fore = new Mesh(forearmGeo, sleeve);
  fore.position.z = 0.2;
  const hand = new Mesh(handGeo, skin);
  hand.position.z = 0;
  const fingers = new Mesh(fingerGeo, skin);
  fingers.position.set(0, 0, -0.07);
  fingers.rotation.x = 0.35;
  const thumb = new Mesh(thumbGeo, skin);
  thumb.position.set(-0.05 * side, 0.005, -0.03);
  thumb.rotation.y = 0.5 * side;
  g.add(fore, hand, fingers, thumb);
  return g;
}

export class HandsSystem extends createSystem({}) {
  private rig = new Group();
  private right = buildArm(1);
  private left = buildArm(-1);
  private anim: Anim = 'idle';
  private animT = 0;
  private animLen = 0;
  private holdTimer = 0;
  private sparks!: Points;
  private sparkPos = new Float32Array(SPARKS * 3);
  private sparkVel = new Float32Array(SPARKS * 3);
  private sparkLife = new Float32Array(SPARKS);
  private t = 0;
  private impacted = false;

  init(): void {
    this.rig.name = 'FirstPersonHands';
    this.rig.add(this.right, this.left);
    this.camera.add(this.rig);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.sparkPos, 3));
    this.sparks = new Points(geo, new PointsMaterial({ color: 0xffd98a, size: 0.012, transparent: true, depthWrite: false }));
    this.sparks.frustumCulled = false;
    this.rig.add(this.sparks);
    for (let i = 0; i < SPARKS; i++) this.sparkPos[i * 3 + 1] = -10;
    const game = getGame(this.world);
    this.cleanupFuncs.push(
      () => this.rig.removeFromParent(),
      game.on((e: GameEvent) => this.onEvent(e)),
    );
  }

  private startAnim(a: Anim, len: number): void {
    this.anim = a;
    this.animT = 0;
    this.animLen = len;
    this.impacted = false;
  }

  private onEvent(e: GameEvent): void {
    if (e.type === 'reach') this.startAnim('reach', 0.45);
    else if (e.type === 'gather') this.startAnim(e.tool === 'axe' || e.tool === 'hammer' ? 'swing' : 'reach', e.tool ? 0.5 : 0.4);
    else if (e.type === 'action') {
      const motion = ACTIONS.find((a) => a.id === e.id)?.motion;
      this.holdTimer = 0.35;
      if (motion) this.anim = motion;
      if (motion === 'knap') this.burst();
    } else if (e.type === 'arrow' && !e.hit) this.startAnim('reach', 0.3);
  }

  /** Arms follow the live interaction state (see handPose in shared.ts). */
  private posePhysical(R: Group, L: Group): void {
    const a = handPose.amount;
    switch (handPose.mode) {
      case 'bend':
        // Fists either side of the stick; wrists roll the ends down as the bend grows.
        R.position.set(0.13, -0.19 - a * 0.03, -0.5);
        L.position.set(-0.13, -0.19 - a * 0.03, -0.5);
        R.rotation.set(0.25, 0.1, -0.15 - a * 0.7);
        L.rotation.set(0.25, -0.1, 0.15 + a * 0.7);
        break;
      case 'swing':
        R.position.set(0.18 + handPose.x, -0.15 + handPose.y, -0.5);
        R.rotation.set(0.1 + a * 1.2, 0.2, 0);
        break;
      case 'knap':
        L.position.set(-0.07, -0.17, -0.45);
        L.rotation.set(0.5, -0.3, 0.2);
        R.position.set(0.05 + handPose.x, -0.12 + handPose.y, -0.45);
        R.rotation.set(0.4 + a * 0.6, 0.3, 0);
        break;
      case 'twist':
        R.position.set(0.05 + handPose.x, -0.17, -0.47);
        L.position.set(-0.05 - handPose.x, -0.17, -0.47);
        R.rotation.set(0.2, 0.1, a * 6);
        L.rotation.set(0.2, -0.1, -a * 6);
        break;
      case 'drag':
      case 'place':
        R.position.set(0.12 + handPose.x, -0.2 + handPose.y, -0.55);
        L.position.set(-0.12 + handPose.x, -0.2 + handPose.y, -0.55);
        R.rotation.set(0.6, 0, 0);
        L.rotation.set(0.6, 0, 0);
        break;
      default:
        break;
    }
  }

  private burst(): void {
    camNudge.pitch = -0.02;
    for (let i = 0; i < SPARKS; i++) {
      const o = i * 3;
      this.sparkLife[i] = 0.35 + Math.random() * 0.2;
      this.sparkPos[o] = 0.1;
      this.sparkPos[o + 1] = -0.12;
      this.sparkPos[o + 2] = -0.6;
      this.sparkVel[o] = (Math.random() - 0.5) * 0.8;
      this.sparkVel[o + 1] = Math.random() * 0.6;
      this.sparkVel[o + 2] = (Math.random() - 0.5) * 0.4;
    }
  }

  update(delta: number): void {
    const desktop = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
    this.rig.visible = desktop;
    if (!desktop) return;
    this.t += delta;
    const s = Math.sin(this.t * 1.6) * 0.004;
    const R = this.right;
    const L = this.left;
    // Rest pose: forearms entering from the lower corners, hands low and slightly in.
    R.position.set(0.24, -0.2 + s, -0.5);
    R.rotation.set(0.1, 0.25, 0);
    L.position.set(-0.24, -0.2 - s, -0.5);
    L.rotation.set(0.1, -0.25, 0);

    if (this.holdTimer > 0) {
      this.holdTimer -= delta;
      if (this.holdTimer <= 0 && this.anim !== 'reach' && this.anim !== 'swing') this.anim = 'idle';
    }
    let k = 0;
    if (this.anim === 'reach' || this.anim === 'swing') {
      this.animT += delta;
      k = Math.min(1, this.animT / this.animLen);
      if (k >= 1) this.anim = 'idle';
    }
    const arc = Math.sin(k * Math.PI);
    // Live interactions drive the arms directly (no canned clip).
    if (handPose.mode !== 'free') {
      this.posePhysical(R, L);
      this.updateSparks(delta);
      return;
    }
    switch (this.anim) {
      case 'reach':
        R.position.set(0.24 - 0.2 * arc, -0.2 + 0.1 * arc, -0.5 - 0.3 * arc);
        R.rotation.x = 0.1 - 0.2 * arc;
        break;
      case 'swing': {
        // Wind up, then chop down; impact at ~60% of the swing.
        const wind = k < 0.6 ? k / 0.6 : 1;
        R.position.set(0.2, -0.12 + 0.2 * Math.sin(wind * Math.PI * 0.5) - (k > 0.6 ? 0.25 * (k - 0.6) / 0.4 : 0), -0.55);
        R.rotation.x = k < 0.6 ? 0.15 + 1.1 * wind : 1.25 - 2.3 * ((k - 0.6) / 0.4);
        if (k >= 0.6 && !this.impacted) {
          this.impacted = true;
          this.burst();
        }
        break;
      }
      case 'snap': {
        const w = Math.sin(this.t * 22) * 0.08;
        R.position.set(0.06, -0.14, -0.55);
        L.position.set(-0.06, -0.14, -0.55);
        R.rotation.set(0.1, 0.4, w);
        L.rotation.set(0.1, -0.4, -w);
        break;
      }
      case 'rub':
        R.position.set(0.15, -0.2, -0.5 - Math.sin(this.t * 16) * 0.08);
        L.position.set(-0.1, -0.2, -0.48);
        break;
      case 'knap': {
        const hit = Math.abs(Math.sin(this.t * 9));
        R.position.set(0.12, -0.08 - hit * 0.1, -0.55);
        R.rotation.x = 0.6 - hit * 0.7;
        L.position.set(-0.08, -0.16, -0.55);
        break;
      }
      default:
        break;
    }

    this.updateSparks(delta);
  }

  private updateSparks(delta: number): void {
    for (let i = 0; i < SPARKS; i++) {
      const o = i * 3;
      if (this.sparkLife[i] > 0) {
        this.sparkLife[i] -= delta;
        this.sparkVel[o + 1] -= 2.5 * delta;
        this.sparkPos[o] += this.sparkVel[o] * delta;
        this.sparkPos[o + 1] += this.sparkVel[o + 1] * delta;
        this.sparkPos[o + 2] += this.sparkVel[o + 2] * delta;
      } else this.sparkPos[o + 1] = -10;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
  }
}
