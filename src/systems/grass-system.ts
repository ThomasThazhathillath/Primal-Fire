// Dense grass tufts around the player (stage 3 of the modern-look round): one InstancedMesh of about 1,500 five-blade
// tufts laid out on a hashed 0.9 m grid under the camera, so the same cell always grows the same tufts (no allocation, no
// random per frame). Tufts shrink to nothing toward the edge of the ring, so there is no pop. Re-laid every 0.2 s while you move;
// wind is a vertex-shader sway. They are walk-through scenery: nothing gameplay-related reads them.

import { BufferAttribute, BufferGeometry, createSystem, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, MeshLambertMaterial, Vector3 } from '@iwsdk/core';
import { valueNoise } from '../game/rng.js';
import { groundHeight, inClearing, nearestTreeDistance, streamDistance } from '../game/world-layout.js';
import { getGame } from './shared.js';

const CELL = 0.7;
const RADIUS = 10;
const FADE_FROM = 5.5;
const PER_CELL = 7;
const MAX = 2200;
const FLOWERS = 450;
/** Colour families (linear tint) a patch can be: fresh, yellow-green, dry, dark. */
const PATCH = [
  [0.55, 0.9, 0.35],
  [0.78, 0.92, 0.38],
  [0.9, 0.82, 0.45],
  [0.4, 0.7, 0.3],
] as const;
/** Flower heads (linear): white, yellow, pink, violet. */
const BLOOM = [
  [1, 1, 0.95],
  [1, 0.85, 0.2],
  [1, 0.5, 0.7],
  [0.65, 0.45, 1],
] as const;

