// The forest floor, the stream and the trees, built from src/game/world-layout.
// Everything is placed in world coordinates, so these assets sit at the origin.
// Budget (Quest browser): trees are one InstancedMesh of a merged low-poly
// geometry, and nothing casts real-time shadows.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { clamp, mulberry32, range, valueNoise } from '../game/rng.js';
import {
  inClearing,
  LANDMARK_BY_ID,
  STREAM,
  STREAM_HALF_WIDTH,
  streamDistance,
  TREES,
  WORLD_RADIUS,
} from '../game/world-layout.js';
import { lambert, writeColor } from './materials.js';

const GROUND_SIZE = 140;

/** Flat ground with painted variation: forest floor, meadow, clearing, banks. */
export function createForestGround(): Object3D {
  const geo = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 100, 100);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  const floor = new Color(0x4a5630);
  const dirt = new Color(0x5e4c35);
  const meadow = new Color(0x8f9446);
  const clearing = new Color(0x6f6440);
  const bank = new Color(0x7d6a4c);
  const scorched = new Color(0x2b2420);
  const M = LANDMARK_BY_ID;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    c.copy(floor).lerp(dirt, valueNoise(x * 0.12, z * 0.12) * 0.7);
    const dm = Math.hypot(x - M.meadow.x, z - M.meadow.z);
    if (dm < 9) c.lerp(meadow, clamp(1.3 - dm / 7.5, 0, 1));
    const dw = Math.hypot(x - M.wake.x, z - M.wake.z);
    if (dw < 7) c.lerp(clearing, clamp(1.2 - dw / 6, 0, 0.8));
    const dg = Math.hypot(x - M.glade.x, z - M.glade.z);
    if (dg < 1.8) c.lerp(scorched, clamp(1.6 - dg, 0, 1));
    const sd = streamDistance(x, z);
    if (sd < 2.2) c.lerp(bank, clamp(1 - (sd - 0.6) / 1.6, 0, 1));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  const ground = new Mesh(geo, new MeshLambertMaterial({ vertexColors: true }));
  ground.name = 'ForestGround';
  return ground;
}

/** A water ribbon along the stream centreline, plus pebbles on the banks. */
export function createStream(): Object3D {
  const root = new Group();
  root.name = 'Stream';
  // Resample the polyline so the ribbon bends smoothly.
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [ax, az] = STREAM[i];
    const [bx, bz] = STREAM[i + 1];
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
    for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  pts.push([...STREAM[STREAM.length - 1]] as [number, number]);
  const verts = new Float32Array(pts.length * 2 * 3);
  const index: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const [px, pz] = pts[Math.max(0, i - 1)];
    const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
    let tx = nx - px;
    let tz = nz - pz;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const w = STREAM_HALF_WIDTH * (0.85 + 0.3 * valueNoise(i * 0.3, 7));
    verts.set([x - tz * w, 0.025, z + tx * w, x + tz * w, 0.025, z - tx * w], i * 6);
    if (i < pts.length - 1) {
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(verts, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const water = new Mesh(
    geo,
    new MeshPhongMaterial({ color: 0x3f7f9e, shininess: 80, specular: 0x8fb8cc }),
  );
  water.name = 'Water';
  root.add(water);

  // Pebbles lining both banks: one instanced draw call.
  const rng = mulberry32(5);
  const pebbles = new InstancedMesh(new DodecahedronGeometry(1, 0), lambert(0xffffff), 420);
  pebbles.name = 'BankPebbles';
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();
  const col = new Color();
  let count = 0;
  for (let i = 0; i < pts.length - 1 && count < 420; i++) {
    for (const side of [-1, 1]) {
      if (rng() < 0.35 || count >= 420) continue;
      const [x, z] = pts[i];
      const [nx, nz] = pts[i + 1];
      const len = Math.hypot(nx - x, nz - z) || 1;
      const off = side * range(rng, 0.7, 1.05);
      const r = range(rng, 0.06, 0.16);
      m.compose(
        p.set(x - ((nz - z) / len) * off, r * 0.3, z + ((nx - x) / len) * off),
        q.setFromAxisAngle(s.set(0, 1, 0), rng() * 6),
        s.set(r, r * 0.7, r),
      );
      pebbles.setMatrixAt(count, m);
      pebbles.setColorAt(count++, col.setHex([0x7d7a72, 0x8f8a80, 0x6b6862][count % 3]));
    }
  }
  pebbles.count = count;
  root.add(pebbles);
  return root;
}

/** A low-poly conifer: trunk + three stacked cones, merged with vertex colours. */
function treeGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const tint = (g: BufferGeometry, hex: number) => {
    const g2 = g.toNonIndexed();
    const arr = new Float32Array(g2.attributes.position.count * 3);
    const tmp = new Color();
    for (let i = 0; i < g2.attributes.position.count; i++) writeColor(arr, i, hex, tmp);
    g2.setAttribute('color', new BufferAttribute(arr, 3));
    g2.deleteAttribute('uv');
    return g2;
  };
  parts.push(tint(new CylinderGeometry(0.11, 0.17, 1.6, 5).translate(0, 0.8, 0), 0x5a4027));
  for (let k = 0; k < 3; k++) {
    const r = 1.2 - k * 0.3;
    const cone = new ConeGeometry(r, 1.5, 7).translate(0, 1.5 + k * 0.75, 0);
    parts.push(tint(cone, [0x2f5a2c, 0x355f30, 0x3a6a33][k]));
  }
  return mergeNonIndexed(parts);
}

/** Concatenates non-indexed geometries that share position/normal/color. */
function mergeNonIndexed(parts: BufferGeometry[]): BufferGeometry {
  const out = new BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const total = parts.reduce((n, g) => n + g.attributes[name].array.length, 0);
    const arr = new Float32Array(total);
    let offset = 0;
    for (const g of parts) {
      arr.set(g.attributes[name].array as Float32Array, offset);
      offset += g.attributes[name].array.length;
    }
    out.setAttribute(name, new BufferAttribute(arr, 3));
  }
  return out;
}

