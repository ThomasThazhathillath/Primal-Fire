// The fire state machine (docs/DESIGN.md -> Experiment 1; Lesson 02 in docs/CURRICULUM.md): build a fire lay
// in the pit, saw the bow drill until dust smoulders into an ember, carry the ember to the tinder and fan it
// into flame, then keep the fire fed. Plain data + rules so it can be unit-tested; FireSystem feeds it hand
// (or mouse) motion.
//
// What is simulated (combustion.ts has the fuel rules):
// - the bow drill: friction heat grows with stroke speed AND downward pressure; the dust cools all the time,
//   faster the hotter it is, so slow or light sawing levels off before it smokes;
// - the ember: it needs air (fanning, or wind on an open pit); damp tinder needs more air and kills it when wet;
// - the burning fire: each piece dries, catches and burns; thin fuel first, logs only on a hot fire; wind and
//   fanning feed it, earth smothers it, rain wets it, burnt fuel leaves coals, and it dies unless it is fed.
// The Lesson 02 experiments are reported from here, as they really happen (lessons/fire/experiments.ts).

import { DAMP, FUEL, type FuelKind, Hearth, type HearthListener, ITEM_FUEL, type Piece } from './combustion.js';
import { fireExposed } from './environment.js';
import type { Game } from './game.js';
import type { ItemId } from './items.js';
import { itemName } from './items.js';
import { nearestTreeDistance } from './world-layout.js';

export type FireStage = 'cold' | 'lay' | 'ember' | 'burning' | 'out';
export type { FuelKind } from './combustion.js';
/** The three layers of a fire lay, finest first. */
export type LayKind = 'tinder' | 'twigs' | 'logs';

/** What the lay needs before it counts as built. */
export const LAY_NEEDS: Record<LayKind, number> = { tinder: 1, twigs: 3, logs: 2 };
/** Order the finest fuel goes in. */
export const FUEL_ORDER: LayKind[] = ['tinder', 'twigs', 'logs'];
/** Seconds of flame each unit of fuel gives at normal air. */
export const BURN_SECONDS: Record<FuelKind, number> = {
  tinder: FUEL.tinder.burnTime,
  twigs: FUEL.twigs.burnTime,
  branch: FUEL.branch.burnTime,
  logs: FUEL.logs.burnTime,
  charcoal: FUEL.charcoal.burnTime,
};
/** Items that can go in the fire, and the kind of fuel they are. */
export const FUEL_ITEMS: Partial<Record<ItemId, FuelKind>> = Object.fromEntries(Object.entries(ITEM_FUEL).map(([id, f]) => [id, f!.kind]));
const FUEL_ITEM: Record<LayKind, ItemId> = { tinder: 'dryGrass', twigs: 'twigs', logs: 'logs' };
const isLayKind = (k: FuelKind): k is LayKind => k === 'tinder' || k === 'twigs' || k === 'logs';

// ------------------------------------------------------------ the bow drill
/** Hand (or mouse) travel slower than this (m/s) makes no friction heat. */
export const SAW_MIN_SPEED = 0.35;
/** Friction heat per second for each m/s of stroke at firm pressure (heat = force x speed). */
export const DRILL_GAIN = 0.35;
/** Downward pressure on the spindle: a light touch only polishes the board; a firm press grinds hot dust. */
export const PRESSURE = { light: 0.25, firm: 1 };
/** The dust always cools: a floor plus a part that grows with its heat (hot things lose heat faster). */
export const DRILL_COOL_BASE = 0.08;
export const DRILL_COOL_K = 0.25;
/** Drill heat at which the board smokes. */
export const SMOKE_HEAT = 0.6;
/** A test stroke run: at least this long (s); slow is below SLOW_SPEED, fast at or above FAST_SPEED (m/s). */
export const SESSION_MIN = 4;
export const SLOW_SPEED = 0.5;
export const FAST_SPEED = 0.9;
/** A pause this long (s) ends a stroke run. */
const SESSION_GAP = 0.6;
/** @deprecated kept for older callers: the drill now cools continuously (DRILL_COOL_*). */
export const HEAT_DECAY = DRILL_COOL_BASE;

