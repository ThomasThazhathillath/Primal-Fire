// The fire in the pit: fuel hotspot, bow-drill sawing and open-palm fanning
// read from hand motion, the carried ember, and the flame effects (a few
// pooled meshes + 24 ember sparks + one light; nothing allocates per frame).
// Browser fallback: tap the pit to add fuel / saw a stroke / fan a puff.

import { roundPoints } from './round-points.js';
import {
  AdditiveBlending,
  BufferAttribute,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
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
  TorusGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { GameEvent } from '../game/game.js';
import { FirePitSpot } from '../components/game-components.js';
import { flameGeometry, flameMaterial, glowMaterial, smokeMaterial } from './fire-fx.js';
import { bowSlide, BowDrillMotion, DRILL, drillSmokeRate, drillSpin, fanLean, fanStrength, Reciprocation, RIG, SawAxis } from '../game/gestures.js';
import { hands } from './hand-input-system.js';
import { getGame, getUi, handClaims } from './shared.js';

const SPARKS = 24;
const FLAMES = 4;
const SMOKE = 8;
/** Hand must be this close (m, horizontal) to the pit to saw, fan or drop the ember. */
const WORK_RADIUS = 1.2;
const TRANSFER_RADIUS = 0.45;

const emberMat = new MeshBasicMaterial({ color: 0xff6a1a });

/** Seconds the first fire takes to grow from a flicker to full flame. */
const FIRST_FIRE_GROW = 10;

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
  /** The first fire grows from ember to full over FIRST_FIRE_GROW seconds (story: the first victory). 1 = full. */
  private growth = 1;
  private sparks!: Points;
  private sparkPos!: Float32Array;
  private sparkVel = new Float32Array(SPARKS * 3);
  private sparkLife = new Float32Array(SPARKS);
  private carried: Mesh | null = null;
  // The bow-drill rig: a board on the ground at the pit, a spindle that spins with the stroke, a bow that slides with the hand.
  private rig = new Group();
  private spinner = new Group();
  private bow = new Group();
  private dust!: Mesh;
  private boardG = new Group();
  private axis = new SawAxis();
  private rigOn = false;
  private rigHold = 0;
  private heldHidden = false;
  private rigWorld = new Vector3();
  private spinRate = 0;
  private spinAngle = 0;
  private kick = 0;
  private wasCarrying = false;
  /** Smoke and sparks lean with the fanning hand's sweep (m/s). */
  private lean = { x: 0, z: 0 };
  private t = 0;
  private shownLay = '';

  init(): void {
    const game = getGame(this.world);
    this.root.name = 'FireFx';
    this.root.visible = false;
    this.world.createTransformEntity(this.root);
    {
      const game = getGame(this.world);
      this.cleanupFuncs.push(
        game.on((e) => {
          // Only the very first ignition (the story beat has not been told yet): later fires light as before.
          if (e.type === 'fire' && e.stage === 'burning' && this.growth >= 1 && !game.story.seen.has('fireLit')) this.growth = 0;
        }),
      );
    }

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
    this.sparks = new Points(geo, roundPoints(new PointsMaterial({ color: 0xffa040, size: 0.012, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 })));
    this.sparks.frustumCulled = false;
    this.root.add(this.sparks);

    this.buildRig();
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
    else if (fire.layBuilt && getGame(this.world).held === 'bowDrill') {
      fire.stroke();
      this.kick = 1;
    }
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

  /** The bow-drill rig, built once: board, spindle with a visible flute, bow with its string, and a glowing dust heap. */
  private buildRig(): void {
    const wood = new MeshBasicMaterial({ color: 0x9a7650 });
    const dark = new MeshBasicMaterial({ color: 0x3a2a1c });
    const stick = new MeshBasicMaterial({ color: 0xc49a66 });
    const green = new MeshBasicMaterial({ color: 0x6a8a3a });
    const cord = new MeshBasicMaterial({ color: 0xe8dcc0 });
    this.rig.name = 'BowDrillRig';
    this.rig.visible = false;
    const board = new Mesh(new BoxGeometry(0.3, 0.022, 0.1), wood);
    board.position.y = 0.011;
    const notch = new Mesh(new BoxGeometry(0.03, 0.004, 0.03), dark);
    notch.position.y = 0.023;
    // The spindle turns about its own axis; a dark flute along it makes the spin visible.
    const rod = new Mesh(new CylinderGeometry(0.011, 0.011, 0.26, 10), stick);
    rod.position.y = 0.15;
    const flute = new Mesh(new BoxGeometry(0.005, 0.2, 0.005), dark);
    flute.position.set(0.011, 0.15, 0);
    this.spinner.add(rod, flute);
    // The bow: a green arc and a cord chord that always passes through the spindle (local Z is the sawing axis).
    const R = 0.34;
    const arc = (0.5 * Math.PI);
    const chord = 2 * R * Math.sin(arc / 2);
    const torus = new Mesh(new TorusGeometry(R, 0.007, 6, 18, arc), green);
    const p1 = new Group();
    p1.rotation.z = -arc / 2;
    p1.add(torus);
    const p2 = new Group();
    p2.rotation.x = -Math.PI / 2;
    p2.position.x = -R * Math.cos(arc / 2);
    p2.add(p1);
    const string = new Mesh(new CylinderGeometry(0.0025, 0.0025, chord, 4), cord);
    string.rotation.x = Math.PI / 2;
    this.bow.add(p2, string);
    this.bow.position.y = 0.14;
    this.dust = new Mesh(new SphereGeometry(0.014, 8, 6), emberMat);
    this.dust.position.set(0, 0.03, 0);
    this.dust.visible = false;
    this.boardG.add(board, notch);
    this.rig.add(this.boardG, this.spinner, this.bow, this.dust);
    this.root.add(this.rig);
  }

  /** Put the rig on the ground at the pit, on the side facing you; the bow starts across your view. */
  private activateRig(): void {
    this.camera.getWorldPosition(this.eye);
    let dx = this.eye.x - this.pitPos.x;
    let dz = this.eye.z - this.pitPos.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    this.rig.position.set(dx * 0.55, 0, dz * 0.55);
    this.rigWorld.set(this.pitPos.x + dx * 0.55, 0, this.pitPos.z + dz * 0.55);
    this.axis.set(-dz, dx);
    this.boardG.rotation.y = Math.atan2(-this.axis.z, this.axis.x);
    this.rig.visible = true;
    this.rigOn = true;
    this.spinRate = 0;
    // The held bow drill is now the bow on the rig: hide the copy in the hand.
    getUi(this.world).setHeldVisible?.(false);
    this.heldHidden = true;
  }

  private deactivateRig(): void {
    this.rig.visible = false;
    this.rigOn = false;
    this.spinRate = 0;
    if (this.heldHidden) {
      getUi(this.world).setHeldVisible?.(true);
      this.heldHidden = false;
    }
  }

  /** Spin the spindle with the bow's travel; the dust heap glows with the heat. */
  private updateRig(delta: number, bowSpeed: number, heat: number, carrying: boolean): void {
    const target = drillSpin(bowSpeed);
    this.spinRate += (target - this.spinRate) * Math.min(1, delta * 20);
    this.spinAngle += this.spinRate * delta;
    this.spinner.rotation.y = this.spinAngle;
    const glow = carrying ? 1 : heat;
    this.dust.visible = glow > 0.2;
    if (this.dust.visible) {
      this.dust.scale.setScalar(0.5 + glow * 1.2);
      emberMat.color.setHex(Math.sin(this.t * 14) > 0 ? 0xff7a28 : 0xff4a10);
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
    if (driving && !this.rigOn) this.activateRig();
    // The ember just appeared: the rig stays a moment with its dust glowing, then the bow goes back to your hand.
    if (fire.carrying && !this.wasCarrying && this.rigOn) this.rigHold = 1.2;
    this.wasCarrying = fire.carrying;
    if (this.rigHold > 0) this.rigHold -= delta;
    if (this.rigOn && !driving && this.rigHold <= 0) this.deactivateRig();
    let fanning = false;
    let fanVx = 0;
    let fanVz = 0;
    let bowSpeed = 0; // signed travel of the bow along its length this frame, m/s
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
        // The bow hand must be over the board: the rig is where the work happens.
        const atRig = Math.hypot(h.pos.x - this.rigWorld.x, h.pos.z - this.rigWorld.z);
        if (atRig < RIG.reach && h.pos.y < 1.2) {
          const other = hands[1 - i];
          const steadyDist = other.tracked ? Math.hypot(other.pos.x - this.rigWorld.x, other.pos.z - this.rigWorld.z) : Infinity;
          const k = this.drill.update(delta, h.motion.vel.x, h.motion.vel.z, steadyDist, other.motion.speed);
          const dist = Math.min(h.motion.speed, DRILL.maxSpeed) * delta;
          fire.saw(dist, delta, k);
          this.axis.update(delta, h.motion.vel.x, h.motion.vel.z);
          bowSpeed = this.axis.along(h.motion.vel.x, h.motion.vel.z);
          // The bow slides with the hand along the line of the stroke.
          const off = bowSlide((h.pos.x - this.rigWorld.x) * this.axis.x + (h.pos.z - this.rigWorld.z) * this.axis.z);
          this.bow.position.set(this.axis.x * off, Math.min(0.3, Math.max(0.1, h.pos.y)), this.axis.z * off);
          this.bow.rotation.y = Math.atan2(this.axis.x, this.axis.z);
        } else this.drill.reset();
      } else if (fire.embedded && game.held !== 'bowDrill' && near < 0.8 && h.pos.y > 0.2 && h.pos.y < 1.1) {
        const r = this.fans[i].update(delta, h.motion.vel.x, h.motion.vel.y, h.motion.vel.z);
        const strength = fanStrength(h.motion.speed, r);
        if (strength > 0) {
          fire.fan(strength, delta);
          fanning = true;
          fanVx = h.motion.vel.x;
          fanVz = h.motion.vel.z;
        }
      } else this.fans[i].reset();
    }
    if (!driving) this.drill.reset();
    fanLean(this.lean, delta, fanVx, fanVz, fanning);
    // Browser: a click is one stroke, shown as a quick spin of the spindle.
    if (this.kick > 0) {
      this.kick = Math.max(0, this.kick - delta * 3);
      bowSpeed = (Math.sin(this.t * 40) > 0 ? 1 : -1) * 0.5 * this.kick;
    }
    if (this.rigOn) this.updateRig(delta, bowSpeed, fire.heat, fire.carrying);

    this.animate(delta, fire.intensity, fire.embedded, fire.heat);
  }

  private animate(delta: number, intensity: number, embedded: boolean, heat: number): void {
    const burning = intensity > 0.5;
    // Flames turn to face you around the vertical axis (cheap billboarding).
    this.camera.getWorldPosition(this.eye);
    const yaw = Math.atan2(this.eye.x - this.pitPos.x, this.eye.z - this.pitPos.z);
    if (this.growth < 1) this.growth = Math.min(1, this.growth + delta / FIRST_FIRE_GROW);
    // Eased: a small tongue of flame, then it takes hold.
    const grow = this.growth * this.growth * (3 - 2 * this.growth);
    const flameLevel = burning ? intensity * (0.3 + 0.7 * grow) : embedded ? 0.25 : 0;
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
    this.light.intensity = burning ? 2.4 * (1 + 0.5 * getGame(this.world).env.night) * intensity * (0.25 + 0.75 * grow) * (0.82 + 0.1 * Math.sin(this.t * 11.3) + 0.06 * Math.sin(this.t * 23.7 + 1.3) + 0.04 * Math.sin(this.t * 37.1)) : embedded ? 0.4 : 0;

    // Smoke: thick while it smoulders, thinner once it burns cleanly.
    // The first fire sends up a thicker column while it takes hold.
    const ownRate = embedded && !burning ? 3 : burning ? 1.4 * (1 + 1.6 * (1 - grow)) : heat > 0.3 ? heat * 2 : 0;
    // Sawing smokes at the drilled board as soon as the spindle turns fast enough.
    const drillRate = this.rigOn ? drillSmokeRate(this.spinRate, heat) : 0;
    const fromRig = drillRate > ownRate;
    const smokeRate = Math.max(ownRate, drillRate);
    let spawnSmoke = smokeRate * delta;
    for (let i = 0; i < SMOKE; i++) {
      const m = this.smoke[i];
      const u = this.smokeMats[i].uniforms;
      if (this.smokeLife[i] > 0) {
        this.smokeLife[i] -= delta;
        const age = 1 - this.smokeLife[i] / 3.5;
        m.position.x += (this.smokeVel[i * 2] + this.lean.x) * delta;
        m.position.z += (this.smokeVel[i * 2 + 1] + this.lean.z) * delta;
        m.position.y += (0.35 + age * 0.2) * delta;
        m.scale.setScalar(0.5 + age * 2.2);
        m.rotation.y = yaw;
        u.uTime.value = this.t;
        u.uAlpha.value = Math.sin(Math.min(1, age) * Math.PI) * 0.8;
        m.visible = this.smokeLife[i] > 0;
      } else if (spawnSmoke > 0 && Math.random() < spawnSmoke) {
        spawnSmoke = 0;
        this.smokeLife[i] = 3.5;
        if (fromRig) m.position.set(this.rig.position.x + (Math.random() - 0.5) * 0.03, 0.05, this.rig.position.z + (Math.random() - 0.5) * 0.03);
        else m.position.set((Math.random() - 0.5) * 0.1, burning ? 0.55 : 0.15, (Math.random() - 0.5) * 0.1);
        this.smokeVel[i * 2] = (Math.random() - 0.5) * 0.08 + 0.05; // a light drift downwind
        this.smokeVel[i * 2 + 1] = (Math.random() - 0.5) * 0.08;
        m.visible = true;
      } else {
        m.visible = false;
      }
    }

    // Sparks: cap at SPARKS; emit while burning.
    // A fanned ember throws sparks too, leaning the way the hand sweeps.
    const leaning = Math.hypot(this.lean.x, this.lean.z) > 0.12;
    let spawn = burning ? 4 * delta : embedded && leaning ? 5 * delta : 0;
    for (let i = 0; i < SPARKS; i++) {
      const o = i * 3;
      if (this.sparkLife[i] > 0) {
        this.sparkLife[i] -= delta;
        // Embers ride the hot air and wander as they cool.
        this.sparkVel[o] += Math.sin(this.t * 3 + i) * 0.1 * delta + (this.lean.x * 1.6 - this.sparkVel[o]) * Math.min(1, delta * 2) * Math.min(1, Math.hypot(this.lean.x, this.lean.z) * 4);
        this.sparkVel[o + 2] += (this.lean.z * 1.6 - this.sparkVel[o + 2]) * Math.min(1, delta * 2) * Math.min(1, Math.hypot(this.lean.x, this.lean.z) * 4);
        this.sparkPos[o] += this.sparkVel[o] * delta;
        this.sparkPos[o + 1] += this.sparkVel[o + 1] * delta;
        this.sparkPos[o + 2] += this.sparkVel[o + 2] * delta;
      } else if (spawn > 0 && Math.random() < spawn) {
        spawn = 0;
        this.sparkLife[i] = 1.2 + Math.random() * 1.6;
        this.sparkPos[o] = (Math.random() - 0.5) * 0.12;
        this.sparkPos[o + 1] = embedded && !burning ? 0.1 + Math.random() * 0.08 : 0.25 + Math.random() * 0.2;
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
