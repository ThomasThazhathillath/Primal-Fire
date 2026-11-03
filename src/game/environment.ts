// World atmosphere as plain data: the time of day and the weather. Everything
// here is derived from the game clock (`Game.time`, saved) plus a small saved
// state, so it is deterministic and unit-testable. EnvironmentSystem turns the
// numbers into sky, light, fog, rain and sound; other systems read the gameplay
// hooks (isRaining, windVector, wetness, visibility).
//
// update() writes into preallocated arrays and never allocates: it runs every frame.

import { clamp, lerp } from './rng.js';

/** Real seconds per in-game day (24 h). */
export const DAY_SECONDS = 20 * 60;
/** The first morning starts at this hour. */
export const START_HOUR = 7;

export type WeatherKind = 'clear' | 'cloudy' | 'lightRain' | 'heavyRain' | 'fog' | 'wind';
export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'cloudy', 'lightRain', 'heavyRain', 'fog', 'wind'];

interface WeatherParams {
  cloud: number;
  rain: number;
  fog: number;
  wind: number;
}
/** What each weather looks like, 0..1. Blended during transitions. */
export const WEATHER: Record<WeatherKind, WeatherParams> = {
  clear: { cloud: 0, rain: 0, fog: 0, wind: 0.15 },
  cloudy: { cloud: 0.7, rain: 0, fog: 0.1, wind: 0.3 },
  lightRain: { cloud: 0.8, rain: 0.4, fog: 0.25, wind: 0.3 },
  heavyRain: { cloud: 1, rain: 1, fog: 0.4, wind: 0.6 },
  fog: { cloud: 0.5, rain: 0, fog: 1, wind: 0.05 },
  wind: { cloud: 0.35, rain: 0, fog: 0, wind: 1 },
};
/** Weighted pick table for the schedule (clear weather is the common case). */
const WEIGHTS: Record<WeatherKind, number> = { clear: 5, cloudy: 3, lightRain: 2, heavyRain: 1, fog: 1.2, wind: 1.5 };
/** A weather spell lasts this long (real seconds), then fades into the next. */
export const SPELL_MIN = 150;
export const SPELL_MAX = 330;
/** Seconds the fade between two spells takes. */
export const TRANSITION = 40;
/** The first spell is always clear, so the tutorial morning is calm. */
const FIRST_SPELL = 360;

/** Fog distances (m): clear vs thick fog. */
const FOG_NEAR = 16;
const FOG_FAR = 52;
const FOG_FAR_THICK = 15;

/** Wetness gained per second at full rain, and lost per second when dry (in sun). */
const WET_RATE = 1 / 60;
const DRY_RATE = 1 / 240;
/** Seconds of burn time an exposed fire loses per second of full rain. */
export const RAIN_BURN_LOSS = 1.5;

export interface EnvironmentSave {
  /** Hours added to the clock (time skips / debug). */
  hourOffset: number;
  seed: number;
  wetness: number;
}

