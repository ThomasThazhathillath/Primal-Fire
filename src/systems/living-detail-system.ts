// Small living details, all cheap (a few draw calls, no per-frame allocation):
// - what is stored on the drying rack, the woodstack and in the basket is drawn: one InstancedMesh of boxes
//   (colour per instance), rebuilt only when a store changes;
// - insects: fireflies drift and blink around you at night (one additive Points), and gnats hang in small
//   clouds above the stream by day when it is dry (one Points).

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  createSystem,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { ITEMS, type ItemId } from '../game/items.js';
import { STREAM, groundHeight } from '../game/world-layout.js';
import { getGame } from './shared.js';

const MAX_GOODS = 200;
const FIREFLIES = 36;
const GNAT_CLOUDS = 3;
const GNATS_PER_CLOUD = 8;
const GNATS = GNAT_CLOUDS * GNATS_PER_CLOUD;
/** Fireflies live in a 32 m square that follows you, fixed in the world (they do not trail behind). */
const WRAP = 32;

const mod = (a: number, n: number) => ((a % n) + n) % n;

export class LivingDetailSystem extends createSystem({}) {
  private goods!: InstancedMesh;
  private goodsSig = '';
  private sigT = 0;
  private m4 = new Matrix4();
  private q = new Quaternion();
  private qy = new Quaternion();
  private pos = new Vector3();
  private sc = new Vector3();
  private col = new Color();
  private up = new Vector3(0, 1, 0);

  private flies!: Points;
  private flyBase = new Float32Array(FIREFLIES * 3);
  private flyCol!: Float32Array;
  private flyMat!: PointsMaterial;
  private gnats!: Points;
  private gnatMat!: PointsMaterial;
  private gnatPos!: Float32Array;
  private clouds = new Float32Array(GNAT_CLOUDS * 3);
  private cloudsOn = false;
  private t = 0;
  private cloudT = 0;

