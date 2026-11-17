// Combustion rules for the fire in the pit (Lesson 02): fuel, heat, air and water as plain numbers.
//
// A fire is a handful of fuel pieces. Each piece first has to dry (its water must boil off before the
// wood can burn, and boiling it soaks up the fire's heat), then heat up to its ignition point, then it
// burns: it gives heat back to the fire and leaves coals. Thin fuel has far more surface for its mass, so
// it dries and catches fast and burns out fast; thick fuel needs a hot fire but lasts. Air (oxygen)
// scales all of it: wind and fanning feed the fire, unburnt heavy fuel crowds a small fire, earth smothers
// it. Rain wets the fuel. The numbers are game-scale rules of thumb (docs/SCIENCE.md), not measurements.
//
// Pure: no three.js. Pieces live in a fixed pool, so stepping the fire allocates nothing.

import type { ItemId } from './items.js';

export type FuelKind = 'tinder' | 'twigs' | 'branch' | 'logs' | 'charcoal';

export interface FuelProps {
  /** Fire heat (0..1) a piece needs around it before it can catch. */
  catchHeat: number;
  /** Seconds to catch at normal air once the fire is hot enough (surface area: thin is fast). */
  catchTime: number;
  /** Seconds to dry from soaking wet in a fully hot fire (surface area again). */
  dryTime: number;
  /** Seconds of burning at normal air. */
  burnTime: number;
  /** Heat it adds to the fire while it burns. */
  heat: number;
  /** Coals it leaves when it has burned (share of a full coal bed). */
  coal: number;
  /** Smoke while it burns dry (charcoal: almost none, its gases are already gone). */
  smoke: number;
  /** Heavy fuel crowds the air out of a fire while it is not yet burning. */
  heavy: boolean;
}

export const FUEL: Record<FuelKind, FuelProps> = {
  tinder: { catchHeat: 0.05, catchTime: 1, dryTime: 4, burnTime: 10, heat: 0.22, coal: 0, smoke: 0.2, heavy: false },
  twigs: { catchHeat: 0.12, catchTime: 2.5, dryTime: 8, burnTime: 25, heat: 0.16, coal: 0.04, smoke: 0.15, heavy: false },
  branch: { catchHeat: 0.3, catchTime: 6, dryTime: 18, burnTime: 45, heat: 0.22, coal: 0.08, smoke: 0.15, heavy: false },
  logs: { catchHeat: 0.4, catchTime: 14, dryTime: 40, burnTime: 90, heat: 0.3, coal: 0.15, smoke: 0.1, heavy: true },
  charcoal: { catchHeat: 0.35, catchTime: 5, dryTime: 6, burnTime: 120, heat: 0.45, coal: 0, smoke: 0.02, heavy: false },
};

/** What each item is as fuel, and the water it holds by nature (moss is spongy, living wood is full of sap). */
export interface ItemFuel {
  kind: FuelKind;
  /** Water it always holds, whatever the weather (0..1). */
  water?: number;
  /** Its water leaves this many times slower (sap is held inside living cells; moss soaks it up). */
  dryMul?: number;
  /** Share of its heat that reaches the fire once it burns (green wood spends heat boiling sap). */
  heatMul?: number;
}

export const ITEM_FUEL: Partial<Record<ItemId, ItemFuel>> = {
  dryGrass: { kind: 'tinder' },
  leafLitter: { kind: 'tinder' },
  bark: { kind: 'tinder' },
  dampMoss: { kind: 'tinder', water: 0.85, dryMul: 2 },
  twigs: { kind: 'twigs' },
  dryBranch: { kind: 'branch' },
  branch: { kind: 'branch' },
  greenBranch: { kind: 'branch', water: 0.6, dryMul: 3, heatMul: 0.75 },
  logs: { kind: 'logs' },
  charcoal: { kind: 'charcoal' },
};