type Rgb = [number, number, number];
interface SkyKey {
  h: number;
  sky: Rgb;
  equator: Rgb;
  ground: Rgb;
  sun: Rgb;
  /** Direct light strength (sun by day, moon at night). */
  sunI: number;
  /** Hemisphere (ambient) light strength. */
  hemiI: number;
  iblI: number;
}
// Display colours, matching the hand-tuned noon in main.iwsdk.scene.json.
// Moonlit, not pitch black: dark enough that the fire matters, light enough to play.
const NIGHT: Omit<SkyKey, 'h'> = {
  // Dark sky, but the world stays lit like day (play-test: night must be fully playable).
  sky: [0.02, 0.03, 0.08],
  equator: [0.06, 0.08, 0.15],
  ground: [0.22, 0.24, 0.18],
  sun: [0.9, 0.93, 1],
  sunI: 2.2,
  hemiI: 1.6,
  iblI: 0.6,
};
const KEYS: SkyKey[] = [
  { h: 0, ...NIGHT },
  { h: 4.5, ...NIGHT },
  { h: 5.8, sky: [0.16, 0.2, 0.36], equator: [0.62, 0.42, 0.38], ground: [0.1, 0.1, 0.08], sun: [1, 0.55, 0.35], sunI: 2, hemiI: 1.5, iblI: 0.55 },
  { h: 7, sky: [0.3, 0.45, 0.68], equator: [0.85, 0.7, 0.55], ground: [0.2, 0.2, 0.14], sun: [1, 0.78, 0.6], sunI: 1.5, hemiI: 1.2, iblI: 0.45 },
  { h: 9.5, sky: [0.26, 0.48, 0.72], equator: [0.62, 0.72, 0.76], ground: [0.22, 0.25, 0.16], sun: [1, 0.92, 0.8], sunI: 2.2, hemiI: 1.6, iblI: 0.6 },
  { h: 15.5, sky: [0.26, 0.48, 0.72], equator: [0.62, 0.72, 0.76], ground: [0.22, 0.25, 0.16], sun: [1, 0.92, 0.8], sunI: 2.2, hemiI: 1.6, iblI: 0.6 },
  { h: 18, sky: [0.3, 0.38, 0.6], equator: [0.92, 0.62, 0.42], ground: [0.2, 0.17, 0.12], sun: [1, 0.62, 0.38], sunI: 1.4, hemiI: 1.1, iblI: 0.4 },
  { h: 19.3, sky: [0.14, 0.15, 0.32], equator: [0.6, 0.32, 0.3], ground: [0.08, 0.07, 0.06], sun: [0.95, 0.45, 0.3], sunI: 2, hemiI: 1.5, iblI: 0.55 },
  { h: 20.6, ...NIGHT },
  { h: 24, ...NIGHT },
];
/** Overcast grey the sky blends toward as clouds thicken. */
const GREY: Rgb = [0.42, 0.45, 0.48];

/** Sun position: rises in the east (+X) at 6, highest (south, +Z tilt) at noon, sets west at 18. */
export function sunDirection(hour: number, out: Float32Array | number[]): void {
  const a = ((hour - 6) / 24) * Math.PI * 2; // 0 at sunrise, π/2 at noon
  const y = Math.sin(a);
  const x = Math.cos(a);
  const z = 0.35; // a little south so noon light still models shapes
  const l = Math.hypot(x, y, z);
  out[0] = x / l;
  out[1] = y / l;
  out[2] = z / l;
}

