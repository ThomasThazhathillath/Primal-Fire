// The forest floor, the stream and the trees, built from src/game/world-layout.
// Everything is placed in world coordinates, so these assets sit at the origin.
// Budget (Quest browser): trees are one InstancedMesh of a merged low-poly
// geometry, and nothing casts real-time shadows.

import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { clamp, mulberry32, range, valueNoise } from '../game/rng.js';
import {
  inClearing,
  LANDMARK_BY_ID,
  nearestTreeDistance,
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
  const geo = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 180, 180);
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
  const litter = new Color(0x6d5430);
  const moss = new Color(0x3b5a2a);
  const mud = new Color(0x2f261c);
  const damp = new Color(0x453823);
  const M = LANDMARK_BY_ID;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    c.copy(floor).lerp(dirt, valueNoise(x * 0.12, z * 0.12) * 0.7);
    // Leaf-litter drifts and mossy patches at two scales, plus fine speckle.
    c.lerp(litter, clamp(valueNoise(x * 0.35 + 40, z * 0.35) * 1.8 - 0.7, 0, 0.75));
    c.lerp(moss, clamp(valueNoise(x * 0.21, z * 0.21 + 90) * 2.2 - 1.15, 0, 0.7));
    c.multiplyScalar(0.88 + valueNoise(x * 2.1, z * 2.1) * 0.24);
    const dm = Math.hypot(x - M.meadow.x, z - M.meadow.z);
    if (dm < 9) c.lerp(meadow, clamp(1.3 - dm / 7.5, 0, 1));
    const dw = Math.hypot(x - M.wake.x, z - M.wake.z);
    if (dw < 7) c.lerp(clearing, clamp(1.2 - dw / 6, 0, 0.8));
    const dg = Math.hypot(x - M.glade.x, z - M.glade.z);
    if (dg < 1.8) c.lerp(scorched, clamp(1.6 - dg, 0, 1));
    const sd = streamDistance(x, z);
    if (sd < 5) c.lerp(damp, clamp(1 - (sd - 1.5) / 3.5, 0, 0.6));
    if (sd < 2.2) c.lerp(bank, clamp(1 - (sd - 0.6) / 1.6, 0, 1));
    if (sd < 1.6) c.lerp(mud, clamp(1.15 - (sd - 0.5) / 1.1, 0, 0.9));
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

/** A low-poly broadleaf: trunk + two lumpy canopy blobs, merged with vertex colours. */
function broadleafGeometry(): BufferGeometry {
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
  parts.push(tint(new CylinderGeometry(0.13, 0.2, 2.0, 5).translate(0, 1.0, 0), 0x6a5a48));
  parts.push(tint(new IcosahedronGeometry(1.15, 0).scale(1, 0.85, 1).translate(0, 2.7, 0), 0x4d7a35));
  parts.push(tint(new IcosahedronGeometry(0.85, 0).translate(0.5, 3.4, 0.25), 0x5b8a3a));
  return mergeNonIndexed(parts);
}

/** A dead snag: bare grey trunk with a couple of broken branch stubs. */
function snagGeometry(): BufferGeometry {
  const tint = (g: BufferGeometry, hex: number) => {
    const g2 = g.toNonIndexed();
    const arr = new Float32Array(g2.attributes.position.count * 3);
    const tmp = new Color();
    for (let i = 0; i < g2.attributes.position.count; i++) writeColor(arr, i, hex, tmp);
    g2.setAttribute('color', new BufferAttribute(arr, 3));
    g2.deleteAttribute('uv');
    return g2;
  };
  const parts = [
    tint(new CylinderGeometry(0.06, 0.2, 3.6, 5).translate(0, 1.8, 0), 0x7d7468),
    tint(new CylinderGeometry(0.02, 0.05, 1.0, 4).rotateZ(1.1).translate(0.45, 2.7, 0), 0x6f675c),
    tint(new CylinderGeometry(0.02, 0.045, 0.8, 4).rotateZ(-1.0).translate(-0.35, 2.1, 0.1), 0x6f675c),
  ];
  return mergeNonIndexed(parts);
}

/** All trees: one InstancedMesh per species (3 draw calls). Instance colours vary each shade. */
export function createForestTrees(): Object3D {
  const root = new Group();
  root.name = 'ForestTrees';
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const s = new Vector3();
  const p = new Vector3();
  const col = new Color();
  // Multiplies the baked vertex colours: near-white keeps trunks brown.
  const shades = [0xffffff, 0xe6f0dc, 0xd2dccb, 0xf2f7e4];
  const geos = [treeGeometry(), broadleafGeometry(), snagGeometry()];
  const names = ['Pines', 'Broadleaves', 'Snags'];
  const lean = new Quaternion();
  const axis = new Vector3();
  geos.forEach((geo, kind) => {
    const list = TREES.filter((t) => t.kind === kind);
    const mesh = new InstancedMesh(geo, new MeshLambertMaterial({ vertexColors: true, flatShading: true }), Math.max(1, list.length));
    mesh.name = names[kind];
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rotY);
      lean.setFromAxisAngle(axis.set(Math.cos(t.leanDir), 0, Math.sin(t.leanDir)), t.lean);
      q.premultiply(lean);
      const w = t.scale * t.girth;
      m.compose(p.set(t.x, 0, t.z), q, s.set(w, t.scale * t.height, w));
      mesh.setMatrixAt(i, m);
      // Snags are grey-brown; living trees vary in shade.
      mesh.setColorAt(i, col.setHex(kind === 2 ? 0xffffff : shades[t.tint]).offsetHSL((t.tint - 1.5) * 0.012, 0, (t.rotY % 0.1) - 0.05));
    });
    mesh.count = list.length;
    mesh.computeBoundingSphere();
    root.add(mesh);
  });
  return root;
}

