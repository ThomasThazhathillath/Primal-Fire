// Draws the animals from game.wildlife: one InstancedMesh per species (3 draw calls in all),
// each a single vertex-coloured model built from boxes. Animation is whole-body (bob, lean,
// dip of the head by scaling) so no skeleton is needed. Parked/hidden animals collapse to
// zero scale. No per-frame allocation: one reusable Object3D and Color.

import {
  BufferAttribute,
  BufferGeometry,
  createSystem,
  DynamicDrawUsage,
  InstancedMesh,
  MeshLambertMaterial,
  CylinderGeometry,
  Object3D,
  SphereGeometry,
} from '@iwsdk/core';
import { Color } from '@iwsdk/core';
import { freshness, TRACK_CAP, TRACK_LIFE } from '../game/tracks.js';
import type { Animal, Species } from '../game/wildlife.js';
import { getGame } from './shared.js';

/** A part: 'e' ellipsoid (centre, radii), 'c' tapered cylinder (centre, radius, height). Colour is 0xrrggbb. */
type Part = ['e', number, number, number, number, number, number, number] | ['c', number, number, number, number, number, number, number];

/** Parts in a model facing +Z, feet at y = 0 (smooth shapes with a darker back and lighter belly, instead of boxes). */
const MODELS: Record<Species, Part[]> = {
  deer: [
    ['e', 0, 0.98, 0, 0.26, 0.27, 0.6, 0x8a5a34], // body
    ['e', 0, 0.9, -0.45, 0.24, 0.25, 0.3, 0x80522f], // haunch
    ['c', 0, 1.45, 0.62, 0.1, 0.62, 0, 0x8a5a34], // neck (leaned by the head below)
    ['e', 0, 1.78, 0.82, 0.1, 0.13, 0.22, 0x9a6a40], // head
    ['e', -0.07, 1.98, 0.76, 0.03, 0.08, 0.03, 0x7a4c2a], // ears
    ['e', 0.07, 1.98, 0.76, 0.03, 0.08, 0.03, 0x7a4c2a],
    ['e', 0, 0.98, -0.66, 0.06, 0.09, 0.07, 0xeee4d0], // tail
    ['c', -0.15, 0.4, 0.4, 0.045, 0.8, 0, 0x5e3b22],
    ['c', 0.15, 0.4, 0.4, 0.045, 0.8, 0, 0x5e3b22],
    ['c', -0.15, 0.4, -0.42, 0.05, 0.8, 0, 0x5e3b22],
    ['c', 0.15, 0.4, -0.42, 0.05, 0.8, 0, 0x5e3b22],
  ],
  rabbit: [
    ['e', 0, 0.15, 0, 0.1, 0.12, 0.17, 0x8c7a62],
    ['e', 0, 0.12, -0.08, 0.1, 0.1, 0.13, 0x86745c],
    ['e', 0, 0.24, 0.2, 0.065, 0.065, 0.085, 0x9a8870],
    ['e', -0.03, 0.38, 0.19, 0.018, 0.09, 0.02, 0x9a8870],
    ['e', 0.03, 0.38, 0.19, 0.018, 0.09, 0.02, 0x9a8870],
    ['e', 0, 0.16, -0.19, 0.04, 0.04, 0.04, 0xf0ece4],
  ],
  bird: [
    ['e', 0, 0.11, 0, 0.065, 0.065, 0.11, 0x5a6a78],
    ['e', 0, 0.17, 0.11, 0.04, 0.04, 0.05, 0x6a7a88],
    ['e', 0, 0.1, -0.16, 0.035, 0.012, 0.09, 0x3a4450],
    ['e', -0.09, 0.12, 0, 0.07, 0.012, 0.09, 0x4a5a68],
    ['e', 0.09, 0.12, 0, 0.07, 0.012, 0.09, 0x4a5a68],
  ],
};

const sphereUnit = new SphereGeometry(1, 9, 7);
const cylUnit = new CylinderGeometry(0.8, 1, 1, 8, 1);

