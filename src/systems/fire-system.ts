// The fire in the pit: fuel hotspot, bow-drill sawing and open-palm fanning
// read from hand motion, the carried ember, and the flame effects (a few
// pooled meshes + 24 ember sparks + one light; nothing allocates per frame).
// Browser fallback: tap the pit to add fuel / saw a stroke / fan a puff.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  createSystem,
  type Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PointLight,
  Points,
  PointsMaterial,
  Pressed,
  RayInteractable,
  SphereGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { GameEvent } from '../game/game.js';
import { FirePitSpot } from '../components/game-components.js';
import { getGame } from './shared.js';

const SPARKS = 24;
const FLAMES = 3;
/** Hand must be this close (m, horizontal) to the pit to saw, fan or drop the ember. */
const WORK_RADIUS = 1.2;
const TRANSFER_RADIUS = 0.45;
/** Fanning needs a hand moving at least this fast (m/s) over the pit. */
const FAN_MIN_SPEED = 0.6;

const emberMat = new MeshBasicMaterial({ color: 0xff6a1a });
const flameMat = new MeshBasicMaterial({ color: 0xffa233, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false });
const coreMat = new MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });

export class FireSystem extends createSystem({
  pitPressed: { required: [FirePitSpot, Pressed] },
}) {
  private root = new Group();
  private pitEntity: Entity | null = null;
  private pitPos = new Vector3();
  private flames: Mesh[] = [];
  private lay!: Group;
  private glow!: Mesh;
  private light!: PointLight;
  private sparks!: Points;
  private sparkPos!: Float32Array;
  private sparkVel = new Float32Array(SPARKS * 3);
  private sparkLife = new Float32Array(SPARKS);
  private carried: Mesh | null = null;
  private t = 0;
  private hands = [
    { prev: new Vector3(), cur: new Vector3(), has: false },
    { prev: new Vector3(), cur: new Vector3(), has: false },
  ];
  private shownLay = '';

  init(): void {
    const game = getGame(this.world);
    this.root.name = 'FireFx';
    this.root.visible = false;
    this.world.createTransformEntity(this.root);

    this.lay = new Group();
    this.root.add(this.lay);
    const glowDisc = new Mesh(new CircleGeometry(0.28, 16), new MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }));
    glowDisc.rotation.x = -Math.PI / 2;
    glowDisc.position.y = 0.03;
    this.glow = glowDisc;
    this.root.add(glowDisc);
    for (let i = 0; i < FLAMES; i++) {
      const m = new Mesh(new ConeGeometry(0.11 - i * 0.02, 0.45, 7, 1, true), i === 0 ? coreMat : flameMat);
      m.position.set((i - 1) * 0.07, 0.25, i === 1 ? 0.05 : -0.04);
      this.flames.push(m);
      this.root.add(m);
    }
    this.light = new PointLight(0xff8a3a, 0, 9, 2);
    this.light.position.y = 0.6;
    this.root.add(this.light);

    const geo = new BufferGeometry();
    this.sparkPos = new Float32Array(SPARKS * 3);
    geo.setAttribute('position', new BufferAttribute(this.sparkPos, 3));
    this.sparks = new Points(geo, new PointsMaterial({ color: 0xffb04a, size: 0.025, blending: AdditiveBlending, depthWrite: false, transparent: true }));
    this.sparks.frustumCulled = false;
    this.root.add(this.sparks);

    this.cleanupFuncs.push(
      game.on((e: GameEvent) => {
        if (e.type === 'structure' && e.structure.kind === 'firePit' && e.structure.complete) this.attach(e.structure.x, e.structure.z);
        if (e.type === 'fire') this.refreshLay();
      }),
      this.queries.pitPressed.subscribe('qualify', () => this.onPitPressed()),
    );
    const pit = game.structures.find((s) => s.kind === 'firePit' && s.complete);
    if (pit) this.attach(pit.x, pit.z);
  }

  private attach(x: number, z: number): void {
    this.pitPos.set(x, 0, z);
    this.root.position.set(x, 0, z);
    this.root.visible = true;
    if (!this.pitEntity) {
      const hot = new Mesh(new CircleGeometry(0.42, 16), new MeshBasicMaterial({ visible: false }));
      hot.rotation.x = -Math.PI / 2;
      hot.position.set(x, 0.05, z);
      this.pitEntity = this.world.createTransformEntity(hot);
      this.pitEntity.addComponent(FirePitSpot);
      this.pitEntity.addComponent(RayInteractable);
    }
    this.refreshLay();
  }

  /** Browser / ray tap on the pit. VR pinches reach it through the same ray. */
  private onPitPressed(): void {
    const fire = getGame(this.world).fire;
    if (fire.carrying) fire.transferEmber();
    else if (fire.embedded) fire.fan(1, 0.3);
    else if (fire.layBuilt && getGame(this.world).held === 'bowDrill') fire.stroke();
    else fire.addFuel();
  }

  private refreshLay(): void {
    const f = getGame(this.world).fire;
    const key = `${f.tinder}.${f.twigs}.${f.logs}.${f.stage}`;
    if (key === this.shownLay) return;
    this.shownLay = key;
    this.lay.clear();
    const bark = new MeshBasicMaterial({ color: 0x6b4a2b });
    const grass = new MeshBasicMaterial({ color: 0xd9c27a });
    if (f.tinder > 0) {
      const nest = new Mesh(new SphereGeometry(0.1, 8, 6), grass);
      nest.scale.y = 0.5;
      nest.position.y = 0.06;
      this.lay.add(nest);
    }
    for (let i = 0; i < Math.min(f.twigs, 6); i++) {
      const a = (i / 3) * Math.PI * 2;
      const stick = new Mesh(new ConeGeometry(0.015, 0.4, 4), bark);
      stick.position.set(Math.cos(a) * 0.08, 0.17, Math.sin(a) * 0.08);
      stick.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      this.lay.add(stick);
    }
    for (let i = 0; i < Math.min(f.logs, 4); i++) {
      const a = (i / 2) * Math.PI * 2 + 0.6;
      const log = new Mesh(new ConeGeometry(0.035, 0.5, 5), bark);
      log.position.set(Math.cos(a) * 0.18, 0.12, Math.sin(a) * 0.18);
      log.rotation.set(Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0);
      this.lay.add(log);
    }
  }

  private handsRaw(): Object3D[] {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return [];
    const out: Object3D[] = [];
    if (this.player.gripSpaces.left) out.push(this.player.gripSpaces.left);
    if (this.player.gripSpaces.right) out.push(this.player.gripSpaces.right);
    return out;
  }

  private setCarried(on: boolean): void {
    if (on && !this.carried) {
      this.carried = new Mesh(new SphereGeometry(0.018, 8, 6), emberMat);
      this.carried.position.set(0, 0, -0.08);
      (this.player.gripSpaces.right ?? this.camera).add(this.carried);
      if (!this.player.gripSpaces.right) this.carried.position.set(0.2, -0.25, -0.5);
    } else if (!on && this.carried) {
      this.carried.removeFromParent();
      this.carried = null;
    }
  }

  update(delta: number): void {
    if (!this.pitEntity || delta <= 0) return;
    const game = getGame(this.world);
    const fire = game.fire;
    this.t += delta;
    this.setCarried(fire.carrying);
    if (this.carried) emberMat.color.setHex(Math.sin(this.t * 14) > 0 ? 0xff7a28 : 0xff4a10);

    // Hand motion: sawing (drill in hand, near the pit) and fanning (empty hand over embedded ember).
    const grips = this.handsRaw();
    for (let i = 0; i < grips.length; i++) {
      const h = this.hands[i];
      grips[i].getWorldPosition(h.cur);
      if (h.has) {
        const dist = h.cur.distanceTo(h.prev);
        const dx = h.cur.x - this.pitPos.x;
        const dz = h.cur.z - this.pitPos.z;
        const near = Math.hypot(dx, dz);
        if (fire.carrying && near < TRANSFER_RADIUS && h.cur.y < 0.9) fire.transferEmber();
        else if (near < WORK_RADIUS && dist < 0.5) {
          if (game.held === 'bowDrill' && h.cur.y < 1.2) fire.saw(dist, delta);
          else if (fire.embedded && near < 0.8 && h.cur.y > 0.2 && h.cur.y < 1.1 && dist / delta >= FAN_MIN_SPEED) {
            fire.fan(Math.min(1, dist / delta / 2), delta);
          }
        }
      }
      h.prev.copy(h.cur);
      h.has = true;
    }
    for (let i = grips.length; i < 2; i++) this.hands[i].has = false;

    this.animate(delta, fire.intensity, fire.embedded, fire.heat);
  }

  private animate(delta: number, intensity: number, embedded: boolean, heat: number): void {
    const burning = intensity > 0.5;
    for (let i = 0; i < FLAMES; i++) {
      const f = this.flames[i];
      f.visible = burning || embedded;
      const flick = 0.85 + Math.sin(this.t * (9 + i * 3) + i) * 0.15;
      f.scale.set(1, Math.max(0.05, intensity * 1.6 * flick), 1);
      f.position.y = 0.05 + 0.22 * f.scale.y;
    }
    this.glow.visible = embedded || burning || heat > 0.15;
    (this.glow.material as MeshBasicMaterial).opacity = 0.25 + Math.max(intensity, heat * 0.5) * 0.5 + Math.sin(this.t * 7) * 0.05;
    this.light.intensity = burning ? 2.2 * intensity * (0.9 + Math.sin(this.t * 17) * 0.1) : 0;

    // Sparks: cap at SPARKS; emit while burning.
    let spawn = burning ? 6 * delta : 0;
    for (let i = 0; i < SPARKS; i++) {
      const o = i * 3;
      if (this.sparkLife[i] > 0) {
        this.sparkLife[i] -= delta;
        this.sparkPos[o] += this.sparkVel[o] * delta;
        this.sparkPos[o + 1] += this.sparkVel[o + 1] * delta;
        this.sparkPos[o + 2] += this.sparkVel[o + 2] * delta;
      } else if (spawn > 0 && Math.random() < spawn) {
        spawn = 0;
        this.sparkLife[i] = 0.8 + Math.random() * 0.8;
        this.sparkPos[o] = (Math.random() - 0.5) * 0.15;
        this.sparkPos[o + 1] = 0.3;
        this.sparkPos[o + 2] = (Math.random() - 0.5) * 0.15;
        this.sparkVel[o] = (Math.random() - 0.5) * 0.3;
        this.sparkVel[o + 1] = 0.5 + Math.random() * 0.6;
        this.sparkVel[o + 2] = (Math.random() - 0.5) * 0.3;
      } else {
        this.sparkPos[o + 1] = -10; // park dead sparks out of sight
      }
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
  }
}