/** Six drooping fronds around a point, merged into one geometry. */
function fernGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const frond = new ConeGeometry(0.09, 0.7, 3).translate(0, 0.35, 0).rotateZ(-0.9).translate(0.05, 0.02, 0).rotateY((k / 6) * Math.PI * 2);
    parts.push(frond.toNonIndexed());
  }
  const out = new BufferGeometry();
  for (const name of ['position', 'normal']) {
    const total = parts.reduce((n, g) => n + g.attributes[name].array.length, 0);
    const arr = new Float32Array(total);
    let off = 0;
    for (const g of parts) {
      arr.set(g.attributes[name].array as Float32Array, off);
      off += g.attributes[name].array.length;
    }
    out.setAttribute(name, new BufferAttribute(arr, 3));
  }
  return out;
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

  // Ferns: a merged 6-frond tuft, instanced.
  const FERNS = 700;
  const ferns = new InstancedMesh(fernGeometry(), lambert(0xffffff, { side: DoubleSide }), FERNS);
  ferns.name = 'Ferns';
  n = 0;
  for (let tries = 0; n < FERNS && tries < 12000; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 4 + Math.sqrt(rng()) * (WORLD_RADIUS + 6);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inClearing(x, z, 0) || streamDistance(x, z) < 1.2) continue;
    const sc = range(rng, 0.6, 1.3);
    m.compose(p.set(x, 0, z), q.setFromAxisAngle(up, rng() * 6), s.set(sc, sc, sc));
    ferns.setMatrixAt(n, m);
    ferns.setColorAt(n, col.setHex([0x3f7a2e, 0x4e8a34, 0x356a2a, 0x5a9a3c][n % 4]));
    n++;
  }
  ferns.count = n;
  ferns.frustumCulled = false;
  root.add(ferns);

  // Fallen logs: decorative trunks lying in the leaf litter.
  const LOGS = 40;
  const logs = new InstancedMesh(new CylinderGeometry(0.16, 0.2, 1, 7).rotateZ(Math.PI / 2), lambert(0xffffff), LOGS);
  logs.name = 'FallenTrunks';
  n = 0;
  for (let tries = 0; n < LOGS && tries < 3000; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 7 + rng() * (WORLD_RADIUS - 4);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inClearing(x, z, 1) || streamDistance(x, z) < 2.4 || nearestTreeDistance(x, z, 2) < 1.2) continue;
    const len = range(rng, 2, 4.5);
    const th = range(rng, 0.8, 1.5);
    m.compose(p.set(x, 0.16 * th, z), q.setFromAxisAngle(up, rng() * 6), s.set(len, th, th));
    logs.setMatrixAt(n, m);
    logs.setColorAt(n, col.setHex([0x5a4636, 0x4d3d2f, 0x66503c][n % 3]));
    n++;
  }
  logs.count = n;
  root.add(logs);
  return root;
}

/**
 * Distant ridges ringing the valley, outside the playable area. Each layer is
 * one merged strip (unlit, fog-exempt) tinted towards the horizon colour with
 * distance, so four draw calls give atmospheric depth.
 */
export function createMountains(): Object3D {
  const root = new Group();
  root.name = 'Mountains';
  const horizon = new Color(0.62, 0.72, 0.76);
  const near = new Color(0.07, 0.16, 0.16);
  // [radius, peak height, noise frequency, seed, haze 0..1]
  const layers: Array<[number, number, number, number, number]> = [
    [96, 42, 7, 1, 0.38],
    [130, 70, 5, 2, 0.52],
    [170, 100, 4, 3, 0.68],
    [215, 125, 3, 4, 0.82],
  ];
  const SEG = 128;
  layers.forEach(([radius, peak, freq, seed, haze], li) => {
    const verts = new Float32Array((SEG + 1) * 2 * 3);
    const index: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      // Wrap noise seamlessly by sampling on a circle.
      const nx = Math.cos(a) * freq + seed * 17;
      const nz = Math.sin(a) * freq + seed * 31;
      const h = peak * (0.25 + 0.75 * Math.pow(valueNoise(nx, nz) * 0.65 + valueNoise(nx * 2.3, nz * 2.3) * 0.35, 1.4));
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      verts.set([x, -6, z, x, h, z], i * 6);
      if (i < SEG) {
        const k = i * 2;
        index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(verts, 3));
    geo.setIndex(index);
    const mat = new MeshBasicMaterial({ color: near.clone().lerp(horizon, haze), fog: false, side: DoubleSide });
    const mesh = new Mesh(geo, mat);
    mesh.name = `Ridge${li}`;
    mesh.frustumCulled = false;
    root.add(mesh);
  });
  return root;
}