/** Deterministic hash of a cell and a salt to 0..1. */
const hash = (ix: number, iz: number, k: number): number => {
  let h = (ix * 374761393 + iz * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function tuftGeometry(): BufferGeometry {
  // Five tapered blades fanned out from one point; each is a quad that narrows to a tip (2 triangles), bent outward.
  const P: number[] = [];
  const C: number[] = [];
  const I: number[] = [];
  const blades = 4;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 0.7;
    const h = 0.2 + (b % 3) * 0.06;
    const w = 0.02;
    const lean = 0.09 + (b % 2) * 0.05;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz;
    const pz = dx;
    const base = P.length / 3;
    // base left, base right, tip (shifted outward by `lean`), plus a mid pair for a gentle bend.
    const mid = [dx * lean * 0.35, h * 0.55, dz * lean * 0.35];
    const tip = [dx * lean, h, dz * lean];
    P.push(px * w, 0, pz * w, -px * w, 0, -pz * w, mid[0] + px * w * 0.7, mid[1], mid[2] + pz * w * 0.7, mid[0] - px * w * 0.7, mid[1], mid[2] - pz * w * 0.7, tip[0], tip[1], tip[2]);
    C.push(0.16, 0.24, 0.08, 0.16, 0.24, 0.08, 0.34, 0.5, 0.18, 0.34, 0.5, 0.18, 0.5, 0.68, 0.26);
    I.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(C), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(P.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(I);
  return g;
}

function flowerGeometry(): BufferGeometry {
  // A thin stem and a six-petal head (flat star), one bloom colour per instance (the stem goes dark under it).
  const P: number[] = [];
  const C: number[] = [];
  const I: number[] = [];
  const h = 0.34;
  P.push(-0.006, 0, 0, 0.006, 0, 0, -0.004, h, 0, 0.004, h, 0);
  C.push(0.25, 0.4, 0.2, 0.25, 0.4, 0.2, 0.3, 0.45, 0.2, 0.3, 0.45, 0.2);
  I.push(0, 1, 2, 1, 3, 2);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const base = P.length / 3;
    const tx = Math.cos(a);
    const tz = Math.sin(a);
    const px = -tz;
    const pz = tx;
    P.push(0, h, 0, tx * 0.055 + px * 0.022, h + 0.012, tz * 0.055 + pz * 0.022, tx * 0.055 - px * 0.022, h + 0.012, tz * 0.055 - pz * 0.022);
    C.push(1, 0.95, 0.6, 1, 1, 1, 1, 1, 1);
    I.push(base, base + 1, base + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(C), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(P.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(I);
  return g;
}

export class GrassSystem extends createSystem({}) {
  private mesh!: InstancedMesh;
  private flowers!: InstancedMesh;
  private uniforms = { uTime: { value: 0 }, uWind: { value: 0.2 } };
  private acc = 1;
  private head = new Vector3();
  private lastX = 1e9;
  private lastZ = 1e9;

  init(): void {
    const mat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.uniforms.uWind = this.uniforms.uWind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
          { vec3 ip = instanceMatrix[3].xyz; float ph = ip.x * 0.9 + ip.z * 1.3;
            float k = position.y * position.y * 14.0;
            transformed.x += (sin(uTime * 1.7 + ph) * 0.6 + sin(uTime * 3.1 + ph * 1.9) * 0.4) * uWind * 0.12 * k;
            transformed.z += cos(uTime * 1.3 + ph * 0.7) * uWind * 0.08 * k; }
          #endif`,
        );
    };
    this.mesh = new InstancedMesh(tuftGeometry(), mat, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'GrassTufts';
    this.scene.add(this.mesh);
    this.flowers = new InstancedMesh(flowerGeometry(), mat, FLOWERS);
    this.flowers.instanceMatrix.setUsage(DynamicDrawUsage);
    this.flowers.instanceColor = new InstancedBufferAttribute(new Float32Array(FLOWERS * 3), 3).setUsage(DynamicDrawUsage);
    this.flowers.frustumCulled = false;
    this.flowers.count = 0;
    this.flowers.name = 'GrassFlowers';
    this.scene.add(this.flowers);
    this.cleanupFuncs.push(() => {
      this.scene.remove(this.mesh);
      this.scene.remove(this.flowers);
      this.flowers.geometry.dispose();
      this.mesh.geometry.dispose();
      mat.dispose();
    });
  }

  update(delta: number, time: number): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uWind.value += (0.2 + getGame(this.world).env.windStrength * 1.5 - this.uniforms.uWind.value) * Math.min(1, delta);
    if ((this.acc += delta) < 0.2) return;
    this.acc = 0;
    this.camera.getWorldPosition(this.head);
    const cx = this.head.x;
    const cz = this.head.z;
    if (Math.hypot(cx - this.lastX, cz - this.lastZ) < 0.35) return;
    this.lastX = cx;
    this.lastZ = cz;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.mesh.instanceColor!.array as Float32Array;
    const farr = this.flowers.instanceMatrix.array as Float32Array;
    const fcol = this.flowers.instanceColor!.array as Float32Array;
    const n0x = Math.floor(cx / CELL);
    const n0z = Math.floor(cz / CELL);
    const span = Math.ceil(RADIUS / CELL);
    let n = 0;
    let nf = 0;
    for (let dz = -span; dz <= span && n < MAX; dz++) {
      for (let dx = -span; dx <= span && n < MAX; dx++) {
        const ix = n0x + dx;
        const iz = n0z + dz;
        // Patches: a coarse noise says where grass grows thick (clumps and meadows), where it thins out and where the ground is bare.
        const px = (ix + 0.5) * CELL;
        const pz = (iz + 0.5) * CELL;
        const patch = valueNoise(px * 0.3 + 7, pz * 0.3 - 3) * 0.65 + valueNoise(px * 1.1, pz * 1.1) * 0.35;
        const dens = Math.min(1, Math.max(0, (patch - 0.33) / 0.14));
        if (dens <= 0) continue;
        const fam = Math.floor(valueNoise(px * 0.11 + 3, pz * 0.11 + 9) * 4) % 4;
        for (let k = 0; k < PER_CELL && n < MAX; k++) {
          if (hash(ix, iz, k * 7 + 11) > dens) continue;
          const x = (ix + hash(ix, iz, k * 3 + 1)) * CELL;
          const z = (iz + hash(ix, iz, k * 3 + 2)) * CELL;
          const d = Math.hypot(x - cx, z - cz);
          if (d > RADIUS) continue;
          if (streamDistance(x, z) < 0.95 || nearestTreeDistance(x, z, 0.5) < 0.4) continue;
          const fade = d < FADE_FROM ? 1 : 1 - (d - FADE_FROM) / (RADIUS - FADE_FROM);
          const s = (0.6 + hash(ix, iz, k * 3 + 3) * 0.7 + dens * 0.2) * fade;
          if (s < 0.05) continue;
          const a = hash(ix, iz, k * 3 + 4) * 6.2832;
          const c = Math.cos(a) * s;
          const sn = Math.sin(a) * s;
          const o = n * 16;
          const gy = groundHeight(x, z) - 0.01;
          arr[o] = c; arr[o + 1] = 0; arr[o + 2] = -sn; arr[o + 3] = 0;
          arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
          arr[o + 8] = sn; arr[o + 9] = 0; arr[o + 10] = c; arr[o + 11] = 0;
          arr[o + 12] = x; arr[o + 13] = gy; arr[o + 14] = z; arr[o + 15] = 1;
          const t = 0.7 + hash(ix, iz, k * 3 + 5) * 0.5;
          const tone = PATCH[fam];
          col[n * 3] = tone[0] * t;
          col[n * 3 + 1] = tone[1] * t;
          col[n * 3 + 2] = tone[2] * t;
          n++;
          // A few blooms in the thick of a patch.
          if (nf < FLOWERS && dens > 0.55 && hash(ix, iz, k * 5 + 29) < 0.07 && fade > 0.3) {
            const fo = nf * 16;
            const fs = 0.8 + hash(ix, iz, k * 5 + 31) * 0.5;
            farr[fo] = fs; farr[fo + 1] = 0; farr[fo + 2] = 0; farr[fo + 3] = 0;
            farr[fo + 4] = 0; farr[fo + 5] = fs * fade; farr[fo + 6] = 0; farr[fo + 7] = 0;
            farr[fo + 8] = 0; farr[fo + 9] = 0; farr[fo + 10] = fs; farr[fo + 11] = 0;
            farr[fo + 12] = x + 0.04; farr[fo + 13] = gy; farr[fo + 14] = z; farr[fo + 15] = 1;
            const b = BLOOM[(fam + Math.floor(hash(ix, iz, k * 5 + 37) * 3)) % 4];
            fcol[nf * 3] = b[0];
            fcol[nf * 3 + 1] = b[1];
            fcol[nf * 3 + 2] = b[2];
            nf++;
          }
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.flowers.count = nf;
    this.flowers.instanceMatrix.needsUpdate = true;
    this.flowers.instanceColor!.needsUpdate = true;
  }
}
