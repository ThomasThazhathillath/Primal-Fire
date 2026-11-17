// The weather where the player stands (curriculum Phase 1, C8): what the body simulation feels.
//
// Simplified on purpose (docs/SCIENCE.md): air temperature follows the time of day and the clouds,
// shelter cuts wind and rain, a bed lifts you off the cold ground, and a fire radiates warmth that
// fades with distance. Numbers are plausible for a temperate autumn forest, not a forecast.

export interface Microclimate {
  /** Air temperature, deg C. */
  air: number;
  /** Ground temperature under you, deg C (clear nights cool the ground below the air). */
  ground: number;
  /** Wind reaching you, 0..1. */
  wind: number;
  /** Rain reaching you, 0..1. */
  rain: number;
  /** Under a roof that does not leak. */
  sheltered: boolean;
  /** On an insulated bed. */
  onBed: boolean;
  /** Radiant warmth from a burning fire, 0..1. */
  fire: number;
  /** It is night (0..1, 1 = full night). */
  night: number;
  /** Share of the ground's pull the bed under you stops (0..1, survival/materials.ts). Absent: 0.9 on a bed, else 0. */
  bedInsulation?: number;
  /** How damp the bed under you is (0..1): damp bedding soaks into your clothes. */
  bedMoisture?: number;
}

export interface WeatherNow {
  hour: number;
  night: number;
  cloud: number;
  rain: number;
  wind: number;
}

/** Day high and night low, deg C, under a clear sky. */
export const DAY_HIGH = 20;
export const NIGHT_LOW = 7;
/** How far a fire's warmth reaches (m). */
export const FIRE_REACH = 4;
/** How much colder (deg C) the air is at the bottom of a hollow on a calm night: cold air drains downhill and pools. */
export const HOLLOW_CHILL = 2.5;

/** Air temperature from the hour (warmest at 14:00, coldest at 05:00) and the sky. */
export function airTemperature(w: WeatherNow): number {
  const mid = (DAY_HIGH + NIGHT_LOW) / 2;
  const amp = (DAY_HIGH - NIGHT_LOW) / 2;
  let t = mid + amp * Math.cos(((w.hour - 14) / 24) * Math.PI * 2);
  // Clouds are a blanket: they keep nights milder and days cooler.
  t += w.cloud * (w.night > 0.5 ? 3 : -2);
  // Rain cools the air.
  t -= w.rain * 3;
  return t;
}

/** Warmth reaching you from a burning fire `d` metres away (0..1, fades with distance). */
export function fireWarmth(d: number, burning: boolean): number {
  if (!burning || d >= FIRE_REACH) return 0;
  const k = 1 - d / FIRE_REACH;
  return k * k;
}

/** Put it together. `shelter`: how much of the wind a roof overhead stops (0..1). */
export function microclimate(
  w: WeatherNow,
  at: {
    sheltered: boolean;
    onBed: boolean;
    fireDist: number;
    fireBurning: boolean;
    /** The bed under you (survival/materials.ts): how much of the ground's pull it stops, and how damp it is. */
    bedInsulation?: number;
    bedMoisture?: number;
    /** 0..1: how deep in a hollow you are (game/sites.ts). Cold air pools there on calm nights; wind stirs it out. */
    hollow?: number;
  },
): Microclimate {
  const pool = (at.hollow ?? 0) * w.night * Math.max(0, 1 - 1.2 * w.wind);
  const air = airTemperature(w) - HOLLOW_CHILL * pool;
  // Clear nights: the ground radiates its heat to the sky and ends up colder than the air.
  const ground = air - (w.night > 0.5 ? 2 * (1 - w.cloud) : 0);
  return {
    air,
    ground,
    wind: at.sheltered ? w.wind * 0.35 : w.wind,
    rain: at.sheltered ? 0 : w.rain,
    sheltered: at.sheltered,
    onBed: at.onBed,
    fire: fireWarmth(at.fireDist, at.fireBurning),
    night: w.night,
    ...(at.bedInsulation !== undefined ? { bedInsulation: at.bedInsulation } : {}),
    ...(at.bedMoisture !== undefined ? { bedMoisture: at.bedMoisture } : {}),
  };
}
