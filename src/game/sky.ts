// Pure sky rules (docs/SKY_SPEC.md): how visible the stars are, the moon's
// phase, how the clouds are lit and how much of the sky they cover. All of it
// is a function of the one clock (Environment: night, sun height, weather), so
// loading a save at any hour gives the same sky with no transition state.
// Functions write into caller-owned arrays and never allocate.

import { clamp } from './rng.js';

const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** In-game days in one lunar cycle (new moon back to new moon). */
export const MOON_CYCLE_DAYS = 8;

/** Phase 0..1 at `day` (whole days) and `hour`: 0 = new, 0.25 = first quarter, 0.5 = full. */
export function moonPhase(day: number, hour: number): number {
  const p = ((day + hour / 24) / MOON_CYCLE_DAYS + 0.5) % 1; // the first night is near full
  return p < 0 ? p + 1 : p;
}

/** Lit fraction of the disc, 0 (new) .. 1 (full). */
export function moonIllumination(phase: number): number {
  return (1 - Math.cos(phase * Math.PI * 2)) / 2;
}

/**
 * Star brightness 0..1. Stars come up gradually as the sky darkens (night 0.3
 * to 0.9), a thick cloud cover hides them, and a bright moon washes out the
 * faintest ones a little.
 */
export function starVisibility(night: number, cloud: number, moonIllum = 0): number {
  const dark = smooth(0.3, 0.9, night);
  return dark * (1 - clamp(cloud * 1.15, 0, 0.92)) * (1 - 0.25 * moonIllum * dark);
}

/** Fraction of the sky the clouds cover: a few wisps in clear weather, nearly full in heavy rain. */
export function cloudCoverage(cloud: number): number {
  return clamp(0.2 + cloud * 0.75, 0, 0.97);
}

/**
 * Cloud colours: `lit` is the sunny top, `shade` the underside. White and
 * soft grey by day, golden at sunrise, orange and pink at sunset, dark blue at
 * night. `sunY` is the sun's height (sin of its elevation).
 */
export function cloudLight(sunY: number, night: number, cloud: number, lit: Float32Array | number[], shade: Float32Array | number[], morning: boolean): void {
  // Clouds keep the sunset colours until it is properly dark.
  const dark = smooth(0.55, 1, night);
  const day = 1 - dark;
  // 1 when the sun is within ~15 degrees of the horizon, 0 when it is high.
  const warm = smooth(0.45, 0.02, Math.abs(sunY)) * smooth(-0.2, 0.0, sunY);
  // Sunrise is gold, sunset is orange and pink.
  const wr = 1;
  const wg = morning ? 0.78 : 0.6;
  const wb = morning ? 0.52 : 0.46;
  const sr = morning ? 0.78 : 0.82;
  const sg = morning ? 0.62 : 0.46;
  const sb = morning ? 0.62 : 0.56;
  // Overcast: the shade rises toward the lit colour and everything greys.
  const grey = clamp(cloud, 0, 1);
  const L = [1, 1, 1];
  const S = [0.6, 0.65, 0.74];
  for (let i = 0; i < 3; i++) {
    const wl = i === 0 ? wr : i === 1 ? wg : wb;
    const ws = i === 0 ? sr : i === 1 ? sg : sb;
    let l = L[i] + (wl - L[i]) * warm;
    let s = S[i] + (ws - S[i]) * warm;
    s += (0.52 - s) * grey * 0.6;
    l += (0.78 - l) * grey * 0.4;
    // Night: dark blue clouds that blend into the sky.
    const nl = [0.1, 0.12, 0.2][i];
    const ns = [0.04, 0.05, 0.09][i];
    lit[i] = nl * dark + l * day;
    shade[i] = ns * dark + s * day;
  }
}
