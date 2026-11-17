// Old players' saves must keep loading through every change (curriculum revamp, Phase 1 C0).
// The fixtures in tests/fixtures/saves/ are frozen version-1 saves (see save-fixtures.gen.test.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game, type SaveData } from '../src/game/game.js';
import { backupBeforeUpgrade, isSave, migrateSave, SURVIVAL_BACKUP_KEY, SURVIVAL_SAVE_KEY } from '../src/game/save.js';
import { SURVIVAL_SAVE_KEY as TUTORIAL_VIEW_OF_KEY } from '../src/game/tutorial-mode.js';

const DIR = 'tests/fixtures/saves';
const FIXTURES = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const load = (f: string): unknown => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));

function memStore() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('save module', () => {
  it('has one survival key, shared with the tutorial module', () => {
    expect(SURVIVAL_SAVE_KEY).toBe('primal-first-fire.save.v1');
    expect(TUTORIAL_VIEW_OF_KEY).toBe(SURVIVAL_SAVE_KEY);
  });

  it('rejects things that are not saves instead of throwing', () => {
    for (const junk of [null, 3, 'x', {}, { time: 1 }, { time: 1, satchel: {}, structures: 'no' }]) {
      expect(isSave(junk)).toBe(false);
      expect(migrateSave(junk)).toBeNull();
    }
  });

  it('backs up an older save once, and never over an existing backup', () => {
    const s = memStore();
    backupBeforeUpgrade(s, '{"old":1}', { v: 0 } as unknown as SaveData);
    expect(s.getItem(SURVIVAL_BACKUP_KEY)).toBe('{"old":1}');
    backupBeforeUpgrade(s, '{"old":2}', { v: 0 } as unknown as SaveData);
    expect(s.getItem(SURVIVAL_BACKUP_KEY)).toBe('{"old":1}');
  });

  it('does not back up a save that is already current', () => {
    const s = memStore();
    backupBeforeUpgrade(s, '{}', new Game().snapshot());
    expect(s.getItem(SURVIVAL_BACKUP_KEY)).toBeNull();
  });
});

describe('frozen version-1 saves', () => {
  it('there is a fixture for each stage of the old game', () => {
    for (const name of ['fresh', 'mid-stones', 'mid-workbench', 'at-ember', 'make-camp', 'ch2-mid-frame', 'rain-tested', 'pre-objectives', 'pre-quests-version']) {
      expect(FIXTURES, name).toContain(`${name}.json`);
    }
  });

  for (const f of FIXTURES) {
    it(`${f} loads without losing anything and saves the same again`, () => {
      const raw = load(f) as SaveData;
      const data = migrateSave(raw);
      expect(data).not.toBeNull();
      const g = Game.restore(data!);
      // Nothing the player made or found is lost.
      expect(g.structures.length).toBe(raw.structures.length);
      expect(g.notebook.length).toBe(raw.notebook.length);
      for (const f of raw.flags) expect(g.flag(f)).toBe(true);
      for (const [id, n] of Object.entries(raw.satchel)) expect(g.count(id as never)).toBe(n);
      // A second round trip is stable: saving what was loaded writes the same thing.
      const once = JSON.stringify(g.snapshot());
      const twice = JSON.stringify(Game.restore(JSON.parse(once) as SaveData).snapshot());
      expect(twice).toBe(once);
    });
  }
});
