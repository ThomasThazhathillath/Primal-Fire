// The weather side of Chapter 2 (rules in game/shelter.ts): during the rain test it shows where the
// roof leaks (drips falling from the thin panels, wet patches and splashes on the floor), the
// water standing on the floor when there is no channel, and water running in a dug channel. It also
// wets the shelter's wood and leaves, and darkens and quietens things while you are inside.
// Everything is pooled: 3 wet patches, one flood disc, 24 drip points, 6 splash rings.

import { roundPoints } from './round-points.js';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  createSystem,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
} from '@iwsdk/core';
import { type PlacedStructure } from '../game/blueprint.js';
import { leakingPanels, panelCentre, PANELS } from '../game/shelter.js';
import { shelterMaterial } from '../scene-assets/leanto.js';
import { groundHeight } from '../game/world-layout.js';
import { getGame } from './shared.js';

const DROPS = 24;
const SPLASHES = 6;
const FLOOR = 0.035;

export class ShelterSystem extends createSystem({}) {
  private root = new Group();
  private patches: Mesh[] = [];
  private patchLevel = new Float32Array(PANELS);
  private flood!: Mesh;
  private drips!: Points;
  private dripPos = new Float32Array(DROPS * 3);
  private dripVel = new Float32Array(DROPS);
  private dripOn = new Uint8Array(DROPS);
  private dripPanel = new Int8Array(DROPS).fill(-1);
  private splashes: Mesh[] = [];
  private splashAge = new Float32Array(SPLASHES).fill(-1);
  private nextSplash = 0;
  private shelter: PlacedStructure | null = null;
  private scan = 0;
  private spawnT = 0;
  private waterT = 0;
  private cos = 1;
  private sin = 0;

