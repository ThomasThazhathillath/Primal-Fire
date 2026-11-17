// Fuel moisture (Lesson 02): how wet the fuel you carry is.
//
// Water in fuel matters: it must boil away before the fuel can catch, which costs the fire heat and makes
// smoke (combustion.ts). Here the weather decides how wet your fuel is:
// - picked up out in the open after rain, it is as wet as the world (Environment.wet); under a roof, dry;
// - carried through rain with no roof over you, it slowly soaks;
// - beside a burning fire it dries quickly, under your roof slowly, in the open air slowest (sun and wind).
// Moisture is kept per item type (the average of the stack you carry), saved, and read by the fire when
// the fuel goes in. Damp moss and green wood also hold water by nature (combustion.ts ITEM_FUEL).

import { DAMP, ITEM_FUEL } from './combustion.js';
import { fireExposed } from './environment.js';
import type { Game } from './game.js';
import { itemName, type ItemId } from './items.js';

/** Water per second soaking into carried fuel in full rain with no roof over you. */
export const CARRY_WET = 1 / 120;
/** Water per second leaving fuel beside a fully hot fire (scaled by the fire's heat). */
export const FIRE_DRY = 1 / 25;
/** Within this distance (m) of a burning fire your fuel dries. */
export const FIRE_DRY_RANGE = 2.5;
/** Water per second leaving fuel under a roof, and in the open air (before sun and wind). */
export const ROOF_DRY = 1 / 150;
export const AIR_DRY = 1 / 240;

export type FuelMoistureSave = Record<string, number>;

const TRACKED = Object.keys(ITEM_FUEL) as ItemId[];

export class FuelMoisture {
  /** Weather water in each carried fuel stack, 0..1 (its own water is added by the fire). */
  private readonly wet = new Map<ItemId, number>();

  constructor(private readonly g: Game) {}

  /** How many of `id` you carry (bag and hand). */
  private carried(id: ItemId): number {
    return this.g.count(id) + (this.g.held === id ? 1 : 0);
  }

  /** Weather water in the fuel you carry (0 for anything that is not fuel). */
  of(id: ItemId): number {
    return this.wet.get(id) ?? 0;
  }

  /** How wet the fuel is in total: its weather water or its own water, whichever is more. */
  total(id: ItemId): number {
    return Math.max(this.of(id), ITEM_FUEL[id]?.water ?? 0);
  }

  isDamp(id: ItemId): boolean {
    return this.total(id) >= DAMP;
  }

  /** How wet the open ground is at (x, z): the world's wetness, or dry under a roof. */
  groundWet(x: number, z: number): number {
    return fireExposed(this.g.structures, x, z) ? this.g.env.wet : 0;
  }

  /** One `id` was just picked up at (x, z) and is now carried: mix its water into the stack. */
  picked(id: ItemId, x: number, z: number): void {
    if (!ITEM_FUEL[id]) return;
    const n = this.carried(id);
    if (n <= 0) return;
    const w = this.groundWet(x, z);
    const before = this.of(id);
    const after = n <= 1 ? w : (before * (n - 1) + w) / n;
    this.set(id, after);
    if (w >= DAMP && !ITEM_FUEL[id]?.water) this.g.toast(`${itemName(id)}: wet from the rain. Dry it by a fire or under your roof.`, 'note');
  }

  private set(id: ItemId, v: number): void {
    const c = Math.max(0, Math.min(1, v));
    if (c < 0.001) this.wet.delete(id);
    else this.wet.set(id, c);
  }

  /** The 4 Hz slow step: rain soaks carried fuel, a fire or a roof dries it. */
  tick(dt: number): void {
    const g = this.g;
    if (!this.wet.size && !(g.env.rain > 0.05)) return;
    const sheltered = g.climate?.sheltered ?? false;
    const raining = g.env.rain > 0.05 && !sheltered;
    let fireDry = 0;
    if (g.fire.stage === 'burning') {
      const pit = g.structures.find((s) => s.kind === 'firePit' && s.complete);
      if (pit && Math.hypot(pit.x - g.player.x, pit.z - g.player.z) < FIRE_DRY_RANGE) fireDry = FIRE_DRY * Math.max(0.2, g.fire.flame);
    }
    const env = g.env;
    const air = AIR_DRY * (0.3 + (1 - env.night) * (1 - env.cloud * 0.6) + env.windStrength * 0.5);
    let soaked: ItemId | null = null;
    let dried: ItemId | null = null;
    for (const id of TRACKED) {
      if (this.carried(id) <= 0) continue;
      const before = this.of(id);
      let after = before;
      if (raining) after += env.rain * CARRY_WET * dt;
      else after -= (fireDry > 0 ? fireDry : sheltered ? ROOF_DRY : air) * dt;
      this.set(id, after);
      if (before < DAMP && after >= DAMP && !ITEM_FUEL[id]?.water) soaked = id;
      if (before >= DAMP && after < DAMP) dried = id;
    }
    if (soaked) g.toast(`${itemName(soaked)} in your bag: getting wet in the rain.`, 'note');
    if (dried) {
      g.toast(`${itemName(dried)}: dry again.`, 'good');
      if (fireDry > 0 || sheltered) g.science('fire.fuel.dried');
    }
  }

  snapshot(): FuelMoistureSave {
    const out: FuelMoistureSave = {};
    for (const [id, v] of this.wet) out[id] = v;
    return out;
  }

  restore(s: FuelMoistureSave | undefined): void {
    this.wet.clear();
    for (const [id, v] of Object.entries(s ?? {})) if (ITEM_FUEL[id as ItemId] && v > 0) this.wet.set(id as ItemId, Math.min(1, v));
  }
}
