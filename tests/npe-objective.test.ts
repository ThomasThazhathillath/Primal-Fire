// NPE milestone D: the objective card always says what to do next, and the compass knows where camp is.
import { describe, expect, it } from 'vitest';
import { bearingTo, campOf, COMPASS_SPAN, headingOf, tapePos } from '../src/game/directions.js';
import { Game } from '../src/game/game.js';
import { cardView, nextActionLine, partsLine } from '../src/game/objectives.js';

describe('objective card content', () => {
  it('every active objective in a fresh game says what to do, how far along it is and the next action', () => {
    const g = new Game();
    const v = cardView(g)!;
    expect(v.title.length).toBeGreaterThan(3);
    expect(v.instruction.length).toBeGreaterThan(10);
    expect(v.progress).toEqual({ have: 0, need: 1 });
    expect(v.nextAction).toMatch(/^Next: look at .* and pinch to collect it\.$/);
    expect(v.parts).toMatch(/^Look for: /);
  });

  it('the next action follows the player: a contextual line wins, then the first open substep', () => {
    const g = new Game();
    const o = g.objectives.current!;
    expect(nextActionLine(o, g, 'This stone fits here.', null, [])).toBe('This stone fits here.');
    expect(nextActionLine(o, g, null, null, [{ text: 'Place the slab', done: false }])).toBe('Next: place the slab');
    expect(nextActionLine(o, g, null, 'You have everything.', [])).toBe('You have everything.');
  });

  it('a build objective lists its materials in its own line, not twice', () => {
    const g = new Game();
    while (g.objectives.current && g.objectives.current.id !== 'workbench') g.objectives.index++;
    const o = g.objectives.current!;
    expect(o.structure).toBe('workbench');
    expect(partsLine(o, g)).toBeNull();
    expect(cardView(g)!.where).toMatch(/Stones \d\/3, flat stone \d\/1/);
  });
});

describe('compass and camp direction', () => {
  it('camp is where you woke until you build one, then your fire and bench', () => {
    const g = new Game();
    expect(campOf(g)).toEqual({ x: 0, z: 0, known: false });
    g.story.camp = { x: -1, z: 3.8 };
    expect(campOf(g)).toEqual({ x: -1, z: 3.8, known: true });
  });

  it('bearings: ahead is 0, right is +90, behind is 180; north is -Z', () => {
    expect(bearingTo(0, -5, 0)).toBeCloseTo(0);
    expect(bearingTo(5, 0, 0)).toBeCloseTo(90);
    expect(Math.abs(bearingTo(0, 5, 0))).toBeCloseTo(180);
    expect(headingOf(0)).toBeCloseTo(0);
    expect(headingOf(-Math.PI / 2)).toBeCloseTo(90); // turned right: facing east
  });

  it('marks outside the tape are pinned to its edge, never lost', () => {
    expect(tapePos(0)).toEqual({ x: 0, edge: false });
    expect(tapePos(COMPASS_SPAN / 2).x).toBeCloseTo(0.5);
    expect(tapePos(150)).toEqual({ x: 1, edge: true });
    expect(tapePos(-170)).toEqual({ x: -1, edge: true });
  });
});
