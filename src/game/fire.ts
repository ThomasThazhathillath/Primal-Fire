// The fire state machine (docs/DESIGN.md → Experiment 1): build a fire lay in
// the pit, saw the bow drill until dust smoulders into an ember, carry the
// ember to the tinder and fan it into flame. Plain data + rules so it can be
// unit-tested; FireSystem feeds it hand motion.

import type { Game } from './game.js';
import type { ItemId } from './items.js';
import { itemName } from './items.js';

export type FireStage = 'cold' | 'lay' | 'ember' | 'burning' | 'out';
export type FuelKind = 'tinder' | 'twigs' | 'logs';

/** What the lay needs before it counts as built. */
export const LAY_NEEDS: Record<FuelKind, number> = { tinder: 1, twigs: 3, logs: 2 };
/** Order the finest fuel goes in. */
export const FUEL_ORDER: FuelKind[] = ['tinder', 'twigs', 'logs'];
/** Seconds of flame each unit of fuel gives. */
export const BURN_SECONDS: Record<FuelKind, number> = { tinder: 10, twigs: 25, logs: 90 };
/** Items that can go in the lay, and the kind of fuel they are. */
export const FUEL_ITEMS: Partial<Record<ItemId, FuelKind>> = {
  dryGrass: 'tinder',
  dampMoss: 'tinder',
  twigs: 'twigs',
  logs: 'logs',
};
const FUEL_ITEM: Record<FuelKind, ItemId> = { tinder: 'dryGrass', twigs: 'twigs', logs: 'logs' };

/** Sawing speed (m/s of hand travel) below which no heat is made. */
export const SAW_MIN_SPEED = 0.35;
/** Heat gained per metre of fast sawing. */
export const SAW_HEAT_PER_M = 0.22;
/** Heat lost per second when you stop sawing. */
export const HEAT_DECAY = 0.12;
/** Seconds a carried ember survives. */
export const EMBER_CARRY_SECONDS = 20;
/** Fan strength (0..1) is air per second; need this much air to catch. */
export const AIR_TO_IGNITE = 1;
/** Seconds an unfanned ember in the tinder lasts. */
export const EMBER_REST_SECONDS = 12;

export interface FireSave {
  tinder: number;
  twigs: number;
  logs: number;
  fuelFirst: boolean;
  stage: FireStage;
  burnLeft: number;
}

export class FireState {
  tinder = 0;
  twigs = 0;
  logs = 0;
  /** Logs went in before the kindling was ready: the fire will starve. */
  fuelFirst = false;
  stage: FireStage = 'cold';
  /** Bow-drill heat 0..1. */
  heat = 0;
  /** True while you carry a glowing ember in your hand. */
  carrying = false;
  carryLeft = 0;
  /** An ember sits in the tinder, waiting for air. */
  embedded = false;
  restLeft = 0;
  air = 0;
  burnLeft = 0;

  constructor(private readonly game: Game) {}

  get layBuilt(): boolean {
    return FUEL_ORDER.every((k) => this[k] >= LAY_NEEDS[k]);
  }

  /** 0..1 flame strength, for effects. */
  get intensity(): number {
    if (this.stage === 'burning') return Math.min(1, 0.45 + this.burnLeft / 120);
    if (this.embedded) return Math.min(0.5, this.air * 0.5);
    return 0;
  }

  // ----------------------------------------------------------- the lay

  /** The fuel kind the next pinch at the pit would add, given hand + satchel. */
  nextFuel(): FuelKind | null {
    const held = this.game.held ? FUEL_ITEMS[this.game.held] : undefined;
    if (held) return held;
    return FUEL_ORDER.find((k) => this[k] < LAY_NEEDS[k] && this.game.count(FUEL_ITEM[k]) > 0) ?? null;
  }

  /** Add fuel to the pit from your hand (or the satchel). */
  addFuel(): boolean {
    const g = this.game;
    if (this.embedded) {
      g.toast('Leave the ember to its air — fan it.', 'note');
      return false;
    }
    if (!g.hasStructure('firePit')) {
      g.toast('Build a fire pit first.', 'bad');
      return false;
    }
    const heldKind = g.held ? FUEL_ITEMS[g.held] : undefined;
    const kind = heldKind ?? this.nextFuel();
    if (!kind) {
      g.toast('You need tinder (dry grass), twigs, then logs.', 'bad');
      return false;
    }
    const item = g.held && FUEL_ITEMS[g.held] ? g.held : FUEL_ITEM[kind];
    if (!g.useItem(item)) {
      g.toast(`You have no ${itemName(item).toLowerCase()}.`, 'bad');
      return false;
    }
    if (kind === 'logs' && (this.tinder < LAY_NEEDS.tinder || this.twigs < LAY_NEEDS.twigs)) this.fuelFirst = true;
    this[kind] += 1;
    if (item === 'dampMoss') this.mossDamp = true;
    if (this.stage === 'burning') {
      this.burnLeft += BURN_SECONDS[kind];
      g.toast(`Fed the fire: ${itemName(item).toLowerCase()}.`, 'good');
    } else {
      this.stage = 'lay';
      g.toast(`Added ${itemName(item).toLowerCase()} to the lay.`);
    }
    if (this.stage === 'lay' && this.layBuilt && !g.flag('fireLayBuilt')) {
      g.setFlag('fireLayBuilt');
      g.toast('The fire lay is ready. Now make an ember.', 'good');
      g.addXp(20);
    }
    g.checkQuests();
    g.notifyFire();
    return true;
  }

