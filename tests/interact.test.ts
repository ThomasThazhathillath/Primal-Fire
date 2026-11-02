import { describe, expect, it } from 'vitest';
import {
  BEND_MAX,
  BEND_YIELD,
  BendState,
  Core,
  DragState,
  GrabTracker,
  KNAP_EDGE,
  Notch,
  SLAB_RADIUS,
  SUPPORT_TOLERANCE,
  SWING_STRONG,
  SWING_WEAK,
  TOUGHNESS,
  TWIST_NEEDED,
  TwistState,
  checkPlace,
  headSpeed,
  knap,
  slabStability,
  strike,
  FAILURE_TEXT,
} from '../src/game/interact.js';

const DT = 1 / 72;

function bendFor(b: BendState, angle: number, seconds: number) {
  const events: string[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const e = b.update(angle, DT);
    if (e) events.push(e);
  }
  return events;
}

describe('grab', () => {
  it('grabs on grip close near a target and releases on open', () => {
    const g = new GrabTracker();
    expect(g.update(1, false, 'stone')).toBeNull();
    expect(g.update(1, true, 'stone')).toEqual({ kind: 'grab', hand: 1, target: 'stone' });
    expect(g.update(1, true, null)).toBeNull();
    expect(g.update(1, false, null)).toEqual({ kind: 'release', hand: 1, target: 'stone' });
  });
  it('does not grab when the grip was already closed', () => {
    const g = new GrabTracker();
    g.update(0, true, null);
    expect(g.update(0, true, 'stone')).toBeNull();
  });
  it('tracks two-hand holds and lift limits', () => {
    const g = new GrabTracker();
    g.update(0, true, 'slab');
    g.update(1, true, 'slab');
    expect(g.twoHanded('slab')).toBe(true);
    expect(GrabTracker.canLift(6, 1)).toBe(false);
    expect(GrabTracker.canLift(6, 2)).toBe(true);
  });
});

describe('branch snap', () => {
  it('never snaps instantly, even at full bend', () => {
    const b = new BendState(TOUGHNESS.branch!);
    expect(bendFor(b, BEND_MAX, 0.3)).not.toContain('snap');
    expect(b.snapped).toBe(false);
  });
  it('cracks twice before snapping under sustained bend', () => {
    const b = new BendState(TOUGHNESS.branch!);
    const ev = bendFor(b, BEND_MAX, 2);
    expect(ev.filter((e) => e === 'crack').length).toBe(2);
    expect(ev.indexOf('snap')).toBeGreaterThan(ev.lastIndexOf('crack'));
    expect(b.snapped).toBe(true);
  });
  it('small bends below yield only flex', () => {
    const b = new BendState(TOUGHNESS.branch!);
    bendFor(b, BEND_YIELD * 0.9, 10);
    expect(b.stress).toBe(0);
    expect(b.flex).toBeGreaterThan(0);
    expect(b.releaseCode()).toBe('bend.notEnough');
  });
  it('tougher wood takes longer', () => {
    const t = (tough: number) => {
      const b = new BendState(tough);
      let s = 0;
      while (!b.snapped && s < 20) {
        b.update(BEND_MAX, DT);
        s += DT;
      }
      return s;
    };
    expect(t(TOUGHNESS.spindle!)).toBeGreaterThan(t(TOUGHNESS.dryBranch!));
  });
  it('easing off lets stress recover', () => {
    const b = new BendState(TOUGHNESS.branch!);
    bendFor(b, BEND_MAX, 0.4);
    const s = b.stress;
    bendFor(b, 0.1, 1);
    expect(b.stress).toBeLessThan(s);
    expect(b.releaseCode()).toBe('bend.released');
  });
  it('green wood bends but never snaps', () => {
    const b = new BendState(TOUGHNESS.greenBranch!);
    bendFor(b, BEND_MAX, 10);
    expect(b.snapped).toBe(false);
    expect(b.releaseCode()).toBe('bend.green');
  });
});

