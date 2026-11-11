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
  BOULDERS,
  FALLEN_TRUNKS,
  groundHeight,
  LANDMARK_BY_ID,
  LANDMARKS,
  nearestTreeDistance,
  STREAM,
  STREAM_HALF_WIDTH,
  streamDistance,
  TREES,
  WORLD_RADIUS,
} from '../game/world-layout.js';
import { lambert, writeColor } from './materials.js';

const GROUND_SIZE = 140;

/** Distance to the nearest worn path (straight lines from the clearing to each landmark). */
function pathDistance(x: number, z: number): number {
  let best = Infinity;
  for (const l of LANDMARKS) {
    if (l.id === 'wake') continue;
    const len2 = l.x * l.x + l.z * l.z;
    const t = clamp((x * l.x + z * l.z) / len2, 0, 1);
    // Wobble the path sideways so it is not ruler-straight.
    const w = (valueNoise(t * 9 + l.x, l.z) - 0.5) * 2.2;
    const px = l.x * t - (l.z / Math.sqrt(len2)) * w;
    const pz = l.z * t + (l.x / Math.sqrt(len2)) * w;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}

/** Ground with gentle undulation and painted variation: forest floor, meadow, clearing, banks. */
export function createForestGround(): Object3D {
  const geo = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 200, 200);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  // Texture blend weights per vertex (forest ground, leaf litter, stream mud), used by GroundSystem's ground shader.
  const zone = new Float32Array(pos.count * 3);
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
  const grassy = new Color(0x5a7a32);
  const bare = new Color(0x6b5638);
  const path = new Color(0x7a6448);
  const crack = new Color(0x261d14);
  const M = LANDMARK_BY_ID;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    c.copy(floor).lerp(dirt, valueNoise(x * 0.12, z * 0.12) * 0.7);
    // Leaf-litter drifts and mossy patches at two scales, plus fine speckle.
    c.lerp(litter, clamp(valueNoise(x * 0.35 + 40, z * 0.35) * 1.8 - 0.7, 0, 0.75));
    c.lerp(moss, clamp(valueNoise(x * 0.21, z * 0.21 + 90) * 2.2 - 1.15, 0, 0.7));
    // Patchy living grass and bare dirt.
    c.lerp(grassy, clamp(valueNoise(x * 0.5 + 7, z * 0.5 - 3) * 2.4 - 1.3, 0, 0.6));
    const bareN = valueNoise(x * 0.27 - 50, z * 0.27 + 11);
    c.lerp(bare, clamp(bareN * 2.4 - 1.4, 0, 0.7));
    // Hairline cracks in the bare soil: thin bands of a fine noise field.
    if (bareN > 0.55) {
      const k = Math.abs(valueNoise(x * 1.6 + 3, z * 1.6 - 9) - 0.5);
      if (k < 0.025) c.lerp(crack, (1 - k / 0.025) * 0.6);
    }
    // Worn paths from the waking clearing towards each landmark.
    const pd = pathDistance(x, z);
    if (pd < 1.1) c.lerp(path, clamp(1 - pd / 1.1, 0, 0.55));
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
    // Zones: mud along the water, open ground in the clearings and meadow, leaf litter under the trees.
    const wm = clamp(1.05 - (sd - 0.9) / 2.3, 0, 1);
    const open = Math.max(clamp(1.25 - dw / 6.5, 0, 1), clamp(1.3 - dm / 8, 0, 1), clamp(valueNoise(x * 0.09 + 20, z * 0.09 - 8) * 1.6 - 0.95, 0, 0.55));
    const wg = (1 - wm) * open;
    const wl = Math.max(0, 1 - wm - wg);
    zone[i * 3] = wg;
    zone[i * 3 + 1] = wl;
    zone[i * 3 + 2] = wm;
    pos.setY(i, groundHeight(x, z));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.setAttribute('zone', new BufferAttribute(zone, 3));
  geo.computeVertexNormals();
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

  return root;
}

