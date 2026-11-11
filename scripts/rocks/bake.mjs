// Build-time only. Shrinks Poly Haven "Rock Moss Set 01" (CC0, https://polyhaven.com/a/rock_moss_set_01, 1K textures)
// into public/rocks/rocks.glb: six rocks at two detail levels (about 2.2k and 0.45k triangles), each centred on the
// origin with its base on y = 0 and its widest horizontal extent scaled to 1 m, sharing one 1K texture set.
//
//   node scripts/rocks/bake.mjs <folder containing rock_moss_set_01_1k.gltf, .bin and textures/>
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import jpeg from 'jpeg-js';
import { NodeIO } from '@gltf-transform/core';
import { simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const src = resolve(process.argv[2] ?? '.');
const OUT = new URL('../../public/rocks/rocks.glb', import.meta.url);
const TARGETS = [2200, 450, 110];
await MeshoptSimplifier.ready;
const io = new NodeIO();

/** Triangles, positions, normals, uvs of a (simplified) primitive as plain arrays. */
const grab = (prim) => ({
  P: Float32Array.from(prim.getAttribute('POSITION').getArray()),
  N: Float32Array.from(prim.getAttribute('NORMAL').getArray()),
  UV: Float32Array.from(prim.getAttribute('TEXCOORD_0').getArray()),
  I: Uint16Array.from(prim.getIndices().getArray()),
});

const levels = [];
for (const target of TARGETS) {
  const d = await io.read(`${src}/rock_moss_set_01_1k.gltf`);
  const meshes = d.getRoot().listMeshes();
  const out = [];
  for (let i = 0; i < meshes.length; i++) {
    const doc = await io.read(`${src}/rock_moss_set_01_1k.gltf`);
    const ms = doc.getRoot().listMeshes();
    ms.forEach((m, j) => { if (j !== i) m.dispose(); });
    doc.getRoot().listNodes().forEach((n) => { if (!n.getMesh()) n.dispose(); });
    const tris = ms[i].listPrimitives()[0].getIndices().getCount() / 3;
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / tris), error: 0.08 }));
    out.push(grab(doc.getRoot().listMeshes().find((m) => !m.isDisposed()).listPrimitives()[0]));
  }
  levels.push(out);
}

// Normalise each rock from its LOD0 bounds so both levels share the same transform.
const rocks = levels[0].map((lod0, i) => {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let k = 0; k < lod0.P.length; k += 3) {
    minX = Math.min(minX, lod0.P[k]); maxX = Math.max(maxX, lod0.P[k]);
    minY = Math.min(minY, lod0.P[k + 1]); maxY = Math.max(maxY, lod0.P[k + 1]);
    minZ = Math.min(minZ, lod0.P[k + 2]); maxZ = Math.max(maxZ, lod0.P[k + 2]);
  }
  const s = 1 / Math.max(maxX - minX, maxZ - minZ);
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  return { s, cx, cz, minY, height: (maxY - minY) * s, i };
});

const doc = (await io.read(`${src}/rock_moss_set_01_1k.gltf`));
const root = doc.getRoot();
const material = root.listMaterials()[0];
const buffer = root.listBuffers()[0];
root.listNodes().forEach((n) => n.dispose());
root.listMeshes().forEach((m) => m.dispose());
const scene = root.listScenes()[0];
const rows = [];
for (const r of rocks) {
  for (let li = 0; li < levels.length; li++) {
    const g = levels[li][r.i];
    const P = new Float32Array(g.P.length);
    for (let k = 0; k < P.length; k += 3) {
      P[k] = (g.P[k] - r.cx) * r.s;
      P[k + 1] = (g.P[k + 1] - r.minY) * r.s;
      P[k + 2] = (g.P[k + 2] - r.cz) * r.s;
    }
    const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
    const prim = doc.createPrimitive().setMaterial(material).setIndices(acc('SCALAR', g.I)).setAttribute('POSITION', acc('VEC3', P)).setAttribute('NORMAL', acc('VEC3', g.N)).setAttribute('TEXCOORD_0', acc('VEC2', g.UV));
    const name = `Rock${r.i + 1}_LOD${li}`;
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
    rows.push({ name, tris: g.I.length / 3, height: +r.height.toFixed(2) });
  }
}
writeFileSync(OUT, Buffer.from(await io.writeBinary(doc)));
console.table(rows);

// Collectible stones are drawn as tiny single meshes (one per gather spot), so the coarsest level also goes to a TypeScript data file
// with per-vertex colours sampled from the diffuse texture (no texture binding, no loader, safe in the manifest's two realms).
const tex = jpeg.decode(readFileSync(`${src}/textures/rock_moss_set_01_diff_1k.jpg`), { useTArray: true });
const sample = (u, v) => {
  const x = Math.max(0, Math.min(tex.width - 1, Math.floor((u - Math.floor(u)) * tex.width)));
  const y = Math.max(0, Math.min(tex.height - 1, Math.floor((v - Math.floor(v)) * tex.height)));
  const o = (y * tex.width + x) * 4;
  return [tex.data[o], tex.data[o + 1], tex.data[o + 2]];
};
const r4 = (n) => Math.round(n * 1e4) / 1e4;
const stones = rocks.map((r) => {
  const g = levels[2][r.i];
  const P = [], N = [], C = [];
  for (let k = 0; k < g.P.length / 3; k++) {
    P.push(r4((g.P[k * 3] - r.cx) * r.s), r4((g.P[k * 3 + 1] - r.minY) * r.s), r4((g.P[k * 3 + 2] - r.cz) * r.s));
    N.push(r4(g.N[k * 3]), r4(g.N[k * 3 + 1]), r4(g.N[k * 3 + 2]));
    // Mostly grey: the pickup tint (stone, flint, chalk, wet stone) supplies the colour, the texture supplies the mottling.
    const [cr, cg, cb] = sample(g.UV[k * 2], g.UV[k * 2 + 1]);
    const luma = 0.3 * cr + 0.59 * cg + 0.11 * cb;
    C.push(...[cr, cg, cb].map((v) => Math.min(255, Math.round(120 + (luma - 90) * 0.7 + (v - luma) * 0.25))));
  }
  return { P, N, C, I: Array.from(g.I) };
});
writeFileSync(
  new URL('../../src/scene-assets/rock-stones.data.ts', import.meta.url),
  `// Generated by scripts/rocks/bake.mjs from Poly Haven "Rock Moss Set 01" (CC0). Do not edit.\n// Six rocks at about 110 triangles: positions and normals (metres, widest side 1, base on y = 0), vertex colours 0-255, indices.\n` +
    `export const ROCK_STONES: ReadonlyArray<{ P: number[]; N: number[]; C: number[]; I: number[] }> = ${JSON.stringify(stones)};\n`,
);
