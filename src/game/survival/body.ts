// The body simulation (curriculum Phase 1, C8): warmth, water, food, rest and wetness, and how they
// affect each other. Pure rules, no rendering; ticked at 4 Hz from Game.tick.
//
// Gentle by design (the game is for beginners): nothing kills you. Low values slow you down, change what
// you see and hear, and bring help. Each value is 0..100 where 100 is comfortable (wetness is 0..1).
// The heat balance is a simplified teaching model, not physiology: heat in (metabolism, a fire) minus heat
// out (cold air, faster in wind, much faster when wet; the ground when you rest on it without a bed).
// The game shows "warmth", never a body temperature, so it states no hypothermia figures (docs/SCIENCE.md).

import type { Microclimate } from './climate.js';

export type SurvivalPressure = 'off' | 'gentle' | 'realistic';

/** How fast needs change for each pressure setting (Off: nothing changes at all). */
export const PRESSURE_RATE: Record<SurvivalPressure, number> = { off: 0, gentle: 0.5, realistic: 1 };

/** Comfortable air temperature for someone moving about in simple clothes, deg C. */
export const COMFORT_AIR = 18;

export type Need = 'warmth' | 'water' | 'food' | 'rest';
export type Level = 'ok' | 'low' | 'critical';

export interface BodySave {
  v: 1;
  warmth: number;
  water: number;
  food: number;
  rest: number;
  wet: number;
  queasy: number;
}

export interface BodyEvent {
  type: 'level';
  need: Need;
  level: Level;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** What the body feels in one tick, for the notebook, help and feedback. */
export interface HeatFlow {
  gain: number;
  loss: number;
  ground: number;
}

export class Body {
  warmth = 100;
  water = 100;
  food = 100;
  rest = 100;
  /** How wet you are, 0..1. */
  wet = 0;
  /** Seconds of an upset stomach left (raw water sometimes carries germs). */
  queasy = 0;
  pressure: SurvivalPressure = 'gentle';
  /** The last heat balance, per second (for feedback and tests). */
  readonly flow: HeatFlow = { gain: 0, loss: 0, ground: 0 };
  private levels: Record<Need, Level> = { warmth: 'ok', water: 'ok', food: 'ok', rest: 'ok' };
  private rawDrinks = 0;

  constructor(private readonly onEvent: (e: BodyEvent) => void = () => {}) {}

  /** Advance `dt` seconds. `resting`: standing still inside a shelter (you would sit or lie down). */
  tick(dt: number, m: Microclimate, resting: boolean): void {
    const rate = PRESSURE_RATE[this.pressure];
    if (rate === 0 || dt <= 0) return;

    // ---- Wetness: rain soaks you in about a minute; you dry slowly, faster by a fire or in warm air.
    if (m.rain > 0.02) this.wet = clamp(this.wet + 0.02 * m.rain * dt, 0, 1);
    else this.wet = clamp(this.wet - 0.004 * (1 + 4 * m.fire + (m.air > 15 ? 1 : 0) + (m.sheltered ? 0.5 : 0)) * dt, 0, 1);

    // ---- Heat balance.
    const cold = Math.max(0, COMFORT_AIR - m.air);
    // Convection: wind strips the warm air layer away. Water conducts heat far faster than air.
    const loss = 0.02 * cold * (1 + 1.5 * m.wind) * (1 + 2 * this.wet) * (m.sheltered ? 0.7 : 1);
    // Conduction into the ground: only while resting on it, and a dry bed stops nearly all of it.
    const groundLoss = resting ? 0.02 * Math.max(0, COMFORT_AIR - m.ground) * (m.onBed ? 0.1 : 1) : 0;
    // Metabolism always makes some heat; a fire radiates more.
    const gain = 0.12 + 1.2 * m.fire;
    this.flow.gain = gain;
    this.flow.loss = loss;
    this.flow.ground = groundLoss;
    const fed = this.food > 20 ? 1 : 0.5; // poor nutrition: the body makes less heat and recovers slower
    this.warmth = clamp(this.warmth + (gain * fed - (loss + groundLoss) * rate) * dt);

    // ---- Water: always used; faster when hot, working or queasy.
    const thirst = 0.04 * (1 + (m.air > 24 ? 0.5 : 0) + (this.queasy > 0 ? 1 : 0));
    this.water = clamp(this.water - thirst * rate * dt);

    // ---- Food: slowly used; cold makes the body burn more.
    const hunger = 0.025 * (1 + (this.warmth < 40 ? 0.5 : 0) + (this.queasy > 0 ? 0.5 : 0));
    this.food = clamp(this.food - hunger * rate * dt);

    // ---- Rest: used while active; recovered resting under a roof, best on a bed. Short of water or food,
    // you recover less: dehydration caps how rested you can get.
    if (resting && m.sheltered) {
      const recover = (m.onBed ? 0.8 : 0.4) * fed * (this.queasy > 0 ? 0.5 : 1);
      this.rest = Math.min(clamp(this.rest + recover * dt), this.restCap());
    } else {
      this.rest = clamp(this.rest - 0.03 * rate * dt);
    }

    if (this.queasy > 0) this.queasy = Math.max(0, this.queasy - dt);
    this.checkLevels();
  }

