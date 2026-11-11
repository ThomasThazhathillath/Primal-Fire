// The forest's trees: five baked EZ-Tree variants (public/trees/*.glb, see scripts/trees/bake.mjs) drawn as
// instanced meshes at three levels of detail plus a billboard far away. Everything about WHERE a tree is
// stays in TREES (world-layout), so collision, perching, sightlines and gaze occlusion are untouched.
//
// Cost control: one InstancedMesh per variant and level (trunk and leaves share one geometry and material),
// so at most 20 draw calls; instances are re-bucketed by distance ten times a second and those behind you
// are skipped; leaves are alpha-tested (never blended); wind is a vertex-shader sway only.

import {
  AmbientLight,
  AssetManager,
  BufferAttribute,
  BufferGeometry,
  Color,
  createSystem,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type Material,
  type Texture,
} from '@iwsdk/core';
import { allTrees, lodFor, TREE_VARIANTS, worthDrawing, type Lod, type TreeInstance, type TreeVariant } from '../game/tree-lod.js';
import { getGame } from './shared.js';

const UPDATE_EVERY = 0.1;
const SHADES = [0xffffff, 0xe6f0dc, 0xd2dccb, 0xf2f7e4];
/** Bark vertices carry this UV so the shader skips the leaf texture for them. */
const BARK_UV = -2;

interface Level {
  mesh: InstancedMesh;
  tris: number;
  n: number;
}

export class TreeSystem extends createSystem({}) {
  private trees: TreeInstance[] = [];
  private mats = new Float32Array(0);
  private cols = new Float32Array(0);
  private lod: Array<Lod | null> = [];
  private levels = new Map<string, Level>();
  private root = new Object3D();
  private uniforms = { uTime: { value: 0 }, uWind: { value: 0.2 } };
  private t = 0;
  private acc = 0;
  private ready = false;
  /** Screenshot helper: draw only this tree (index into the instance list), at full detail. */
  private solo = -1;
  /** Screenshot helper: draw every tree at this level (3 = billboards only), or -1 for normal distance rules. */
  private force = -1;
  private head = new Vector3();
  private fwd = new Vector3();
  private disposables: Array<{ dispose(): void }> = [];

  init(): void {
    this.root.name = 'TreeLOD';
    this.scene.add(this.root);
    this.cleanupFuncs.push(() => {
      this.scene.remove(this.root);
      for (const d of this.disposables) d.dispose();
      this.levels.clear();
    });
    void this.load();
  }