  init(): void {
    this.root.name = 'ShelterWeather';
    this.world.createTransformEntity(this.root);
    const wet = new MeshBasicMaterial({ color: 0x1b1a17, transparent: true, opacity: 0, depthWrite: false });
    for (let p = 0; p < PANELS; p++) {
      const patch = new Mesh(new CircleGeometry(0.36, 14), wet.clone());
      patch.rotation.x = -Math.PI / 2;
      patch.visible = false;
      this.root.add(patch);
      this.patches.push(patch);
    }
    this.flood = new Mesh(new CircleGeometry(1, 20), new MeshBasicMaterial({ color: 0x5f7f92, transparent: true, opacity: 0.55, depthWrite: false }));
    this.flood.rotation.x = -Math.PI / 2;
    this.flood.visible = false;
    this.root.add(this.flood);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.dripPos, 3));
    this.drips = new Points(geo, roundPoints(new PointsMaterial({ color: 0xbfe3f5, size: 0.035, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending })));
    this.drips.frustumCulled = false;
    this.drips.visible = false;
    for (let i = 0; i < DROPS; i++) this.dripPos[i * 3 + 1] = -10;
    this.root.add(this.drips);
    const ringGeo = new RingGeometry(0.05, 0.07, 14);
    for (let i = 0; i < SPLASHES; i++) {
      const r = new Mesh(ringGeo, new MeshBasicMaterial({ color: 0xcfeaf7, transparent: true, opacity: 0.8, depthWrite: false, side: DoubleSide }));
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      this.root.add(r);
      this.splashes.push(r);
    }
  }

  /** Local shelter frame to world, using the cached rotation of the structure. */
  private toWorld(x: number, z: number, out: { x: number; z: number }): void {
    const s = this.shelter!;
    out.x = s.x + x * this.cos + z * this.sin;
    out.z = s.z - x * this.sin + z * this.cos;
  }
  private tmp = { x: 0, z: 0 };

  private splash(x: number, y: number, z: number): void {
    const i = this.nextSplash;
    this.nextSplash = (i + 1) % SPLASHES;
    this.splashes[i].position.set(x, y + 0.01, z);
    this.splashAge[i] = 0;
    this.splashes[i].visible = true;
  }

  update(delta: number): void {
    const game = getGame(this.world);
    const dt = Math.min(delta, 0.05);
    // Which shelter and how it stands: rescanned a couple of times a second.
    if ((this.scan -= dt) <= 0) {
      this.scan = 0.5;
      this.shelter = game.leanTo();
      if (this.shelter) {
        this.cos = Math.cos(this.shelter.rotY);
        this.sin = Math.sin(this.shelter.rotY);
      }
    }
    const s = this.shelter;
    const env = game.env;
    // Wet wood and leaves look darker; they dry again with the weather.
    const c = 1 - Math.min(0.3, env.wet * 0.35 + env.rain * 0.1);
    shelterMaterial.color.setRGB(c, c, c * 1.02);
    // Inside the roof: darker light, quieter rain (the light and sound systems read shelterShade).
    const inShelter = !!s && game.insideShelter(game.player.x, game.player.z);
    game.shelterShade += ((inShelter ? 1 : 0) - game.shelterShade) * Math.min(1, dt * 2.5);
    const raining = game.shelterTest.raining;
    if (!s || !raining) {
      this.drips.visible = false;
      for (const p of this.patches) p.visible = false;
      this.flood.visible = game.shelterTest.flood > 0.02 && !!s;
      if (!s) return;
    }
    const leaks = raining ? leakingPanels(s) : [];
    // Wet patches grow under leaking panels and fade when sealed.
    for (let p = 0; p < PANELS; p++) {
      const on = leaks.includes(p);
      this.patchLevel[p] = Math.max(0, Math.min(1, this.patchLevel[p] + (on ? 0.25 : -0.35) * dt));
      const patch = this.patches[p];
      patch.visible = this.patchLevel[p] > 0.01;
      if (patch.visible) {
        const pc = panelCentre(p);
        this.toWorld(pc.x, pc.z, this.tmp);
        patch.position.set(this.tmp.x, groundHeight(this.tmp.x, this.tmp.z) + FLOOR, this.tmp.z);
        patch.scale.setScalar(0.5 + this.patchLevel[p] * 0.7);
        (patch.material as MeshBasicMaterial).opacity = 0.55 * this.patchLevel[p];
      }
    }
    // Standing water on the floor when there is no channel; it drains once there is one.
    const fl = game.shelterTest.flood;
    this.flood.visible = fl > 0.02;
    if (this.flood.visible) {
      this.toWorld(0.05, -0.15, this.tmp);
      this.flood.position.set(this.tmp.x, groundHeight(this.tmp.x, this.tmp.z) + FLOOR + 0.005, this.tmp.z);
      this.flood.scale.set(0.25 + fl * 0.85, 0.25 + fl * 1.1, 1);
    }
    // Drips from every leaking panel.
    this.drips.visible = leaks.length > 0;
    if (leaks.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 0.14 / leaks.length;
        for (let i = 0; i < DROPS; i++) {
          if (this.dripOn[i]) continue;
          const p = leaks[Math.floor(Math.random() * leaks.length)];
          const pc = panelCentre(p);
          this.toWorld(pc.x + (Math.random() - 0.5) * 0.4, pc.z + (Math.random() - 0.5) * 0.5, this.tmp);
          // Start at the underside of the roof there (the rib line height).
          const y = groundHeight(this.tmp.x, this.tmp.z) + 0.75 + (Math.random() - 0.5) * 0.15;
          this.dripPos[i * 3] = this.tmp.x;
          this.dripPos[i * 3 + 1] = y;
          this.dripPos[i * 3 + 2] = this.tmp.z;
          this.dripVel[i] = 0;
          this.dripOn[i] = 1;
          this.dripPanel[i] = p;
          break;
        }
      }
    }
    for (let i = 0; i < DROPS; i++) {
      if (!this.dripOn[i]) continue;
      this.dripVel[i] += 9.8 * dt;
      this.dripPos[i * 3 + 1] -= this.dripVel[i] * dt;
      const gy = groundHeight(this.dripPos[i * 3], this.dripPos[i * 3 + 2]) + FLOOR;
      if (this.dripPos[i * 3 + 1] <= gy) {
        this.splash(this.dripPos[i * 3], gy, this.dripPos[i * 3 + 2]);
        this.dripPos[i * 3 + 1] = -10;
        this.dripOn[i] = 0;
      }
    }
    this.drips.geometry.attributes.position.needsUpdate = true;
    for (let i = 0; i < SPLASHES; i++) {
      if (this.splashAge[i] < 0) continue;
      this.splashAge[i] += dt;
      const k = this.splashAge[i] / 0.35;
      if (k >= 1) {
        this.splashAge[i] = -1;
        this.splashes[i].visible = false;
        continue;
      }
      this.splashes[i].scale.setScalar(0.6 + k * 2);
      (this.splashes[i].material as MeshBasicMaterial).opacity = 0.8 * (1 - k);
    }
    // Water running in the dug channel while it rains.
    if ((this.waterT -= dt) <= 0) {
      this.waterT = 0.5;
      const w = this.world.scene.getObjectByName('DrainWater');
      if (w) w.visible = raining;
    }
  }
}
