// Level 2 "Clean Water": the clay pot, the charcoal mound and purifying water.
// Pure rules on top of Game; WaterSystem turns hand/mouse actions into calls.
//
//   pot:      bench-made pot dries over time → fire it in a burning fire
//   charcoal: dig a pit (digging stick + logs) → seal with clay or not → light
//             it from your fire → watch the smoke → open at the right moment
//   water:    fill the fired pot at the stream → pour it through a finished
//             filter → set it on the burning fire until it boils
//
// Every outcome emits an existing science event so the Lab Notebook explains it.

import type { Game } from './game.js';
import type { ItemId } from './items.js';
import { nearestTreeDistance, STREAM_BANK, streamDistance } from './world-layout.js';

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

export type PotWater = 'empty' | 'raw' | 'filtered' | 'boiledRaw' | 'safe';
export type Smoke = 'none' | 'white' | 'yellow' | 'blue';

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
}

/** A thing the player can do right now, for prompts and the input layer. */
export interface WaterAction {
  id: 'firePot' | 'fillPot' | 'pourFilter' | 'boil' | 'digMound' | 'sealMound' | 'lightMound' | 'openMound' | 'drink';
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

  constructor(private g: Game) {}

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
    const f = this.g.structures.find((s) => s.kind === 'filter' && s.complete && near(s, at));
    return f ? { x: f.x, z: f.z } : null;
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
        g.checkQuests();
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
          g.toast('The pot rings when you tap it: ceramic.', 'good');
          g.checkQuests();
        }
      } else if (this.potWater === 'raw' || this.potWater === 'filtered') {
        this.boil += dt;
        if (this.boil >= BOIL_SECONDS) this.finishBoil();
      }
    }
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

  private finishBoil(): void {
    const g = this.g;
    this.onFire = false;
    this.boil = 0;
    if (this.potWater === 'filtered') {
      this.potWater = 'safe';
      g.setFlag('waterSafe');
      g.science('water.boil.done');
      g.toast('A rolling boil: filtered and disinfected. Safe to drink.', 'good');
    } else {
      this.potWater = 'boiledRaw';
      g.science('water.boil.murky');
      g.toast('Boiled, but still full of grit. Filter it first, then boil.', 'bad');
    }
    g.checkQuests();
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
      if (this.potWater === 'raw' && this.filterNear(at)) return { id: 'pourFilter', label: 'Pour the water through the filter', at: this.filterNear(at)! };
      if ((this.potWater === 'raw' || this.potWater === 'filtered') && fire) return { id: 'boil', label: 'Set the pot on the fire to boil', at: fire };
      if ((this.potWater === 'empty' || this.potWater === 'boiledRaw') && this.atStream(at)) return { id: 'fillPot', label: 'Fill the pot at the stream', at };
      return null;
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
        g.science('water.pot.filled');
        if (g.gatheredCount('lens') > 0) g.science('water.raw.inspected');
        g.toast('A pot of murky stream water.', 'info');
        return true;
      case 'pourFilter':
        if (this.potWater !== 'raw' || !this.filterNear(at)) return false;
        this.potWater = 'filtered';
        g.science('water.filter.poured');
        if (g.gatheredCount('lens') > 0) g.science('water.filter.microbes');
        g.toast('Clear water drips from the spout. Clear, but is it safe?', 'info');
        return true;
      case 'boil':
        if (!this.burningFireNear(at) || (this.potWater !== 'raw' && this.potWater !== 'filtered')) return false;
        this.onFire = true;
        this.boil = 0;
        g.toast('The pot is on the fire. Wait for a rolling boil.', 'info');
        return true;
      case 'drink':
        if (this.potWater !== 'safe') return false;
        this.potWater = 'empty';
        g.science('body.drink');
        g.toast('Cool, clean water.', 'good');
        g.checkQuests();
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
        g.checkQuests();
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
          g.checkQuests();
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
          g.checkQuests();
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
    return { potDry: this.potDry, potHeat: this.potHeat, potWater: this.potWater, boil: this.boil, mound: this.mound ? { ...this.mound } : null };
  }

  restore(s: WaterSave): void {
    this.potDry = s.potDry;
    this.potHeat = s.potHeat;
    this.potWater = s.potWater;
    this.boil = s.boil;
    this.mound = s.mound ? { ...s.mound } : null;
  }
}
