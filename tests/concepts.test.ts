// Curriculum Phase 1, C7: science concepts group the Lab Notebook entries by lesson.
import { describe, expect, it } from 'vitest';
import { LESSON_IDS } from '../src/game/curriculum/registry.js';
import { OBSERVATIONS } from '../src/game/observations.js';
import { CONCEPTS, conceptOfEntry, conceptsOf, discovered } from '../src/game/science/concepts.js';

describe('science concepts', () => {
  it('every notebook entry belongs to exactly one concept', () => {
    const seen = new Map<string, string>();
    for (const c of CONCEPTS) for (const e of c.entries) {
      expect(OBSERVATIONS[e], `${c.id} names unknown entry ${e}`).toBeDefined();
      expect(seen.has(e), `${e} is in ${seen.get(e)} and ${c.id}`).toBe(false);
      seen.set(e, c.id);
    }
    for (const id of Object.keys(OBSERVATIONS)) expect(conceptOfEntry(id), `${id} has no concept`).toBeDefined();
  });

  it('every lesson teaches several concepts, and ids are unique', () => {
    for (const l of LESSON_IDS) expect(conceptsOf(l).length, l).toBeGreaterThanOrEqual(4);
    expect(new Set(CONCEPTS.map((c) => c.id)).size).toBe(CONCEPTS.length);
  });

  it('texts are short enough for a card in the headset', () => {
    for (const c of CONCEPTS) {
      expect(c.name.length, c.id).toBeLessThanOrEqual(32);
      for (const k of ['idea', 'apply', 'discover'] as const) {
        expect(c[k].length, `${c.id}.${k}`).toBeGreaterThan(15);
        expect(c[k].length, `${c.id}.${k}`).toBeLessThanOrEqual(130);
      }
    }
  });

  it('a concept is discovered by recording any of its entries', () => {
    const c = CONCEPTS.find((x) => x.id === 'drainage')!;
    expect(discovered(c, [])).toBe(false);
    expect(discovered(c, ['c2_drain'])).toBe(true);
    expect(discovered(c, new Set(['s_site']))).toBe(true);
  });

  it('the water concepts never claim a filter makes water safe', () => {
    for (const c of conceptsOf('water')) expect(`${c.idea} ${c.apply}`.toLowerCase()).not.toMatch(/filter(ed|ing)? (water )?(is|makes it) safe/);
  });
});
