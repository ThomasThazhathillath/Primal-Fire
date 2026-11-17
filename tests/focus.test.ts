// Curriculum Phase 1, C3: systems read progress through the Game focus API, and the Roadmap wall
// lights from what was discovered, not from a quest's place in a list.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game, type GameEvent } from '../src/game/game.js';
import { roadmapLit } from '../src/game/roadmap.js';

describe('focus API', () => {
  it('a new game focuses on the first step and is guiding', () => {
    const g = new Game();
    expect(g.focus()?.id).toBe('firstStone');
    expect(g.focusIs('firstStone', 'x')).toBe(true);
    expect(g.guiding()).toBe(true);
  });

  it('learned controls go through the game', () => {
    const g = new Game();
    expect(g.hasLearned('bench')).toBe(false);
    g.learn('bench');
    expect(g.hasLearned('bench')).toBe(true);
    expect(g.learnedControls()).toContain('bench');
  });

  it('no system reaches into the objectives tracker, the quest index or story flags directly', () => {
    for (const f of readdirSync('src/systems')) {
      const src = readFileSync(`src/systems/${f}`, 'utf8');
      expect(src, f).not.toMatch(/\.objectives\./);
      expect(src, f).not.toMatch(/\.questIndex/);
      expect(src, f).not.toMatch(/story\.seen\.has\('fireLit'\)/);
    }
  });
});

describe('first fire', () => {
  it('only the very first ignition is marked first', () => {
    const g = new Game();
    const firsts: boolean[] = [];
    g.on((e: GameEvent) => e.type === 'fire' && e.stage === 'burning' && firsts.push(!!e.first));
    g.notifyFire();
    expect(firsts).toEqual([]);
    g.fire.stage = 'burning';
    g.notifyFire(true);
    g.notifyFire();
    expect(firsts).toEqual([true, false]);
  });
});

describe('roadmap from discoveries', () => {
  it('lights fire, pottery and water from flags, whatever the quest index says', () => {
    const g = new Game();
    expect(roadmapLit(g)).toEqual([]);
    g.setFlag('fireLit');
    g.setFlag('waterSafe');
    g.questIndex = 0;
    expect(roadmapLit(g)).toEqual(['fire', 'water']);
  });

  it('lights the shelter nodes from the lean-to and the rain test', () => {
    const g = new Game();
    g.setFlag('shelterTested');
    expect(roadmapLit(g)).toContain('hydro');
    expect(roadmapLit(g)).not.toContain('structure');
  });
});
