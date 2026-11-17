// Lesson 04 (Tools): the Tool Yard's rules, its experiments fed by those rules, and the yard state.
import { afterEach, describe, expect, it } from 'vitest';
import { LESSON_IDS, setPlayableLessons } from '../src/game/curriculum/registry.js';
import {
  blowAngle,
  BOUGH,
  BOULDER_R,
  BOULDER_START,
  dropToRoll,
  FRAME_SPOT,
  FRAME_TRIAL,
  LEVER_DIR,
  POLE_LENGTH,
  HARDEN_SECONDS,
  leverEffort,
  leverMoves,
  leverPush,
  MAX_PUSH,
  pivotArm,
  rackTest,
  ROLL_LIFT,
  ROLL_STEP,
  strandStrength,
  TEST_LOAD,
  tensileTest,
  TIP_FORCE,
  YARD,
} from '../src/game/curriculum/lessons/tools/engineering.js';
import { TOOLS_EXPERIMENTS } from '../src/game/curriculum/lessons/tools/experiments.js';
import { Game } from '../src/game/game.js';
import { KNAP_ANGLE, knap } from '../src/game/interact.js';
import { BOULDERS, FALLEN_TRUNKS, RESOURCES, TREES } from '../src/game/world-layout.js';
import { jumpTo } from './helpers/lessons.js';

const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) g.tick(0.25);
};
/** A game standing in the Tool Yard with an experiment offered and predicted. */
function atYard(step: string, experiment: string, prediction: string): Game {
  const g = new Game();
  jumpTo(g, step);
  g.setPlayerPosition(YARD.x, YARD.z);
  run(g, 0.5);
  expect(g.experiments.phase(experiment)).toBe('predict');
  expect(g.experiments.predict(experiment, prediction)).toBe(true);
  return g;
}
const hold = (g: Game, id: Parameters<Game['addItem']>[0]) => {
  g.addItem(id);
  expect(g.takeOut(id)).toBe(true);
};

describe('strike angle (knapping rule as the variable)', () => {
  it('a square blow crushes the edge, an angled blow near the edge flakes', () => {
    expect(knap(2, 0.01, 50).outcome).toBe('flake');
    expect(knap(2, 0.01, KNAP_ANGLE[1] + 5)).toEqual({ outcome: 'crushed', code: 'knap.badAngle' });
  });

  it('only fair blows are trials: firm, near the edge, angled or square', () => {
    expect(blowAngle(2, 0.01, 50)).toBe('angled');
    expect(blowAngle(2, 0.01, 86)).toBe('square');
    expect(blowAngle(0.2, 0.01, 86)).toBeNull(); // too soft
    expect(blowAngle(9, 0.01, 50)).toBeNull(); // too hard: force decided, not angle
    expect(blowAngle(2, 0.2, 50)).toBeNull(); // off the edge
    expect(blowAngle(2, 0.01, 10)).toBeNull(); // a skimming blow
  });

  it('the experiment concludes from the knap rule, and a crushed edge records t_crumble', () => {
    const g = new Game();
    jumpTo(g, 'stoneTools');
    run(g, 0.5);
    expect(g.experiments.phase('strikeAngle')).toBe('predict');
    g.experiments.predict('strikeAngle', 'square');
    for (const angle of [50, 87]) g.yard.knapStrike(2, 0.01, angle, knap(2, 0.01, angle).outcome);
    expect(g.experiments.phase('strikeAngle')).toBe('result');
    expect(g.experiments.state('strikeAngle').supported).toBe('angled');
    expect(g.experiments.predictedRight('strikeAngle')).toBe(false);
    expect(g.notebook).toContain('t_crumble');
  });
});

