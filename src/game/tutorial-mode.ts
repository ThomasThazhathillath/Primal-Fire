// Which world the page runs: the survival game or the tutorial ("THE FIRST
// STEPS"). The choice is made before the world is created, so every real
// system (gathering, carry, building, bench, fire) binds to the right Game
// instance. The tutorial has its own save key and its own progress key; it
// never reads or writes the survival save.

/** The survival save (owned by WorldSystem). Listed here only so tests can check it is never touched. */
export const SURVIVAL_SAVE_KEY = 'primal-first-fire.save.v1';
/** The tutorial's own Game snapshot (cleared each time the tutorial starts). */
export const TUTORIAL_SAVE_KEY = 'primal-first-fire.tutorial-game.v1';
/** Lesson progress: which lessons are done, which one is open. */
export const TUTORIAL_PROGRESS_KEY = 'primal-first-fire.tutorial.v1';
/** 'tutorial' while the next page load should open the tutorial; 'survival' once the start choice is made. */
export const MODE_KEY = 'primal-first-fire.mode.v1';

export type PlayMode = 'tutorial' | 'survival';

/** The part of Storage this module needs (tests pass a Map-backed fake). */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function safeGet(store: KeyStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(store: KeyStore | null, key: string, value: string | null): void {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
    // Storage blocked: the choice only lasts this page.
  }
}

export function browserStore(): KeyStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The mode this page load runs. A `?tutorial` URL forces the tutorial (handy for testing). */
export function currentMode(store: KeyStore | null = browserStore(), search = typeof location === 'undefined' ? '' : location.search): PlayMode {
  if (/[?&]tutorial(=1|=true)?(&|$)/.test(search)) return 'tutorial';
  const saved = safeGet(store, MODE_KEY);
  if (saved === 'tutorial' || saved === 'survival') return saved;
  // A brand-new player (no choice made, no survival save) always starts in the guided tutorial, "The First Steps". They can skip it from its card.
  return choiceMade(store) ? 'survival' : 'tutorial';
}

/** Has the player ever made the start choice (tutorial or skip)? */
export function choiceMade(store: KeyStore | null = browserStore()): boolean {
  return safeGet(store, MODE_KEY) !== null || safeGet(store, SURVIVAL_SAVE_KEY) !== null;
}

/** Switch to the tutorial on the next load. The tutorial game always starts fresh. */
export function chooseTutorial(store: KeyStore | null = browserStore()): void {
  safeSet(store, MODE_KEY, 'tutorial');
  safeSet(store, TUTORIAL_SAVE_KEY, null);
}

/** Switch to (or stay in) survival on the next load. The tutorial's game is thrown away; its lesson ticks stay. */
export function chooseSurvival(store: KeyStore | null = browserStore()): void {
  safeSet(store, MODE_KEY, 'survival');
  safeSet(store, TUTORIAL_SAVE_KEY, null);
}

/** Reload into the chosen mode (the world is rebuilt so every system binds the right Game). */
export function reloadInto(mode: PlayMode, store: KeyStore | null = browserStore()): void {
  if (mode === 'tutorial') chooseTutorial(store);
  else chooseSurvival(store);
  if (typeof location === 'undefined') return;
  // Drop a forcing ?tutorial so "Leave" really leaves.
  const url = location.pathname + location.search.replace(/[?&]tutorial(=[^&]*)?/, '').replace(/^&/, '?') + location.hash;
  location.replace(url);
}

export function loadProgressRaw(store: KeyStore | null = browserStore()): string | null {
  return safeGet(store, TUTORIAL_PROGRESS_KEY);
}

export function saveProgressRaw(raw: string, store: KeyStore | null = browserStore()): void {
  safeSet(store, TUTORIAL_PROGRESS_KEY, raw);
}

/** What finishing the opening carries into survival: the controls you learned, never items or progress. */
export const CARRY_KEY = 'primal-first-fire.carry.v1';

export interface StoryCarry {
  /** Interaction ids the objective card no longer needs to explain (ObjectiveTracker.learn). */
  learned: string[];
}

export function saveCarry(carry: StoryCarry, store: KeyStore | null = browserStore()): void {
  safeSet(store, CARRY_KEY, JSON.stringify({ learned: carry.learned.filter((x) => typeof x === 'string') }));
}

/** Is a carry waiting (without taking it)? The awakening must not replay after the opening. */
export function hasCarry(store: KeyStore | null = browserStore()): boolean {
  return safeGet(store, CARRY_KEY) !== null;
}

/** Read and remove the carry (it applies once, to a fresh survival game). */
export function takeCarry(store: KeyStore | null = browserStore()): StoryCarry | null {
  const raw = safeGet(store, CARRY_KEY);
  if (raw === null) return null;
  safeSet(store, CARRY_KEY, null);
  try {
    const c = JSON.parse(raw) as StoryCarry;
    return Array.isArray(c?.learned) ? { learned: c.learned.filter((x) => typeof x === 'string') } : null;
  } catch {
    return null;
  }
}
