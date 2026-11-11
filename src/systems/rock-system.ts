// The large decor boulders (BOULDERS in world-layout: positions and collision circles are unchanged), drawn from six baked
// Poly Haven rocks ("Rock Moss Set 01", CC0, shrunk by scripts/rocks/bake.mjs) at three levels of detail. One InstancedMesh per
// rock and level; instances are re-bucketed by distance four times a second. Collectible stones are NOT these: they are small
// single meshes with a pickup ring (item-meshes.ts), so decor and resources stay easy to tell apart.

import { AssetManager, Color, createSystem, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, Object3D, Quaternion, Vector3, type Material } from '@iwsdk/core';
import { BOULDERS } from '../game/world-layout.js';
import { groundHeight } from '../game/world-layout.js';

const ROCKS = 6;
/** Distances (m) at which a boulder drops to the next level. */
const LOD_AT = [14, 32] as const;
const SHADES = [0xffffff, 0xe8e2d6, 0xd6d0c4];

interface Bucket {
  mesh: InstancedMesh;
  n: number;
}

export class RockSystem extends createSystem({}) {
  private root = new Object3D();
  private buckets: Bucket[] = [];
  private mats = new Float32Array(BOULDERS.length * 16);
  private cols = new Float32Array(BOULDERS.length * 3);
  private rockOf: number[] = [];
  private acc = 1;
  private ready = false;
  private head = new Vector3();

  init(): void {
    this.root.name = 'RockLOD';
    this.scene.add(this.root);
    this.cleanupFuncs.push(() => {
      this.scene.remove(this.root);
      this.buckets.length = 0;
    });
    void this.load();
  }

  private async load(): Promise<void> {
    const g = AssetManager.getGLTF('rocks-set', { shared: true }) ?? (await AssetManager.loadGLTFById('rocks-set'));
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const s = new Vector3();
    const p = new Vector3();
    const c = new Color();
    BOULDERS.forEach((b, i) => {
      const rock = (i * 5 + Math.floor(b.rotY * 3)) % ROCKS;
      this.rockOf.push(rock);
      q.setFromAxisAngle(up, b.rotY);
      // The baked rock is 1 m across its widest side; the old boulder had radius `size`.
      const w = b.size * 2.1;
      m.compose(p.set(b.x, groundHeight(b.x, b.z) - w * 0.06, b.z), q, s.set(w, w, w));
      m.toArray(this.mats, i * 16);
      c.setHex(SHADES[i % 3]);
      this.cols.set([c.r, c.g, c.b], i * 3);
    });
    for (let r = 0; r < ROCKS; r++) {
      const count = this.rockOf.filter((x) => x === r).length;
      for (let lod = 0; lod < 3; lod++) {
        const node = g.scene.getObjectByName(`Rock${r + 1}_LOD${lod}`) as Mesh | undefined;
        if (!node || !count) {
          this.buckets.push({ mesh: null as unknown as InstancedMesh, n: 0 });
          continue;
        }
        const mesh = new InstancedMesh(node.geometry, node.material as Material, count);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.name = `Rock${r + 1}_LOD${lod}`;
        this.root.add(mesh);
        this.buckets.push({ mesh, n: 0 });
      }
    }
    this.ready = true;
  }

  update(delta: number): void {
    if (!this.ready || (this.acc += delta) < 0.25) return;
    this.acc = 0;
    this.camera.getWorldPosition(this.head);
    for (const b of this.buckets) b.n = 0;
    BOULDERS.forEach((bd, i) => {
      const d = Math.hypot(bd.x - this.head.x, bd.z - this.head.z) / Math.max(0.6, bd.size);
      const lod = d < LOD_AT[0] ? 0 : d < LOD_AT[1] ? 1 : 2;
      const b = this.buckets[this.rockOf[i] * 3 + lod];
      if (!b?.mesh) return;
      b.mesh.instanceMatrix.array.set(this.mats.subarray(i * 16, i * 16 + 16), b.n * 16);
      (b.mesh.instanceColor!.array as Float32Array).set(this.cols.subarray(i * 3, i * 3 + 3), b.n * 3);
      b.n++;
    });
    for (const b of this.buckets) {
      if (!b.mesh) continue;
      b.mesh.count = b.n;
      b.mesh.visible = b.n > 0;
      b.mesh.instanceMatrix.needsUpdate = true;
      b.mesh.instanceColor!.needsUpdate = true;
    }
  }
}