  init(): void {
    this.goods = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color: 0xffffff }), MAX_GOODS);
    this.goods.name = 'StoredGoods';
    this.goods.count = 0;
    this.goods.frustumCulled = false;
    this.goods.setColorAt(0, this.col.set(0xffffff));
    this.world.createTransformEntity(this.goods);

    for (let i = 0; i < FIREFLIES; i++) {
      this.flyBase[i * 3] = (i * 7.31) % WRAP;
      this.flyBase[i * 3 + 1] = 0.5 + ((i * 0.37) % 1) * 1.6;
      this.flyBase[i * 3 + 2] = (i * 12.77) % WRAP;
    }
    this.flyCol = new Float32Array(FIREFLIES * 3);
    const fg = new BufferGeometry();
    fg.setAttribute('position', new BufferAttribute(new Float32Array(FIREFLIES * 3), 3));
    fg.setAttribute('color', new BufferAttribute(this.flyCol, 3));
    this.flyMat = new PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true });
    this.flies = new Points(fg, this.flyMat);
    this.flies.name = 'Fireflies';
    this.flies.frustumCulled = false;
    this.flies.visible = false;
    this.world.createTransformEntity(this.flies);

    this.gnatPos = new Float32Array(GNATS * 3);
    const gg = new BufferGeometry();
    gg.setAttribute('position', new BufferAttribute(this.gnatPos, 3));
    this.gnatMat = new PointsMaterial({ size: 0.04, color: 0x2a2620, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true });
    this.gnats = new Points(gg, this.gnatMat);
    this.gnats.name = 'Gnats';
    this.gnats.frustumCulled = false;
    this.gnats.visible = false;
    this.world.createTransformEntity(this.gnats);
  }

  // ------------------------------------------------------------ stored goods

  private put(i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY: number, color: number): void {
    this.pos.set(x, y, z);
    this.sc.set(sx, sy, sz);
    this.qy.setFromAxisAngle(this.up, rotY);
    this.m4.compose(this.pos, this.qy, this.sc);
    this.goods.setMatrixAt(i, this.m4);
    this.goods.setColorAt(i, this.col.set(color));
  }

  private rebuildGoods(): void {
    const game = getGame(this.world);
    let n = 0;
    for (const s of game.structures) {
      if (!s.complete || !s.store || n >= MAX_GOODS - 14) continue;
      const c = Math.cos(s.rotY);
      const sn = Math.sin(s.rotY);
      // Local (lx, lz) to world, with the structure's yaw.
      const wx = (lx: number, lz: number) => s.x + lx * c + lz * sn;
      const wz = (lx: number, lz: number) => s.z - lx * sn + lz * c;
      const gy = groundHeight(s.x, s.z);
      const ry = s.rotY;
      if (s.kind === 'woodStack') {
        let k = 0;
        for (const id of ['logs', 'dryBranch', 'twigs'] as ItemId[]) {
          const have = s.store[id] ?? 0;
          for (let j = 0; j < have && k < 12; j++, k++) {
            const col = k % 3;
            const row = Math.floor(k / 3);
            const x = -0.2 + col * 0.2;
            const th = id === 'twigs' ? 0.04 : 0.12;
            this.put(n++, wx(x, 0), gy + 0.08 + row * 0.15, wz(x, 0), th, th, id === 'twigs' ? 0.4 : 0.55, ry, ITEMS[id].color);
          }
        }
      } else if (s.kind === 'dryingRack') {
        let k = 0;
        for (const id of ['fish', 'driedFish', 'berries'] as ItemId[]) {
          const have = s.store[id] ?? 0;
          for (let j = 0; j < have && k < 6; j++, k++) {
            const x = -0.4 + k * 0.17;
            if (id === 'berries') this.put(n++, wx(x, 0.02), gy + 0.9, wz(x, 0.02), 0.07, 0.1, 0.07, ry, 0x5a1424);
            else this.put(n++, wx(x, 0.02), gy + 0.8, wz(x, 0.02), 0.07, 0.3, 0.03, ry, id === 'driedFish' ? 0xb89a6a : 0x8fa7b3);
          }
        }
      } else if (s.kind === 'storage') {
        let k = 0;
        for (const id of Object.keys(s.store) as ItemId[]) {
          const have = Math.min(4, s.store[id] ?? 0);
          for (let j = 0; j < have && k < 9; j++, k++) {
            const col = k % 3;
            const row = Math.floor(k / 3);
            this.put(n++, wx(-0.12 + col * 0.12, -0.1 + row * 0.1), gy + 0.3 + (k % 2) * 0.03, wz(-0.12 + col * 0.12, -0.1 + row * 0.1), 0.09, 0.07, 0.09, ry, ITEMS[id]?.color ?? 0xaaaaaa);
          }
        }
      }
    }
    this.goods.count = n;
    this.goods.instanceMatrix.needsUpdate = true;
    if (this.goods.instanceColor) this.goods.instanceColor.needsUpdate = true;
  }

  private goodsSignature(): string {
    let sig = '';
    for (const s of getGame(this.world).structures) {
      if (!s.complete || !s.store) continue;
      if (s.kind !== 'woodStack' && s.kind !== 'dryingRack' && s.kind !== 'storage') continue;
      sig += `${s.id}:${Object.entries(s.store).map(([k, v]) => `${k}${v}`).join(',')};`;
    }
    return sig;
  }

  // ----------------------------------------------------------------- insects

  /** Three points along the stream nearest the player, for the gnat clouds (1 Hz). */
  private findClouds(px: number, pz: number): void {
    let bd = Infinity;
    let bx = 0;
    let bz = 0;
    let tx = 1;
    let tz = 0;
    for (let i = 0; i < STREAM.length - 1; i++) {
      const [ax, az] = STREAM[i];
      const [cx, cz] = STREAM[i + 1];
      const dx = cx - ax;
      const dz = cz - az;
      const len2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
      const x = ax + dx * u;
      const z = az + dz * u;
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) {
        bd = d;
        bx = x;
        bz = z;
        const l = Math.sqrt(len2);
        tx = dx / l;
        tz = dz / l;
      }
    }
    this.cloudsOn = bd < 24;
    for (let k = 0; k < GNAT_CLOUDS; k++) {
      const along = (k - 1) * 4.5;
      this.clouds[k * 3] = bx + tx * along - tz * 0.8;
      this.clouds[k * 3 + 1] = bz + tz * along + tx * 0.8;
      this.clouds[k * 3 + 2] = groundHeight(bx, bz) + 1.1;
    }
  }

  update(delta: number): void {
    const game = getGame(this.world);
    const dt = Math.min(delta, 0.1);
    this.t += dt;
    if ((this.sigT += dt) > 0.5) {
      this.sigT = 0;
      const sig = this.goodsSignature();
      if (sig !== this.goodsSig) {
        this.goodsSig = sig;
        this.rebuildGoods();
      }
    }
    const px = game.player.x;
    const pz = game.player.z;
    const night = game.env.night;
    // Fireflies: dusk to dawn, not in rain.
    const fly = Math.max(0, Math.min(1, (night - 0.4) / 0.3)) * (game.env.rain > 0.3 ? 0 : 1);
    this.flies.visible = fly > 0.02;
    if (this.flies.visible) {
      this.flyMat.opacity = fly;
      const pa = (this.flies.geometry.getAttribute('position') as BufferAttribute).array as Float32Array;
      for (let i = 0; i < FIREFLIES; i++) {
        const bx = this.flyBase[i * 3];
        const bz = this.flyBase[i * 3 + 2];
        const x = px + mod(bx - px + WRAP / 2, WRAP) - WRAP / 2 + Math.sin(this.t * 0.5 + i) * 0.7;
        const z = pz + mod(bz - pz + WRAP / 2, WRAP) - WRAP / 2 + Math.cos(this.t * 0.43 + i * 1.7) * 0.7;
        pa[i * 3] = x;
        pa[i * 3 + 1] = groundHeight(x, z) + this.flyBase[i * 3 + 1] + Math.sin(this.t * 0.9 + i * 2.1) * 0.25;
        pa[i * 3 + 2] = z;
        // A slow blink, each on its own phase.
        const b = Math.max(0, Math.sin(this.t * 1.6 + i * 3.7)) ** 3;
        this.flyCol[i * 3] = 0.75 * b + 0.05;
        this.flyCol[i * 3 + 1] = 1.0 * b + 0.08;
        this.flyCol[i * 3 + 2] = 0.25 * b;
      }
      (this.flies.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (this.flies.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
    }
    // Gnats: clouds above the water in daylight, when it is not raining.
    if ((this.cloudT += dt) > 1) {
      this.cloudT = 0;
      this.findClouds(px, pz);
    }
    const gn = this.cloudsOn && night < 0.5 && game.env.rain < 0.3;
    this.gnats.visible = gn;
    if (gn) {
      for (let k = 0; k < GNAT_CLOUDS; k++) {
        for (let j = 0; j < GNATS_PER_CLOUD; j++) {
          const i = k * GNATS_PER_CLOUD + j;
          const a = this.t * (1.8 + j * 0.23) + j * 1.9;
          this.gnatPos[i * 3] = this.clouds[k * 3] + Math.cos(a) * (0.35 + 0.05 * j);
          this.gnatPos[i * 3 + 1] = this.clouds[k * 3 + 2] + Math.sin(a * 1.3 + k) * 0.3;
          this.gnatPos[i * 3 + 2] = this.clouds[k * 3 + 1] + Math.sin(a) * (0.35 + 0.05 * j);
        }
      }
      (this.gnats.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }
  }
}