// ------------------------------------------------------------ the ember
// The ember has no time limit: carried, it glows until you put it in the tinder; in the tinder without air it only
// smoulders and dims (the card says it needs air) until you fan it or the wind does.
/** Fan strength (0..1) is air per second; dry tinder catches at this much air. Damp tinder needs more. */
export const AIR_TO_IGNITE = 1;
/** Seconds an unfanned ember smoulders in the tinder before the game points out that it needs air. */
export const EMBER_REST_SECONDS = 12;
/** Tinder this wet kills the ember outright (the water takes its heat). */
export const TINDER_KILLS = 0.6;
/** Air per second wind gives an ember in an open pit, per unit of wind. */
export const EMBER_WIND = 0.12;

// ------------------------------------------------------------ the burning fire
/**
 * Water per second rain puts on exposed fuel, per unit of rain loss (EnvironmentSystem's RAIN_BURN_LOSS scale):
 * light rain only slows a fire that has caught; heavy rain on an unsheltered fire can put it out.
 */
export const RAIN_WET = 0.008;
/** The fire's own rules run at this step (the 4 Hz slow step), whatever the frame rate. */
const SIM_STEP = 0.25;
/** The practical: keep a fire you lit yourself burning this long (s), feeding it at least this often. */
export const KEEP_SECONDS = 150;
export const KEEP_FEEDS = 2;
/** Seconds after it goes in that a piece that has not caught counts as slow to catch. */
const SLOW_TO_CATCH = 15;
/** A fine piece that catches within this many seconds caught quickly; a branch within BRIGHT_SECONDS burned bright. */
const QUICK_SECONDS = 4;
const FAST_SECONDS = 6;
const BRIGHT_SECONDS = 10;
/** Fanning: air given before a fanning run is judged, and the power gain that counts as growing. */
const FAN_JUDGE_AIR = 0.8;
const FAN_GROWS = 1.15;

// Bits in Piece.told: what has been reported about a piece.
const TOLD_SLOW = 1;
const TOLD_SMOKE = 2;

export interface FireSave {
  tinder: number;
  twigs: number;
  logs: number;
  fuelFirst: boolean;
  stage: FireStage;
  burnLeft: number;
  // ---- Lesson 02 (absent in older saves)
  /** The pieces in the pit: [item, water, water when it went in, catch progress, seconds left (-1 = not burning), age, fed]. */
  pieces?: Array<[ItemId, number, number, number, number, number, boolean]>;
  coals?: number;
  flame?: number;
  /** Fires lit from an ember so far, and which one is burning now. */
  lights?: number;
  run?: number;
  /** Seconds the current fire has burned and pieces fed to it. */
  keepT?: number;
  feeds?: number;
  /** The practical was passed: a fire lit on your own, kept burning and fed. */
  kept?: boolean;
  /** An ember in your hand or in the tinder (it has no time limit, so it is kept across a reload). */
  ember?: 'carried' | 'tinder';
}

export class FireState implements HearthListener {
  tinder = 0;
  twigs = 0;
  logs = 0;
  /** Logs went in before the kindling was ready: the fire will starve. */
  fuelFirst = false;
  stage: FireStage = 'cold';
  /** Bow-drill heat 0..1. */
  heat = 0;
  /** True while you carry a glowing ember in your hand (it does not go out). */
  carrying = false;
  /** An ember sits in the tinder, waiting for air. */
  embedded = false;
  /** Seconds it has smouldered there without enough air. */
  restLeft = 0;
  air = 0;
  /** Seconds of fuel left in the burning fire (kept up to date by the fire's rules). */
  burnLeft = 0;
  /** The fuel in the pit: pieces, heat, air, coals (combustion.ts). */
  readonly hearth: Hearth = new Hearth(this);
  /** Fires lit from an ember so far, and the number of the one burning now. */
  lights = 0;
  run = 0;
  /** Seconds the current fire has been burning, and pieces fed to it. */
  keepT = 0;
  feeds = 0;
  /** The practical: a fire you lit on your own (not the first, guided one) kept burning and fed. */
  kept = false;
  /** Wind reaching the pit (0..1), from the weather and whether a roof shelters the pit. */
  wind = 0;
  /** What the bow drill is doing right now (for the experiment card's readout): stroke speed (m/s) and press. */
  strokeSpeed = 0;
  strokePress: number = PRESSURE.firm;
  /** The last piece put on the burning fire (its slot is reused once it has burned away). */
  lastFed: Piece | null = null;

