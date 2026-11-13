// Assistance modes and accessibility options (docs/NPE_PLAN.md, milestone E). Pure: what the player chose,
// how it is stored, and the numbers each choice turns into. SettingsSystem shows the card and applies the
// numbers to the live tuning objects; nothing here changes rules, removes science or completes anything.
//
//   Guided   (default for a new player): help comes sooner, near misses are forgiven sooner, placement arrows
//            appear earlier, a slightly wider pickup cone.
//   Standard (default for an existing save): the intended game, help when needed.
//   Explorer: help comes late, minimal markers, no compass unless guidance is set to Full.
//
// Stored in localStorage under its own key (never inside the save, so old saves load unchanged and the choice
// carries across the tutorial and survival pages). Every option applies at once: no restart.

import type { KeyStore } from './tutorial-mode.js';

export type AssistMode = 'guided' | 'standard' | 'explorer';
export type Amount = 'low' | 'normal' | 'high';
export type TextSize = 'small' | 'normal' | 'large';
export type Guidance = 'minimal' | 'normal' | 'full';

export interface Settings {
  v: 1;
  mode: AssistMode;
  textSize: TextSize;
  /** How often help comes on its own. */
  hints: Amount;
  /** How many markers: the compass, highlights, pulses. */
  guidance: Guidance;
  /** How forgiving aiming and pickup are. */
  sensitivity: Amount;
  /** Seated play: a little more reach, so nothing needs a stretch. */
  seated: boolean;
}

export const SETTINGS_KEY = 'primal-first-fire.settings.v1';

export const MODES: readonly AssistMode[] = ['guided', 'standard', 'explorer'];
const AMOUNTS: readonly Amount[] = ['low', 'normal', 'high'];
const SIZES: readonly TextSize[] = ['small', 'normal', 'large'];
const GUIDES: readonly Guidance[] = ['minimal', 'normal', 'full'];

/** A first-time player starts Guided; someone with a game already under way keeps the game they know (Standard). */
export function defaultSettings(newPlayer: boolean): Settings {
  return { v: 1, mode: newPlayer ? 'guided' : 'standard', textSize: 'normal', hints: 'normal', guidance: 'normal', sensitivity: 'normal', seated: false };
}

const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** Read the stored settings; anything missing or unknown falls back to the default (an old or hand-edited value never breaks the game). */
export function loadSettings(store: KeyStore | null, newPlayer: boolean): Settings {
  const d = defaultSettings(newPlayer);
  let raw: Partial<Settings> | null = null;
  try {
    const text = store?.getItem(SETTINGS_KEY);
    raw = text ? (JSON.parse(text) as Partial<Settings>) : null;
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object') return d;
  return {
    v: 1,
    mode: pick(raw.mode, MODES, d.mode),
    textSize: pick(raw.textSize, SIZES, d.textSize),
    hints: pick(raw.hints, AMOUNTS, d.hints),
    guidance: pick(raw.guidance, GUIDES, d.guidance),
    sensitivity: pick(raw.sensitivity, AMOUNTS, d.sensitivity),
    seated: typeof raw.seated === 'boolean' ? raw.seated : d.seated,
  };
}

export function saveSettings(store: KeyStore | null, s: Settings): void {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: the choice lasts this page.
  }
}

/** The live numbers a set of settings turns into. */
export interface Tuning {
  /** Multiplier on every assistance delay (adaptive.ts STRUGGLE.delay). Bigger = later help. */
  helpDelay: number;
  /** Gaze and hand-ray cone and pickup radius (gaze.ts TOLERANCE.sensitivity). */
  sensitivity: number;
  /** Gathering reach multiplier (resource-system reachCfg.scale). */
  reach: number;
  /** Wrong-motion refusals before a bench step forgives near misses (bench.ts BENCH_ASSIST.forgiveAfter). */
  forgiveAfter: number;
  /** Adaptive placement level from which the mark pulses / the arrow shows (adaptive.ts ADAPT). */
  pulseLevel: number;
  arrowLevel: number;
  /** How many things may be highlighted at once (assist.ts ASSIST.highlightBudget). */
  highlightBudget: number;
  /** Show the compass tape. */
  compass: boolean;
  /** Card scale multiplier (text size). */
  textScale: number;
  /** Snap and catch radius multiplier for placing parts (assist.ts ASSIST). */
  snap: number;
  /** One pinch on a glowing mark always fills it, the heavy top included (Game.easyBuild). */
  easyBuild: boolean;
  /** One arrow and ring on the current goal's next target, all the time (not only after a hint). */
  nextTarget: boolean;
}

export function tuning(s: Settings): Tuning {
  const mode = { guided: { delay: 0.6, forgive: 2, pulse: 1, arrow: 2, sens: 1.1 }, standard: { delay: 1, forgive: 3, pulse: 2, arrow: 3, sens: 1 }, explorer: { delay: 2.5, forgive: 5, pulse: 3, arrow: 5, sens: 1 } }[s.mode];
  const hints = { low: 1.8, normal: 1, high: 0.6 }[s.hints];
  const sens = { low: 0.8, normal: 1, high: 1.3 }[s.sensitivity];
  const budget = { minimal: 3, normal: 6, full: 9 }[s.guidance];
  return {
    helpDelay: mode.delay * hints,
    sensitivity: mode.sens * sens,
    reach: s.seated ? 1.25 : 1,
    forgiveAfter: mode.forgive,
    pulseLevel: mode.pulse,
    arrowLevel: mode.arrow,
    highlightBudget: s.mode === 'explorer' ? Math.min(budget, 4) : budget,
    compass: s.guidance === 'full' || (s.guidance === 'normal' && s.mode !== 'explorer'),
    textScale: { small: 0.85, normal: 1, large: 1.25 }[s.textSize],
    snap: { guided: 1.4, standard: 1, explorer: 0.9 }[s.mode],
    easyBuild: s.mode === 'guided',
    nextTarget: s.guidance !== 'minimal' && s.mode !== 'explorer',
  };
}
