// Level 2 "Clean Water": the clay pot, the charcoal mound and purifying water.
// Pure rules on top of Game; WaterSystem turns hand/mouse actions into calls.
//
//   pot:      bench-made pot dries over time → fire it in a burning fire
//   charcoal: dig a pit (digging stick + logs) → seal with clay or not → light
//             it from your fire → watch the smoke → open at the right moment
//   water:    fill the fired pot at the stream → pour it through a finished
//             filter → set it on the burning fire until it boils
//
// Lesson 03 (curriculum/lessons/water): the filter's layer order decides what
// comes out (filter.ts); muddy water left still settles; rain is caught off the
// roof; two dry stones heated in the fire can boil the pot; clay test cups
// (clay.ts) dry and fire by the same rules as the pot. Each reports its trial
// to the Lesson 03 experiments.
//
// Every outcome emits an existing science event so the Lab Notebook explains it.

import type { PlacedStructure } from './blueprint.js';
import type { Game } from './game.js';
import type { ItemId } from './items.js';
import { nearestTreeDistance, STREAM_BANK, streamDistance } from './world-layout.js';
import { ClayLab, type ClaySave } from './curriculum/lessons/water/clay.js';
import { filterLayers, filterResult, type FilterResult } from './curriculum/lessons/water/filter.js';
import { roofed } from './shelter.js';

/** Game seconds a fresh pot needs to dry (sun and air). */
export const POT_DRY_SECONDS = 45;
/** Seconds in a burning fire to turn dry clay into ceramic. */
export const POT_FIRE_SECONDS = 15;
/** Seconds of steady heat for a pot of water to reach a rolling boil. */
export const BOIL_SECONDS = 12;
/** Smoke stages of a sealed mound (seconds since lighting). */
export const SMOKE_YELLOW_AT = 20;
export const SMOKE_BLUE_AT = 40;
/** How close (m) you must be to use something. */
export const USE_RADIUS = 1.6;
/** A mound this close to the stream fills with groundwater. */
export const MOUND_MIN_STREAM = 6;
/** A burning stick can be carried this far (m) from your fire to light the mound. */
export const MOUND_LIGHT_RANGE = 15;

/** Seconds a pot of muddy water must stand still (not carried, not on the fire) for the mud to sink. */
export const SETTLE_SECONDS = 15;
/** Seconds dry stones need in a burning fire to get hot enough to boil a pot. */
export const STONE_HEAT_SECONDS = 8;
/** Hot stones it takes to bring a pot to the boil. */
export const BOIL_STONES = 2;
/** How close (m) to the low edge of your roof the pot catches its runoff. */
export const RAIN_CATCH_RADIUS = 1.5;

/**
 * What the fired pot holds. 'raw' is muddy stream water; 'settled' stood still until the mud sank (or ran
 * cloudy through a filter with no fine layer); 'rain' ran off your roof; 'filtered' ran clear through the
 * filter; 'boiledRaw' was boiled without filtering; 'safe' was filtered (or rain) and boiled.
 */
export type PotWater = 'empty' | 'raw' | 'filtered' | 'boiledRaw' | 'safe' | 'settled' | 'rain';
export type Smoke = 'none' | 'white' | 'yellow' | 'blue';

/** Untreated water that can go through the filter. */
export const FILTERABLE: readonly PotWater[] = ['raw', 'settled', 'rain'];
/** Water that can be boiled. */
export const BOILABLE: readonly PotWater[] = ['raw', 'settled', 'rain', 'filtered'];
/** Water with mud or silt in it. */
const MUDDY: readonly PotWater[] = ['raw', 'settled'];

export interface Mound {
  x: number;
  z: number;
  sealed: boolean;
  /** Seconds since it was lit; -1 = not lit. */
  burn: number;
}

export interface WaterSave {
  potDry: number;
  potHeat: number;
  potWater: PotWater;
  boil: number;
  mound: Mound | null;
  /** Lesson 03 (all optional: older saves have none). */
  settle?: number;
  source?: 'stream' | 'rain' | null;
  stones?: { n: number; heat: number } | null;
  clay?: ClaySave;
}