/** Hash of (seed, spell index) → 0..1, without keeping an RNG around. */
function spellRandom(seed: number, i: number, salt: number): number {
  let t = (seed * 7919 + i * 104729 + salt + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pickWeather(r: number): WeatherKind {
  let total = 0;
  for (const k of WEATHER_KINDS) total += WEIGHTS[k];
  let x = r * total;
  for (const k of WEATHER_KINDS) {
    x -= WEIGHTS[k];
    if (x <= 0) return k;
  }
  return 'clear';
}

export class Environment {
  dayLength = DAY_SECONDS;
  hourOffset = 0;
  seed = 1;
  /** 0..1: how soaked the world is (wood, moss, ground). */
  wet = 0;

  // ------------------------------------------------ derived each update()
  /** Hour of day 0..24. */
  hour = START_HOUR;
  /** Whole days since the start. */
  day = 0;
  readonly sunDir = new Float32Array(3);
  /** Direction of the light that is actually lit: the sun by day, the moon by night. */
  readonly lightDir = new Float32Array(3);
  readonly moonDir = new Float32Array(3);
  /** 0 at full day, 1 at full night. */
  night = 0;
  readonly sky = new Float32Array(3);
  readonly equator = new Float32Array(3);
  readonly ground = new Float32Array(3);
  readonly fogColor = new Float32Array(3);
  readonly lightColor = new Float32Array(3);
  lightIntensity = 0;
  hemiIntensity = 0;
  iblIntensity = 0;
  fogNear = FOG_NEAR;
  fogFar = FOG_FAR;
  /** Current blended weather values. */
  cloud = 0;
  rain = 0;
  fog = 0;
  windStrength = 0;
  readonly wind = { x: 0, z: 0 };
  /** The dominant weather right now (the incoming one once a fade is half done). */
  weather: WeatherKind = 'clear';

  /** Hours since the start of the game, including skips. */
  totalHours(time: number): number {
    return START_HOUR + this.hourOffset + (time / this.dayLength) * 24;
  }

  /** Weather spell index and start time at game time `t` (spells are deterministic from the seed). */
  /** Current spell (set by spellAt; reused, not allocated). */
  readonly spell = { index: 0, start: 0, end: FIRST_SPELL, kind: 'clear' as WeatherKind, prev: 'clear' as WeatherKind };

  spellAt(t: number): typeof this.spell {
    const sp = this.spell;
    if (t < FIRST_SPELL) {
      sp.index = 0;
      sp.start = 0;
      sp.end = FIRST_SPELL;
      sp.kind = sp.prev = 'clear';
      return sp;
    }
    let start = FIRST_SPELL;
    let prev: WeatherKind = 'clear';
    for (let i = 1; ; i++) {
      const len = SPELL_MIN + spellRandom(this.seed, i, 1) * (SPELL_MAX - SPELL_MIN);
      let kind = pickWeather(spellRandom(this.seed, i, 2));
      // Never the same spell twice in a row: it reads as "nothing happens".
      if (kind === prev) kind = pickWeather(spellRandom(this.seed, i, 3));
      if (t < start + len || i > 100000) {
        sp.index = i;
        sp.start = start;
        sp.end = start + len;
        sp.kind = kind;
        sp.prev = prev;
        return sp;
      }
      prev = kind;
      start += len;
    }
  }

  /**
   * Recompute everything for game time `time` (seconds). `dt` is how much
   * game time passed since the last call (0 while paused): it drives wetness.
   */
  update(time: number, dt: number): void {
    const total = this.totalHours(time);
    this.day = Math.floor(total / 24);
    const hour = total - this.day * 24;
    this.hour = hour;
    this.weatherAt(time);

    // ---- sky keys
    let k = 0;
    while (k < KEYS.length - 2 && KEYS[k + 1].h <= hour) k++;
    const a = KEYS[k];
    const b = KEYS[k + 1];
    const f = clamp((hour - a.h) / (b.h - a.h), 0, 1);
    const s = f * f * (3 - 2 * f);
    const overcast = this.cloud * 0.75;
    const rainDark = 1 - this.rain * 0.35;
    sunDirection(hour, this.sunDir);
    sunDirection(hour + 12, this.moonDir);
    // Night factor from the sun's height: dark once it is 8° below the horizon.
    this.night = clamp((0.05 - this.sunDir[1]) / 0.2, 0, 1);

    this.mix(this.sky, a.sky, b.sky, s, overcast, rainDark);
    this.mix(this.equator, a.equator, b.equator, s, overcast, rainDark);
    this.mix(this.ground, a.ground, b.ground, s, overcast * 0.5, rainDark);
    this.mix(this.lightColor, a.sun, b.sun, s, overcast * 0.5, 1);

    const sunI = lerp(a.sunI, b.sunI, s);
    // Clouds block direct light far more than ambient.
    this.lightIntensity = sunI * (1 - this.cloud * 0.7) * rainDark;
    this.hemiIntensity = lerp(a.hemiI, b.hemiI, s) * (1 - this.cloud * 0.15) * rainDark;
    this.iblIntensity = lerp(a.iblI, b.iblI, s) * (1 - this.cloud * 0.2);
    const src = this.night > 0.5 ? this.moonDir : this.sunDir;
    // Never light from below the horizon: clamp the lit direction to ≥ 12° up.
    this.lightDir[0] = src[0];
    this.lightDir[1] = Math.max(0.2, src[1]);
    this.lightDir[2] = src[2];
    const l = Math.hypot(this.lightDir[0], this.lightDir[1], this.lightDir[2]);
    for (let i = 0; i < 3; i++) this.lightDir[i] /= l;
    // Around twilight neither body is high: fade the direct light through the swap.
    const swap = clamp(Math.abs(this.night - 0.5) * 4, 0, 1);
    this.lightIntensity *= 0.3 + 0.7 * swap;

    // ---- fog: horizon colour, closer in fog / rain / night
    for (let i = 0; i < 3; i++) this.fogColor[i] = this.equator[i];
    const thick = clamp(this.fog + this.rain * 0.35, 0, 1);
    this.fogFar = lerp(FOG_FAR, FOG_FAR_THICK, thick) * (1 - this.night * 0.25);
    this.fogNear = lerp(FOG_NEAR, 1.5, thick) * (1 - this.night * 0.4);

    // ---- wetness
    if (dt > 0) {
      if (this.rain > 0.05) this.wet = Math.min(1, this.wet + this.rain * WET_RATE * dt);
      else {
        const sun = (1 - this.night) * (1 - this.cloud * 0.6);
        this.wet = Math.max(0, this.wet - DRY_RATE * (0.3 + sun + this.windStrength * 0.5) * dt);
      }
    }
  }

  private mix(out: Float32Array, ka: Rgb, kb: Rgb, s: number, grey: number, dark: number): void {
    for (let i = 0; i < 3; i++) {
      const v = lerp(ka[i], kb[i], s);
      // Grey toward overcast, scaled by the day's brightness so night clouds stay dark.
      const g = GREY[i] * (0.2 + 0.8 * (1 - this.night));
      out[i] = lerp(v, Math.min(v * 1.2 + 0.02, g), grey) * dark;
    }
  }

  /** Debug/tuning: pin the weather (null = follow the schedule). Not saved. */
  forceWeather: WeatherKind | null = null;

  private weatherAt(t: number): void {
    const spell = this.spellAt(t);
    if (this.forceWeather) {
      spell.kind = spell.prev = this.forceWeather;
      spell.start = -TRANSITION;
    }
    const cur = WEATHER[spell.kind];
    const prev = WEATHER[spell.prev];
    const f = clamp((t - spell.start) / TRANSITION, 0, 1);
    const s = f * f * (3 - 2 * f);
    this.cloud = lerp(prev.cloud, cur.cloud, s);
    this.rain = lerp(prev.rain, cur.rain, s);
    this.fog = lerp(prev.fog, cur.fog, s);
    this.windStrength = lerp(prev.wind, cur.wind, s);
    this.weather = s >= 0.5 || spell.index === 0 ? spell.kind : spell.prev;
    // The wind slowly veers; gusts are layered on top by whoever renders them.
    const dir = spellRandom(this.seed, spell.index, 4) * Math.PI * 2 + Math.sin(t * 0.01) * 0.4;
    this.wind.x = Math.cos(dir) * this.windStrength;
    this.wind.z = Math.sin(dir) * this.windStrength;
  }

  // ------------------------------------------------ gameplay hooks

  isRaining(): boolean {
    return this.rain > 0.15;
  }
  /** Wind on the ground plane; length 0..1. Do not keep the object: it is reused. */
  windVector(): { readonly x: number; readonly z: number } {
    return this.wind;
  }
  /** 0..1: how soaked wood, moss and ground are. Fuel gathered now is damp above ~0.4. */
  wetness(): number {
    return this.wet;
  }
  /** How far (m) you can see before things vanish into fog. */
  visibility(): number {
    return this.fogFar;
  }
  isNight(): boolean {
    return this.night > 0.5;
  }

  /** Jump the clock to `hour` today (or tomorrow, if that hour has passed). */
  skipTo(time: number, hour: number): void {
    const now = this.totalHours(time);
    let target = Math.floor(now / 24) * 24 + hour;
    if (target < now) target += 24;
    this.hourOffset += target - now;
  }

  snapshot(): EnvironmentSave {
    return { hourOffset: this.hourOffset, seed: this.seed, wetness: this.wet };
  }

  restore(s: Partial<EnvironmentSave> | undefined): void {
    this.hourOffset = s?.hourOffset ?? 0;
    this.seed = s?.seed ?? 1;
    this.wet = s?.wetness ?? 0;
  }
}

/** Is a fire at (x, z) out in the weather (no shelter roof within `r` m)? */
export function fireExposed(
  structures: ReadonlyArray<{ kind: string; x: number; z: number; complete: boolean }>,
  x: number,
  z: number,
  r = 2.5,
): boolean {
  for (const s of structures) {
    if (s.kind === 'shelter' && s.complete && Math.hypot(s.x - x, s.z - z) < r) return false;
  }
  return true;
}
