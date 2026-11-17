// The survival save: one key and one place where the save format changes.
//
// The key keeps its old name ("save.v1") on purpose: the start screen, the
// tutorial and old players' browsers all look for it. The format version lives
// inside the save (`SaveData.v`), and `migrateSave` brings any older save up to
// the current shape before `Game.restore` reads it. Before a save is upgraded
// for the first time, the original is copied to `SURVIVAL_BACKUP_KEY`, so a bad
// migration can always be undone by hand.

import type { SaveData } from './game.js';

/** Where the survival game is saved (owned by WorldSystem). */
export const SURVIVAL_SAVE_KEY = 'primal-first-fire.save.v1';
/** A copy of the last save written before the format was upgraded. */
export const SURVIVAL_BACKUP_KEY = 'primal-first-fire.save.v1.bak';
/** The format `Game.snapshot()` writes today. */
export const SAVE_VERSION = 1;

/** The part of Storage the save needs (tests pass a Map-backed fake). */
export interface SaveStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Does this look like a survival save at all (any version)? */
export function isSave(raw: unknown): raw is SaveData {
  if (!raw || typeof raw !== 'object') return false;
  const d = raw as Partial<SaveData>;
  return typeof d.time === 'number' && !!d.satchel && typeof d.satchel === 'object' && Array.isArray(d.structures);
}

/** The format version of a save (saves always carry one; anything missing counts as 1). */
export function saveVersion(raw: SaveData): number {
  return typeof raw.v === 'number' ? raw.v : 1;
}

/**
 * Bring a parsed save up to the current format. Returns null for something that
 * is not a save. Never throws: a save it cannot read is treated as no save.
 */
export function migrateSave(raw: unknown): SaveData | null {
  if (!isSave(raw)) return null;
  // Version 1 is today's format; later versions add steps here, oldest first.
  return raw;
}

/** Keep a copy of a save that is about to be upgraded (only once, never over an existing copy). */
export function backupBeforeUpgrade(store: SaveStore, rawText: string, parsed: SaveData): void {
  if (saveVersion(parsed) >= SAVE_VERSION) return;
  try {
    if (store.getItem(SURVIVAL_BACKUP_KEY) === null) store.setItem(SURVIVAL_BACKUP_KEY, rawText);
  } catch {
    // Storage full or blocked: the upgrade still goes ahead.
  }
}
