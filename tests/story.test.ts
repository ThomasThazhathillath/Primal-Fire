import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import type { StructureKind } from '../src/game/blueprint.js';
import { CLUES, MAST_TOP, campSite, type StoryEvent } from '../src/game/story.js';

function put(g: Game, kind: StructureKind, x: number, z: number): void {
  g.structures.push({ id: g.structures.length + 100, kind, x, z, rotY: 0, key: 'dryStone', spots: [], complete: true });
}

function listen(g: Game): string[] {
  const told: string[] = [];
  g.story.on((e: StoryEvent) => e.type === 'thought' && told.push(e.beat));
  return told;
}

describe('story', () => {
  it('wakes once', () => {
    const g = new Game();
    const told = listen(g);
    g.story.wake();
    g.story.wake();
    expect(told).toEqual(['awake']);
  });

  it('fires gathering beats from real gather events, once each', () => {
    const g = new Game();
    const told = listen(g);
    g.player.x = 50; // away from clues and stream
    g.player.z = 50;
    g.gather('dryGrass');
    g.gather('dryGrass');
    expect(told.filter((b) => b === 'firstGather')).toHaveLength(1);
    expect(told.filter((b) => b === 'dryGrass')).toHaveLength(1);
    expect(told).not.toContain('tinder'); // the fire act has not begun
  });

  it('notices a clue only when you walk up to it', () => {
    const g = new Game();
    const told = listen(g);
    g.player.x = 50;
    g.player.z = 50;
    g.story.poll();
    expect(told).not.toContain('clueFire');
    g.player.x = CLUES.oldFire.x;
    g.player.z = CLUES.oldFire.z;
    g.story.poll();
    g.story.poll();
    expect(told.filter((b) => b === 'clueFire')).toHaveLength(1);
  });

  it('tells the workbench, fire and camp in order and marks the camp', () => {
    const g = new Game();
    const told = listen(g);
    g.player.x = 50;
    g.player.z = 50;
    put(g, 'workbench', 10, 10);
    g.story.poll();
    expect(told).toContain('benchIntro');
    expect(told).toContain('benchDone');
    put(g, 'firePit', 12, 11);
    g.story.poll();
    expect(told).toContain('fireIntro');
    expect(told).not.toContain('camp'); // no fire yet
    g.setFlag('fireLit');
    g.story.poll();
    expect(told).toContain('fireLit');
    expect(told).toContain('camp');
    expect(g.story.camp).toEqual({ x: 11, z: 10.5 });
    expect(told).not.toContain('ruinsTeaser');
    // Looking towards the mast (no forced turn): the teaser.
    g.facingYaw = Math.atan2(-(MAST_TOP.x - g.player.x), -(MAST_TOP.z - g.player.z));
    g.story.poll();
    expect(told).toContain('ruinsTeaser');
  });

  it('asks for a closer camp when the fire and bench are far apart', () => {
    const g = new Game();
    const told = listen(g);
    put(g, 'workbench', 0, 0);
    put(g, 'firePit', 20, 0);
    expect(campSite(g)).toBeNull();
    g.setFlag('fireLit');
    g.story.poll();
    expect(told).toContain('campFar');
    expect(told).not.toContain('camp');
  });

  it('saves progress: nothing replays after reload', () => {
    const g = new Game();
    g.story.wake();
    g.player.x = 50;
    g.gather('fibers');
    g.story.setMuted(true);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    const told = listen(g2);
    g2.story.wake();
    g2.gather('fibers');
    expect(told).toEqual([]);
    expect(g2.story.muted).toBe(true);
  });

  it('migrates an old save without story: what is past is marked seen', () => {
    const g = new Game();
    g.time = 900;
    g.gather('dryGrass');
    put(g, 'workbench', 0, 0);
    put(g, 'firePit', 3, 0);
    g.setFlag('fireLit');
    const data = JSON.parse(JSON.stringify(g.snapshot()));
    delete data.story;
    const g2 = Game.restore(data);
    const told = listen(g2);
    g2.story.wake();
    g2.story.poll();
    expect(told).not.toContain('awake');
    expect(told).not.toContain('benchDone');
    expect(told).not.toContain('fireLit');
    expect(told).not.toContain('camp');
    expect(g2.story.camp).not.toBeNull();
  });

  it('a fresh save from before the story still gets its awakening', () => {
    const g = new Game();
    const data = JSON.parse(JSON.stringify(g.snapshot()));
    delete data.story;
    const g2 = Game.restore(data);
    const told = listen(g2);
    g2.story.wake();
    expect(told).toEqual(['awake']);
  });

  it('records a short context note for new notebook entries', () => {
    const g = new Game();
    g.story.observe({ type: 'observation', id: 'x' });
    expect(g.story.notes.get('x')).toMatch(/^Recorded at Waking Clearing/);
  });
});

describe('story pacing', () => {
  it('the camp waits while a thought is still being said', () => {
    const g = new Game();
    const told = listen(g);
    put(g, 'workbench', 0, 0);
    put(g, 'firePit', 2, 0);
    g.setFlag('fireLit');
    g.story.poll(true);
    expect(told).toContain('fireLit');
    expect(told).not.toContain('camp');
    g.story.poll(false);
    expect(told).toContain('camp');
  });
});