  /** How rested you can get: short of water, not fully. */
  restCap(): number {
    return this.water < 25 ? 40 + this.water * 2 : 100;
  }

  /** Movement speed factor from the body (1 = normal). Never below 0.6: slower, never stuck. */
  speedFactor(): number {
    if (this.pressure === 'off') return 1;
    let f = 1;
    if (this.warmth < 30) f *= this.warmth < 10 ? 0.75 : 0.88;
    if (this.rest < 20) f *= 0.85;
    if (this.water < 15) f *= 0.9;
    return Math.max(0.6, f);
  }

  /** Should you drink from the stream right now (not when already full)? */
  wantsWater(): boolean {
    return this.water < 95;
  }

  /**
   * Cupped hands at the stream: it quenches thirst, but untreated water can carry germs, and now and then
   * it upsets your stomach (Lesson 03 explains why). Returns whether this drink made you queasy.
   */
  drinkRaw(): boolean {
    this.water = clamp(this.water + 30);
    this.rawDrinks++;
    // Every third untreated drink (deterministic, so it is fair and testable).
    const sick = this.rawDrinks % 3 === 0 && this.pressure !== 'off';
    if (sick) this.queasy = this.pressure === 'realistic' ? 120 : 60;
    this.checkLevels();
    return sick;
  }

  /** Boiled, filtered water from your pot. */
  drinkSafe(): void {
    this.water = clamp(this.water + 45);
    this.checkLevels();
  }

  /** Eat: energy in food points (cooked fish 40, dried fish 35, nuts 25, tuber 30, berries 15). */
  eat(points: number): void {
    this.food = clamp(this.food + points);
    this.checkLevels();
  }

  /** The level of a need: ok above 40, low above 15, critical below. */
  level(need: Need): Level {
    const v = this[need];
    return v > 40 ? 'ok' : v > 15 ? 'low' : 'critical';
  }

  private checkLevels(): void {
    for (const need of ['warmth', 'water', 'food', 'rest'] as const) {
      const now = this.level(need);
      if (now !== this.levels[need]) {
        this.levels[need] = now;
        this.onEvent({ type: 'level', need, level: now });
      }
    }
  }

  snapshot(): BodySave {
    return { v: 1, warmth: this.warmth, water: this.water, food: this.food, rest: this.rest, wet: this.wet, queasy: this.queasy };
  }

  /** Restore; a save without a body (older versions) starts comfortable. */
  restore(s: BodySave | undefined): void {
    if (!s) return;
    const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    this.warmth = clamp(n(s.warmth, 100));
    this.water = clamp(n(s.water, 100));
    this.food = clamp(n(s.food, 100));
    this.rest = clamp(n(s.rest, 100));
    this.wet = clamp(n(s.wet, 0), 0, 1);
    this.queasy = Math.max(0, n(s.queasy, 0));
    for (const need of ['warmth', 'water', 'food', 'rest'] as const) this.levels[need] = this.level(need);
  }
}
