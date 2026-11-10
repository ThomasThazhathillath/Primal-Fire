// The three levels of Chapter 1. Each level is a run of quests in QUESTS;
// the level you are on is derived from the quest you are on, so it can
// never disagree with quest progress (and old saves map onto it for free).

import { QUESTS } from './quests.js';

export interface GameLevel {
  n: 1 | 2 | 3 | 4;
  name: string;
  /** Titles of the quests in this level, in order. */
  quests: string[];
  /** Shown on the title card when the level starts. */
  intro: string;
  /** XP for finishing the level. */
  xp: number;
}

export const GAME_LEVELS: GameLevel[] = [
  {
    n: 1,
    name: 'First Fire',
    quests: ['Scavenger', 'First Fire'],
    intro: 'Nothing but your hands and the forest. Build a workbench, make a bow drill, and light a fire from friction.',
    xp: 150,
  },
  {
    n: 2,
    name: 'Clean Water',
    quests: ['Hold Water', 'Black Gold', 'Clear ≠ Safe'],
    intro: 'The stream is murky. Fire a clay pot, make charcoal, build a filter, and boil the filtered water.',
    xp: 200,
  },
  {
    n: 3,
    name: 'Camp',
    quests: ['Make Camp', 'Catch a Fish', 'Cook Your Catch', 'Grow Food'],
    intro: 'Build a camp around your fire, spear fish in the stream, cook them, and grow food of your own.',
    xp: 250,
  },
  {
    n: 4,
    name: 'The Living Camp',
    quests: ['A Place to Call Home', 'The Foundation', 'Build the Frame', 'Roof Over Your Head', 'Test Your Engineering'],
    intro: 'Fire is not enough. Build a real shelter with your hands, one stage at a time, then test it against the rain.',
    xp: 300,
  },
];

/** Index in QUESTS of a level's first quest. */
export function levelStart(n: number): number {
  const lv = GAME_LEVELS[n - 1];
  return QUESTS.findIndex((q) => q.title === lv.quests[0]);
}

/** The level a quest index belongs to (quests after level 3 count as level 3). */
export function levelForQuest(questIndex: number): GameLevel {
  for (let i = GAME_LEVELS.length - 1; i >= 0; i--) {
    if (questIndex >= levelStart(GAME_LEVELS[i].n)) return GAME_LEVELS[i];
  }
  return GAME_LEVELS[0];
}

/** True once every quest of level `n` is complete. */
export function levelComplete(n: number, questIndex: number): boolean {
  const lv = GAME_LEVELS[n - 1];
  return questIndex >= levelStart(n) + lv.quests.length;
}

/**
 * Save migration. Saves before levels (no `questsVersion`) used the old quest
 * order: 5 chapter quests, 5 survival quests, then First Lab. Anything past
 * the water quests maps to the start of level 3 (Camp); First Lab maps to the
 * new First Lab position.
 */
export const QUESTS_VERSION = 2;
export function migrateQuestIndex(questIndex: number, version: number | undefined): number {
  if (version === QUESTS_VERSION) return Math.min(questIndex, QUESTS.length);
  const camp = levelStart(3);
  if (questIndex < camp) return questIndex;
  if (questIndex >= 10) return QUESTS.findIndex((q) => q.title === 'First Lab');
  return camp;
}