function buildGeometry(parts: Part[]): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const dummy = new Object3D();
  const c = new Color();
  for (const [kind, cx, cy, cz, a, b, d, rgb] of parts) {
    const src = (kind === 'e' ? sphereUnit : cylUnit).toNonIndexed();
    dummy.position.set(cx, cy, cz);
    dummy.rotation.set(0, 0, 0);
    if (kind === 'e') dummy.scale.set(a, b, d);
    else {
      dummy.scale.set(a, b, a); // radius a, height b
      if (cx === 0 && cz > 0.5 && cy > 1.3) dummy.rotation.set(0.5, 0, 0); // the deer's neck leans forward
    }
    dummy.updateMatrix();
    src.applyMatrix4(dummy.matrix);
    c.setHex(rgb);
    const p = src.attributes.position.array as Float32Array;
    const n = src.attributes.normal.array as Float32Array;
    for (let i = 0; i < p.length; i += 3) {
      pos.push(p[i], p[i + 1], p[i + 2]);
      nor.push(n[i], n[i + 1], n[i + 2]);
      // Darker back, lighter belly.
      const k = 1.12 - 0.3 * (n[i + 1] * 0.5 + 0.5);
      col.push(c.r * k, c.g * k, c.b * k);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  return geo;
}

const SCALE: Record<Species, number> = { deer: 1, rabbit: 1, bird: 1 };

export class WildlifeSystem extends createSystem({}) {
  private meshes = new Map<Species, InstancedMesh>();
  private dummy!: Object3D;
  private prints!: InstancedMesh;
  private printVersion = -1;
  private printT = 0;
  private col = new Color();

  init() {
    this.dummy = new Object3D();
    const game = getGame(this.world);
    for (const sp of ['deer', 'rabbit', 'bird'] as Species[]) {
      const n = game.wildlife.animals.filter((a) => a.species === sp).length;
      if (!n) continue;
      const mat = new MeshLambertMaterial({ vertexColors: true });
      const mesh = new InstancedMesh(buildGeometry(MODELS[sp]), mat, n);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.name = `Wildlife_${sp}`;
      this.scene.add(mesh);
      this.meshes.set(sp, mesh);
    }
    // Footprints: a cloven pair of flat marks per print, tinted by age.
    const pm = new MeshLambertMaterial({ color: 0xffffff });
    const printGeo = buildGeometry([
      ['e', -0.04, 0, 0, 0.026, 0.006, 0.068, 0xffffff],
      ['e', 0.04, 0, 0, 0.026, 0.006, 0.068, 0xffffff],
    ]);
    this.prints = new InstancedMesh(printGeo, pm, TRACK_CAP);
    this.prints.instanceMatrix.setUsage(DynamicDrawUsage);
    this.prints.frustumCulled = false;
    this.prints.name = 'Tracks';
    this.prints.count = TRACK_CAP;
    this.scene.add(this.prints);
    this.cleanupFuncs.push(() => {
      this.scene.remove(this.prints);
      printGeo.dispose();
      pm.dispose();
      this.prints.dispose();
    });
    this.cleanupFuncs.push(() => {
      for (const m of this.meshes.values()) {
        this.scene.remove(m);
        m.geometry.dispose();
        (m.material as MeshLambertMaterial).dispose();
        m.dispose();
      }
      this.meshes.clear();
    });
  }

  update(_delta: number, time: number) {
    const game = getGame(this.world);
    const counters: Record<Species, number> = { deer: 0, rabbit: 0, bird: 0 };
    const d = this.dummy;
    for (const a of game.wildlife.animals) {
      const mesh = this.meshes.get(a.species);
      if (!mesh) continue;
      const i = counters[a.species]++;
      const visible = a.active && !a.hidden;
      if (!visible) {
        d.position.set(0, -50, 0);
        d.scale.setScalar(0.0001);
        d.rotation.set(0, 0, 0);
      } else {
        this.pose(a, time, d);
      }
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    for (const m of this.meshes.values()) m.instanceMatrix.needsUpdate = true;
    this.updatePrints(_delta, game);
  }

  /** Rebuild the print instances when one was added/removed, and re-tint for age every couple of seconds. */
  private updatePrints(delta: number, game: ReturnType<typeof getGame>): void {
    this.printT += delta;
    const tr = game.tracks;
    if (tr.version === this.printVersion && this.printT < 2) return;
    this.printVersion = tr.version;
    this.printT = 0;
    const d = this.dummy;
    for (let i = 0; i < tr.prints.length; i++) {
      const p = tr.prints[i];
      if (!p.live) {
        d.position.set(0, -50, 0);
        d.scale.setScalar(0.0001);
      } else {
        const age = game.time - p.born;
        const fade = Math.max(p.seeded ? 0.3 : 0, 1 - age / TRACK_LIFE);
        d.position.set(p.x + Math.cos(p.heading) * (p.side ? 0.12 : -0.12), tr.y(p), p.z - Math.sin(p.heading) * (p.side ? 0.12 : -0.12));
        d.rotation.set(0, p.heading, 0);
        const sz = p.species === 'deer' ? 1 : 0.55;
        d.scale.set(sz, 1, sz);
        // Fresh: dark and crisp; old: close to the ground colour.
        const f = freshness(age);
        this.col.setHex(f === 'fresh' ? 0x5a4630 : f === 'recent' ? 0x6e5a3e : 0x806c4c);
        this.col.multiplyScalar(0.6 + 0.4 * fade);
        this.prints.setColorAt(i, this.col);
      }
      d.updateMatrix();
      this.prints.setMatrixAt(i, d.matrix);
    }
    this.prints.instanceMatrix.needsUpdate = true;
    if (this.prints.instanceColor) this.prints.instanceColor.needsUpdate = true;
  }

  /** Whole-body pose for the state: bob when walking, hop, head-down graze, lying when asleep. */
  private pose(a: Animal, time: number, d: Object3D): void {
    const s = a.size * SCALE[a.species];
    d.position.set(a.x, a.y, a.z);
    d.scale.setScalar(s);
    let pitch = 0;
    let roll = 0;
    let lift = 0;
    const ph = time * 7 + a.id;
    switch (a.state) {
      case 'graze':
        pitch = 0.25;
        break;
      case 'drink':
        pitch = 0.4;
        break;
      case 'walk':
        lift = a.species === 'rabbit' ? Math.max(0, Math.sin((a.t % 0.9) * Math.PI * 2.9)) * 0.15 : Math.abs(Math.sin(ph * 0.5)) * 0.03;
        break;
      case 'run':
      case 'flee':
        lift = Math.abs(Math.sin(ph * 1.6)) * (a.species === 'rabbit' ? 0.12 : 0.18);
        pitch = -0.1;
        break;
      case 'alert':
        pitch = -0.1;
        break;
      case 'sleep':
        d.scale.set(s, s * (a.species === 'deer' ? 0.62 : 0.8), s);
        break;
      case 'fly':
        lift = 0;
        roll = Math.sin(time * 18 + a.id) * 0.5;
        pitch = -0.3;
        break;
      default:
        break;
    }
    d.position.y += lift;
    d.rotation.set(pitch, a.heading + (a.state === 'alert' && a.species === 'bird' ? a.look : 0), roll, 'YXZ');
  }
}