/** Water above this keeps a piece from catching (it steams first). Also where fuel counts as damp. */
export const WET_IGNITE = 0.25;
export const DAMP = 0.3;
/** Pieces the pit holds at once (a fixed pool). */
export const MAX_PIECES = 16;
/** Extra air per unit of wind reaching the pit. */
export const WIND_AIR = 0.5;
/** Most extra air fanning can give, and how fast that boost fades (per second). */
export const FAN_MAX = 0.8;
export const FAN_DECAY = 0.6;
/** Air lost for each unlit heavy piece beyond the number of pieces already burning. */
export const CROWD_AIR = 0.2;
/** Air above this gives no more heat (only burns the fuel faster). */
export const AIR_HEAT_CAP = 1.4;
/** Heat a full bed of coals gives, and the share of the bed that burns away per second. */
export const COAL_HEAT = 0.5;
export const COAL_DECAY = 1 / 120;
/** Below this the coals are ash. */
export const COAL_MIN = 0.04;
/** How fast the fire's heat follows what its fuel and air give (per second). */
export const HEAT_FOLLOW = 0.8;
/** Heat a steaming piece takes from the fire per unit of water (boiling water soaks up heat). */
export const STEAM_COOL = 0.1;
/** A burning piece wetter than this is put out (rain). */
export const DOUSE = 0.5;

export interface Piece {
  used: boolean;
  kind: FuelKind;
  item: ItemId;
  /** Water 0..1. */
  wet: number;
  /** Water when it went in (what the player put on the fire). */
  wet0: number;
  /** Progress towards catching, 0..1. */
  catch: number;
  burning: boolean;
  /** Seconds of burning left. */
  left: number;
  /** Seconds since it went in. */
  age: number;
  /** Age when it caught (-1 = not yet). */
  caughtAt: number;
  /** Seconds it has spent steaming and smoking. */
  steamed: number;
  /** Put on an already burning fire (fed), not part of the first lay. */
  fed: boolean;
  /** Bits for what has been reported about it (FireState uses them). */
  told: number;
}

const blank = (): Piece => ({ used: false, kind: 'tinder', item: 'dryGrass', wet: 0, wet0: 0, catch: 0, burning: false, left: 0, age: 0, caughtAt: -1, steamed: 0, fed: false, told: 0 });

/** What happened during a step (FireState turns it into trials, notebook entries and messages). */
export interface HearthListener {
  caught(p: Piece): void;
  burnt(p: Piece): void;
  doused(p: Piece): void;
}

const fuelOf = (item: ItemId): ItemFuel => ITEM_FUEL[item] ?? { kind: 'twigs' };

/** The fire in the pit as fuel, heat, air and water. */
export class Hearth {
  readonly pieces: Piece[] = Array.from({ length: MAX_PIECES }, blank);
  /** Fire heat 0..1 (how hot and big the flames are). */
  heat = 0;
  /** Heat the burning fuel gives with this air, not capped (fanning shows up here even in a roaring fire). */
  power = 0;
  /** What the same fuel would give right now without the fanning (to judge what fanning does). */
  stillPower = 0;
  /** The coal bed 0..1. */
  coals = 0;
  /** Air factor this step: 1 = still air. */
  air = 1;
  /** Extra air from fanning (fades). */
  fan = 0;
  /** Smoke 0..1 and steam 0..1 this step. */
  smoke = 0;
  steam = 0;
  /** Covered with earth: no air gets in. */
  smothered = false;

  constructor(private readonly on: HearthListener) {}

  /** Put a piece of `item` in, holding `wet` water from the weather (its own water is added). */
  add(item: ItemId, wet: number, fed: boolean): Piece | null {
    const p = this.pieces.find((x) => !x.used);
    if (!p) return null;
    const f = fuelOf(item);
    p.used = true;
    p.kind = f.kind;
    p.item = item;
    p.wet = Math.min(1, Math.max(wet, f.water ?? 0));
    p.wet0 = p.wet;
    p.catch = 0;
    p.burning = false;
    p.left = 0;
    p.age = 0;
    p.caughtAt = -1;
    p.steamed = 0;
    p.fed = fed;
    p.told = 0;
    return p;
  }

  /** Light the piece: an ember or a flame has brought it to burning. */
  ignite(p: Piece): void {
    p.burning = true;
    p.catch = 1;
    p.left = FUEL[p.kind].burnTime;
    p.caughtAt = p.age;
  }

  clear(): void {
    for (const p of this.pieces) p.used = false;
    this.heat = this.power = this.coals = this.fan = this.smoke = this.steam = 0;
    this.air = 1;
    this.smothered = false;
  }

  count(kind?: FuelKind): number {
    let n = 0;
    for (const p of this.pieces) if (p.used && (!kind || p.kind === kind)) n++;
    return n;
  }

  get burningCount(): number {
    let n = 0;
    for (const p of this.pieces) if (p.used && p.burning) n++;
    return n;
  }

  /** Flames or glowing coals: the fire is still alive. */
  get alive(): boolean {
    return this.burningCount > 0 || this.coals > COAL_MIN;
  }