  private simT = 0;
  /** The current stroke run of the bow drill (for the drill experiments). */
  private strokes = { t: 0, dist: 0, firm: 0, light: 0, idle: 0, trend: 0, lastHeat: 0, noLay: false };
  /** The current fanning run of a burning fire (for the airflow experiment). */
  private fanRun = { air: 0, idle: 0 };
  /** Seconds the wind has been fanning an open fire. */
  private windT = 0;

  constructor(private readonly game: Game) {}

  get layBuilt(): boolean {
    return FUEL_ORDER.every((k) => this[k] >= LAY_NEEDS[k]);
  }

  /** The lay is built and waiting for an ember. */
  get layReady(): boolean {
    return this.layBuilt && this.stage === 'lay';
  }

  /** Can the bow drill be sawn at the pit right now (also beside a burning fire, for the experiments)? */
  get canDrill(): boolean {
    return this.game.held === 'bowDrill' && this.game.hasStructure('firePit') && !this.carrying && !this.embedded && (this.layReady || this.stage === 'burning');
  }

  /** Fire heat 0..1: how big and hot the flames are. */
  get flame(): number {
    return this.stage === 'burning' ? this.hearth.heat : 0;
  }

  /** Smoke 0..1: thick from damp or green fuel, a smouldering ember, or a crowded fire. */
  get smoke(): number {
    if (this.stage === 'burning') return this.hearth.smoke;
    if (this.embedded) return Math.min(1, 0.3 + this.tinderWet());
    return 0;
  }

