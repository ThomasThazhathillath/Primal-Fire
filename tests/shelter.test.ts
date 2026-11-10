import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, isSpotLocked, spotWorldPosition } from '../src/game/blueprint.js';
import { openMarks } from '../src/game/assist.js';
import { Game } from '../src/game/game.js';
import {
  currentStage,
  frameDone,
  HOLD_DRY,
  inside,
  leakingPanels,
  panelProtection,
  PROTECT_NEED,
  RAIN_MAX,
  repairFor,
  roofed,
  ShelterTest,
  stageCount,
} from '../src/game/shelter.js';

const spot = (name: string) => BLUEPRINTS.leanTo.spots.findIndex((s) => s.role === name);
const roles = (role: string) => BLUEPRINTS.leanTo.spots.map((s, i) => (s.role === role ? i : -1)).filter((i) => i >= 0);

/** A game with all the parts, the plan placed by hand (first pole in hand) 1.5 m in front of you. */
function start() {
  const g = new Game();
  g.science('story.ch2.begin');
  g.addItem('pole', 3);
  g.addItem('greenBranch', 5);
  g.addItem('cord', 3);
  g.addItem('twigs', 4);
  g.addItem('bark', 3);
  g.addItem('leafLitter', 3);
  g.addItem('dryGrass', 3);
  g.addItem('diggingStick');
  g.takeOut('pole');
  const r = g.placeBlueprint('leanTo', 0, -1.6, 0);
  expect(r.ok).toBe(true);
  return { g, s: g.leanTo()! };
}
const put = (g: Game, id: number, i: number) => g.fillSpot(id, i);
const fillRole = (g: Game, id: number, role: string) => {
  for (const i of roles(role)) expect(put(g, id, i), `${role}[${i}]`).toBe(true);
};
function buildFrame(g: Game, s: ReturnType<Game['leanTo']> & object) {
  expect(put(g, s.id, spot('upright'))).toBe(true);
  expect(put(g, s.id, spot('ridge'))).toBe(true);
  fillRole(g, s.id, 'rib');
  fillRole(g, s.id, 'cross');
  for (const i of roles('lash')) {
    expect(g.lashJoint(s.id, i, 1)).toBe(1);
  }
  fillRole(g, s.id, 'lattice');
}

