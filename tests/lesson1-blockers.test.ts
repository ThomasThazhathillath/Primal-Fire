// Curriculum Phase 1, C1: bugs that would block Lesson 01 (Shelter) when it comes first.
import { describe, expect, it } from 'vitest';
import { BLUEPRINTS } from '../src/game/blueprint.js';
import { fireExposed } from '../src/game/environment.js';
import { Game, LASH_STEPS, type GameEvent, type SaveData } from '../src/game/game.js';
import { objectiveById } from '../src/game/objectives.js';

const roles = (role: string) => BLUEPRINTS.leanTo.spots.map((s, i) => (s.role === role ? i : -1)).filter((i) => i >= 0);

function leanToGame() {
  const g = new Game();
  g.addItem('pole', 3);
  g.addItem('greenBranch', 5);
  g.addItem('cord', 3);
  g.addItem('twigs', 4);
  g.addItem('bark', 3);
  g.addItem('leafLitter', 3);
  g.addItem('dryGrass', 3);
  g.takeOut('pole');
  expect(g.placeBlueprint('leanTo', 0, -1.6, 0).ok).toBe(true);
  return { g, s: g.leanTo()! };
}

function frameAndRoof(g: Game, id: number) {
  for (const role of ['upright', 'ridge', 'rib', 'cross']) for (const i of roles(role)) expect(g.fillSpot(id, i)).toBe(true);
  for (const i of roles('lash')) expect(g.lashJoint(id, i, 1)).toBe(1);
  for (const i of roles('lattice')) expect(g.fillSpot(id, i)).toBe(true);
  for (const i of roles('roofBark')) expect(g.fillSpot(id, i)).toBe(true);
}

describe('lean-to milestones belong to the lean-to', () => {
  it('celebrates its frame and roof even after the old shelter fired the same events', () => {
    const { g, s } = leanToGame();
    // An old 4-spot shelter, finished earlier, already fired shelter.frame.built and shelter.roof.covered.
    g.science('shelter.frame.built');
    g.science('shelter.roof.covered');
    const stages: number[] = [];
    g.on((e: GameEvent) => e.type === 'shelterStage' && stages.push(e.stage));
    const xp0 = g.xp;
    frameAndRoof(g, s.id);
    expect(stages).toContain(6);
    expect(stages).toContain(7);
    expect(s.milestones).toEqual(['frame', 'roof']);
    expect(g.xp).toBeGreaterThanOrEqual(xp0 + 100);
  });

  it('a lean-to from an older save is not celebrated twice', () => {
    const { g, s } = leanToGame();
    frameAndRoof(g, s.id);
    const snap = JSON.parse(JSON.stringify(g.snapshot())) as SaveData;
    for (const st of snap.structures) delete st.milestones;
    const g2 = Game.restore(snap);
    expect(g2.leanTo()!.milestones).toEqual(['frame', 'roof']);
  });
});

describe('cord made by hand counts', () => {
  it('twisting fibres by hand sets cordMade and finishes the cord objective', () => {
    const g = new Game();
    g.addItem('fibers');
    g.takeOut('fibers');
    for (let i = 0; i < 10; i++) g.work(0.3);
    expect(g.count('cord')).toBe(1);
    expect(g.flag('cordMade')).toBe(true);
    expect(objectiveById('cord')!.done(g, 0)).toBe(true);
  });
});

describe('lashing does not flood the view with redraws', () => {
  it('many small twists send only one redraw per visible wrap', () => {
    const { g, s } = leanToGame();
    for (const role of ['upright', 'ridge', 'rib', 'cross']) for (const i of roles(role)) g.fillSpot(s.id, i);
    let lashEvents = 0;
    g.on((e: GameEvent) => e.type === 'lash' && lashEvents++);
    const joint = roles('lash')[0];
    for (let i = 0; i < 200 && g.lashJoint(s.id, joint, 0.006) < 1; i++);
    expect(lashEvents).toBeLessThanOrEqual(LASH_STEPS);
    expect(lashEvents).toBeGreaterThan(1);
  });

  it('without cord the reminder is not repeated every frame', () => {
    const { g, s } = leanToGame();
    for (const role of ['upright', 'ridge', 'rib', 'cross']) for (const i of roles(role)) g.fillSpot(s.id, i);
    g.satchel.set('cord', 0);
    let toasts = 0;
    g.on((e: GameEvent) => e.type === 'toast' && toasts++);
    for (let i = 0; i < 60; i++) g.lashJoint(s.id, roles('lash')[0], 0.01);
    expect(toasts).toBe(1);
  });
});

describe('a roofed lean-to keeps the rain off a fire', () => {
  it('a fire beside a roofed lean-to is not exposed; in the open it is', () => {
    const { g, s } = leanToGame();
    expect(fireExposed(g.structures, s.x + 1, s.z)).toBe(true);
    frameAndRoof(g, s.id);
    expect(fireExposed(g.structures, s.x + 1, s.z)).toBe(false);
    expect(fireExposed(g.structures, s.x + 6, s.z)).toBe(true);
  });
});