  private async load(): Promise<void> {
    const gltfs = new Map<TreeVariant, Object3D>();
    for (const v of TREE_VARIANTS) {
      const key = `tree-${v}`;
      const g = AssetManager.getGLTF(key, { shared: true }) ?? (await AssetManager.loadGLTFById(key));
      gltfs.set(v, g.scene);
    }
    this.trees = allTrees();
    const n = this.trees.length;
    this.mats = new Float32Array(n * 16);
    this.cols = new Float32Array(n * 3);
    this.lod = new Array(n).fill(null);
    const m = new Matrix4();
    const q = new Quaternion();
    const lean = new Quaternion();
    const ax = new Vector3();
    const up = new Vector3(0, 1, 0);
    const s = new Vector3();
    const p = new Vector3();
    const c = new Color();
    this.trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rotY);
      lean.setFromAxisAngle(ax.set(Math.cos(t.leanDir), 0, Math.sin(t.leanDir)), t.lean);
      q.premultiply(lean);
      m.compose(p.set(t.x, t.y, t.z), q, s.set(t.w, t.h, t.w));
      m.toArray(this.mats, i * 16);
      // Snags stay grey-brown; living trees vary a little in shade (same recipe as the old low-poly forest).
      c.setHex(t.variant === 'snag' ? 0xffffff : SHADES[t.tint % 4]);
      if (t.variant !== 'snag') c.offsetHSL(((t.tint - 1.5) * 0.012), 0, (t.rotY % 0.1) - 0.05);
      this.cols[i * 3] = c.r;
      this.cols[i * 3 + 1] = c.g;
      this.cols[i * 3 + 2] = c.b;
    });
    for (const v of TREE_VARIANTS) {
      const count = this.trees.filter((t) => t.variant === v).length;
      if (!count) continue;
      const { geos, material, leaf } = this.prepare(gltfs.get(v)!, v);
      geos.forEach((geo, li) => this.addLevel(`${v}:${li}`, geo, material, count));
      this.addLevel(`${v}:3`, this.billboard(geos[0], material, leaf), this.billboardMaterial(this.bake(geos[0], material)), count, true);
    }
    this.ready = true;
    const dbg = Object.assign(() => this.stats(), {
      /** A tree of `variant` with a height multiplier in [lo, hi] and no neighbour within `gap` m, nearest the origin (for screenshots). */
      /** Draw only the given tree (an object from pick) at full detail; null restores the forest. */
      only: (t: { x: number; z: number } | null) => {
        this.solo = t ? this.trees.findIndex((o) => o.x === t.x && o.z === t.z) : -1;
        this.acc = 1;
      },
      forceLod: (n: number) => {
        this.force = n;
        this.acc = 1;
      },
      /** Trees within `r` m of a point (for screenshots). */
      near: (x: number, z: number, r: number) => this.trees.filter((t) => Math.hypot(t.x - x, t.z - z) < r).map((t) => ({ x: t.x, z: t.z, h: t.h, w: t.w })),
      pick: (variant: string, lo = 0.7, hi = 1.2, gap = 2.4) =>
        this.trees
          .filter((t) => t.variant === variant && (t.tree >= 0 || variant.startsWith('bush')) && t.h >= lo && t.h <= hi && !this.trees.some((o) => o !== t && Math.hypot(o.x - t.x, o.z - t.z) < gap))
          .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0] ?? null,
    });
    (window as unknown as { __trees?: unknown }).__trees = dbg;
  }

  /** Merge each level's trunk and leaves into one geometry, and build the variant's alpha-tested material. */
  private prepare(scene: Object3D, v: TreeVariant): { geos: BufferGeometry[]; material: MeshLambertMaterial; leaf: Texture | null } {
    let leaf: Texture | null = null;
    const geos: BufferGeometry[] = [];
    for (let li = 0; li < 3; li++) {
      const parts: BufferGeometry[] = [];
      const trunk = scene.getObjectByName(`Trunk_LOD${li}`) as Mesh | undefined;
      const leaves = scene.getObjectByName(`Leaves_LOD${li}`) as Mesh | undefined;
      if (trunk) parts.push(this.tagged(trunk.geometry, true));
      if (leaves) {
        parts.push(this.tagged(leaves.geometry, false));
        leaf ??= (leaves.material as MeshLambertMaterial).map;
      }
      geos.push(this.merge(parts));
    }
    const material = new MeshLambertMaterial({ vertexColors: true, map: leaf ?? undefined, alphaTest: 0.5, side: DoubleSide });
    this.wind(material, false);
    this.disposables.push(material, ...geos);
    return { geos, material, leaf };
  }

  /** Plain copies of a GLB geometry (the loader may hand back interleaved attributes), with bark/leaf tagging. */
  private tagged(src: BufferGeometry, bark: boolean): BufferGeometry {
    const g = new BufferGeometry();
    const pos = src.attributes.position;
    const nor = src.attributes.normal;
    const suv = src.attributes.uv;
    const sc = src.attributes.color;
    const P = new Float32Array(pos.count * 3);
    const N = new Float32Array(pos.count * 3);
    const UV = new Float32Array(pos.count * 2);
    const C = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      P[i * 3] = pos.getX(i);
      P[i * 3 + 1] = pos.getY(i);
      P[i * 3 + 2] = pos.getZ(i);
      N[i * 3] = nor.getX(i);
      N[i * 3 + 1] = nor.getY(i);
      N[i * 3 + 2] = nor.getZ(i);
      UV[i * 2] = bark ? BARK_UV : suv.getX(i);
      UV[i * 2 + 1] = bark ? BARK_UV : suv.getY(i);
      C[i * 3] = bark && sc ? sc.getX(i) : 1;
      C[i * 3 + 1] = bark && sc ? sc.getY(i) : 1;
      C[i * 3 + 2] = bark && sc ? sc.getZ(i) : 1;
    }
    g.setAttribute('position', new BufferAttribute(P, 3));
    g.setAttribute('normal', new BufferAttribute(N, 3));
    g.setAttribute('uv', new BufferAttribute(UV, 2));
    g.setAttribute('color', new BufferAttribute(C, 3));
    const idx = src.index!;
    const I = new Uint32Array(idx.count);
    for (let i = 0; i < idx.count; i++) I[i] = idx.getX(i);
    g.setIndex(new BufferAttribute(I, 1));
    return g;
  }

  private merge(parts: BufferGeometry[]): BufferGeometry {
    const out = new BufferGeometry();
    let verts = 0;
    let idx = 0;
    for (const g of parts) {
      verts += g.attributes.position.count;
      idx += g.index!.count;
    }
    const P = new Float32Array(verts * 3);
    const N = new Float32Array(verts * 3);
    const UV = new Float32Array(verts * 2);
    const C = new Float32Array(verts * 3);
    const I = new Uint32Array(idx);
    let v0 = 0;
    let i0 = 0;
    for (const g of parts) {
      P.set(g.attributes.position.array as Float32Array, v0 * 3);
      N.set(g.attributes.normal.array as Float32Array, v0 * 3);
      UV.set(g.attributes.uv.array as Float32Array, v0 * 2);
      C.set(g.attributes.color.array as Float32Array, v0 * 3);
      const gi = g.index!.array;
      for (let k = 0; k < gi.length; k++) I[i0 + k] = gi[k] + v0;
      v0 += g.attributes.position.count;
      i0 += gi.length;
    }
    out.setAttribute('position', new BufferAttribute(P, 3));
    out.setAttribute('normal', new BufferAttribute(N, 3));
    out.setAttribute('uv', new BufferAttribute(UV, 2));
    out.setAttribute('color', new BufferAttribute(C, 3));
    out.setIndex(new BufferAttribute(I, 1));
    return out;
  }

  /** Wind (vertex sway growing with height squared, a quick flutter on leaf cards) and the bark/leaf texture switch. */
  private wind(mat: MeshLambertMaterial, billboard: boolean): void {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.uniforms.uWind = this.uniforms.uWind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
          {
            vec3 ip = instanceMatrix[3].xyz;
            float ph = ip.x * 0.37 + ip.z * 0.53;
            float h = max(position.y, 0.0);
            float sway = sin(uTime * 1.1 + ph) * 0.6 + sin(uTime * 1.9 + ph * 1.7) * 0.4;
            float leaf = ${billboard ? '0.0' : 'step(-0.5, uv.x)'};
            transformed.x += sway * uWind * 0.012 * h * h;
            transformed.z += cos(uTime * 0.9 + ph) * uWind * 0.008 * h * h;
            transformed += leaf * uWind * 0.02 * vec3(sin(uTime * 5.0 + position.x * 9.0 + ph), 0.0, cos(uTime * 4.3 + position.z * 9.0 + ph)) * h * 0.1;
          }
          #endif`,
        );
      if (!billboard) {
        sh.fragmentShader = sh.fragmentShader.replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            vec4 sampledDiffuseColor = texture2D( map, vMapUv );
            // Bark vertices (uv < -0.5) skip the leaf texture and use their vertex colour only.
            float notBark = step(-0.5, vMapUv.x);
            diffuseColor *= mix(vec4(1.0), sampledDiffuseColor, notBark);
          #endif`,
        );
      }
    };
  }

  /** One front view of a variant (medium detail) rendered to a small texture, for the far billboard. */
  private bake(geo: BufferGeometry, material: MeshLambertMaterial): WebGLRenderTarget {
    const size = 128;
    const rt = new WebGLRenderTarget(size, size);
    rt.texture.colorSpace = SRGBColorSpace;
    geo.computeBoundingBox();
    const b = geo.boundingBox!;
    const ext = Math.max(b.max.y - b.min.y, b.max.x - b.min.x, b.max.z - b.min.z) * 1.04;
    const cam = new OrthographicCamera(-ext / 2, ext / 2, ext, 0, 0.1, 50);
    cam.position.set(0, 0, 10);
    const sc = new Scene();
    // Near-flat light: the card is lit again by the scene at run time, so the baked image must hold albedo, not a lit tree.
    sc.add(new AmbientLight(0xffffff, 1.3), new DirectionalLight(0xffffff, 0.5));
    const mesh = new Mesh(geo, material);
    sc.add(mesh);
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const clear = r.getClearAlpha();
    const clearColor = new Color();
    r.getClearColor(clearColor);
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(sc, cam);
    r.setRenderTarget(prev);
    r.setClearColor(clearColor, clear);
    (rt as unknown as { ext: number }).ext = ext;
    this.disposables.push(rt);
    return rt;
  }

  private billboard(geo: BufferGeometry, _m: Material, _t: Texture | null): BufferGeometry {
    geo.computeBoundingBox();
    const b = geo.boundingBox!;
    const ext = Math.max(b.max.y - b.min.y, b.max.x - b.min.x, b.max.z - b.min.z) * 1.04;
    const plane = new PlaneGeometry(ext, ext).translate(0, ext / 2, 0);
    // Normals point up so the card is lit like foliage from above, whatever way it faces.
    const n = plane.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    this.disposables.push(plane);
    return plane;
  }

  private billboardMaterial(rt: WebGLRenderTarget): MeshLambertMaterial {
    const mat = new MeshLambertMaterial({ map: rt.texture, alphaTest: 0.4, side: DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace(
        '#include <project_vertex>',
        `vec3 bip = instanceMatrix[3].xyz;
        float bsx = length(instanceMatrix[0].xyz);
        float bsy = length(instanceMatrix[1].xyz);
        vec3 bto = normalize(vec3(cameraPosition.x - bip.x, 0.0, cameraPosition.z - bip.z) + vec3(1e-4));
        vec3 bwp = bip + vec3(bto.z, 0.0, -bto.x) * position.x * bsx + vec3(0.0, position.y * bsy, 0.0);
        vec4 mvPosition = viewMatrix * vec4(bwp, 1.0);
        gl_Position = projectionMatrix * mvPosition;`,
      );
    };
    this.disposables.push(mat);
    return mat;
  }

  private addLevel(key: string, geo: BufferGeometry, mat: Material, capacity: number, billboard = false): void {
    const mesh = new InstancedMesh(geo, mat, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.name = `Tree_${key}`;
    this.root.add(mesh);
    const tris = billboard ? 2 : (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    this.levels.set(key, { mesh, tris, n: 0 });
  }

  /** Counts per level and triangles currently submitted (debug and the perf report). */
  stats(): { trees: number; instances: number; triangles: number; draws: number; byLod: number[]; trisByLod: number[] } {
    const byLod = [0, 0, 0, 0];
    const trisByLod = [0, 0, 0, 0];
    let instances = 0;
    let triangles = 0;
    let draws = 0;
    for (const l of this.levels.values()) {
      if (l.n > 0) draws++;
      instances += l.n;
      triangles += l.n * l.tris;
      const k = Number(l.mesh.name.slice(-1));
      byLod[k] += l.n;
      trisByLod[k] += l.n * l.tris;
    }
    return { trees: this.trees.length, instances, triangles, draws, byLod, trisByLod };
  }

  update(delta: number, time: number): void {
    if (!this.ready) return;
    this.uniforms.uTime.value = time;
    this.uniforms.uWind.value += (0.15 + getGame(this.world).env.windStrength * 1.2 - this.uniforms.uWind.value) * Math.min(1, delta);
    if ((this.acc += delta) < UPDATE_EVERY) return;
    this.acc = 0;
    this.camera.getWorldPosition(this.head);
    this.camera.getWorldDirection(this.fwd);
    const fl = Math.hypot(this.fwd.x, this.fwd.z) || 1;
    const fx = this.fwd.x / fl;
    const fz = this.fwd.z / fl;
    for (const l of this.levels.values()) l.n = 0;
    const keys = new Map<string, Level>();
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      const dx = t.x - this.head.x;
      const dz = t.z - this.head.z;
      const d2 = dx * dx + dz * dz;
      const d = Math.sqrt(d2);
      if (this.solo >= 0 && i !== this.solo) continue;
      const lod = this.solo >= 0 ? 0 : this.force >= 0 ? (this.force as Lod) : lodFor(d2 * t.bias * t.bias, this.lod[i]);
      this.lod[i] = lod;
      if (!worthDrawing(d, (dx * fx + dz * fz) / (d || 1))) continue;
      const key = `${t.variant}:${lod}`;
      const l = this.levels.get(key) ?? keys.get(key);
      if (!l) continue;
      l.mesh.instanceMatrix.array.set(this.mats.subarray(i * 16, i * 16 + 16), l.n * 16);
      (l.mesh.instanceColor!.array as Float32Array).set(this.cols.subarray(i * 3, i * 3 + 3), l.n * 3);
      l.n++;
    }
    for (const l of this.levels.values()) {
      l.mesh.count = l.n;
      l.mesh.visible = l.n > 0;
      l.mesh.instanceMatrix.needsUpdate = true;
      l.mesh.instanceColor!.needsUpdate = true;
    }
  }
}
