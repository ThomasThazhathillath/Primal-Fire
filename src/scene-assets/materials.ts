// Shared low-poly materials. Lambert shading is much cheaper than PBR on the
// Quest browser, and the art direction is flat-shaded anyway.

import { BufferAttribute, type BufferGeometry } from '@iwsdk/core';
import { valueNoise } from '../game/rng.js';
import { Color, MeshLambertMaterial, type MeshLambertMaterialParameters } from '@iwsdk/core';

const cache = new Map<string, MeshLambertMaterial>();

/** One shared material per colour + options, so meshes batch well. */
export function lambert(color: number, opts: MeshLambertMaterialParameters = {}): MeshLambertMaterial {
  const key = `${color}:${JSON.stringify(opts)}`;
  let m = cache.get(key);
  if (!m) {
    m = new MeshLambertMaterial({ color, flatShading: false, ...opts });
    cache.set(key, m);
  }
  return m;
}

/** Writes an sRGB hex into a linear float colour array at `i`. */
export function writeColor(target: Float32Array, i: number, hex: number, tmp = new Color()): void {
  tmp.setHex(hex);
  target[i * 3] = tmp.r;
  target[i * 3 + 1] = tmp.g;
  target[i * 3 + 2] = tmp.b;
}

/** Weathered surface: a subdivided solid with its vertices nudged and mottled by noise (colours baked per vertex). */
export function weather(geo: BufferGeometry, amount: number, seed: number): BufferGeometry {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = valueNoise(x * 2.3 + seed, y * 2.3 + z * 1.7) - 0.5;
    // Offsets depend on position only, so vertices shared between faces move together (no cracks at the edges).
    pos.setXYZ(i, x + (valueNoise(x * 3.1 + seed, y * 3.1 - z) - 0.5) * amount, y + (valueNoise(y * 3.1 - seed, z * 3.1 + x) - 0.5) * amount, z + (valueNoise(z * 3.1 + seed, x * 3.1 + y) - 0.5) * amount);
    void nor;
    const m = 0.5 + 0.34 * valueNoise(x * 5.1 - seed, z * 5.1 + y * 3.7) + n * 0.2;
    col[i * 3] = m;
    col[i * 3 + 1] = m * 0.99;
    col[i * 3 + 2] = m * 0.97;
  }
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

