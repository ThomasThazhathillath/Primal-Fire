// Every Lab Notebook entry must be reachable in play: its trigger event is emitted somewhere in src/,
// or the entry is recorded directly (an item's first pickup, a finished structure, observe('id')).
// UNREACHABLE lists the entries that nothing can unlock yet. It may only shrink: when you wire an
// entry up, delete it from the list (the second test fails until you do).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLUEPRINTS } from '../src/game/blueprint.js';
import { ITEMS } from '../src/game/items.js';
import { OBSERVATIONS } from '../src/game/observations.js';
import { SCIENCE_EVENTS } from '../src/game/science-events.js';

/** Notebook entries with no way to unlock them yet (Phase 1 audit, Nov 2026). */
const UNREACHABLE = new Set([
  'b_wetstone', 'b_litter', 'f_charcoal', 'p_temper',
  'w_washout', 'w_clog', 'w_odor', 'w_settle', 'w_hotstones',
  'f_smoke', 'f_night', 't_crumble', 't_lever', 't_harden',
  'n_chain', 'n_eyes', 'y_thirst', 'y_wet', 'y_wound_clean', 'y_wound_dirty',
  'x_sky', 'x_rain', 'x_night',
]);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Event ids that appear in code as something emitted (not only as a hasEvent/onEvent check). */
function emittedEvents(): Set<string> {
  const ids = Object.keys(SCIENCE_EVENTS);
  const found = new Set<string>();
  for (const file of sources('src')) {
    if (file.endsWith('science-events.ts') || file.endsWith('observations.ts')) continue;
    const text = readFileSync(file, 'utf8')
      // Checks are not emitters.
      .replace(/(hasEvent|onEvent|events\.has)\(\s*'[^']*'\s*\)/g, '')
      // A guide step's scienceEvent is what it waits for, not something it emits.
      .replace(/scienceEvent: '[^']*'/g, '');
    for (const id of ids) if (text.includes(`'${id}'`) || text.includes(`"${id}"`)) found.add(id);
    // Template emitters such as `farm.stage.${st}`.
    for (const m of text.matchAll(/`([a-z]+\.[a-z]+\.)\$\{/g)) for (const id of ids) if (id.startsWith(m[1])) found.add(id);
  }
  return found;
}

/** Entries recorded directly, without a science event. */
function directEntries(): Set<string> {
  const direct = new Set<string>();
  for (const it of Object.values(ITEMS)) if (it.firstObservation) direct.add(it.firstObservation);
  for (const b of Object.values(BLUEPRINTS)) if (b.completeObservation) direct.add(b.completeObservation);
  for (const file of sources('src')) {
    if (file.endsWith('observations.ts')) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/observe\(\s*'([a-z0-9_]+)'/g)) direct.add(m[1]);
  }
  return direct;
}

function unreachable(): string[] {
  const emitted = emittedEvents();
  const direct = directEntries();
  return Object.entries(OBSERVATIONS)
    .filter(([id, o]) => !direct.has(id) && !(o.trigger && emitted.has(o.trigger)))
    .map(([id]) => id)
    .sort();
}

describe('Lab Notebook reachability', () => {
  it('no entry becomes unreachable that was reachable before', () => {
    const now = unreachable().filter((id) => !UNREACHABLE.has(id));
    expect(now, 'these notebook entries have no emitter').toEqual([]);
  });

  it('the list of unreachable entries is honest (remove entries once they are wired up)', () => {
    const now = new Set(unreachable());
    const fixed = [...UNREACHABLE].filter((id) => !now.has(id));
    expect(fixed, 'these are reachable now: delete them from UNREACHABLE').toEqual([]);
  });
});