describe('shelter: construction stages', () => {
  it('starts as a plan with the first upright standing; later stages are closed', () => {
    const { g, s } = start();
    expect(s.key).toBe('pole');
    expect(s.complete).toBe(false);
    expect(currentStage(s)).toBe(1);
    expect(isSpotLocked(s, spot('ridge'))).toBe(true);
    // Only the second upright is a drop mark right now.
    const marks = openMarks(g.structures).filter((m) => m.structure.kind === 'leanTo');
    expect(marks.map((m) => BLUEPRINTS.leanTo.spots[m.index].role)).toEqual(['upright']);
  });
  it('refuses a later stage and says what to finish first', () => {
    const { g, s } = start();
    const msgs: string[] = [];
    g.on((e) => e.type === 'toast' && msgs.push(e.text));
    expect(put(g, s.id, spot('ridge'))).toBe(false);
    expect(msgs.join(' ')).toMatch(/finish the uprights first/);
    expect(put(g, s.id, spot('upright'))).toBe(true);
    expect(currentStage(s)).toBe(2);
    expect(put(g, s.id, spot('ridge'))).toBe(true);
    expect(currentStage(s)).toBe(3);
  });
  it('only the right parts fit: a twig is not a pole, and nothing is placed twice', () => {
    const { g, s } = start();
    g.satchel.set('pole', 0); // nothing in the bag fits an upright either
    g.takeOut('twigs');
    expect(put(g, s.id, spot('upright'))).toBe(false);
    g.stow();
    g.addItem('pole');
    expect(put(g, s.id, spot('upright'))).toBe(true);
    expect(put(g, s.id, spot('upright'))).toBe(false);
  });
  it('the frame teaches as it goes: triangle, load sharing, tension, and completes with an event', () => {
    const { g, s } = start();
    const stages: number[] = [];
    g.on((e) => e.type === 'shelterStage' && stages.push(e.stage));
    expect(put(g, s.id, spot('upright'))).toBe(true);
    expect(put(g, s.id, spot('ridge'))).toBe(true);
    fillRole(g, s.id, 'rib');
    expect(g.hasEvent('shelter.frame.braced')).toBe(true);
    fillRole(g, s.id, 'cross');
    expect(g.hasEvent('shelter.load.shared')).toBe(true);
    // Lashing: not by setting cord down, only by hand.
    const lash = roles('lash')[0];
    expect(put(g, s.id, lash)).toBe(false);
    expect(g.lashJoint(s.id, lash, 0.4)).toBeCloseTo(0.4);
    expect(s.spots[lash]).toBeNull();
    expect(g.lashJoint(s.id, lash, 0.7)).toBe(1);
    expect(s.spots[lash]).toBe('cord');
    expect(g.count('cord')).toBe(2);
    expect(g.hasEvent('shelter.lashing.tight')).toBe(true);
    for (const i of roles('lash').slice(1)) g.lashJoint(s.id, i, 1);
    expect(frameDone(s)).toBe(false);
    fillRole(g, s.id, 'lattice');
    expect(frameDone(s)).toBe(true);
    expect(g.hasEvent('shelter.frame.built')).toBe(true);
    expect(stages).toContain(6);
    expect(currentStage(s)).toBe(7);
    expect(stageCount(s, 3)).toEqual({ done: 3, total: 3 });
  });
  it('lashing needs cord and does not go past a closed stage', () => {
    const { g, s } = start();
    const lash = roles('lash')[0];
    expect(g.lashJoint(s.id, lash, 1)).toBe(0); // stage 5 is not open yet
    buildFrameUntilLash(g, s);
    g.satchel.set('cord', 0);
    expect(g.lashJoint(s.id, lash, 1)).toBe(0);
    expect(g.lashTarget(...worldOf(s, lash), 0.5)?.index).toBe(lash);
  });
  it('built parts stay: they cannot be taken back', () => {
    const { g, s } = start();
    put(g, s.id, spot('upright'));
    expect(g.takeBack(s.id, spot('upright'))).toBe(false);
    expect(s.spots[spot('upright')]).toBe('pole');
  });
});

function buildFrameUntilLash(g: Game, s: ReturnType<Game['leanTo']> & object) {
  put(g, s.id, spot('upright'));
  put(g, s.id, spot('ridge'));
  fillRole(g, s.id, 'rib');
  fillRole(g, s.id, 'cross');
}
const worldOf = (s: ReturnType<Game['leanTo']> & object, i: number): [number, number, number] => {
  const p = spotWorldPosition(s, i);
  return [p.x, p.z, p.y];
};

describe('shelter: roof and leaks', () => {
  function framed() {
    const { g, s } = start();
    buildFrame(g, s);
    return { g, s };
  }
  it('is only roofed once every panel has a layer; one layer leaks, bark and leaves do not', () => {
    const { g, s } = framed();
    const bark = roles('roofBark');
    const leaf = roles('roofLeaf');
    expect(roofed(s)).toBe(false);
    expect(leakingPanels(s)).toEqual([]);
    for (const i of bark) put(g, s.id, i);
    expect(roofed(s)).toBe(true);
    expect(g.hasEvent('shelter.roof.covered')).toBe(true);
    expect(leakingPanels(s)).toEqual([0, 1, 2]);
    expect(panelProtection(s, 0)).toBeCloseTo(0.45);
    put(g, s.id, leaf[0]);
    expect(leakingPanels(s)).toEqual([1, 2]);
    expect(panelProtection(s, 0)).toBeGreaterThanOrEqual(PROTECT_NEED - 1e-9);
  });
  it('a weak mix leaks and the repair names the missing layer', () => {
    const { g, s } = framed();
    // grass alone on panel 0, bark on 1 and 2
    put(g, s.id, roles('roofGrass')[0]);
    put(g, s.id, roles('roofBark')[1]);
    put(g, s.id, roles('roofBark')[2]);
    expect(leakingPanels(s)).toContain(0);
    expect(repairFor(s, 0)?.item).toBe('bark');
    expect(repairFor(s, 1)?.item).toBe('leafLitter');
  });
  it('completes as a finished shelter when every layer is on', () => {
    const { g, s } = framed();
    for (const role of ['roofBark', 'roofLeaf', 'roofGrass']) fillRole(g, s.id, role);
    expect(s.complete).toBe(true);
    expect(leakingPanels(s)).toEqual([]);
    expect(g.xp).toBeGreaterThan(100);
  });
  it('knows who is under the roof', () => {
    const { s } = start();
    expect(inside(s, 0, -1.6 - 0.2)).toBe(true);
    expect(inside(s, 0, -1.6 + 3)).toBe(false);
    expect(inside(s, 4, -1.6)).toBe(false);
  });
});