describe('tensile test (twist)', () => {
  it('loose fibres snap under the test stone, twisted cord holds it', () => {
    expect(strandStrength('loose')).toBeLessThan(TEST_LOAD);
    expect(strandStrength('twisted')).toBeGreaterThan(TEST_LOAD);
    expect(tensileTest('loose')).toBe('snaps');
    expect(tensileTest('twisted')).toBe('holds');
    // Even cord has a limit.
    expect(tensileTest('twisted', 200)).toBe('snaps');
  });

  it('lifting the stone feeds the experiment; snapped fibres are used up, cord is kept', () => {
    const g = atYard('cordTest', 'cordStrength', 'twisted');
    expect(g.yard.liftTestStone()).toBeNull(); // nothing to tie with
    hold(g, 'fibers');
    expect(g.yard.liftTestStone()).toBe('snaps');
    expect(g.held).toBeNull();
    hold(g, 'cord');
    expect(g.yard.liftTestStone()).toBe('holds');
    expect(g.held).toBe('cord');
    expect(g.experiments.state('cordStrength').supported).toBe('twisted');
    expect(g.notebook).toEqual(expect.arrayContaining(['t_strand', 't_twist']));
  });
});

describe('levers (effort x effort arm = load x load arm)', () => {
  it('only a pivot close to the boulder brings the effort within a person', () => {
    expect(TIP_FORCE).toBeGreaterThan(MAX_PUSH); // hands alone cannot
    expect(leverEffort(pivotArm('near'))).toBeLessThanOrEqual(MAX_PUSH);
    expect(leverEffort(pivotArm('middle'))).toBeCloseTo(TIP_FORCE, 5);
    expect(leverEffort(pivotArm('far'))).toBeGreaterThan(TIP_FORCE * 3);
    expect([leverMoves('near'), leverMoves('middle'), leverMoves('far')]).toEqual([true, false, false]);
  });

  it('the end travels further than the load rises, and the boulder rolls once the edge is high enough', () => {
    const r = leverPush('near', 0.1);
    expect(r.moves).toBe(true);
    expect(r.lift).toBeCloseTo((0.1 * 0.3) / 1.7, 6);
    expect(r.rolls).toBe(false);
    expect(leverPush('near', dropToRoll('near')).rolls).toBe(true);
    expect(leverPush('near', dropToRoll('near')).lift).toBeCloseTo(ROLL_LIFT, 6);
    expect(leverPush('far', 1)).toMatchObject({ moves: false, drop: 0, lift: 0, rolls: false });
    expect(dropToRoll('far')).toBe(Infinity);
  });

  it('the pole must be long; the pivot experiment and the boulder challenge run on the real rule', () => {
    const g = atYard('leverTest', 'leverPivot', 'far');
    expect(g.yard.rigLever()).toBe('needPole');
    hold(g, 'spindle');
    expect(g.yard.rigLever()).toBe('short');
    g.stow();
    hold(g, 'pole');
    expect(g.yard.rigLever()).toBe('set');
    expect(g.held).toBeNull();
    g.yard.setPivot('far');
    g.yard.beginPush();
    expect(g.yard.push(0.3)!.moves).toBe(false);
    expect(g.notebook).toContain('t_pivot');
    g.yard.setPivot('near');
    g.yard.beginPush();
    expect(g.yard.push(0.1)!.moves).toBe(true);
    expect(g.experiments.state('leverPivot').supported).toBe('near');
    expect(g.yard.rolls).toBe(0);
    // Roll it clear of the seam: push right down, set the pole again, push again.
    g.yard.push(0.4);
    expect(g.yard.rolls).toBe(1);
    expect(g.yard.pole).toBe('down');
    expect(g.notebook).toContain('t_lever');
    expect(g.yard.seamOpen()).toBe(false);
    expect(g.yard.rigLever()).toBe('set');
    g.yard.beginPush();
    g.yard.push(0.4);
    expect(g.yard.rolls).toBe(2);
    expect(g.yard.seamOpen()).toBe(true);
    expect(g.yard.boulder.x).toBeCloseTo(BOULDER_START.x - 2 * ROLL_STEP, 6);
  });
});

