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

// ------------------------------------------------ progressive assistance (NPE milestone C)

/**
 * Situations where a player is visibly struggling. Each grows by failures (counted) or by time (seconds), then
 * offers help in three levels, and is cleared the moment the player succeeds at it.
 *   - look:   looking (or pointing) at something takeable for a while without picking it up
 *   - fail:   the same failure code again and again (wrong bench motion, too heavy, knapping misses, placement)
 *   - idle:   no progress at all for a long while
 *   - bench:  every part of a recipe in the bag, but the workbench not used
 */
export type StruggleKind = 'look' | 'fail' | 'idle' | 'bench';

/** Thresholds per kind for levels 1 (cue), 2 (instruction), 3 (explicit): seconds, or failure counts for 'fail'. */
export const STRUGGLE = {
  look: [3, 7, 14],
  fail: [2, 3, 5],
  idle: [40, 80, 140],
  bench: [20, 45, 90],
  /** Multiplier on every threshold: the hint-frequency setting (lower = sooner help). Infinity = never. */
  delay: 1,
} as { look: number[]; fail: number[]; idle: number[]; bench: number[]; delay: number };

export type HelpLevel = 0 | 1 | 2 | 3;

interface StruggleState {
  kind: StruggleKind;
  amount: number;
  /** Highest level already offered (a level is offered once, then the next one waits for more struggle). */
  shown: HelpLevel;
}

/** What to show for a struggle at a level: a cue (highlight / pulse), a short line, an explicit how-to with a hand sign. */
export interface Help {
  key: string;
  kind: StruggleKind;
  level: HelpLevel;
}

export class StruggleTracker {
  private s = new Map<string, StruggleState>();

  private get(key: string, kind: StruggleKind): StruggleState {
    let st = this.s.get(key);
    if (!st) {
      st = { kind, amount: 0, shown: 0 };
      this.s.set(key, st);
    }
    return st;
  }

  /** One more failure of `key` (e.g. 'fail:bench.wrongMotion'). */
  fail(key: string): void {
    this.get(key, 'fail').amount++;
  }

  /** `dt` seconds more of a time-based struggle (looking without taking, idle, bench unused). */
  grow(key: string, kind: Exclude<StruggleKind, 'fail'>, dt: number): void {
    this.get(key, kind).amount += dt;
  }

  /** The player did it: every struggle whose key starts with `prefix` is cleared, with its help. */
  succeed(prefix: string): void {
    for (const k of [...this.s.keys()]) if (k.startsWith(prefix)) this.s.delete(k);
  }

  /** The level a struggle has reached (0 = none yet). */
  level(key: string): HelpLevel {
    const st = this.s.get(key);
    if (!st) return 0;
    const t = STRUGGLE[st.kind];
    const d = STRUGGLE.delay;
    if (!Number.isFinite(d)) return 0;
    const a = st.amount;
    return a >= t[2] * d ? 3 : a >= t[1] * d ? 2 : a >= t[0] * d ? 1 : 0;
  }

  /**
   * Help that is due now: the struggle whose level rose above what was already offered (highest level first).
   * Each level is offered once; null when nothing new is due.
   */
  due(): Help | null {
    let best: Help | null = null;
    for (const [key, st] of this.s) {
      const l = this.level(key);
      if (l <= st.shown) continue;
      if (!best || l > best.level) best = { key, kind: st.kind, level: l };
    }
    if (best) this.s.get(best.key)!.shown = best.level;
    return best;
  }

  /** The highest level currently reached by any struggle with this prefix (for cues that last while it lasts). */
  levelOf(prefix: string): HelpLevel {
    let l: HelpLevel = 0;
    for (const k of this.s.keys()) if (k.startsWith(prefix)) l = Math.max(l, this.level(k)) as HelpLevel;
    return l;
  }

  clear(): void {
    this.s.clear();
  }
}

/** The hand sign (ghost-hand-system clip) that shows how to do the thing a failure code is about. */
export const FAIL_SIGN: Record<string, string> = {
  'grab.tooHeavy': 'carry',
  'drag.tooHeavy': 'carry',
  'knap.offEdge': 'knap',
  'knap.badAngle': 'knap',
  'knap.tooSoft': 'knap',
  'knap.miss': 'knap',
  'place.tooFar': 'release',
  'place.wrongMaterial': 'release',
};

/** Bench step motion → hand sign. */
export const MOTION_SIGN: Record<string, string> = { saw: 'saw', twist: 'twist', wrap: 'twist', press: 'point', scrape: 'saw', strike: 'knap' };

/** How to do each bench motion, said plainly (level 2 and 3 help). */
export const MOTION_HOW: Record<string, string> = {
  saw: 'Move back and forth.',
  twist: 'Turn your wrists opposite ways.',
  wrap: 'Circle your hand around it.',
  press: 'Push down and hold.',
  scrape: 'Drag the edge along it.',
  strike: 'Tap down sharply.',
};

/** The words for a failure struggle at level 2 (short) and 3 (explicit). */
export function failHelp(code: string, detail: string | undefined, level: HelpLevel): string {
  const motion = /needs: (\w+)/.exec(detail ?? '')?.[1];
  if (code === 'bench.wrongMotion' && motion) {
    const how = MOTION_HOW[motion] ?? 'Copy the hand sign.';
    return level >= 3 ? `${how} Copy the hand sign. Close is fine.` : `${motion.charAt(0).toUpperCase()}${motion.slice(1)}: ${how.toLowerCase()}`;
  }
  if (code === 'grab.tooHeavy' || code === 'drag.tooHeavy') {
    return level >= 3 ? 'Pinch it with both hands. Lift together.' : 'Too heavy. Use both hands.';
  }
  if (code.startsWith('knap.')) {
    return level >= 3 ? 'Hold it still. Hit the edge at an angle.' : 'Hit near the edge, at an angle.';
  }
  if (code.startsWith('place.')) {
    return level >= 3 ? 'Follow the arrow. Let go over the mark.' : 'Bring it to the glowing mark.';
  }
  return level >= 3 ? 'Tap the bulb for a hint.' : 'Try a different way.';
}