  /** 0..1 flame strength, for effects. */
  get intensity(): number {
    // Flames while fuel burns; only glowing coals (below 0.5, so no flames are drawn) once it has burned down.
    if (this.stage === 'burning') return this.hearth.burningCount > 0 ? Math.min(1, 0.5 + 0.5 * this.hearth.heat) : Math.min(0.45, 0.2 + this.hearth.coals);
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
      g.toast('Leave the ember to its air: fan it.', 'note');
      return false;
    }
    if (!g.hasStructure('firePit')) {
      g.toast('Build a fire pit first.', 'bad');
      return false;
    }
    const heldKind = g.held ? FUEL_ITEMS[g.held] : undefined;
    const kind = heldKind ?? this.nextFuel();
    if (!kind) {
      g.toast(this.stage === 'burning' ? 'Take fuel out of your bag to feed the fire.' : 'You need tinder (dry grass), twigs, then logs.', 'bad');
      return false;
    }
    const item: ItemId = g.held && FUEL_ITEMS[g.held] ? g.held : FUEL_ITEM[kind as LayKind];
    const wet = g.fuelWet.of(item);
    if (!g.useItem(item)) {
      g.toast(`You have no ${itemName(item).toLowerCase()}.`, 'bad');
      return false;
    }
    const burning = this.stage === 'burning';
    const piece = this.hearth.add(item, wet, burning);
    if (!piece) {
      g.addItem(item);
      g.toast('The pit is full. Let it burn down a little.', 'note');
      return false;
    }
    if (kind === 'logs' && !burning && (this.tinder < LAY_NEEDS.tinder || this.twigs < LAY_NEEDS.twigs)) this.fuelFirst = true;
    if (isLayKind(kind)) this[kind] += 1;
    const name = itemName(item).toLowerCase();
    if (burning) {
      this.feeds++;
      this.lastFed = piece;
      this.updateBurnLeft();
      if (piece.wet >= DAMP) {
        g.science('fire.fuel.wet');
        g.toast(item === 'greenBranch' ? 'The green branch sizzles and smokes: sap boils out of it.' : 'It hisses and steams: its water must boil off before it can burn.', 'note');
      } else if (this.hearth.heat < FUEL[kind].catchHeat) {
        g.toast(`The fire is too small to light ${kind === 'logs' ? 'a log' : `the ${name}`} yet. Give it thin kindling first.`, 'note');
      } else g.toast(`Fed the fire: ${name}.`, 'good');
    } else {
      this.stage = 'lay';
      g.toast(piece.wet >= DAMP ? `Added ${name} to the lay. It is damp.` : `Added ${name} to the lay.`);
    }
    if (this.stage === 'lay' && this.layBuilt && !g.flag('fireLayBuilt')) {
      g.setFlag('fireLayBuilt');
      g.toast('The fire lay is ready. Now make an ember.', 'good');
      g.addXp(20);
    }
    g.checkProgress();
    g.notifyFire();
    return true;
  }

  /** How wet the tinder in the lay is (the wettest counts most: the ember sits in it). */
  tinderWet(): number {
    let sum = 0;
    let n = 0;
    for (const p of this.hearth.pieces) if (p.used && p.kind === 'tinder') {
      sum += p.wet;
      n++;
    }
    return n ? sum / n : 0;
  }

  /** Rain on an exposed fire: `loss` per second of rain strength (EnvironmentSystem). */
  weather(loss: number, dt: number): void {
    if (loss <= 0 || dt <= 0) return;
    if (this.stage === 'burning' || this.stage === 'lay') this.hearth.rain(loss * RAIN_WET, dt);
  }

  // ----------------------------------------------------------- the ember

  /**
   * One frame of sawing: `distance` metres of bow travel in `dt` seconds, `pressure` how hard the spindle is
   * pressed (PRESSURE.light..firm) and `rhythm` 0..1 how steadily the bow goes back and forth.
   */
  saw(distance: number, dt: number, pressure = PRESSURE.firm, rhythm = 1): void {
    if (!this.canDrill || dt <= 0) return;
    const speed = distance / dt;
    const r = this.strokes;
    this.strokeSpeed += (speed - this.strokeSpeed) * Math.min(1, dt * 4);
    this.strokePress = pressure;
    if (speed >= 0.1) {
      r.t += dt;
      r.dist += distance;
      if (pressure >= 0.6) r.firm += dt;
      else r.light += dt;
      r.idle = 0;
    }
    if (speed >= SAW_MIN_SPEED) {
      const gain = DRILL_GAIN * pressure * speed * (0.25 + 0.75 * Math.max(0, Math.min(1, rhythm)));
      this.heat = Math.min(1, this.heat + gain * dt);
    }
    r.trend += ((this.heat - r.lastHeat) / dt - r.trend) * Math.min(1, dt * 2);
    r.lastHeat = this.heat;
    if (this.heat >= 1) {
      if (this.layReady) this.makeEmber();
      else {
        this.heat = 0.98;
        if (!r.noLay) {
          r.noLay = true;
          this.game.toast('The board smokes. Your fire is already burning, so no ember is needed.', 'note');
        }
      }
    }
  }

  /** A stroke run ended: it is a trial of the drill experiments when it lasted long enough. */
  private endRun(): void {
    const g = this.game;
    const r = this.strokes;
    if (r.t >= SESSION_MIN || (this.carrying && r.t >= 1)) {
      const speed = r.dist / r.t;
      const firm = r.firm >= r.t * 0.6;
      const light = r.light >= r.t * 0.6;
      // Smoking and not cooling down: the friction keeps up with the heat it loses.
      const smoke = this.carrying || (this.heat >= SMOKE_HEAT && r.trend > -0.02);
      const out = smoke ? 'smoke' : 'nosmoke';
      // One thing changes per test: speed is compared at a firm press, pressure at a fast stroke.
      if (firm && speed < SLOW_SPEED) g.experiments.trial('drillSpeed', 'slow', out);
      if (firm && speed >= FAST_SPEED) g.experiments.trial('drillSpeed', 'fast', out);
      if (speed >= FAST_SPEED && firm) g.experiments.trial('drillPressure', 'firm', out);
      if (speed >= FAST_SPEED && light) g.experiments.trial('drillPressure', 'light', out);
      if (!smoke && firm && speed < SLOW_SPEED) {
        g.science('fire.drill.slow');
        g.toast('Warm dust, but no smoke: slow strokes lose heat as fast as they make it. Saw faster.', 'note');
      } else if (!smoke && light && speed >= FAST_SPEED) {
        g.science('fire.drill.light');
        g.toast('The spindle only polished the board: press down harder on top of the spindle.', 'note');
      }
    }
    r.t = r.dist = r.firm = r.light = r.idle = r.trend = 0;
    r.lastHeat = this.heat;
    r.noLay = false;
  }

  private makeEmber(): void {
    const g = this.game;
    this.heat = 0;
    this.carrying = true;
    this.endRun();
    g.setFlag('emberMade');
    g.observe('f_drill');
    g.science('fire.drill.ember');
    g.toast('An ember! Carry it to the tinder in your fire lay.', 'good');
    g.checkProgress();
    g.notifyFire();
  }

  /** Move the carried ember into the tinder nest. */
  transferEmber(): boolean {
    const g = this.game;
    if (!this.carrying) return false;
    this.carrying = false;
    if (!this.layReady) {
      g.toast('The ember needs a tinder nest in a built fire lay.', 'note');
      g.notifyFire();
      return true;
    }
    const wet = this.tinderWet();
    if (wet >= TINDER_KILLS) {
      this.reset();
      g.observe('f_damp');
      g.science('fire.ember.damp');
      g.toast('The damp tinder hissed: the ember is dead. Use dry grass.', 'bad');
      g.notifyFire();
      return true;
    }
    this.embedded = true;
    this.restLeft = 0;
    this.air = 0.1;
    g.toast(wet >= DAMP ? 'The tinder is damp: it smokes. Fan it hard and long!' : 'Fan it with an open palm!', 'note');
    g.notifyFire();
    return true;
  }

  /** Open-palm fanning: strength 0..1 per second. Feeds an ember, or a burning fire. */
  fan(strength: number, dt: number): void {
    if (strength <= 0 || dt <= 0) return;
    if (this.stage === 'burning') {
      this.fanRun.air += strength * dt;
      this.fanRun.idle = 0;
      this.hearth.fanned(strength, dt);
      return;
    }
    if (!this.embedded) return;
    this.air = Math.min(this.airNeeded(), this.air + strength * dt);
    this.restLeft = 0;
    if (this.air >= this.airNeeded()) this.ignite();
  }

  /** Air the ember needs before the tinder catches: damp tinder takes up to three times as much. */
  private airNeeded(): number {
    return AIR_TO_IGNITE * (1 + 2 * Math.max(0, this.tinderWet()));
  }

  private ignite(): void {
    const g = this.game;
    this.embedded = false;
    if (this.fuelFirst) {
      g.observe('f_bigfuel');
      g.science('fire.fuel.toobig');
      g.toast('The tinder flared, then the heavy logs smothered it. Kindling goes under logs.', 'bad');
      this.reset();
      g.notifyFire();
      return;
    }
    this.stage = 'burning';
    for (const p of this.hearth.pieces) if (p.used && p.kind === 'tinder') this.hearth.ignite(p);
    this.hearth.heat = Math.max(this.hearth.heat, 0.2);
    this.hearth.smothered = false;
    this.lights++;
    this.run = this.lights;
    this.keepT = 0;
    this.feeds = 0;
    this.updateBurnLeft();
    const first = !g.flag('fireLit');
    g.setFlag('fireLit');
    g.observe('f_success');
    g.science('fire.lit');
    this.fireSafety();
    g.addXp(40);
    g.toast(this.lights >= 2 ? 'Fire! You lit it on your own.' : 'Fire!', 'good');
    g.checkProgress();
    g.notifyFire(first);
  }

  /** What a burning fire teaches about where it is: wet stones in the ring, dry litter under trees. */
  private fireSafety(): void {
    const g = this.game;
    const pit = g.structures.find((s) => s.kind === 'firePit' && s.complete);
    if (!pit) return;
    if ((pit.key === 'wetStone' || pit.spots.includes('wetStone')) && !g.hasEvent('build.firepit.wetstone')) {
      g.science('build.firepit.wetstone');
      g.toast('Crack! A wet stream stone in your ring burst in the heat. Use dry stones near a fire.', 'note');
    }
    if (nearestTreeDistance(pit.x, pit.z) < 3.5 && !g.hasEvent('build.firepit.litter')) {
      g.science('build.firepit.litter');
      g.toast('Sparks drift into the dry leaves under the trees. Keep the ground around a fire clear.', 'note');
    }
  }

  /** Scrape earth over the burning fire: no air gets in, and it dies. */
  smother(): boolean {
    const g = this.game;
    if (this.stage !== 'burning') return false;
    if (this.hearth.smothered) return true;
    this.hearth.smothered = true;
    g.toast('You scrape earth over the fire. Smoke seeps out...', 'info');
    g.notifyFire();
    return true;
  }

  private reset(): void {
    this.tinder = this.twigs = this.logs = 0;
    this.fuelFirst = false;
    this.stage = 'cold';
    this.heat = 0;
    this.carrying = false;
    this.embedded = false;
    this.air = 0;
    this.burnLeft = 0;
    this.keepT = 0;
    this.feeds = 0;
    this.hearth.clear();
  }

  private updateBurnLeft(): void {
    this.burnLeft = this.hearth.fuelSeconds;
  }

  // ------------------------------------------------- what the fuel did (HearthListener)

  caught(p: Piece): void {
    const g = this.game;
    if (this.stage !== 'burning') return;
    const t = p.caughtAt;
    this.judgePiece(p, t);
    if (p.kind === 'charcoal') {
      g.science('fire.charcoal.burn');
      g.toast('The charcoal glows white-hot, with almost no smoke.', 'good');
    }
  }

  burnt(p: Piece): void {
    // A log burned through in the open pit, with all the air it wanted: only ash and a few coals are left.
    if (p.kind === 'logs' && this.stage === 'burning') this.game.experiments.trial('charcoalAir', 'open', 'ash');
  }

  doused(p: Piece): void {
    if (this.hearth.smothered || this.stage !== 'burning') return;
    if (p.kind !== 'tinder') this.game.toast(`Rain put out the burning ${itemName(p.item).toLowerCase()}. A roof over the fire keeps it dry.`, 'note');
  }

  /**
   * A piece caught (`t` = seconds it took) or has been slow (`t` = null): it is a trial of the fuel experiments.
   * Each compares one thing; the other things are held the same (dry fuel for the size and wood tests).
   */
  private judgePiece(p: Piece, t: number | null): void {
    const g = this.game;
    const damp = p.wet0 >= DAMP;
    const fine = p.kind === 'tinder' || p.kind === 'twigs';
    if (fine) g.experiments.trial('tinderDamp', damp ? 'damp' : 'dry', t !== null && t <= QUICK_SECONDS ? 'quick' : 'slow');
    if (!damp && (p.kind === 'twigs' || p.kind === 'logs')) {
      const fast = t !== null && t <= FAST_SECONDS;
      g.experiments.trial('fuelSize', p.kind === 'twigs' ? 'kindling' : 'log', fast ? 'fast' : 'slow');
      if (p.kind === 'logs' && t !== null && !fast) g.science('fire.fuel.ladder');
    }
    if (p.kind === 'branch') {
      const green = p.item === 'greenBranch';
      const bright = t !== null && t <= BRIGHT_SECONDS;
      if (green || !damp) g.experiments.trial('woodType', green ? 'green' : 'dead', bright ? 'bright' : 'smoky');
    }
  }

  // -------------------------------------------------------------- time

  tick(dt: number): void {
    const g = this.game;
    // The drill dust cools all the time, faster the hotter it is.
    if (this.heat > 0 && !this.carrying) this.heat = Math.max(0, this.heat - (DRILL_COOL_BASE + DRILL_COOL_K * this.heat) * dt);
    if (this.strokes.t > 0 && (this.strokes.idle += dt) > SESSION_GAP) this.endRun();
    if (this.strokes.t === 0 && this.strokeSpeed > 0) this.strokeSpeed = this.strokeSpeed < 0.01 ? 0 : this.strokeSpeed * Math.max(0, 1 - dt * 3);
    if (this.embedded) {
      // Wind across an open pit feeds the ember too.
      const breeze = this.wind * EMBER_WIND * dt;
      if (breeze > 0) {
        this.air = Math.min(this.airNeeded(), this.air + breeze);
        if (this.air >= this.airNeeded()) {
          this.ignite();
          return;
        }
      }
      // Without air it only smoulders and dims; it never goes out by itself, and the first time it is pointed out.
      this.air = Math.max(0.1, this.air - 0.04 * dt);
      const was = this.restLeft;
      this.restLeft += dt;
      if (was < EMBER_REST_SECONDS && this.restLeft >= EMBER_REST_SECONDS) {
        g.observe('f_oxygen');
        g.science('fire.ember.unfed');
        g.toast('The ember only smoulders and dims: it needs air. Fan it with an open palm.', 'note');
      }
    }
    // The burning fire's rules run at the slow step.
    this.simT += dt;
    while (this.simT >= SIM_STEP) {
      this.simT -= SIM_STEP;
      this.slowStep(SIM_STEP);
    }
  }

  /** The fire's own rules, four times a second. */
  private slowStep(dt: number): void {
    const g = this.game;
    const pit = g.structures.find((s) => s.kind === 'firePit' && s.complete);
    const exposed = !pit || fireExposed(g.structures, pit.x, pit.z);
    this.wind = Math.max(0, Math.min(1, g.env.windStrength * (exposed ? 1 : 0.3)));
    if (this.stage !== 'burning') return;
    const h = this.hearth;
    h.step(dt, this.wind);
    this.keepT += dt;
    this.updateBurnLeft();
    // Slow pieces: tell the fuel experiments, and green wood's smoke.
    for (const p of h.pieces) {
      if (!p.used || p.burning) continue;
      if (p.age >= SLOW_TO_CATCH && !(p.told & TOLD_SLOW)) {
        p.told |= TOLD_SLOW;
        this.judgePiece(p, null);
      }
      if (p.item === 'greenBranch' && p.steamed >= 5 && !(p.told & TOLD_SMOKE)) {
        p.told |= TOLD_SMOKE;
        g.science('fire.signal.smoke');
        g.toast('Thick white smoke pours off the green wood.', 'note');
      }
    }
    // Wind on an open fire: it roars and eats its fuel faster.
    if (this.wind > 0.55 && h.burningCount > 0) {
      if ((this.windT += dt) > 8) g.science('fire.air.wind');
    } else this.windT = 0;
    // A fanning run is judged once enough air has gone in.
    const f = this.fanRun;
    if (f.air > 0) {
      f.idle += dt;
      if (f.air >= FAN_JUDGE_AIR) {
        // Compared with the same fire in still air at this moment: fanning longer never undoes the result.
        const grows = h.power > 0.01 && h.power >= h.stillPower * FAN_GROWS;
        g.experiments.trial('airflow', 'fanned', grows ? 'grows' : 'same');
        if (grows) {
          g.science('fire.air.fanned');
          g.toast('The flames leap up as you fan: more air, more fire.', 'good');
        }
        f.air = f.idle = 0;
      } else if (f.idle > 1.5) f.air = f.idle = 0;
    }
    // The practical: a fire lit on your own, kept burning and fed.
    if (this.keepT >= KEEP_SECONDS && this.feeds >= KEEP_FEEDS) {
      if (!g.hasEvent('fire.night.kept')) g.science('fire.night.kept');
      if (this.run >= 2 && !this.kept) {
        this.kept = true;
        g.toast('Your fire has burned for minutes and you kept it fed. You can make and keep fire.', 'good');
        g.addXp(40);
        g.checkProgress();
      }
    }
    if (!h.alive || (h.smothered && h.heat < 0.03)) this.burnOut();
  }

  private burnOut(): void {
    const g = this.game;
    const smothered = this.hearth.smothered;
    this.reset();
    this.stage = 'out';
    if (smothered) {
      g.experiments.trial('airflow', 'smothered', 'dies');
      g.science('fire.air.smothered');
      g.toast('The fire is out. Cut off its air and it dies: that is how you put a fire out safely.', 'note');
    } else {
      g.observe('f_nofuel');
      g.science('fire.fuel.none');
      g.toast('The fire burned out. Lay more fuel to relight.', 'note');
    }
    g.notifyFire();
  }

  // ------------------------------------------------------- save / load

  snapshot(): FireSave {
    const pieces: NonNullable<FireSave['pieces']> = [];
    for (const p of this.hearth.pieces) if (p.used) pieces.push([p.item, p.wet, p.wet0, p.catch, p.burning ? p.left : -1, p.age, p.fed]);
    return {
      tinder: this.tinder,
      twigs: this.twigs,
      logs: this.logs,
      fuelFirst: this.fuelFirst,
      stage: this.stage,
      burnLeft: this.burnLeft,
      pieces,
      coals: this.hearth.coals,
      flame: this.hearth.heat,
      lights: this.lights,
      run: this.run,
      keepT: this.keepT,
      feeds: this.feeds,
      kept: this.kept,
      ...(this.carrying ? { ember: 'carried' as const } : this.embedded ? { ember: 'tinder' as const } : {}),
    };
  }

  restore(s: FireSave): void {
    this.tinder = s.tinder;
    this.twigs = s.twigs;
    this.logs = s.logs;
    this.fuelFirst = s.fuelFirst;
    this.stage = s.stage === 'ember' ? 'lay' : s.stage;
    this.burnLeft = s.burnLeft;
    this.hearth.clear();
    // A burning fire with no pieces and no coals can only come from an older save (or a hand-made one): its
    // burn time becomes fuel below. Otherwise the saved pieces are the fire.
    const legacy = !s.pieces || (s.pieces.length === 0 && !(s.coals && s.coals > 0) && s.stage === 'burning');
    if (!legacy && s.pieces) {
      for (const [item, wet, wet0, c, left, age, fed] of s.pieces) {
        if (!ITEM_FUEL[item]) continue;
        const p = this.hearth.add(item, 0, fed);
        if (!p) break;
        p.wet = wet;
        p.wet0 = wet0;
        p.catch = c;
        p.age = age;
        if (left >= 0) {
          p.burning = true;
          p.left = left;
          p.caughtAt = 0;
        }
      }
      this.hearth.coals = s.coals ?? 0;
      this.hearth.heat = s.flame ?? 0;
    } else if (this.stage === 'lay') {
      // An older save: the lay as plain dry fuel.
      for (const k of FUEL_ORDER) for (let i = 0; i < this[k]; i++) this.hearth.add(FUEL_ITEM[k], 0, false);
    } else if (this.stage === 'burning') {
      // An older save with a fire burning: its burn time as burning logs over a bed of coals.
      for (let left = s.burnLeft; left > 0.01; left -= BURN_SECONDS.logs) {
        const p = this.hearth.add('logs', 0, false);
        if (!p) break;
        this.hearth.ignite(p);
        p.left = Math.min(BURN_SECONDS.logs, left);
      }
      this.hearth.coals = 0.3;
      this.hearth.heat = 0.6;
    }
    this.lights = s.lights ?? (this.game.flag('fireLit') ? 1 : 0);
    this.run = s.run ?? (this.stage === 'burning' ? this.lights : 0);
    this.keepT = s.keepT ?? 0;
    this.feeds = s.feeds ?? 0;
    this.kept = s.kept ?? false;
    this.carrying = s.ember === 'carried';
    this.embedded = s.ember === 'tinder' && this.stage === 'lay';
    this.air = this.embedded ? 0.1 : 0;
  }
}