describe('frames (triangles)', () => {
  it('a square frame folds under a push; a braced one holds', () => {
    expect(rackTest('none', 30)).toBe('folds');
    expect(rackTest('none', 5)).toBe('holds');
    expect(rackTest('diagonal', 300)).toBe('holds');
  });

  it('building, pushing, bracing and pushing again concludes the experiment', () => {
    const g = atYard('frameTest', 'frameBracing', 'square');
    expect(g.yard.addFramePiece()).toBe('needStick');
    g.addItem('spindle', 4);
    expect([g.yard.addFramePiece(), g.yard.addFramePiece(), g.yard.addFramePiece()]).toEqual(['post', 'post', 'bar']);
    expect(g.yard.pushFrame(FRAME_TRIAL / 2)).toBeNull(); // a nudge is not a test
    expect(g.yard.pushFrame(0.1)).toBe('folds');
    expect(g.yard.frame.folded).toBe(true);
    expect(g.yard.pushFrame(0.1)).toBeNull(); // lying flat
    expect(g.yard.addFramePiece()).toBe('raised');
    expect(g.yard.addFramePiece()).toBe('brace');
    expect(g.yard.pushFrame(0.1)).toBe('holds');
    expect(g.experiments.state('frameBracing').supported).toBe('braced');
    expect(g.count('spindle')).toBe(0);
    expect(g.notebook).toEqual(expect.arrayContaining(['b_rack', 'b_triangle']));
  });
});

