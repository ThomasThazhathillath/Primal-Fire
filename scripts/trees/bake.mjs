// Build-time only: bakes the forest tree variants with EZ-Tree (MIT, https://github.com/dgreenheck/ez-tree)
// into GLB files under public/trees/. Never imported at runtime (the library ships its own copy of three).
//
//   node scripts/trees/bake.mjs            writes public/trees/<variant>.glb and prints triangle counts
//
// Each GLB holds three levels of detail as separate nodes (Trunk_LOD0/Leaves_LOD0, ... LOD2), all scaled to
// the same height (see VARIANTS[].height, metres at scale 1), trunk at the origin, bark as vertex colours,
// leaves as alpha-tested cards (alphaMode MASK) sharing one 512 px leaf texture. Positions are deterministic
// (fixed seeds). Re-run after changing this file; the output is committed.

import './dom-stub.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { Box3, Vector3 } from 'three';
const { Tree } = await import('@dgreenheck/ez-tree');

const OUT = new URL('../../public/trees/', import.meta.url);
mkdirSync(OUT, { recursive: true });

/** The variants: EZ-Tree preset, seed, target height at scale 1, leaf texture, bark colour and per-LOD overrides. */
const VARIANTS = [
  { id: 'oak', trunk: 1.7, preset: 'Oak Medium', seed: 11011, height: 4.4, leaf: 'oak', lk: 1.1, bark: [0x6e5b47, 0x4a3b2c] },
  { id: 'ash', trunk: 1.5, preset: 'Ash Medium', seed: 22022, height: 4.9, leaf: 'ash', lk: 0.8, bk: 0.55, bark: [0x80786a, 0x5a5348] },
  { id: 'aspen', trunk: 2.3, preset: 'Aspen Medium', seed: 33033, height: 4.6, leaf: 'aspen', bark: [0xe6e2d6, 0x8f897c] },
  { id: 'pine', trunk: 1.6, preset: 'Pine Medium', seed: 44044, height: 5.2, leaf: 'pine', lk: 0.6, bk: 0.4, bark: [0x6e4e39, 0x4a3426] },
  { id: 'snag', trunk: 1.9, preset: 'Oak Small', seed: 55055, height: 3.6, leaf: 'oak', bark: [0x8a8174, 0x625b52], dead: true },
];

/** Detail levels: leaf count scale, billboard type, branch levels, segment/section reductions, leaf size scale. */
const LODS = [
  { name: 'LOD0', leafCount: 1.7, double: false, levels: null, seg: 0.8, sec: 0.8, size: 1.55, kids: 1, trunkSec: 1 },
  { name: 'LOD1', leafCount: 1.1, double: false, levels: -1, seg: 0.45, sec: 0.45, size: 2.6, kids: 0.45, trunkSec: 0.5 },
  { name: 'LOD2', leafCount: 0.5, double: false, levels: -99, seg: 0.34, sec: 0.34, size: 4.2, kids: 0.3, trunkSec: 0.34 },
];

function build(v, lod) {
  const t = new Tree();
  t.options.bark.textured = false;
  t.loadPreset(v.preset);
  const o = t.options;
  o.seed = v.seed;
  o.branch.radius[0] *= v.trunk ?? 1;
  o.bark.textured = false;
  const type = o.type;
  if (v.dead) {
    o.leaves.count = 0;
    o.branch.gnarliness[1] = 0.22;
    o.branch.gnarliness[2] = 0.3;
  } else {
    o.leaves.count = Math.max(2, Math.round(o.leaves.count * lod.leafCount * (v.lk ?? 1)));
    o.leaves.size *= lod.size;
    o.leaves.billboard = lod.double ? 'double' : 'single';
  }
  if (lod.levels) {
    const L = Math.max(1, o.branch.levels + lod.levels);
    // Fewer levels: the remaining ones carry more children so the crown keeps its volume.
    if (!(type === 'evergreen')) o.branch.children[L - 1] = Math.round(o.branch.children[L - 1] * 1.4);
    o.branch.levels = L;
  }
  for (const k of Object.keys(o.branch.children)) o.branch.children[k] = Math.max(3, Math.round(o.branch.children[k] * lod.kids * (k === '0' ? 1 : (v.bk ?? 1) ** 0.5)));
  for (const k of Object.keys(o.branch.segments)) o.branch.segments[k] = Math.max(3, Math.round(o.branch.segments[k] * lod.seg * (k === '0' ? 1 : (v.bk ?? 1))));
  for (const k of Object.keys(o.branch.sections)) o.branch.sections[k] = Math.max(1, Math.round(o.branch.sections[k] * (k === '0' ? lod.trunkSec : lod.sec * (v.bk ?? 1))));
  t.generate();
  return t;
}

/** Index-aware copy of a THREE geometry into plain arrays, optionally transformed. */
function extract(geo, scale, shift) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const P = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    P[i * 3] = (pos.getX(i) - shift.x) * scale;
    P[i * 3 + 1] = (pos.getY(i) - shift.y) * scale;
    P[i * 3 + 2] = (pos.getZ(i) - shift.z) * scale;
  }
  return { P, N: Float32Array.from(nor.array), UV: Float32Array.from(uv.array), I: Uint32Array.from(geo.index.array) };
}

const doc = (v) => {
  const d = new Document();
  d.createBuffer();
  const scene = d.createScene(v.id);
  return { d, scene };
};