  mossDamp = false;

  // ----------------------------------------------------------- the ember

  /** Hand travel while sawing the bow drill: call each frame with metres moved and dt. */
  saw(distance: number, dt: number): void {
    const g = this.game;
    if (g.held !== 'bowDrill' || !this.layBuilt || this.stage !== 'lay' || this.carrying) return;
    const speed = dt > 0 ? distance / dt : 0;
    if (speed >= SAW_MIN_SPEED) {
      this.heat = Math.min(1, this.heat + distance * SAW_HEAT_PER_M);
      if (this.heat >= 1) this.makeEmber();
    }
  }

  /** Fallback for browser play: one tap = one stroke. */
  stroke(): void {
    this.saw(0.3, 0.25);
  }

  private makeEmber(): void {
    const g = this.game;
    this.heat = 0;
    this.carrying = true;
    this.carryLeft = EMBER_CARRY_SECONDS;
    g.setFlag('emberMade');
    g.observe('f_drill');
    g.toast('An ember! Carry it to the tinder before it dies.', 'good');
    g.checkQuests();
    g.notifyFire();
  }

  /** Move the carried ember into the tinder nest. */
  transferEmber(): boolean {
    const g = this.game;
    if (!this.carrying) return false;
    this.carrying = false;
    if (this.mossDamp) {
      this.reset();
      g.observe('f_damp');
      g.toast('The damp moss hissed — the ember is dead. Use dry grass.', 'bad');
      g.notifyFire();
      return true;
    }
    this.embedded = true;
    this.restLeft = EMBER_REST_SECONDS;
    this.air = 0.1;
    g.toast('Fan it with an open palm!', 'note');
    g.notifyFire();
    return true;
  }

  /** Open-palm fanning: strength 0..1 per second. */
  fan(strength: number, dt: number): void {
    if (!this.embedded) return;
    this.air = Math.min(AIR_TO_IGNITE, this.air + strength * dt);
    this.restLeft = Math.min(EMBER_REST_SECONDS, this.restLeft + dt * 2 * strength);
    if (this.air >= AIR_TO_IGNITE) this.ignite();
  }

  private ignite(): void {
    const g = this.game;
    this.embedded = false;
    if (this.fuelFirst) {
      g.observe('f_bigfuel');
      g.toast('The tinder flared, then the heavy logs smothered it. Kindling goes under logs.', 'bad');
      this.reset();
      g.notifyFire();
      return;
    }
    this.stage = 'burning';
    this.burnLeft = this.tinder * BURN_SECONDS.tinder + this.twigs * BURN_SECONDS.twigs + this.logs * BURN_SECONDS.logs;
    g.setFlag('fireLit');
    g.observe('f_success');
    g.addXp(40);
    g.toast('Fire!', 'good');
    g.checkQuests();
    g.notifyFire();
  }

  private reset(): void {
    this.tinder = this.twigs = this.logs = 0;
    this.fuelFirst = false;
    this.mossDamp = false;
    this.stage = 'cold';
    this.heat = 0;
    this.carrying = false;
    this.embedded = false;
    this.air = 0;
  }

  // -------------------------------------------------------------- time

  tick(dt: number): void {
    const g = this.game;
    if (this.heat > 0 && !this.carrying) this.heat = Math.max(0, this.heat - HEAT_DECAY * dt);
    if (this.carrying) {
      this.carryLeft -= dt;
      if (this.carryLeft <= 0) {
        this.carrying = false;
        g.observe('f_oxygen');
        g.toast('The ember went dark. Saw again.', 'bad');
        g.notifyFire();
      }
    }
    if (this.embedded) {
      this.restLeft -= dt;
      this.air = Math.max(0.1, this.air - 0.04 * dt);
      if (this.restLeft <= 0) {
        this.embedded = false;
        this.stage = 'lay';
        this.air = 0;
        g.observe('f_oxygen');
        g.toast('The ember faded. It needs air — saw a new one.', 'bad');
        g.notifyFire();
      }
    }
    if (this.stage === 'burning') {
      this.burnLeft -= dt;
      if (this.burnLeft <= 0) {
        this.reset();
        this.stage = 'out';
        g.observe('f_nofuel');
        g.toast('The fire burned out. Lay more fuel to relight.', 'note');
        g.notifyFire();
      }
    }
  }

  // ------------------------------------------------------- save / load

  snapshot(): FireSave {
    return { tinder: this.tinder, twigs: this.twigs, logs: this.logs, fuelFirst: this.fuelFirst, stage: this.stage, burnLeft: this.burnLeft };
  }

  restore(s: FireSave): void {
    this.tinder = s.tinder;
    this.twigs = s.twigs;
    this.logs = s.logs;
    this.fuelFirst = s.fuelFirst;
    this.stage = s.stage === 'ember' ? 'lay' : s.stage;
    this.burnLeft = s.burnLeft;
  }
}
