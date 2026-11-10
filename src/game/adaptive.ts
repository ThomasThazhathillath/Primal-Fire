// Adaptive assistance (docs/TUTORIAL_USABILITY_SPEC.md, part B): the game helps more when YOU keep
// missing, and eases back when you stop. Three channels, each with a "strain" that failures raise and
// successes lower: placements (snap radius, magnetic pull, a clearer indicator), taps on menus (a
// bigger hit area) and knapping (a wider strike edge). The level is clamped so assistance never becomes
// absurd, saved with the game, and starts at the default. Pure and tiny.

export type Channel = 'place' | 'tap' | 'knap';
export const CHANNELS: readonly Channel[] = ['place', 'tap', 'knap'];

export const ADAPT = {
  /** Strain added by a failed attempt, removed by a success (several successes ease it back). */
  failStep: 1,
  successStep: 1.5,
  /** Strain per level, the highest level, and the strain ceiling. */
  perLevel: 2,
  maxLevel: 4,
  /** Extra size per level for each channel (1 = +100%): the cap is 1 + gain * maxLevel. */
  gain: { place: 0.25, tap: 0.1, knap: 0.2 } as Record<Channel, number>,
  /** Magnetic pull grows a bit faster than the snap radius. */
  magnetGain: 0.3,
  /** From this level the placement indicator pulses; from this one it also shows an arrow. */
  pulseLevel: 2,
  arrowLevel: 3,
};

export interface AssistSave {
  place: number;
  tap: number;
  knap: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export class Adaptive {
  private strain: Record<Channel, number> = { place: 0, tap: 0, knap: 0 };

  /** A miss: a rejected placement, a tap that did not register, a knap that broke nothing. */
  fail(ch: Channel): void {
    this.strain[ch] = clamp(this.strain[ch] + ADAPT.failStep, 0, ADAPT.perLevel * ADAPT.maxLevel);
  }

  /** A hit: strain eases back, so a few successes return it to the default. */
  success(ch: Channel): void {
    this.strain[ch] = clamp(this.strain[ch] - ADAPT.successStep, 0, ADAPT.perLevel * ADAPT.maxLevel);
  }

  /** 0 (default) .. maxLevel. */
  level(ch: Channel): number {
    return clamp(Math.floor(this.strain[ch] / ADAPT.perLevel), 0, ADAPT.maxLevel);
  }

  /** Size multiplier for a channel's forgiveness (snap radius, tap area, knap edge): 1 at the default, capped. */
  scale(ch: Channel): number {
    return 1 + ADAPT.gain[ch] * this.level(ch);
  }

  /** Magnetic pull multiplier for placements. */
  magnet(): number {
    return 1 + ADAPT.magnetGain * this.level('place');
  }

  /** How obvious the placement indicator is: 0 normal, 1 pulsing outline, 2 pulsing outline and arrow. */
  indicator(): 0 | 1 | 2 {
    const l = this.level('place');
    return l >= ADAPT.arrowLevel ? 2 : l >= ADAPT.pulseLevel ? 1 : 0;
  }

  snapshot(): AssistSave {
    return { ...this.strain };
  }

  restore(s: Partial<AssistSave> | undefined): void {
    for (const ch of CHANNELS) {
      const v = s?.[ch];
      this.strain[ch] = typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, ADAPT.perLevel * ADAPT.maxLevel) : 0;
    }
  }
}
