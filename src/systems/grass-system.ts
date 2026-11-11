// Dense grass tufts around the player (stage 3 of the modern-look round): one InstancedMesh of about 1,500 five-blade
// tufts laid out on a hashed 0.9 m grid under the camera, so the same cell always grows the same tufts (no allocation, no
// random per frame). Tufts shrink to nothing toward the edge of the ring, so there is no pop. Re-laid every 0.2 s while you move;
// wind is a vertex-shader sway. They are walk-through scenery: nothing gameplay-related reads them.

import { BufferAttribute, BufferGeometry, createSystem, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, MeshLambertMaterial, Vector3 } from '@iwsdk/core';
import { groundHeight, inClearing, nearestTreeDistance, streamDistance } from '../game/world-layout.js';
import { getGame } from './shared.js';

const CELL = 1.0;
const RADIUS = 11;
const FADE_FROM = 6;
const PER_CELL = 4;
const MAX = 2400;

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
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 0.7;
    const h = 0.2 + (b % 3) * 0.06;
    const w = 0.015;
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
    C.push(0.22, 0.3, 0.12, 0.22, 0.3, 0.12, 0.5, 0.65, 0.28, 0.5, 0.65, 0.28, 0.85, 0.92, 0.5);
    I.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
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
    this.cleanupFuncs.push(() => {
      this.scene.remove(this.mesh);
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
    const n0x = Math.floor(cx / CELL);
    const n0z = Math.floor(cz / CELL);
    const span = Math.ceil(RADIUS / CELL);
    let n = 0;
    for (let dz = -span; dz <= span && n < MAX; dz++) {
      for (let dx = -span; dx <= span && n < MAX; dx++) {
        const ix = n0x + dx;
        const iz = n0z + dz;
        for (let k = 0; k < PER_CELL && n < MAX; k++) {
          const x = (ix + hash(ix, iz, k * 3 + 1)) * CELL;
          const z = (iz + hash(ix, iz, k * 3 + 2)) * CELL;
          const d = Math.hypot(x - cx, z - cz);
          if (d > RADIUS) continue;
          // Patchy meadows rather than a carpet: a hashed mask, thinner under dense canopy and absent in the water.
          if (hash(ix >> 2, iz >> 2, 9) < 0.18 || streamDistance(x, z) < 0.95 || nearestTreeDistance(x, z, 0.5) < 0.4) continue;
          const fade = d < FADE_FROM ? 1 : 1 - (d - FADE_FROM) / (RADIUS - FADE_FROM);
          const s = (0.55 + hash(ix, iz, k * 3 + 3) * 0.6) * fade * (inClearing(x, z, 0) ? 1.0 : 0.8);
          if (s < 0.05) continue;
          const a = hash(ix, iz, k * 3 + 4) * 6.2832;
          const c = Math.cos(a) * s;
          const sn = Math.sin(a) * s;
          const o = n * 16;
          arr[o] = c; arr[o + 1] = 0; arr[o + 2] = -sn; arr[o + 3] = 0;
          arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
          arr[o + 8] = sn; arr[o + 9] = 0; arr[o + 10] = c; arr[o + 11] = 0;
          arr[o + 12] = x; arr[o + 13] = groundHeight(x, z) - 0.01; arr[o + 14] = z; arr[o + 15] = 1;
          const t = 0.75 + hash(ix, iz, k * 3 + 5) * 0.5;
          col[n * 3] = 0.8 * t;
          col[n * 3 + 1] = 0.95 * t;
          col[n * 3 + 2] = 0.5 * t;
          n++;
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}
