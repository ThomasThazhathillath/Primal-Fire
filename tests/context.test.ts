import { describe, expect, it } from 'vitest';
import { openMarks, releaseStuck } from '../src/game/assist.js';
import { Game } from '../src/game/game.js';
import { materialsLine, OBJECTIVES, readyToBuild } from '../src/game/objectives.js';

const toWorkbench = (g: Game) => {
  for (let i = 0; i < 4; i++) g.gather('dryStone');
  g.gather('slab');
  g.tick(3);
};

describe('contextual messages', () => {
  it('picking up a stone says what it is for, then goes away by itself', () => {
    const g = new Game();
    g.gather('dryStone');
    g.tick(3); // the first-stone celebration ends; the message is still showing
    expect(g.objectives.view()!.message).toBe('Stone collected. You can use it to build structures.');
    g.tick(5);
    expect(g.objectives.view()!.message).toBeNull();
  });
  it('holding a slab with no workbench says to find ground; near an unfinished one says what it needs', () => {
    const g = new Game();
    g.addItem('slab');
    g.takeOut('slab');
    g.tick(0.6);
    expect(g.objectives.view()!.message).toMatch(/suitable ground/);
    const h = new Game();
    h.addItem('dryStone', 3);
    h.placeFromBook('workbench', 0, -1);
    h.tick(0.6);
    expect(h.objectives.view()!.message).toMatch(/workbench needs 3 more parts/);
  });
  it('a fitting part held near its mark says it fits and where to put it', () => {
    const g = new Game();
    g.addItem('dryStone', 3);
    g.placeFromBook('workbench', 0, -1);
    const m = openMarks(g.structures)[0];
    g.player.x = m.x;
    g.player.z = m.z + 1;
    g.takeOut('dryStone');
    g.tick(6);
    g.tick(0.6);
    expect(g.objectives.view()!.message).toMatch(/fits here\. Release or move it into position/);
  });
  it('every failure reason shows on the card, on any objective, and then clears', () => {
    const g = new Game();
    g.toast('Too close to the stream. Find firmer ground.', 'bad');
    expect(g.objectives.view()!.feedback).toBe('Too close to the stream. Find firmer ground.');
    g.tick(10);
    expect(g.objectives.view()!.feedback).toBeNull();
  });
  it('messages are not repeated every few seconds', () => {
    const g = new Game();
    g.gather('dryStone');
    g.tick(8);
    g.gather('dryStone');
    g.tick(3);
    expect(g.objectives.view()!.message).toBeNull();
  });
});

describe('material counts and ready to build', () => {
  it('shows stones and the flat stone as counts and says when you can start', () => {
    const g = new Game();
    toWorkbench(g);
    expect(g.objectives.current!.id).toBe('workbench');
    expect(materialsLine('workbench', g)).toBe('Stones 3/3, flat stone 1/1');
    expect(g.objectives.view()!.where).toBe('Stones 3/3, flat stone 1/1');
    expect(readyToBuild(g)).toMatch(/Ready to build: tap the grid icon, then the hammer, then Workbench/);
    expect(g.objectives.view()!.next).toMatch(/Ready to build/);
  });
  it('counts what you hold and what is already placed, and drops the note once building starts', () => {
    const g = new Game();
    g.addItem('dryStone', 2);
    expect(materialsLine('workbench', g)).toBe('Stones 2/3, flat stone 0/1');
    expect(readyToBuild(g)).toBeNull();
    g.addItem('dryStone', 3);
    g.addItem('slab');
    g.placeFromBook('workbench', 0, -1);
    expect(readyToBuild(g)).toBeNull(); // the outline is down: now fill the marks
    expect(materialsLine('workbench', g)).toMatch(/Stones 3\/3/);
  });
  it('every structure objective names its structure', () => {
    for (const id of ['workbench', 'firePit', 'cleanWater', 'shelter']) expect(OBJECTIVES.find((o) => o.id === id)!.structure).toBeDefined();
  });
});

describe('hint chime and unsticking', () => {
  it('unlocking a hint level tells the sound system', () => {
    const g = new Game();
    const levels: number[] = [];
    g.on((e) => e.type === 'hintGiven' && levels.push(e.level));
    g.objectives.unlockHint('firstStone');
    g.objectives.unlockHint('firstStone');
    expect(levels).toEqual([1, 2]);
  });
  it('anything resting inside an obstacle is moved to the free point, and nothing else is touched', () => {
    const things = [
      { x: 0, z: 0 },
      { x: 5, z: 5 },
    ];
    const moved = releaseStuck(things, (x, z) => (Math.hypot(x, z) < 1 ? { x: 1.5, z: 0 } : { x, z }));
    expect(moved).toBe(1);
    expect(things[0]).toEqual({ x: 1.5, z: 0 });
    expect(things[1]).toEqual({ x: 5, z: 5 });
    expect(releaseStuck(things, (x, z) => ({ x, z }))).toBe(0);
  });
});

describe('only the wanted structure may start an outline', () => {
  it('nothing during objectives that build nothing; the objective structure when it builds; the lesson overrides both', () => {
    const g = new Game();
    expect(g.wantedStructure()).toBeNull(); // first stone: no outline may start
    for (let i = 0; i < 4; i++) g.gather('dryStone');
    g.gather('slab');
    g.tick(3);
    expect(g.objectives.current!.id).toBe('workbench');
    expect(g.wantedStructure()).toBe('workbench');
    g.lessonStructure = 'firePit';
    expect(g.wantedStructure()).toBe('firePit');
    g.lessonStructure = null;
    expect(g.wantedStructure()).toBeNull();
    g.lessonStructure = undefined;
    expect(g.wantedStructure()).toBe('workbench');
  });
  it('once the beginner objectives are over any structure may start', () => {
    const g = new Game();
    g.objectives.done = true;
    expect(g.wantedStructure()).toBeUndefined();
  });
});
