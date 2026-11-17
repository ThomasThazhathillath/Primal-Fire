// Lesson 03 (Water): clay test pieces, the potter's way of testing clay before risking a pot.
//
// One bench recipe shapes three small cups the same size from the same clay: one of clay only and two
// with sand kneaded in (temper). They dry in your bag like the pot. Two rules decide what happens, and
// the real pot follows the same two rules (water.ts):
//   - drying: clay shrinks as its water leaves, the surface first. The strain peaks halfway through
//     drying; clay alone tears, while sand opens paths for the water and resists the shrinking;
//   - firing: water still in the clay turns to steam and bursts it; bone-dry clay becomes ceramic.
// Every outcome is reported as a trial of the clay experiments (experiments.ts).

import type { Game } from '../../../game.js';

/** Seconds a small test cup needs to dry (smaller and thinner than a pot, so faster). */
export const TEST_DRY_SECONDS = 30;
/** Seconds a dry test cup needs in a burning fire to become ceramic. */
export const PIECE_FIRE_SECONDS = 6;
/** Seconds before a damp test cup bursts in the fire. */
export const PIECE_BURST_SECONDS = 1.5;
/** Drying strain a piece of clay can take before it tears. */
export const CLAY_STRENGTH = 1;

/**
 * Drying strain at `fraction` (0..1) of the way to dry: shrinkage differs most between the drying surface
 * and the damp inside halfway through. Temper lowers the difference (a simple teaching model).
 */
export function dryingStrain(tempered: boolean, fraction: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  return (tempered ? 0.7 : 1.6) * 4 * f * (1 - f);
}

export const cracksWhileDrying = (tempered: boolean, fraction: number): boolean => dryingStrain(tempered, fraction) > CLAY_STRENGTH;

/** What the fire does to clay: steam bursts damp clay; dry clay becomes ceramic. */
export const firingOutcome = (dry: boolean): 'burst' | 'ceramic' => (dry ? 'ceramic' : 'burst');

export type PieceKind = 'plain' | 'temper';
export type PieceState = 'damp' | 'dry' | 'cracked' | 'firing' | 'burst' | 'ceramic';

export interface TestPiece {
  kind: PieceKind;
  /** Seconds spent drying. */
  dry: number;
  state: PieceState;
}

export interface ClaySave {
  pieces: TestPiece[];
  firing: { index: number; t: number; dry: boolean } | null;
}

export class ClayLab {
  pieces: TestPiece[] = [];
  /** The cup in the fire: which one, seconds there, and whether it was dry when it went in. */
  firing: { index: number; t: number; dry: boolean } | null = null;

  constructor(private readonly g: Game) {}

  /** A set is still in progress (something drying, dry and unfired, or in the fire). */
  get busy(): boolean {
    return this.pieces.some((p) => p.state === 'damp' || p.state === 'dry' || p.state === 'firing');
  }

  count(kind: PieceKind, ...states: PieceState[]): number {
    return this.pieces.filter((p) => p.kind === kind && states.includes(p.state)).length;
  }

  /** The bench made a new set: one clay-only cup, two with sand. */
  make(): void {
    this.pieces = [
      { kind: 'plain', dry: 0, state: 'damp' },
      { kind: 'temper', dry: 0, state: 'damp' },
      { kind: 'temper', dry: 0, state: 'damp' },
    ];
    this.firing = null;
    this.g.science('pottery.test.made');
    this.g.toast('Three test cups the same size: one clay only, two with sand. They dry in your bag.', 'good');
  }