/** A thing the player can do right now, for prompts and the input layer. */
export interface WaterAction {
  id:
    | 'firePot'
    | 'fillPot'
    | 'pourFilter'
    | 'boil'
    | 'digMound'
    | 'sealMound'
    | 'lightMound'
    | 'openMound'
    | 'drink'
    | 'drinkStream'
    | 'catchRain'
    | 'fireTest'
    | 'heatStone'
    | 'stoneBoil'
    | 'pourOut';
  label: string;
  at: { x: number; z: number };
}

const near = (a: { x: number; z: number }, b: { x: number; z: number }, r = USE_RADIUS) => Math.hypot(a.x - b.x, a.z - b.z) <= r;

export class WaterState {
  /** Seconds the current pot has spent drying. */
  potDry = 0;
  /** Seconds the dry pot has spent in the fire. */
  potHeat = 0;
  potWater: PotWater = 'empty';
  /** Seconds the water pot has spent on the fire. */
  boil = 0;
  mound: Mound | null = null;
  /** True while the pot sits on the fire (firing it or boiling water). */
  onFire = false;
  /** Seconds the muddy water has stood still. */
  settle = 0;
  /** Where the water in the pot came from (the treatment experiment compares stream water only). */
  source: 'stream' | 'rain' | null = null;
  /** Dry stones heating in the fire for stone boiling. */
  stones: { n: number; heat: number } | null = null;
  /** Lesson 03: clay test cups. */
  readonly clay: ClayLab;
  /** What the last pour through the filter gave (for the objective card; not saved). */
  lastFilter: FilterResult | null = null;

  constructor(private g: Game) {
    this.clay = new ClayLab(g);
  }

  /** Hot stones are ready to drop into the pot. */
  get stonesHot(): boolean {
    return !!this.stones && this.stones.n >= BOIL_STONES && this.stones.heat >= STONE_HEAT_SECONDS;
  }

  /** Where runoff leaves the low edge of your roofed lean-to, if it has one. */
  roofEdge(): { x: number; z: number } | null {
    const s = this.g.leanTo();
    if (!s || !roofed(s)) return null;
    // The roof slopes down to the back (local -z), where the drainage channel runs.
    const lz = -1.3;
    return { x: s.x + lz * Math.sin(s.rotY), z: s.z + lz * Math.cos(s.rotY) };
  }

  /** Raining, and you stand at the low edge of your roof. */
  canCatchRain(at = this.g.player): { x: number; z: number } | null {
    if (this.g.env.rain <= 0.3) return null;
    const e = this.roofEdge();
    return e && near(e, at, RAIN_CATCH_RADIUS) ? e : null;
  }

  /** Stone boiling makes sense: your pot is fired and holds water to boil. */
  private stoneBoilUseful(): boolean {
    return this.g.flag('potFired') && BOILABLE.includes(this.potWater);
  }

  private firingTestOpen(): boolean {
    const p = this.g.experiments.phase('potFiring');
    return p === 'predict' || p === 'testing';
  }

  private get hasPot(): boolean {
    return this.g.count('pot') > 0 || this.g.held === 'pot';
  }

  /** The finished fire pit with a burning fire in it, if you are near it. */
  burningFireNear(at = this.g.player): { x: number; z: number } | null {
    if (this.g.fire.stage !== 'burning') return null;
    const pit = this.g.structures.find((s) => s.kind === 'firePit' && s.complete && near(s, at, USE_RADIUS + 0.4));
    return pit ? { x: pit.x, z: pit.z } : null;
  }

  filterNear(at = this.g.player): { x: number; z: number } | null {
    const f = this.filterAt(at);
    return f ? { x: f.x, z: f.z } : null;
  }

  /** The finished filter near you (the structure itself). */
  filterAt(at = this.g.player): PlacedStructure | null {
    return this.g.structures.find((s) => s.kind === 'filter' && s.complete && near(s, at)) ?? null;
  }

