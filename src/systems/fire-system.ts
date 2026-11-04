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
  PlaneGeometry,
  type ShaderMaterial,
  SphereGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { GameEvent } from '../game/game.js';
import { FirePitSpot } from '../components/game-components.js';
import { flameGeometry, flameMaterial, glowMaterial, smokeMaterial } from './fire-fx.js';
import { BowDrillMotion, DRILL, fanStrength, Reciprocation } from '../game/gestures.js';
import { hands } from './hand-input-system.js';
import { getGame, handClaims } from './shared.js';

const SPARKS = 24;
const FLAMES = 4;
const SMOKE = 8;
/** Hand must be this close (m, horizontal) to the pit to saw, fan or drop the ember. */
const WORK_RADIUS = 1.2;
const TRANSFER_RADIUS = 0.45;

const emberMat = new MeshBasicMaterial({ color: 0xff6a1a });

export class FireSystem extends createSystem({
  pitPressed: { required: [FirePitSpot, Pressed] },
}) {
  private drill = new BowDrillMotion();
  private fans = [new Reciprocation(), new Reciprocation()];
  private root = new Group();
  private pitEntity: Entity | null = null;
  private pitPos = new Vector3();
  private flames: Mesh[] = [];
  private flameMats: ShaderMaterial[] = [];
  private smoke: Mesh[] = [];
  private smokeMats: ShaderMaterial[] = [];
  private smokeLife = new Float32Array(SMOKE);
  private smokeVel = new Float32Array(SMOKE * 2);
  private glowMat = glowMaterial();
  private eye = new Vector3();
  private lay!: Group;
  private glow!: Mesh;
  private light!: PointLight;
  private sparks!: Points;
  private sparkPos!: Float32Array;
  private sparkVel = new Float32Array(SPARKS * 3);
  private sparkLife = new Float32Array(SPARKS);
  private carried: Mesh | null = null;
  private t = 0;
  private shownLay = '';

  init(): void {
    const game = getGame(this.world);
    this.root.name = 'FireFx';
    this.root.visible = false;
    this.world.createTransformEntity(this.root);

    this.lay = new Group();
    this.root.add(this.lay);
    const glowDisc = new Mesh(new PlaneGeometry(1.4, 1.4), this.glowMat);
    glowDisc.rotation.x = -Math.PI / 2;
    glowDisc.position.y = 0.025;
    this.glow = glowDisc;
    this.root.add(glowDisc);
    // Flame tongues: two wide outer layers and two hot narrow cores, each with its own noise seed.
    const outer = flameGeometry(0.46, 0.75);
    const inner = flameGeometry(0.3, 0.5);
    for (let i = 0; i < FLAMES; i++) {
      const core = i >= 2;
      const mat = flameMaterial(i * 3.7 + 1.3, core);
      const m = new Mesh(core ? inner : outer, mat);
      m.position.set((i % 2 ? 1 : -1) * 0.04, 0.04, (i % 2 ? -1 : 1) * 0.03);
      m.renderOrder = core ? 3 : 2;
      m.frustumCulled = false;
      this.flames.push(m);
      this.flameMats.push(mat);
      this.root.add(m);
    }
    const puff = new PlaneGeometry(0.4, 0.4);
    for (let i = 0; i < SMOKE; i++) {
      const mat = smokeMaterial(i * 5.1);
      const m = new Mesh(puff, mat);
      m.visible = false;
      m.renderOrder = 1;
      this.smoke.push(m);
      this.smokeMats.push(mat);
      this.root.add(m);
    }
    this.light = new PointLight(0xff8a3a, 0, 14, 1.6);
    this.light.position.y = 0.6;
    this.root.add(this.light);

    const geo = new BufferGeometry();
    this.sparkPos = new Float32Array(SPARKS * 3);
    geo.setAttribute('position', new BufferAttribute(this.sparkPos, 3));
    this.sparks = new Points(geo, new PointsMaterial({ color: 0xffa040, size: 0.012, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
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

    // Hand motion (filtered, once a frame in HandInputSystem): the bow hand saws back and forth while the
    // other hand steadies the spindle; an empty hand waved over an embedded ember fans it.
    const vr = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    const driving = game.held === 'bowDrill' && fire.layBuilt && fire.stage === 'lay' && !fire.carrying;
    for (let i = 0; i < 2 && vr; i++) {
      const h = hands[i];
      if (!h.tracked) {
        this.fans[i].reset();
        continue;
      }
      const near = Math.hypot(h.pos.x - this.pitPos.x, h.pos.z - this.pitPos.z);
      if (fire.carrying && near < TRANSFER_RADIUS && h.pos.y < 0.9) {
        fire.transferEmber();
        continue;
      }
      const bowHand = driving && i === handClaims.holdHand;
      if (bowHand) {
        if (near < WORK_RADIUS && h.pos.y < 1.2) {
          const other = hands[1 - i];
          const steadyDist = other.tracked ? Math.hypot(other.pos.x - this.pitPos.x, other.pos.z - this.pitPos.z) : Infinity;
          const k = this.drill.update(delta, h.motion.vel.x, h.motion.vel.z, steadyDist, other.motion.speed);
          const dist = Math.min(h.motion.speed, DRILL.maxSpeed) * delta;
          fire.saw(dist, delta, k);
        } else this.drill.reset();
      } else if (fire.embedded && game.held !== 'bowDrill' && near < 0.8 && h.pos.y > 0.2 && h.pos.y < 1.1) {
        const r = this.fans[i].update(delta, h.motion.vel.x, h.motion.vel.y, h.motion.vel.z);
        const strength = fanStrength(h.motion.speed, r);
        if (strength > 0) fire.fan(strength, delta);
      } else this.fans[i].reset();
    }
    if (!driving) this.drill.reset();

    this.animate(delta, fire.intensity, fire.embedded, fire.heat);
  }

  private animate(delta: number, intensity: number, embedded: boolean, heat: number): void {
    const burning = intensity > 0.5;
    // Flames turn to face you around the vertical axis (cheap billboarding).
    this.camera.getWorldPosition(this.eye);
    const yaw = Math.atan2(this.eye.x - this.pitPos.x, this.eye.z - this.pitPos.z);
    const flameLevel = burning ? intensity : embedded ? 0.25 : 0;
    for (let i = 0; i < FLAMES; i++) {
      const f = this.flames[i];
      f.visible = flameLevel > 0;
      f.rotation.y = yaw + (i - 1.5) * 0.35;
      const u = this.flameMats[i].uniforms;
      u.uTime.value = this.t * (1 + i * 0.07);
      u.uIntensity.value = Math.min(1, flameLevel * (0.85 + 0.15 * Math.sin(this.t * (5.3 + i) + i)));
      const size = 0.45 + flameLevel * 0.75;
      f.scale.set(size, size * (0.9 + 0.12 * Math.sin(this.t * 3.1 + i * 2)), size);
    }
    const glowLevel = Math.max(flameLevel, heat * 0.4, embedded ? 0.35 : 0);
    this.glow.visible = glowLevel > 0.02;
    this.glowMat.uniforms.uIntensity.value = glowLevel * (0.55 + 0.08 * Math.sin(this.t * 7.1) + 0.05 * Math.sin(this.t * 13.7));
    // Firelight: layered flicker so it never pulses like a metronome.
    this.light.intensity = burning ? 2.4 * intensity * (0.82 + 0.1 * Math.sin(this.t * 11.3) + 0.06 * Math.sin(this.t * 23.7 + 1.3) + 0.04 * Math.sin(this.t * 37.1)) : embedded ? 0.4 : 0;

    // Smoke: thick while it smoulders, thinner once it burns cleanly.
    const smokeRate = embedded && !burning ? 3 : burning ? 1.4 : heat > 0.3 ? heat * 2 : 0;
    let spawnSmoke = smokeRate * delta;
    for (let i = 0; i < SMOKE; i++) {
      const m = this.smoke[i];
      const u = this.smokeMats[i].uniforms;
      if (this.smokeLife[i] > 0) {
        this.smokeLife[i] -= delta;
        const age = 1 - this.smokeLife[i] / 3.5;
        m.position.x += this.smokeVel[i * 2] * delta;
        m.position.z += this.smokeVel[i * 2 + 1] * delta;
        m.position.y += (0.35 + age * 0.2) * delta;
        m.scale.setScalar(0.5 + age * 2.2);
        m.rotation.y = yaw;
        u.uTime.value = this.t;
        u.uAlpha.value = Math.sin(Math.min(1, age) * Math.PI) * 0.8;
        m.visible = this.smokeLife[i] > 0;
      } else if (spawnSmoke > 0 && Math.random() < spawnSmoke) {
        spawnSmoke = 0;
        this.smokeLife[i] = 3.5;
        m.position.set((Math.random() - 0.5) * 0.1, burning ? 0.55 : 0.15, (Math.random() - 0.5) * 0.1);
        this.smokeVel[i * 2] = (Math.random() - 0.5) * 0.08 + 0.05; // a light drift downwind
        this.smokeVel[i * 2 + 1] = (Math.random() - 0.5) * 0.08;
        m.visible = true;
      } else {
        m.visible = false;
      }
    }

    // Sparks: cap at SPARKS; emit while burning.
    let spawn = burning ? 4 * delta : 0;
    for (let i = 0; i < SPARKS; i++) {
      const o = i * 3;
      if (this.sparkLife[i] > 0) {
        this.sparkLife[i] -= delta;
        // Embers ride the hot air and wander as they cool.
        this.sparkVel[o] += Math.sin(this.t * 3 + i) * 0.1 * delta;
        this.sparkPos[o] += this.sparkVel[o] * delta;
        this.sparkPos[o + 1] += this.sparkVel[o + 1] * delta;
        this.sparkPos[o + 2] += this.sparkVel[o + 2] * delta;
      } else if (spawn > 0 && Math.random() < spawn) {
        spawn = 0;
        this.sparkLife[i] = 1.2 + Math.random() * 1.6;
        this.sparkPos[o] = (Math.random() - 0.5) * 0.12;
        this.sparkPos[o + 1] = 0.25 + Math.random() * 0.2;
        this.sparkPos[o + 2] = (Math.random() - 0.5) * 0.12;
        this.sparkVel[o] = (Math.random() - 0.5) * 0.15;
        this.sparkVel[o + 1] = 0.35 + Math.random() * 0.45;
        this.sparkVel[o + 2] = (Math.random() - 0.5) * 0.15;
      } else {
        this.sparkPos[o + 1] = -10; // park dead sparks out of sight
      }
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
  }
}
