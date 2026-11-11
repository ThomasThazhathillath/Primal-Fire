import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { LIVING_QUESTS } from '../src/game/living-quests.js';
import { freshness, Tracks, TRACK_CAP } from '../src/game/tracks.js';

describe('tracks', () => {
  it('seeds old trails and never exceeds the cap', () => {
    const t = new Tracks();
    const live = t.prints.filter((p) => p.live);
    expect(live.length).toBeGreaterThan(10);
    expect(t.prints.length).toBe(TRACK_CAP);
    expect(new Set(live.map((p) => p.species)).size).toBe(2);
  });
  it('freshness ages', () => {
    expect(freshness(10)).toBe('fresh');
    expect(freshness(300)).toBe('recent');
    expect(freshness(900)).toBe('old');
  });
  it('The Hidden Trail completes from reading tracks and approaching quietly, persists through save', () => {
    const g = new Game();
    const trail = g.tracks.prints.filter((p) => p.live);
    // Stand on prints of different ages until five have been read.
    for (const p of trail.slice(0, 6)) {
      g.setPlayerPosition(p.x, p.z);
      g.tick(0.6);
    }
    const old = trail.find((p) => g.time - p.born > 380)!;
    g.setPlayerPosition(old.x, old.z);
    g.tick(0.6);
    expect(g.hasEvent('hunt.track.found')).toBe(true);
    expect(g.hasEvent('hunt.track.followed')).toBe(true);
    expect(g.hasEvent('hunt.track.fresh')).toBe(true);
    expect(g.living.has('hiddenTrail')).toBe(false);
    g.science('wild.quiet.approach');
    expect(g.living.has('hiddenTrail')).toBe(true);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.living.has('hiddenTrail')).toBe(true);
    expect(LIVING_QUESTS[0].steps.every((s) => s.done(g2))).toBe(true);
  });
  it('animals leave prints as they move', () => {
    const g = new Game();
    const before = g.tracks.version;
    const d = g.wildlife.animals.find((a) => a.species === 'deer')!;
    g.setPlayerPosition(d.x - 25, d.z);
    for (let i = 0; i < 600; i++) g.tick(0.1);
    expect(g.tracks.version).toBeGreaterThan(before);
  });
});