  /** Pour the pot through filter `f`: the order of its layers decides what comes out (filter.ts). */
  private pourThrough(f: PlacedStructure): void {
    const g = this.g;
    const muddy = MUDDY.includes(this.potWater);
    const fromStream = muddy && this.source === 'stream';
    const r = filterResult(filterLayers(f), muddy);
    this.lastFilter = r;
    if (r.arrangement) g.experiments.trial('filterOrder', r.arrangement, r.flow);
    this.settle = 0;
    switch (r.flow) {
      case 'washout':
        this.potWater = 'raw';
        g.science('water.filter.washout');
        g.toast(r.text, 'bad');
        break;
      case 'clogged':
        this.potWater = 'empty';
        g.science('water.filter.clog');
        g.toast(`${r.text} Refill the pot and try another order.`, 'bad');
        break;
      case 'cloudy':
        this.potWater = 'settled';
        g.science('water.filter.poured');
        if (fromStream) g.experiments.trial('treatment', 'filter', 'clearerGerms');
        g.toast(r.text, 'info');
        break;
      case 'clear':
        this.potWater = 'filtered';
        g.science('water.filter.poured');
        if (g.gatheredCount('lens') > 0) g.science('water.filter.microbes');
        if (muddy && !r.charcoal) g.science('water.filter.odour');
        if (fromStream) g.experiments.trial('treatment', 'filter', 'clearGerms');
        g.toast(r.text, 'info');
        break;
    }
    g.checkProgress();
  }

  atStream(at = this.g.player): boolean {
    return streamDistance(at.x, at.z) < STREAM_BANK + 1;
  }

  smoke(): Smoke {
    const m = this.mound;
    if (!m || m.burn < 0) return 'none';
    if (!m.sealed) return 'white';
    if (m.burn >= SMOKE_BLUE_AT) return 'blue';
    if (m.burn >= SMOKE_YELLOW_AT) return 'yellow';
    return 'white';
  }

  tick(dt: number): void {
    const g = this.g;
    // A shaped pot dries in the air.
    if (this.hasPot && !g.flag('potDry')) {
      this.potDry += dt;
      if (this.potDry >= POT_DRY_SECONDS) {
        g.setFlag('potDry');
        g.toast('Your clay pot is bone dry: ready to fire.', 'good');
        g.checkProgress();
      }
    }
    // The pot in the fire: firing, then boiling.
    if (this.onFire) {
      if (g.fire.stage !== 'burning' || !this.hasPot) {
        this.onFire = false;
      } else if (!g.flag('potFired')) {
        this.potHeat += dt;
        if (this.potHeat >= POT_FIRE_SECONDS) {
          this.onFire = false;
          g.setFlag('potFired');
          g.science('pottery.fired');
          g.experiments.trial('potFiring', 'dry', 'ceramic');
          g.toast('The pot rings when you tap it: ceramic.', 'good');
          g.checkProgress();
        }
      } else if (BOILABLE.includes(this.potWater)) {
        this.boil += dt;
        if (this.boil >= BOIL_SECONDS) this.finishBoil();
      }
    }
    // Muddy water left still: the mud sinks.
    if (this.potWater === 'raw' && g.held !== 'pot' && !this.onFire) {
      this.settle += dt;
      if (this.settle >= SETTLE_SECONDS) {
        this.settle = 0;
        this.potWater = 'settled';
        g.science('water.sediment.settle');
        if (this.source === 'stream') g.experiments.trial('treatment', 'settle', 'clearerGerms');
        g.toast('The mud in your pot has sunk to the bottom: clearer on top, but germs do not sink away.', 'info');
        g.checkProgress();
      }
    } else if (this.potWater === 'raw') this.settle = 0;
    // Stones heating in the fire.
    if (this.stones) {
      if (g.fire.stage === 'burning') this.stones.heat += dt;
      else if (this.stones.heat > 0) this.stones.heat = Math.max(0, this.stones.heat - dt);
    }
    this.clay.tick(dt, g.fire.stage === 'burning');
    // The mound burns.
    const m = this.mound;
    if (m && m.burn >= 0) {
      m.burn += dt;
      if (!m.sealed && m.burn > 6) {
        // Open vents: plenty of oxygen, the wood just burns away.
        this.mound = null;
        g.science('charcoal.ash');
        g.toast('Flames roared out of the open mound and left only grey ash.', 'bad');
      }
    }
  }