/** All trees in one draw call. Instance colours vary each tree's shade. */
export function createForestTrees(): Object3D {
  const mesh = new InstancedMesh(treeGeometry(), new MeshLambertMaterial({ vertexColors: true, flatShading: true }), TREES.length);
  mesh.name = 'ForestTrees';
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const s = new Vector3();
  const p = new Vector3();
  const col = new Color();
  // Multiplies the baked vertex colours: near-white keeps trunks brown.
  const shades = [0xffffff, 0xe6f0dc, 0xd2dccb, 0xf2f7e4];
  TREES.forEach((t, i) => {
    m.compose(p.set(t.x, 0, t.z), q.setFromAxisAngle(up, t.rotY), s.set(t.scale, t.scale * 1.1, t.scale));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.setHex(shades[t.tint]));
  });
  mesh.computeBoundingSphere();
  return mesh;
}

/** Bushes (walk-through) and boulders, both instanced. */
export function createUndergrowth(): Object3D {
  const root = new Group();
  root.name = 'Undergrowth';
  const rng = mulberry32(31);
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const s = new Vector3();
  const p = new Vector3();
  const col = new Color();

  const bushes = new InstancedMesh(new IcosahedronGeometry(1, 0), lambert(0xffffff), 260);
  bushes.name = 'Bushes';
  let n = 0;
  for (let tries = 0; n < 260 && tries < 6000; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 6 + rng() * (WORLD_RADIUS + 4);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inClearing(x, z, -0.5) || streamDistance(x, z) < 1.6) continue;
    const sc = range(rng, 0.25, 0.6);
    m.compose(p.set(x, sc * 0.45, z), q.setFromAxisAngle(up, rng() * 6), s.set(sc, sc * 0.75, sc));
    bushes.setMatrixAt(n, m);
    bushes.setColorAt(n, col.setHex([0x3d5f2e, 0x4a6b34, 0x36542a][n % 3]));
    n++;
  }
  bushes.count = n;
  root.add(bushes);

  const boulders = new InstancedMesh(new DodecahedronGeometry(1, 0), lambert(0xffffff), 45);
  boulders.name = 'Boulders';
  n = 0;
  for (let tries = 0; n < 45 && tries < 2000; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 8 + rng() * WORLD_RADIUS;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inClearing(x, z, 0.5) || streamDistance(x, z) < 1.8) continue;
    const sc = range(rng, 0.2, 0.85);
    m.compose(p.set(x, sc * 0.35, z), q.setFromAxisAngle(up, rng() * 6), s.set(sc, sc * 0.8, sc));
    boulders.setMatrixAt(n, m);
    boulders.setColorAt(n, col.setHex([0x8a857b, 0x77736b, 0x6e6a62][n % 3]));
    n++;
  }
  boulders.count = n;
  root.add(boulders);
  return root;
}
