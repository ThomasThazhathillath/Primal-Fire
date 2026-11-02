import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { ITEMS } from '../src/game/items.js';
import {
  OBSERVATION_GROUPS,
  OBSERVATIONS,
  observationsForEvent,
} from '../src/game/observations.js';
import { QUESTS } from '../src/game/quests.js';
import { isScienceEvent, SCIENCE_EVENTS } from '../src/game/science-events.js';

const nonEmpty = (s: unknown) => typeof s === 'string' && s.trim().length > 0;

describe('lab notebook', () => {
  it('every entry has text, a known group, a valid trigger and a why prompt', () => {
    for (const [id, o] of Object.entries(OBSERVATIONS)) {
      expect(nonEmpty(o.title), id).toBe(true);
      expect(nonEmpty(o.obs), id).toBe(true);
      expect(nonEmpty(o.pri), id).toBe(true);
      expect(OBSERVATION_GROUPS[o.group], id).toBeDefined();
      expect(o.trigger && isScienceEvent(o.trigger), `${id} trigger`).toBe(true);
      expect(nonEmpty(o.why), `${id} why`).toBe(true);
    }
  });
  it('keeps entries short enough to read in VR', () => {
    for (const [id, o] of Object.entries(OBSERVATIONS)) {
      expect(o.obs.length, id).toBeLessThanOrEqual(260);
      expect(o.pri.length, id).toBeLessThanOrEqual(330);
      expect(o.lim.length, id).toBeLessThanOrEqual(260);
    }
  });
  it('gives each entry its own trigger', () => {
    const seen = new Set<string>();
    for (const o of Object.values(OBSERVATIONS)) {
      expect(seen.has(o.trigger!), o.trigger).toBe(false);
      seen.add(o.trigger!);
    }
  });
  it('all event descriptions are non-empty', () => {
    for (const [id, d] of Object.entries(SCIENCE_EVENTS)) expect(nonEmpty(d), id).toBe(true);
  });
});

describe('quests (survival progression)', () => {
  it('have title, desc, recap and non-empty hints for every quest', () => {
    for (const q of QUESTS) {
      expect(nonEmpty(q.title)).toBe(true);
      expect(nonEmpty(q.desc), q.title).toBe(true);
      expect(nonEmpty(q.recap), `${q.title} recap`).toBe(true);
      for (const s of q.steps) {
        expect(s.hints.every(nonEmpty), q.title).toBe(true);
        expect(nonEmpty(s.text(new Game())), q.title).toBe(true);
        for (const id of s.target.items) expect(ITEMS[id], id).toBeDefined();
      }
    }
  });
  it('keeps the finale last', () => {
    expect(QUESTS[QUESTS.length - 1].title).toBe('First Lab');
  });
  it('event-driven steps complete only when their event fires', () => {
    const idx = QUESTS.findIndex((q) => q.title === 'A Roof for the Night');
    expect(idx).toBeGreaterThan(0);
    const g = new Game();
    const step = QUESTS[idx].steps[0];
    expect(step.done(g)).toBe(false);
    g.science('shelter.site.chosen');
    expect(step.done(g)).toBe(true);
  });
});

describe('Game.science', () => {
  it('records the entry once, awards xp and survives save/load', () => {
    const g = new Game();
    g.science('tool.knap.flake');
    expect(g.notebook).toEqual(observationsForEvent('tool.knap.flake'));
    const xp = g.xp;
    g.science('tool.knap.flake');
    expect(g.xp).toBe(xp);
    const r = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(r.hasEvent('tool.knap.flake')).toBe(true);
  });
  it('rejects unknown events', () => {
    expect(() => new Game().science('nope.nothing')).toThrow();
  });
});