  /** The water reached a rolling boil (on the fire, or from hot stones dropped in). */
  private finishBoil(stones = false): void {
    const g = this.g;
    this.onFire = false;
    this.boil = 0;
    const was = this.potWater;
    const how = stones ? 'The hot stones brought it to a rolling boil' : 'A rolling boil';
    if (was === 'filtered' || was === 'rain') {
      this.potWater = 'safe';
      g.setFlag('waterSafe');
      g.science('water.boil.done');
      if (was === 'filtered' && this.source === 'stream') g.experiments.trial('treatment', 'both', 'clearKilled');
      g.toast(`${how}: clear and disinfected. Safer to drink, though no chemicals were taken out.`, 'good');
    } else {
      this.potWater = 'boiledRaw';
      g.science('water.boil.murky');
      if (this.source === 'stream') g.experiments.trial('treatment', 'boil', 'muddyKilled');
      g.toast(`${how}: germs killed, but the mud is all still there. Filter it first, then boil.`, 'bad');
    }
    if (stones) g.science('fire.hotstones.boil');
    g.checkProgress();
  }

  /** What you can do here with what you hold. `held` defaults to the game's held item. */
  available(at = this.g.player, held: ItemId | null = this.g.held): WaterAction | null {
    const g = this.g;
    const fire = this.burningFireNear(at);
    if (held === 'pot') {
      if (!g.flag('potFired')) {
        if (fire) return { id: 'firePot', label: g.flag('potDry') ? 'Set the dry pot in the fire' : 'Set the damp pot in the fire', at: fire };
        return null;
      }
      if (this.potWater === 'safe') return { id: 'drink', label: 'Drink the safe water', at };
      const filter = this.filterNear(at);
      if (FILTERABLE.includes(this.potWater) && filter) return { id: 'pourFilter', label: 'Pour the water through the filter', at: filter };
      if (BOILABLE.includes(this.potWater) && fire) {
        if (this.stonesHot) return { id: 'stoneBoil', label: 'Drop the hot stones into the pot', at: fire };
        return { id: 'boil', label: 'Set the pot on the fire to boil', at: fire };
      }
      const refill = this.potWater === 'empty' || this.potWater === 'boiledRaw';
      const edge = this.canCatchRain(at);
      if (edge && refill) return { id: 'catchRain', label: 'Catch the rain running off your roof', at: edge };
      const stream = this.atStream(at);
      if (refill && stream) return { id: 'fillPot', label: 'Fill the pot at the stream', at };
      // Browser only (in VR you tip the pot): where you would want an empty pot, the water can be tipped out.
      if (this.potWater !== 'empty' && (stream || edge)) return { id: 'pourOut', label: 'Tip the water out of the pot', at };
      return null;
    }
    if (fire && held === null && this.clay.nextToFire() && this.firingTestOpen()) {
      const n = this.clay.nextToFire()!;
      return { id: 'fireTest', label: n.dry ? 'Set the dry test cup in the fire' : 'Set a damp test cup in the fire', at: fire };
    }
    if (fire && held === 'dryStone' && this.stoneBoilUseful() && (this.stones?.n ?? 0) < BOIL_STONES) {
      return { id: 'heatStone', label: 'Heat the stone in the fire (to boil water)', at: fire };
    }
    const m = this.mound;
    if (m && near(m, at)) {
      if (m.burn < 0 && !m.sealed && held === 'clay') return { id: 'sealMound', label: 'Seal the mound with clay', at: m };
      // A burning stick carried from your fire lights it, so the fire must be burning nearby.
      const pit = this.firePit();
      if (m.burn < 0 && g.fire.stage === 'burning' && pit && near(m, pit, MOUND_LIGHT_RANGE)) {
        return { id: 'lightMound', label: m.sealed ? 'Light the sealed mound from your fire' : 'Light the mound (vents open)', at: m };
      }
      if (m.burn >= 0 && m.sealed) return { id: 'openMound', label: `Open the mound (smoke: ${this.smoke()})`, at: m };
      return null;
    }
    if (held === 'diggingStick' && !m && g.count('logs') >= 2) return { id: 'digMound', label: 'Dig a charcoal pit and stack logs in it', at };
    // Empty hands at the water: drink with cupped hands (quenches thirst; untreated water can carry germs).
    if (!held && this.atStream(at) && g.body.wantsWater() && g.body.pressure !== 'off') return { id: 'drinkStream', label: 'Drink from the stream with cupped hands', at };
    return null;
  }