  /** Drying and firing, a few times a second. `burning`: is your fire burning? */
  tick(dt: number, burning: boolean): void {
    const g = this.g;
    let dried = false;
    for (const p of this.pieces) {
      if (p.state !== 'damp') continue;
      p.dry = Math.min(TEST_DRY_SECONDS, p.dry + dt);
      if (cracksWhileDrying(p.kind === 'temper', p.dry / TEST_DRY_SECONDS)) {
        p.state = 'cracked';
        g.experiments.trial('clayTemper', p.kind === 'temper' ? 'sand' : 'none', 'cracked');
        g.science('pottery.untempered.crack');
        // Unfired clay slakes back into workable clay.
        g.addItem('clay');
        g.science('pottery.clay.reclaimed');
        g.toast('The clay-only cup cracked as it dried. Soaked in water, the pieces turn back into clay (+1 clay).', 'bad');
        g.checkProgress();
      } else if (p.dry >= TEST_DRY_SECONDS) {
        p.state = 'dry';
        g.experiments.trial('clayTemper', p.kind === 'temper' ? 'sand' : 'none', 'whole');
        dried = true;
      }
    }
    if (dried) {
      g.toast('The sand cups are bone dry, and whole.', 'good');
      g.checkProgress();
    }
    const f = this.firing;
    if (!f) return;
    const p = this.pieces[f.index];
    if (!p) {
      this.firing = null;
      return;
    }
    if (!burning) {
      p.state = f.dry ? 'dry' : 'damp';
      this.firing = null;
      g.toast('The fire went out: your test cup is back, unfired.', 'note');
      return;
    }
    f.t += dt;
    const outcome = firingOutcome(f.dry);
    if (outcome === 'burst' && f.t >= PIECE_BURST_SECONDS) {
      p.state = 'burst';
      this.firing = null;
      g.experiments.trial('potFiring', 'damp', 'burst');
      g.science('pottery.wet.burst');
      g.toast('A hiss, then a crack: the damp cup burst. Water inside turned to steam and blew it apart.', 'bad');
      g.checkProgress();
    } else if (outcome === 'ceramic' && f.t >= PIECE_FIRE_SECONDS) {
      p.state = 'ceramic';
      this.firing = null;
      g.experiments.trial('potFiring', 'dry', 'ceramic');
      g.science('pottery.test.fired');
      g.toast('The dry cup glowed red. Cooled, it rings when tapped: ceramic.', 'good');
      g.checkProgress();
    }
  }

  /** The sand cup that would go in the fire next: a damp one until the damp test is seen, then a dry one. */
  nextToFire(): { index: number; dry: boolean } | null {
    if (this.firing) return null;
    const pick = (state: PieceState) => this.pieces.findIndex((p) => p.kind === 'temper' && p.state === state);
    const damp = pick('damp');
    const dry = pick('dry');
    const dampSeen = this.g.experiments.state('potFiring').trials.has('damp');
    if (damp >= 0 && (!dampSeen || dry < 0)) return { index: damp, dry: false };
    if (dry >= 0) return { index: dry, dry: true };
    return null;
  }

  /** Put the next sand cup in the fire. */
  fire(): boolean {
    const n = this.nextToFire();
    if (!n) return false;
    this.pieces[n.index].state = 'firing';
    this.firing = { index: n.index, t: 0, dry: n.dry };
    this.g.toast(n.dry ? 'The dry test cup sits in the flames. Watch.' : 'The damp test cup goes into the flames. Watch.', 'info');
    return true;
  }

  snapshot(): ClaySave {
    return { pieces: this.pieces.map((p) => ({ ...p })), firing: this.firing ? { ...this.firing } : null };
  }

  restore(s: ClaySave | undefined): void {
    const states: PieceState[] = ['damp', 'dry', 'cracked', 'firing', 'burst', 'ceramic'];
    this.pieces = (s?.pieces ?? [])
      .filter((p) => (p.kind === 'plain' || p.kind === 'temper') && states.includes(p.state))
      .map((p) => ({ kind: p.kind, dry: Number(p.dry) || 0, state: p.state }));
    this.firing = s?.firing && this.pieces[s.firing.index]?.state === 'firing' ? { ...s.firing } : null;
    // A cup saved in the fire with no record of it comes back as it was.
    for (const p of this.pieces) if (p.state === 'firing' && !this.firing) p.state = p.dry >= TEST_DRY_SECONDS ? 'dry' : 'damp';
  }
}