describe('swing', () => {
  it('wrist flicks count through the handle lever', () => {
    expect(headSpeed(0.5, 6, 0.45)).toBeGreaterThan(SWING_WEAK);
  });
  it('weak vs strong vs glancing', () => {
    expect(strike(1, 1, 'wood', 'axe').code).toBe('swing.weak');
    const strong = strike(SWING_STRONG * 1.3, 0.95, 'wood', 'axe');
    const medium = strike(SWING_WEAK + 0.3, 0.95, 'wood', 'axe');
    expect(strong.outcome).toBe('chop');
    expect(strong.damage).toBeGreaterThan(medium.damage);
    const glance = strike(SWING_STRONG * 1.3, 0.2, 'wood', 'axe');
    expect(glance.code).toBe('swing.glancing');
    expect(glance.damage).toBeLessThan(medium.damage);
  });
  it('materials respond differently', () => {
    expect(strike(4, 1, 'stone', 'axe').outcome).toBe('bounce');
    expect(strike(4, 1, 'soil', 'axe').outcome).toBe('thud');
    expect(strike(4, 1, 'wood', 'hammer').damage).toBeLessThan(strike(4, 1, 'wood', 'axe').damage);
  });
  it('a notch deepens over several good blows', () => {
    const n = new Notch();
    let blows = 0;
    while (!n.hit(strike(SWING_STRONG * 1.2, 0.9, 'wood', 'axe').damage)) blows++;
    expect(blows).toBeGreaterThanOrEqual(2);
    expect(n.depth).toBe(1);
    expect(n.hit(1)).toBe(false);
  });
});

describe('knapping', () => {
  it('outcome depends on location and strength', () => {
    expect(knap(2, 0.01, 60).outcome).toBe('flake');
    expect(knap(0.5, 0.01, 60).code).toBe('knap.tooSoft');
    expect(knap(5, 0.01, 60)).toEqual({ outcome: 'crushed', code: 'knap.tooHard' });
    expect(knap(2, KNAP_EDGE * 2, 60).code).toBe('knap.offEdge');
    expect(knap(2, 0.01, 95).code).toBe('knap.badAngle');
  });
  it('a core runs out of flakes', () => {
    const c = new Core(2);
    expect(c.strike(2, 0.01, 60).outcome).toBe('flake');
    expect(c.strike(2, 0.01, 60).outcome).toBe('flake');
    expect(c.strike(2, 0.01, 60).code).toBe('knap.coreSpent');
  });
});

describe('cordage', () => {
  it('must split strands before twisting', () => {
    const t = new TwistState();
    t.update(0.2, 0.1, -0.1);
    expect(t.progress).toBe(0);
    expect(t.lastCode).toBe('cord.notSplit');
    expect(t.update(0.4, 0, 0)).toBe('split');
  });
  it('progress comes from counter-rotation, not time or same-direction spin', () => {
    const t = new TwistState();
    t.update(0.2, 0, 0);
    t.update(0.4, 0, 0);
    for (let i = 0; i < 200; i++) t.update(0.3, 0.05, 0.05);
    expect(t.progress).toBe(0);
    expect(t.lastCode).toBe('cord.sameDirection');
    for (let i = 0; i < 200; i++) t.update(0.3, 0, 0);
    expect(t.progress).toBe(0);
    let done = false;
    for (let i = 0; i < 1000 && !done; i++) done = t.update(0.3, 0.05, -0.05) === 'done';
    expect(done).toBe(true);
  });
  it('slack strands do not twist', () => {
    const t = new TwistState();
    t.update(0.2, 0, 0);
    t.update(0.4, 0, 0);
    t.update(0.05, 0.1, -0.1);
    expect(t.lastCode).toBe('cord.tooLoose');
    expect(t.progress).toBe(0);
  });
  it('needs a full twist budget', () => {
    const t = new TwistState();
    t.update(0.2, 0, 0);
    t.update(0.4, 0, 0);
    t.update(0.3, TWIST_NEEDED / 4, -TWIST_NEEDED / 4);
    expect(t.progress).toBeCloseTo(0.5);
  });
});