  /** Seconds of fuel left (burning pieces' remaining time plus the unlit pieces' whole burn). */
  get fuelSeconds(): number {
    let s = 0;
    for (const p of this.pieces) if (p.used) s += p.burning ? p.left : FUEL[p.kind].burnTime;
    return s + this.coals * 30;
  }

  /** Fanning: `strength` 0..1 for `dt` seconds. */
  fanned(strength: number, dt: number): void {
    this.fan = Math.min(FAN_MAX, this.fan + strength * dt * 1.5);
  }

  /** Rain on the fuel: `rate` water per second. */
  rain(rate: number, dt: number): void {
    for (const p of this.pieces) if (p.used) p.wet = Math.min(1, p.wet + rate * dt);
  }

  /** Advance the fire by `dt` seconds (callers keep steps at a quarter second or less). `wind` 0..1 reaching the pit. */
  step(dt: number, wind: number): void {
    // Air: still air, plus wind and fanning, minus heavy unlit fuel crowding a small fire.
    let burning = 0;
    let heavyUnlit = 0;
    for (const p of this.pieces) {
      if (!p.used) continue;
      if (p.burning) burning++;
      else if (FUEL[p.kind].heavy) heavyUnlit++;
    }
    const crowd = CROWD_AIR * Math.max(0, heavyUnlit - burning);
    this.air = this.smothered ? 0 : Math.max(0.2, Math.min(1.8, 1 + wind * WIND_AIR + this.fan - crowd));
    const airHeat = Math.min(this.air, AIR_HEAT_CAP);
    // Heat: what burns gives heat, water boiling off takes it.
    let power = this.coals * COAL_HEAT * airHeat;
    let steam = 0;
    let smoke = crowd * 0.5;
    for (const p of this.pieces) {
      if (!p.used) continue;
      const props = FUEL[p.kind];
      if (p.burning) {
        power += props.heat * (fuelOf(p.item).heatMul ?? 1) * airHeat;
        smoke += props.smoke * (1 + p.wet);
      } else if (p.wet > WET_IGNITE) {
        steam += p.wet * STEAM_COOL;
        smoke += 0.25 + p.wet * 0.4;
      } else if (p.catch > 0) smoke += 0.15;
    }
    this.power = power;
    const stillAir = this.smothered ? 0 : Math.max(0.2, Math.min(1.8, 1 + wind * WIND_AIR - crowd));
    this.stillPower = airHeat > 0 ? (power * Math.min(stillAir, AIR_HEAT_CAP)) / airHeat : 0;
    this.steam = Math.min(1, steam * 3);
    this.smoke = Math.min(1, smoke);
    const target = Math.max(0, Math.min(1, power - steam));
    this.heat += (target - this.heat) * Math.min(1, dt * HEAT_FOLLOW);
    if (this.heat < 0.002) this.heat = 0;
    // Each piece: dry, then catch, then burn.
    for (const p of this.pieces) {
      if (!p.used) continue;
      const f = fuelOf(p.item);
      const props = FUEL[p.kind];
      p.age += dt;
      if (p.burning) {
        // A burning piece dries itself; rain can still put it out.
        p.wet = Math.max(0, p.wet - (dt * Math.max(0.3, this.heat)) / (props.dryTime * (f.dryMul ?? 1)));
        if (p.wet > DOUSE || this.air <= 0) {
          p.burning = false;
          p.catch = 0;
          this.on.doused(p);
          continue;
        }
        p.left -= dt * Math.max(0.3, this.air);
        if (p.left <= 0) {
          this.coals = Math.min(1, this.coals + props.coal);
          p.used = false;
          this.on.burnt(p);
        }
        continue;
      }
      if (p.wet > WET_IGNITE) {
        // Water has to boil off first: the hotter the fire, the faster; thin pieces faster than thick.
        p.wet = Math.max(0, p.wet - (dt * this.heat) / (props.dryTime * (f.dryMul ?? 1)));
        p.steamed += dt;
        continue;
      }
      if (this.heat >= props.catchHeat && this.air > 0.2) {
        p.catch += (dt * airHeat) / props.catchTime;
        if (p.catch >= 1) {
          this.ignite(p);
          this.on.caught(p);
        }
      }
    }
    // Coals burn away (faster in a draught); earth snuffs them.
    this.coals = Math.max(0, this.coals - dt * (this.smothered ? 0.5 : COAL_DECAY * Math.max(0.3, this.air)));
    this.fan = Math.max(0, this.fan - dt * FAN_DECAY);
  }
}