describe('shelter: the rain test', () => {
  /** Run game time forward, standing in the shelter. */
  const run = (g: Game, seconds: number, standIn = true) => {
    const s = g.leanTo()!;
    if (standIn) {
      g.player.x = s.x;
      g.player.z = s.z - 0.2;
    }
    for (let t = 0; t < seconds; t += 0.25) g.tick(0.25);
  };
  function roofedGame(layers: Array<'roofBark' | 'roofLeaf' | 'roofGrass'>) {
    const { g, s } = start();
    buildFrame(g, s);
    for (const role of layers) fillRole(g, s.id, role);
    return { g, s };
  }
  it('waits for the roof, then rain falls (forced heavy rain), a channel plan appears, and leaks are found', () => {
    const { g, s } = roofedGame(['roofBark']);
    run(g, 10);
    expect(g.shelterTest.phase).toBe('idle'); // the builder is still working: no rain for a while after setting a part
    run(g, 20);
    expect(g.shelterTest.phase).toBe('rain');
    expect(g.env.forceWeather).toBe('heavyRain');
    expect(g.hasEvent('shelter.rain.begin')).toBe(true);
    expect(g.structures.some((t) => t.kind === 'drainage')).toBe(true);
    run(g, 2);
    expect(g.hasEvent('shelter.leak.found')).toBe(true);
    expect(leakingPanels(s).length).toBeGreaterThan(0);
  });
  it('layers close the leaks, the channel is dug with a tool that is kept, and the test passes', () => {
    const { g, s } = roofedGame(['roofBark']);
    run(g, 30);
    expect(g.shelterTest.raining).toBe(true);
    for (const role of ['roofLeaf', 'roofGrass']) fillRole(g, s.id, role);
    run(g, 1);
    expect(leakingPanels(s)).toEqual([]);
    expect(g.hasEvent('shelter.layers.sealed')).toBe(true);
    const d = g.structures.find((t) => t.kind === 'drainage')!;
    g.takeOut('diggingStick');
    for (let i = 0; i < 3; i++) expect(g.fillSpot(d.id, i)).toBe(true);
    expect(g.held).toBe('diggingStick'); // the stick digs and is kept
    expect(d.complete).toBe(true);
    expect(g.drained()).toBe(true);
    run(g, 1);
    expect(g.hasEvent('shelter.drain.dug')).toBe(true);
    run(g, HOLD_DRY + 5);
    expect(g.shelterTest.phase).toBe('passed');
    expect(g.flag('shelterTested')).toBe(true);
    expect(g.env.forceWeather).toBeNull();
    expect(g.hasEvent('shelter.roof.sheds')).toBe(true);
    expect(g.hasEvent('shelter.rested')).toBe(true);
  });
  it('a roof with no leaks still needs the channel; without it the floor floods and the test does not pass', () => {
    const { g } = roofedGame(['roofBark', 'roofLeaf', 'roofGrass']);
    run(g, 40);
    expect(g.shelterTest.raining).toBe(true);
    run(g, 60);
    expect(g.shelterTest.phase).toBe('rain');
    expect(g.shelterTest.flood).toBeGreaterThan(0.3);
    expect(g.flag('shelterTested')).toBe(false);
  });
  it('the rain eases off after a while and comes back', () => {
    const { g } = roofedGame(['roofBark', 'roofLeaf', 'roofGrass']);
    run(g, 25);
    run(g, RAIN_MAX + 5);
    expect(g.shelterTest.phase).toBe('pause');
    expect(g.env.forceWeather).toBeNull();
    run(g, 40);
    expect(g.shelterTest.phase).toBe('rain');
  });
});