describe('drag', () => {
  it('heavy things lag behind the hand and never teleport', () => {
    const d = new DragState(0, 0, 40);
    d.update(0.5, 0, 0.1);
    expect(d.x).toBeGreaterThan(0);
    expect(d.x).toBeLessThan(0.5);
    const light = new DragState(0, 0, 5);
    light.update(0.5, 0, 0.1);
    expect(light.x).toBeGreaterThan(d.x);
  });
  it('two hands pull faster; the grip slips if you run ahead', () => {
    expect(new DragState(0, 0, 40, 2).maxSpeed).toBeGreaterThan(new DragState(0, 0, 40, 1).maxSpeed);
    expect(new DragState(0, 0, 40).update(2, 0, 0.1)).toBe(false);
  });
});

describe('placement and workbench', () => {
  it('seats within tolerance', () => {
    expect(checkPlace(0.05, 0, 0, 0, SUPPORT_TOLERANCE).ok).toBe(true);
    expect(checkPlace(0.5, 0, 0, 0, SUPPORT_TOLERANCE).code).toBe('place.tooFar');
  });
  const tri = [
    { x: 0.24, z: 0 },
    { x: -0.12, z: 0.2 },
    { x: -0.12, z: -0.2 },
  ];
  it('a centred slab on three supports is stable', () => {
    expect(slabStability(tri, { x: 0, z: 0 }).stable).toBe(true);
  });
  it('names the support that is not under the slab', () => {
    const r = slabStability([tri[0], { x: -0.6, z: 0.3 }, tri[2]], { x: 0, z: 0 });
    expect(r).toEqual({ stable: false, code: 'slab.notOnSupports', support: 1 });
  });
  it('detects an off-centre slab', () => {
    const narrow = [
      { x: 0.25, z: 0.05 },
      { x: 0.25, z: -0.05 },
      { x: 0.05, z: 0 },
    ];
    const r = slabStability(narrow, { x: -0.05, z: 0 });
    expect(r.code).toBe('slab.offCentre');
    expect(Math.hypot(narrow[r.support!].x + 0.05, narrow[r.support!].z)).toBeLessThanOrEqual(SLAB_RADIUS);
  });
  it('slab before supports', () => {
    expect(slabStability([tri[0], null, null], { x: 0, z: 0 }).code).toBe('slab.beforeSupports');
  });
  it('every failure code has a message', () => {
    for (const t of Object.values(FAILURE_TEXT)) expect(t.length).toBeGreaterThan(10);
  });
});

import { Game } from '../src/game/game.js';
describe('game hooks', () => {
  it('reports failures as events and completes actions', () => {
    const g = new Game();
    const seen: string[] = [];
    g.on((e) => e.type === 'interaction' && seen.push(e.code));
    g.interactionFailure('swing.glancing');
    expect(seen).toEqual(['swing.glancing']);
    g.addItem('branch');
    g.takeOut('branch');
    expect(g.completeAction()).toBe(true);
    expect(g.count('twigs')).toBe(3);
  });
});

import { LOOK_MATERIAL, materialOf } from '../src/game/interact.js';
describe('materials', () => {
  it('logs are hard wood, stones bounce, unknown is soil', () => {
    expect(materialOf('fallenLog')).toEqual(LOOK_MATERIAL.fallenLog);
    expect(materialOf('stone').material).toBe('stone');
    expect(materialOf('???').material).toBe('soil');
    const n = new Notch();
    let blows = 0;
    while (!n.hit(strike(4.5, 0.95, 'wood', 'axe').damage, LOOK_MATERIAL.fallenLog.hardness)) blows++;
    expect(blows).toBeGreaterThanOrEqual(5);
  });
});