describe('the Tool Yard', () => {
  it('the flint seam needs the boulder moved and a hammer', () => {
    const g = new Game();
    g.setPlayerPosition(YARD.x, YARD.z);
    expect(g.yard.takeFlint()).toBe(false);
    g.yard.boulder.x -= 2;
    g.addItem('flint', 0);
    expect(g.yard.takeFlint()).toBe(false); // no hammer: the nodules are locked in rock
    g.addItem('hammer');
    expect(g.yard.takeFlint()).toBe(true);
    expect(g.count('flint')).toBeGreaterThan(0);
    expect(g.yard.jobs.has('hammer')).toBe(true);
  });

  it('no building outline starts in the yard (a pole there is a lever)', () => {
    const g = new Game();
    jumpTo(g, 'leverTest');
    g.setPlayerPosition(0, 0);
    expect(g.wantedStructure()).toBeUndefined();
    g.setPlayerPosition(YARD.x, YARD.z);
    expect(g.wantedStructure()).toBeNull();
  });

  it('tools doing real jobs count for the tool test', () => {
    const g = new Game();
    g.addItem('knife');
    g.addItem('axe');
    g.gather('fibers');
    expect(g.yard.jobs.has('knife')).toBe(true);
    g.gather('logs');
    expect(g.yard.jobs.has('axe')).toBe(true);
    expect(g.hasEvent('tool.wedge.split')).toBe(true);
  });

  it('a full set of hafted tools, and a digging stick turned over a fire', () => {
    const g = new Game();
    for (const id of ['knife', 'axe', 'hammer'] as const) g.addItem(id);
    run(g, 0.5);
    expect(g.notebook).toContain('t_kit');
    // Hardening: a burning fire, a pit close by, the digging stick held over it for a few seconds.
    g.structures.push({ id: 901, kind: 'firePit', x: 0, z: 0, rotY: 0, key: 'dryStone', spots: [], complete: true });
    hold(g, 'diggingStick');
    // (The fire rules have their own tests: here it simply keeps burning.)
    const burn = (s: number) => {
      for (let t = 0; t < s; t += 0.25) {
        g.fire.stage = 'burning';
        g.tick(0.25);
      }
    };
    burn(HARDEN_SECONDS / 2);
    expect(g.hasEvent('tool.point.hardened')).toBe(false);
    burn(HARDEN_SECONDS);
    expect(g.notebook).toContain('t_harden');
  });

  it('survives a save, and older saves without a yard load as the world made it', () => {
    const g = new Game();
    g.addItem('spindle', 3);
    for (let i = 0; i < 3; i++) g.yard.addFramePiece();
    g.yard.setPivot('near');
    g.yard.boulder.x -= ROLL_STEP;
    g.yard.rolls = 1;
    g.yard.pole = 'down';
    g.yard.jobs.add('axe');
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.yard.snapshot()).toEqual(g.yard.snapshot());
    const data = JSON.parse(JSON.stringify(g.snapshot()));
    delete data.yard;
    const old = Game.restore(data);
    expect(old.yard.boulder).toEqual(BOULDER_START);
    expect(old.yard.pole).toBe('none');
    expect(old.yard.frame.posts).toBe(0);
  });

  it('every Lesson 04 experiment is complete', () => {
    expect(TOOLS_EXPERIMENTS.map((e) => e.id)).toEqual(['strikeAngle', 'cordStrength', 'frameBracing', 'leverPivot']);
    for (const e of TOOLS_EXPERIMENTS) {
      expect(e.lesson).toBe('tools');
      // The card shows up to four trial rows.
      expect(e.variable.values.length).toBeGreaterThanOrEqual(2);
      expect(e.variable.values.length).toBeLessThanOrEqual(4);
      expect(e.predictions.length).toBeLessThanOrEqual(3);
      expect(e.check.options.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('Level 4 from the title list', () => {
  afterEach(() => setPlayableLessons(LESSON_IDS));

  it('a fresh game can choose Level 4, and the steps say how to make what earlier lessons made', () => {
    setPlayableLessons(['shelter', 'fire', 'water', 'tools']);
    const g = new Game();
    g.lessons.setResume('tools');
    expect(`${g.lessons.lesson?.id}/${g.focus()?.id}`).toBe('tools/stoneTools');
    jumpTo(g, 'axe');
    const view = g.steps.view()!;
    expect(view.instruction).toMatch(/build a workbench/i);
    expect(g.focus()!.find!(g)).toEqual(['slab', 'dryStone']);
    jumpTo(g, 'cordTest');
    expect(g.steps.view()!.tip).toMatch(/twist/i);
  });

  it('finishing Level 4 as the last playable level ends the guide', () => {
    setPlayableLessons(['shelter', 'fire', 'water', 'tools']);
    const g = new Game();
    jumpTo(g, 'toolCheck');
    for (const j of ['knife', 'axe', 'hammer'] as const) g.yard.jobs.add(j);
    for (let t = 0; t < 1; t += 0.25) g.tick(0.25);
    expect(g.lessons.lessonDone.has('tools')).toBe(true);
    expect(g.guiding()).toBe(false);
  });

  it('the experiment cards read out what the simulation measured', () => {
    const g = new Game();
    const card = (id: string) => g.experiments.def(id)!.readout!(g);
    expect(card('strikeAngle')).toBeNull();
    g.yard.knapStrike(2, 0.01, 86, knap(2, 0.01, 86).outcome);
    expect(card('strikeAngle')).toMatch(/86 degrees.*crushed/);
    expect(card('leverPivot')).toMatch(/in the middle.*700 N/);
    g.yard.setPivot('near');
    expect(card('leverPivot')).toMatch(/close to the boulder.*124 N/);
    expect(card('frameBracing')).toMatch(/0 of 2 posts/);
  });
});

describe('the Tool Yard layout', () => {
  it('stands clear of loose resources, trees, rocks and logs (they would take the clicks meant for it)', () => {
    // The boulder's whole roll path, the lever line with its pivot marks, the test bough and the frame ground.
    const D = LEVER_DIR;
    const keep: Array<{ name: string; x: number; z: number; r: number }> = [];
    for (let k = 0; k <= 2; k++) keep.push({ name: `boulder after ${k} rolls`, x: BOULDER_START.x - D.x * ROLL_STEP * k, z: BOULDER_START.z - D.z * ROLL_STEP * k, r: BOULDER_R + 0.3 });
    for (let t = 0; t <= POLE_LENGTH + 0.4; t += 0.25) keep.push({ name: `lever line +${t}`, x: BOULDER_START.x + D.x * t, z: BOULDER_START.z + D.z * t, r: 0.45 });
    keep.push({ name: 'test bough', x: BOUGH.x, z: BOUGH.z, r: 0.9 }, { name: 'frame ground', x: FRAME_SPOT.x, z: FRAME_SPOT.z, r: 0.7 });
    const clash: string[] = [];
    for (const k of keep) {
      for (const s of RESOURCES) if (Math.hypot(s.x - k.x, s.z - k.z) < k.r + 0.15) clash.push(`${k.name}: ${s.id}`);
      for (const t of TREES) if (Math.hypot(t.x - k.x, t.z - k.z) < k.r + 0.4) clash.push(`${k.name}: tree ${t.x.toFixed(1)},${t.z.toFixed(1)}`);
      for (const b of BOULDERS) if (Math.hypot(b.x - k.x, b.z - k.z) < k.r + b.size) clash.push(`${k.name}: boulder`);
      for (const f of FALLEN_TRUNKS) if (Math.hypot(f.x - k.x, f.z - k.z) < k.r + f.length / 2) clash.push(`${k.name}: trunk`);
    }
    expect(clash).toEqual([]);
  });
});