describe('shelter: the pure test machine', () => {
  const dry = { roofed: true, leaks: 0, drained: true, inside: true };
  it('passes after HOLD_DRY dry seconds, resets when a leak appears', () => {
    const t = new ShelterTest();
    expect(t.update(0.25, dry)).toBe('rainBegan');
    let last: string | null = null;
    for (let s = 0; s < HOLD_DRY - 2; s += 0.25) last = t.update(0.25, dry) ?? last;
    expect(t.phase).toBe('rain');
    t.update(0.25, { ...dry, leaks: 1 });
    expect(t.dry).toBe(0);
    for (let s = 0; s < HOLD_DRY + 1; s += 0.25) last = t.update(0.25, dry) ?? last;
    expect(t.phase).toBe('passed');
    expect(last).not.toBeNull();
  });
  it('does not start without a roof', () => {
    const t = new ShelterTest();
    expect(t.update(1, { ...dry, roofed: false })).toBeNull();
    expect(t.phase).toBe('idle');
  });
});

describe('shelter: persistence', () => {
  it('every stage survives a save and reload: spots, lashing progress, the test and the channel', () => {
    const { g, s } = start();
    put(g, s.id, spot('upright'));
    put(g, s.id, spot('ridge'));
    fillRole(g, s.id, 'rib');
    fillRole(g, s.id, 'cross');
    const lash = roles('lash');
    g.lashJoint(s.id, lash[0], 1);
    g.lashJoint(s.id, lash[1], 0.5);
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    const b = back.leanTo()!;
    expect(b.spots).toEqual(s.spots);
    expect(b.work?.[lash[1]]).toBeCloseTo(0.5);
    expect(currentStage(b)).toBe(5);
    expect(b.key).toBe('pole');
    // carry on where it left off
    expect(back.lashJoint(b.id, lash[1], 0.5)).toBe(1);
    expect(back.lashJoint(b.id, lash[2], 1)).toBe(1);
    expect(back.count('cord')).toBe(0);
  });
  it('a raining test and its channel come back raining', () => {
    const { g, s } = start();
    buildFrame(g, s);
    fillRole(g, s.id, 'roofBark');
    g.player.x = s.x;
    g.player.z = s.z - 0.2;
    for (let t = 0; t < 32; t += 0.25) g.tick(0.25);
    expect(g.shelterTest.raining).toBe(true);
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    back.tick(0.5);
    expect(back.shelterTest.raining).toBe(true);
    expect(back.env.forceWeather).toBe('heavyRain');
    expect(back.structures.some((t) => t.kind === 'drainage')).toBe(true);
  });
  it('old saves without any shelter load fine', () => {
    const snap = JSON.parse(JSON.stringify(new Game().snapshot()));
    delete snap.shelterTest;
    const g = Game.restore(snap);
    expect(g.leanTo()).toBeNull();
    expect(g.shelterTest.phase).toBe('idle');
  });
});

describe('shelter: Chapter 2 quests', () => {
  it('the quests follow the build and the notebook records the six discoveries', () => {
    const { g, s } = start();
    buildFrame(g, s);
    for (const role of ['roofBark', 'roofLeaf', 'roofGrass']) fillRole(g, s.id, role);
    for (const id of ['c2_triangle', 'c2_tension', 'c2_load']) expect(g.notebook, id).toContain(id);
    g.player.x = s.x;
    g.player.z = s.z - 0.2;
    for (let t = 0; t < 40; t += 0.25) g.tick(0.25);
    const d = g.structures.find((x) => x.kind === 'drainage')!;
    g.takeOut('diggingStick');
    for (let i = 0; i < 3; i++) g.fillSpot(d.id, i);
    for (let t = 0; t < HOLD_DRY + 5; t += 0.25) g.tick(0.25);
    for (const id of ['c2_slope', 'c2_drain']) expect(g.notebook, id).toContain(id);
    expect(g.flag('shelterTested')).toBe(true);
  });
});