/**
 * The forest's trees are drawn at runtime by TreeSystem from baked EZ-Tree GLBs (public/trees), placed from TREES
 * in world-layout. This asset stays in the scene (and keeps its name for the perf chunking) but holds nothing.
 */
export function createForestTrees(): Object3D {
  const root = new Group();
  root.name = 'ForestTrees';
  return root;
}

/** Seven thin blades leaning out from a point. */
function grassClumpGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const h = 0.18 + (k % 3) * 0.06;
    parts.push(new ConeGeometry(0.012, h, 3).translate(0, h / 2, 0).rotateZ(0.25 + (k % 2) * 0.2).rotateY((k / 7) * Math.PI * 2).toNonIndexed());
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

/** Boulders, instanced (the shrubs are drawn by TreeSystem). */
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

  // Boulders are drawn by RockSystem (baked Poly Haven rocks, see scripts/rocks/bake.mjs).

  // Ferns are drawn by TreeSystem (arching leaf cards).

  // Fallen logs: decorative trunks lying in the leaf litter.
  const LOGS = FALLEN_TRUNKS.length;
  // A rounder trunk with bark streaks and moss on the upper side baked into vertex colours (12 sides, 5 rings).
  const logGeo = new CylinderGeometry(0.16, 0.2, 1, 12, 5).rotateZ(Math.PI / 2);
  {
    const pos = logGeo.attributes.position;
    const lc = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ang = Math.atan2(z, y);
      const streak = valueNoise(ang * 3.2 + 11, x * 1.8);
      const fine = valueNoise(ang * 9 + 2, x * 6);
      let k = 0.72 + 0.4 * streak + 0.16 * fine;
      const top = Math.max(0, y / 0.2);
      const moss = Math.max(0, valueNoise(x * 3 + 5, ang * 2) * 1.6 - 0.65) * top;
      lc[i * 3] = k * (1 - moss) + 0.28 * moss;
      lc[i * 3 + 1] = k * (1 - moss) + 0.5 * moss;
      lc[i * 3 + 2] = k * (1 - moss) + 0.2 * moss;
      k = 0;
    }
    logGeo.setAttribute('color', new BufferAttribute(lc, 3));
  }
  const logs = new InstancedMesh(logGeo, lambert(0xffffff, { vertexColors: true, flatShading: false }), LOGS);
  logs.name = 'FallenTrunks';
  let n = 0;
  for (const t of FALLEN_TRUNKS) {
    m.compose(p.set(t.x, 0.16 * t.thick, t.z), q.setFromAxisAngle(up, t.rotY), s.set(t.length, t.thick, t.thick));
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
  // [radius, peak height, noise frequency, seed, haze 0..1, stone colour]
  // The nearest range is stony grey-brown with the strongest contours; each
  // farther one is greyer, bluer and hazier (atmospheric perspective). The
  // environment system hazes them toward the live fog colour (EnvironmentSystem).
  const layers: Array<[number, number, number, number, number, [number, number, number]]> = [
    [96, 42, 7, 1, 0.08, [0.3, 0.26, 0.22]],
    [130, 70, 5, 2, 0.2, [0.32, 0.29, 0.26]],
    [170, 100, 4, 3, 0.36, [0.33, 0.34, 0.36]],
    [215, 125, 3, 4, 0.55, [0.34, 0.38, 0.43]],
  ];
  // Each ridge is a grid (SEG around, ROWS up) with ridged-noise crags, a treeline of dark green on the lower slopes of the nearer ranges and
  // snow on the high peaks of the farther ones, all in vertex colours (still one unlit draw call per ridge).
  const SEG = 256;
  const ROWS = 7;
  layers.forEach(([radius, peak, freq, seed, haze, stone], li) => {
    const V = (SEG + 1) * (ROWS + 1);
    const verts = new Float32Array(V * 3);
    const cols = new Float32Array(V * 3);
    const index: number[] = [];
    const snowLine = li === 0 ? 2 : li === 1 ? 0.86 : 0.72;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      // Wrap noise seamlessly by sampling on a circle.
      const nx = Math.cos(a) * freq + seed * 17;
      const nz = Math.sin(a) * freq + seed * 31;
      const base = Math.pow(valueNoise(nx, nz) * 0.65 + valueNoise(nx * 2.3, nz * 2.3) * 0.35, 1.4);
      // Ridged crags: the sharp creases of 1 - |2n - 1|, stronger on the higher parts.
      const ridge = 1 - Math.abs(valueNoise(nx * 5.1 + 3, nz * 5.1 - 7) * 2 - 1);
      const h = peak * (0.25 + 0.75 * base) * (0.9 + 0.2 * ridge);
      for (let j = 0; j <= ROWS; j++) {
        const t = j / ROWS;
        const rr = radius * (1 - 0.05 * t * (0.6 + valueNoise(nx * 7 + j, nz * 7 - j)));
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        const y = -6 + (h + 6) * Math.pow(t, 0.9) + (valueNoise(nx * 9 + j * 3, nz * 9) - 0.5) * peak * 0.05 * t;
        const k = (i * (ROWS + 1) + j) * 3;
        verts[k] = x;
        verts[k + 1] = y;
        verts[k + 2] = z;
        const rock = valueNoise(nx * 3.1 + 9 + j * 0.3, nz * 3.1 - 5);
        let c = 0.78 + 0.34 * rock + 0.16 * (ridge - 0.5) * t;
        const warm = (valueNoise(nx * 1.4 - 3, nz * 1.4 + 11) - 0.5) * 0.16;
        let r = c + warm;
        let g = c;
        let b = c - warm;
        // Lower slopes of the near ranges: dark conifer green.
        const tree = (li < 2 ? 1 : 0.35) * Math.max(0, 1 - t * 3.2) * (0.6 + 0.4 * valueNoise(nx * 6, nz * 6 + j));
        r = r * (1 - tree) + 0.4 * tree;
        g = g * (1 - tree) + 0.6 * tree;
        b = b * (1 - tree) + 0.4 * tree;
        // Snow on the highest parts.
        const sn = Math.max(0, Math.min(1, (t * (0.55 + 0.45 * base) - snowLine * 0.7) / 0.18)) * (0.65 + 0.35 * ridge);
        const snow = Math.min(1, sn);
        r = r * (1 - snow) + 1.35 * snow;
        g = g * (1 - snow) + 1.38 * snow;
        b = b * (1 - snow) + 1.45 * snow;
        cols[k] = r;
        cols[k + 1] = g;
        cols[k + 2] = b;
      }
      if (i < SEG) {
        for (let j = 0; j < ROWS; j++) {
          const a0 = i * (ROWS + 1) + j;
          const a1 = (i + 1) * (ROWS + 1) + j;
          index.push(a0, a0 + 1, a1, a0 + 1, a1 + 1, a1);
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(verts, 3));
    geo.setAttribute('color', new BufferAttribute(cols, 3));
    geo.setIndex(index);
    const mat = new MeshBasicMaterial({ color: new Color(stone[0], stone[1], stone[2]), vertexColors: true, fog: false, side: DoubleSide });
    const mesh = new Mesh(geo, mat);
    mesh.name = `Ridge${li}`;
    mesh.userData.stone = [stone[0], stone[1], stone[2]]; // plain data: userData survives cloning
    mesh.userData.haze = haze;
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

  // Grass tufts are drawn around the player by GrassSystem.
  let n = 0;

  // (Loose pebbles and leaf flakes were removed: anything that small must be a
  // real gatherable, see SCATTER_RULES. Leaf litter now lives in the ground colour.)
  const mossCush = new InstancedMesh(new SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xffffff), 260);
  mossCush.name = 'MossCushions';
  n = 0;
  for (let tries = 0; n < 260 && tries < 3000; tries++) {
    const [x, z] = spot(2);
    if (inClearing(x, z, -2) || streamDistance(x, z) < 1.0) continue;
    const sc = range(rng, 0.12, 0.4);
    m.compose(p.set(x, 0, z), q.setFromAxisAngle(up, rng() * 6), s.set(sc, sc * 0.12, sc));
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