const lerpC = (a, b, t) => {
  const r = (x, s) => (x >> s) & 255;
  const m = (s) => Math.round(r(a, s) + (r(b, s) - r(a, s)) * t) / 255;
  return [m(16), m(8), m(0)];
};
const srgbToLinear = (c) => c.map((x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));

const summary = [];
for (const v of VARIANTS) {
  const { d, scene } = doc(v);
  const buffer = d.getRoot().listBuffers()[0];
  const barkMat = d.createMaterial(`${v.id}-bark`).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  const leafTex = d.createTexture(`${v.id}-leaf`).setImage(readFileSync(new URL(`leaf_${v.leaf}.png`, OUT))).setMimeType('image/png');
  const lt = new Tree().options.leaves;
  const leafMat = d
    .createMaterial(`${v.id}-leaf`)
    .setBaseColorTexture(leafTex)
    .setAlphaMode('MASK')
    .setAlphaCutoff(0.5)
    .setDoubleSided(true)
    .setRoughnessFactor(1)
    .setMetallicFactor(0);
  const row = { id: v.id };
  let scale = 1;
  let shift = new Vector3();
  LODS.forEach((lod, li) => {
    const t = build(v, lod);
    const bb = new Box3().setFromObject(t);
    // Height and ground contact are normalised on LOD0 and reused so every level of detail matches.
    if (li === 0) {
      scale = v.height / (bb.max.y - bb.min.y);
      shift = new Vector3(0, bb.min.y, 0);
    }
    const branches = extract(t.branchesMesh.geometry, scale, shift);
    // Bark colour: darker toward the base and with a faint per-ring banding (uv.y alternates 0/1 per section).
    const bh = new Float32Array(branches.P.length);
    let maxY = 0;
    for (let i = 1; i < branches.P.length; i += 3) maxY = Math.max(maxY, branches.P[i]);
    for (let i = 0; i < branches.P.length / 3; i++) {
      const c = srgbToLinear(lerpC(v.bark[1], v.bark[0], Math.min(1, branches.P[i * 3 + 1] / (maxY * 0.8)) * 0.45 + 0.4 + (branches.UV[i * 2 + 1] > 0.5 ? 0.06 : 0)));
      bh.set(c, i * 3);
    }
    const mkMesh = (name, g, mat, extra) => {
      const prim = d
        .createPrimitive()
        .setMaterial(mat)
        .setIndices(d.createAccessor().setType('SCALAR').setArray(g.I).setBuffer(buffer))
        .setAttribute('POSITION', d.createAccessor().setType('VEC3').setArray(g.P).setBuffer(buffer))
        .setAttribute('NORMAL', d.createAccessor().setType('VEC3').setArray(g.N).setBuffer(buffer))
        .setAttribute('TEXCOORD_0', d.createAccessor().setType('VEC2').setArray(g.UV).setBuffer(buffer));
      if (extra) prim.setAttribute('COLOR_0', d.createAccessor().setType('VEC3').setArray(extra).setBuffer(buffer));
      const mesh = d.createMesh(name).addPrimitive(prim);
      const node = d.createNode(name).setMesh(mesh);
      scene.addChild(node);
    };
    mkMesh(`Trunk_${lod.name}`, branches, barkMat, bh);
    let tris = branches.I.length / 3;
    if (!v.dead && t.leavesMesh.geometry.attributes.position) {
      const leaves = extract(t.leavesMesh.geometry, scale, shift);
      // glTF textures put v = 0 at the top; the library's cards were authored for three's bottom-up flipY textures.
      for (let i = 1; i < leaves.UV.length; i += 2) leaves.UV[i] = 1 - leaves.UV[i];
      // Soft crown lighting: normals point out from the crown centre, blended with up, instead of along the cards.
      const cy = (bb.max.y - bb.min.y) * scale * 0.62;
      for (let i = 0; i < leaves.P.length / 3; i++) {
        const dx = leaves.P[i * 3];
        const dy = leaves.P[i * 3 + 1] - cy;
        const dz = leaves.P[i * 3 + 2];
        const l = Math.hypot(dx, dy, dz) || 1;
        const nx = dx / l;
        const ny = dy / l * 0.6 + 0.5;
        const nz = dz / l;
        const nl = Math.hypot(nx, ny, nz) || 1;
        leaves.N[i * 3] = nx / nl;
        leaves.N[i * 3 + 1] = ny / nl;
        leaves.N[i * 3 + 2] = nz / nl;
      }
      mkMesh(`Leaves_${lod.name}`, leaves, leafMat, null);
      tris += leaves.I.length / 3;
    }
    if (li === 0) {
      // Trunk base radius at scale 1: the game's collision circle is 0.19 m, so the visible trunk should be close.
      let r = 0;
      for (let i = 0; i < branches.P.length; i += 3) if (branches.P[i + 1] < 0.12) r = Math.max(r, Math.hypot(branches.P[i], branches.P[i + 2]));
      row.trunkR = +r.toFixed(3);
    }
    row[lod.name] = Math.round(tris);
    row[`${lod.name}t`] = branches.I.length / 3;
  });
  summary.push(row);
  const io = new NodeIO();
  writeFileSync(new URL(`${v.id}.glb`, OUT), Buffer.from(await io.writeBinary(d)));
}
console.table(summary);
