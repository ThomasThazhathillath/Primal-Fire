// Shared low-poly materials. Lambert shading is much cheaper than PBR on the
// Quest browser, and the art direction is flat-shaded anyway.

import { Color, MeshLambertMaterial, type MeshLambertMaterialParameters } from '@iwsdk/core';

const cache = new Map<string, MeshLambertMaterial>();

/** One shared material per colour + options, so meshes batch well. */
export function lambert(color: number, opts: MeshLambertMaterialParameters = {}): MeshLambertMaterial {
  const key = `${color}:${JSON.stringify(opts)}`;
  let m = cache.get(key);
  if (!m) {
    m = new MeshLambertMaterial({ color, flatShading: true, ...opts });
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
