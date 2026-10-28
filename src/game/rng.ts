// Deterministic randomness: the forest must come out identical in the app and
// in the editor (src/assets.ts is evaluated in both), so nothing here may use
// Math.random().

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rng: Rng, a: number, b: number): number =>
  a + rng() * (b - a);

export const clamp = (v: number, a: number, b: number): number =>
  Math.max(a, Math.min(b, v));

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Cheap smooth 2D value noise in [0, 1], used for ground colour variation. */
export function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  return lerp(
    lerp(hash2(xi, zi), hash2(xi + 1, zi), u),
    lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u),
    v,
  );
}