  private firePit(): { x: number; z: number } | null {
    const pit = this.g.structures.find((s) => s.kind === 'firePit' && s.complete);
    return pit ? { x: pit.x, z: pit.z } : null;
  }

  /** Tipping the pot out: whatever it held is gone. */
  pourOut(): boolean {
    if (this.potWater === 'empty') return false;
    this.potWater = 'empty';
    this.boil = 0;
    this.settle = 0;
    this.g.toast('You poured the water out.', 'note');
    return true;
  }

  /** Performs an action the player chose (the input layer checks `available` first). */
  perform(id: WaterAction['id'], at = this.g.player): boolean {
    const g = this.g;
    switch (id) {
      case 'firePot': {
        if (!this.burningFireNear(at) || !this.hasPot) return false;
        if (!g.flag('potDry')) {
          // Steam inside a damp pot bursts it.
          this.consumePot();
          g.science('pottery.wet.burst');
          g.experiments.trial('potFiring', 'damp', 'burst');
          g.toast('The damp pot burst with a crack. Shape another and let it dry fully.', 'bad');
          return true;
        }
        this.onFire = true;
        g.toast('The pot sits in the flames. Keep the fire going.', 'info');
        return true;
      }
      case 'fillPot':
        if (!this.atStream(at) || !g.flag('potFired')) return false;
        this.potWater = 'raw';
        this.source = 'stream';
        this.settle = 0;
        g.science('water.pot.filled');
        g.experiments.trial('waterSource', 'stream', 'muddy');
        if (g.gatheredCount('lens') > 0) g.science('water.raw.inspected');
        g.toast('A pot of murky stream water.', 'info');
        return true;
      case 'catchRain':
        if (!g.flag('potFired') || !this.canCatchRain(at) || (this.potWater !== 'empty' && this.potWater !== 'boiledRaw')) return false;
        this.potWater = 'rain';
        this.source = 'rain';
        g.science('water.rain.caught');
        g.experiments.trial('waterSource', 'rain', 'clearer');
        g.toast('Runoff from your roof pours in: rainwater, much clearer than the stream. It ran over bark and leaves, so treat it too.', 'info');
        g.checkProgress();
        return true;
      case 'pourFilter': {
        const f = this.filterAt(at);
        if (!FILTERABLE.includes(this.potWater) || !f) return false;
        this.pourThrough(f);
        return true;
      }
      case 'boil':
        if (!this.burningFireNear(at) || !BOILABLE.includes(this.potWater)) return false;
        this.onFire = true;
        this.boil = 0;
        g.toast('The pot is on the fire. Wait for a rolling boil.', 'info');
        return true;
      case 'stoneBoil':
        if (!this.burningFireNear(at) || !BOILABLE.includes(this.potWater) || !this.stonesHot) return false;
        g.addItem('dryStone', this.stones!.n);
        this.stones = null;
        this.finishBoil(true);
        return true;
      case 'heatStone':
        if (!this.burningFireNear(at) || g.held !== 'dryStone' || (this.stones?.n ?? 0) >= BOIL_STONES) return false;
        g.useItem('dryStone');
        this.stones = { n: (this.stones?.n ?? 0) + 1, heat: this.stones?.heat ?? 0 };
        g.toast(this.stones.n < BOIL_STONES ? 'The stone heats in the flames. Add one more dry stone.' : 'Two dry stones heat in the flames. Bring your pot of water.', 'info');
        return true;
      case 'fireTest':
        if (!this.burningFireNear(at) || !this.firingTestOpen()) return false;
        return this.clay.fire();
      case 'pourOut':
        return this.pourOut();
      case 'drinkStream': {
        if (!this.atStream(g.player)) return false;
        const sick = g.body.drinkRaw();
        g.toast(
          sick
            ? 'Your stomach turns. Clear stream water can still carry germs you cannot see (Lesson 03).'
            : 'Cold and fresh. It quenches your thirst, but untreated water is a gamble.',
          sick ? 'bad' : 'info',
        );
        return true;
      }
      case 'drink':
        if (this.potWater !== 'safe') return false;
        this.potWater = 'empty';
        g.body.drinkSafe();
        g.science('body.drink');
        g.toast('Cool, clean water.', 'good');
        g.checkProgress();
        return true;
      case 'digMound': {
        if (g.count('logs') < 2 || this.mound) return false;
        if (streamDistance(at.x, at.z) < MOUND_MIN_STREAM) {
          g.science('charcoal.pit.water');
          g.toast('Water seeps into the pit: too close to the stream. Dig on drier ground.', 'bad');
          return true;
        }
        if (nearestTreeDistance(at.x, at.z) < 1.2) {
          g.toast('Roots everywhere. Dig in the open.', 'bad');
          return false;
        }
        g.useItem('logs');
        g.useItem('logs');
        this.mound = { x: at.x, z: at.z, sealed: false, burn: -1 };
        g.setFlag('moundBuilt');
        g.toast('Logs stacked in the pit and covered with earth. Seal the vents, or leave them open?', 'info');
        g.checkProgress();
        return true;
      }
      case 'sealMound':
        if (!this.mound || this.mound.sealed || g.held !== 'clay') return false;
        g.useItem('clay');
        this.mound.sealed = true;
        g.toast('Vents sealed with clay. Little air can get in now.', 'info');
        return true;
      case 'lightMound': {
        const pit = this.firePit();
        if (!this.mound || this.mound.burn >= 0 || g.fire.stage !== 'burning' || !pit || !near(this.mound, pit, MOUND_LIGHT_RANGE)) return false;
        this.mound.burn = 0;
        if (this.mound.sealed) {
          g.setFlag('kilnLit');
          g.toast('Lit. Watch the smoke: white, then yellow, then thin blue.', 'info');
          g.checkProgress();
        } else {
          g.toast('Flames lick out of the open vents...', 'info');
        }
        return true;
      }
      case 'openMound': {
        const m = this.mound;
        if (!m || m.burn < 0 || !m.sealed) return false;
        this.mound = null;
        if (this.smoke() === 'blue' || m.burn >= SMOKE_BLUE_AT) {
          g.addItem('charcoal', 3);
          g.setFlag('charcoalMade');
          g.science('charcoal.done');
          g.toast('Light, black charcoal: three pieces.', 'good');
          g.checkProgress();
        } else {
          g.science('charcoal.early');
          g.toast('Opened too early: black outside, brown and damp inside. Dig again and wait for thin blue smoke.', 'bad');
        }
        return true;
      }
    }
  }

  private consumePot(): void {
    if (this.g.held === 'pot') this.g.useItem('pot');
    else if (this.g.count('pot') > 0) this.g.useItem('pot');
    this.potDry = 0;
    this.potHeat = 0;
    this.onFire = false;
  }

  snapshot(): WaterSave {
    return {
      potDry: this.potDry,
      potHeat: this.potHeat,
      potWater: this.potWater,
      boil: this.boil,
      mound: this.mound ? { ...this.mound } : null,
      settle: this.settle,
      source: this.source,
      stones: this.stones ? { ...this.stones } : null,
      clay: this.clay.snapshot(),
    };
  }

  restore(s: WaterSave): void {
    this.potDry = s.potDry;
    this.potHeat = s.potHeat;
    this.potWater = s.potWater;
    this.boil = s.boil;
    this.mound = s.mound ? { ...s.mound } : null;
    this.settle = s.settle ?? 0;
    this.source = s.source ?? (this.potWater === 'empty' ? null : 'stream');
    this.stones = s.stones ? { ...s.stones } : null;
    this.clay.restore(s.clay);
  }
}