/**
 * Small ground dressing, each kind one InstancedMesh: leaf-litter flakes,
 * pebbles (more and darker near the water), moss cushions and half-buried
 * roots at tree feet. Purely decorative; gatherables live in world-layout.
 */
export function createGroundDetail(): Object3D {
  const root = new Group();
  root.name = 'GroundDetail';
  const rng = mulberry32(61);
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const s = new Vector3();
  const p = new Vector3();
  const col = new Color();
  const R = WORLD_RADIUS + 6;
  const spot = (minR: number): [number, number] => {
    const a = rng() * Math.PI * 2;
    const r = minR + Math.sqrt(rng()) * (R - minR);
    return [Math.cos(a) * r, Math.sin(a) * r];
  };

  const flakes = new InstancedMesh(new CircleGeometry(1, 5).rotateX(-Math.PI / 2), lambert(0xffffff, { side: DoubleSide }), 900);
  flakes.name = 'LeafFlakes';
  let n = 0;
  for (let tries = 0; n < 900 && tries < 3000; tries++) {
    const [x, z] = spot(1);
    if (inClearing(x, z, -2) || streamDistance(x, z) < 0.8) continue;
    const sc = range(rng, 0.07, 0.16);
    m.compose(p.set(x, 0.02 + rng() * 0.01, z), q.setFromAxisAngle(up, rng() * 6), s.set(sc, 1, sc * 0.7));
    flakes.setMatrixAt(n, m);
    flakes.setColorAt(n, col.setHex([0xa8793a, 0x8c6230, 0xb98b45, 0x7a5528, 0x5e4a22][n % 5]));
    n++;
  }
  flakes.count = n;
  flakes.frustumCulled = false;
  root.add(flakes);

  const pebbles = new InstancedMesh(new DodecahedronGeometry(1, 0), lambert(0xffffff), 700);
  pebbles.name = 'Pebbles';
  n = 0;
  for (let tries = 0; n < 700 && tries < 5000; tries++) {
    const [x, z] = spot(1);
    const sd = streamDistance(x, z);
    // Pebbles gather near the water: thin out quickly with distance.
    if (inClearing(x, z, -2) || sd < 0.75 || rng() > (sd < 4 ? 1 : 0.18)) continue;
    const sc = range(rng, 0.03, 0.11);
    m.compose(p.set(x, sc * 0.3, z), q.setFromAxisAngle(up, rng() * 6), s.set(sc, sc * 0.65, sc * 0.85));
    pebbles.setMatrixAt(n, m);
    pebbles.setColorAt(n, col.setHex(sd < 3 ? [0x4f4d4a, 0x5f5c57, 0x6e6a62][n % 3] : [0x8a857b, 0x77736b, 0x9a948a][n % 3]));
    n++;
  }
  pebbles.count = n;
  pebbles.frustumCulled = false;
  root.add(pebbles);

  const mossCush = new InstancedMesh(new SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xffffff), 260);
  mossCush.name = 'MossCushions';
  n = 0;
  for (let tries = 0; n < 260 && tries < 3000; tries++) {
    const [x, z] = spot(2);
    if (inClearing(x, z, -2) || streamDistance(x, z) < 1.0) continue;
    const sc = range(rng, 0.12, 0.4);
    m.compose(p.set(x, 0, z), q.setFromAxisAngle(up, rng() * 6), s.set(sc, sc * 0.35, sc));
    mossCush.setMatrixAt(n, m);
    mossCush.setColorAt(n, col.setHex([0x3b5a2a, 0x4a6b34, 0x33522a][n % 3]));
    n++;
  }
  mossCush.count = n;
  mossCush.frustumCulled = false;
  root.add(mossCush);

  // Roots: a bent half-buried cylinder flaring out from each nearby trunk.
  const sample = TREES.filter((t) => t.scale * t.girth > 0.85);
  const roots = new InstancedMesh(new CylinderGeometry(0.03, 0.09, 1, 5).rotateZ(Math.PI / 2).translate(0.5, 0, 0), lambert(0xffffff), sample.length * 3);
  roots.name = 'Roots';
  n = 0;
  for (const t of sample) {
    for (let k = 0; k < 3; k++) {
      const len = range(rng, 0.5, 1.1) * t.scale;
      const a = rng() * Math.PI * 2;
      m.compose(p.set(t.x, 0.015, t.z), q.setFromAxisAngle(up, a), s.set(len, 1 + t.scale * 0.5, 1));
      roots.setMatrixAt(n, m);
      roots.setColorAt(n, col.setHex(t.kind === 2 ? 0x6f675c : 0x4a3a28));
      n++;
    }
  }
  roots.count = n;
  roots.frustumCulled = false;
  root.add(roots);
  return root;
}
