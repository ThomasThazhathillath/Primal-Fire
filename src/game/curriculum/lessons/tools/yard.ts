// Lesson 04 (Tools): the Tool Yard by Split Rock, as game state. Pure: no three.js.
//
// The yard holds the lesson's physical experiments and its engineering challenge:
//   - the test bough: lift the test stone with loose fibres, then with twisted cord (tensile test);
//   - the frame ground: build a square stick frame, push it, brace it, push again (triangles);
//   - the boulder on the flint seam: lay a long pole under it, set the pivot stone, push the pole end
//     down (levers); rolling it clear of the seam is the challenge, and the seam then gives flint to a
//     hammer (a tool making a job possible that bare hands cannot do).
// It also watches knapping blows (strike angle), a digging stick turned over a fire (hardening) and which
// tools did real jobs (the tool test). Every outcome comes from the rules in engineering.ts; the yard
// reports trials to the experiment tracker and science events to the notebook. ToolYardSystem draws it
// and turns hands / mouse into these calls.

import type { Game, GameEvent } from '../../../game.js';
import type { KnapOutcome } from '../../../interact.js';
import type { ItemId } from '../../../items.js';
import {
  blowAngle,
  BOULDER_START,
  type Bracing,
  dropToRoll,
  HARDEN_RANGE,
  HARDEN_SECONDS,
  LEVER_DIR,
  leverPush,
  type LeverPush,
  MAX_PUSH,
  PIVOTS,
  type PivotId,
  FRAME_TRIAL,
  LEVER_TRIAL,
  pushForce,
  rackTest,
  ROLL_STEP,
  SEAM_CHARGES,
  SEAM_CLEAR,
  SEAM_REGROW,
  type Strand,
  strandStrength,
  TEST_LOAD,
  tensileTest,
  TIP_FORCE,
  YARD,
  YARD_NO_BUILD,
} from './engineering.js';

/** Things a lever can be made from; anything else in the hands is too short. */
const STICKS: readonly ItemId[] = ['spindle', 'branch', 'dryBranch', 'greenBranch', 'twigs', 'diggingStick'];
/** Soft things a knife cuts (the tool test). */
const KNIFE_JOBS: readonly ItemId[] = ['fibers', 'dryGrass', 'cane', 'cloth', 'vine', 'bark'];
const AXE_JOBS: readonly ItemId[] = ['logs', 'twigs', 'branch'];
const HAMMER_JOBS: readonly ItemId[] = ['dryStone', 'wetStone', 'flint', 'gravel'];

export type ToolJob = 'knife' | 'axe' | 'hammer';
export const TOOL_JOBS: readonly ToolJob[] = ['knife', 'axe', 'hammer'];

export interface FrameState {
  posts: number;
  bar: boolean;
  brace: boolean;
  /** Pushed over (a square frame folded): stand it up again with a touch. */
  folded: boolean;
}

export interface YardSave {
  v: 1;
  boulder: { x: number; z: number };
  rolls: number;
  pole: 'none' | 'set' | 'down';
  pivot: PivotId;
  frame: FrameState;
  seam: number;
  seamAt: number;
  jobs: ToolJob[];
}

export type RigResult = 'set' | 'already' | 'needPole' | 'short';
export type FrameAdd = 'post' | 'bar' | 'brace' | 'raised' | 'full' | 'needStick';

const ever = (g: Game, id: ItemId): boolean => g.gatheredCount(id) > 0 || g.count(id) > 0 || g.held === id;

export class ToolYard {
  readonly boulder = { ...BOULDER_START };
  rolls = 0;
  /** The lever pole: none yet, set under the boulder, or lying down after a roll (set it again). */
  pole: 'none' | 'set' | 'down' = 'none';
  pivot: PivotId = 'middle';
  readonly frame: FrameState = { posts: 0, bar: false, brace: false, folded: false };
  seamCharges = SEAM_CHARGES;
  seamRegrowAt = 0;
  readonly jobs = new Set<ToolJob>();
  /** Seconds the digging stick has turned over a burning fire (not saved: a short job). */
  private hardenT = 0;
  /** This push of the lever already counted as a trial (one per push). */
  private pushCounted = false;
  /** Bumped on every visible change, so the renderer only redraws when something moved. */
  version = 0;

  constructor(private readonly g: Game) {}

  // ------------------------------------------------------------ where

  /** Within the yard (where its objects can be used). */
  near(x: number, z: number, r = YARD.r): boolean {
    return Math.hypot(x - YARD.x, z - YARD.z) <= r;
  }

  /** Building outlines do not start in the yard: a pole here is a lever and a stick is a frame piece. */
  blocksBuilding(): boolean {
    return this.near(this.g.player.x, this.g.player.z, YARD_NO_BUILD);
  }

  /** The boulder has rolled clear of the flint seam (the engineering challenge). */
  seamOpen(): boolean {
    return Math.hypot(this.boulder.x - BOULDER_START.x, this.boulder.z - BOULDER_START.z) >= SEAM_CLEAR - 1e-6;
  }

  /** Rolls still needed to clear the seam. */
  rollsNeeded(): number {
    return Math.ceil(SEAM_CLEAR / ROLL_STEP);
  }

  private changed(): void {
    this.version++;
  }

  // ------------------------------------------------------------ knapping (strike angle)

  /** A knapping blow happened (CraftGestureSystem): record the strike-angle trial and crushed edges. */
  knapStrike(speed: number, edgeDistance: number, angleDeg: number, outcome: KnapOutcome): void {
    if (outcome === 'crushed') this.g.science('tool.knap.fail');
    const value = blowAngle(speed, edgeDistance, angleDeg);
    if (value && outcome !== 'nothing') this.g.experiments.trial('strikeAngle', value, outcome === 'flake' ? 'flake' : 'crushed');
  }

  // ------------------------------------------------------------ the test bough (tensile)

  /** The strand in your hand for the tensile test, or null. */
  strandInHand(): Strand | null {
    if (this.g.held === 'fibers') return 'loose';
    if (this.g.held === 'cord') return 'twisted';
    return null;
  }

  /**
   * Tie the strand you hold to the test stone and lift it clear of the ground. The strand's strength
   * against the stone's weight decides; loose fibres that snap are used up, cord that holds is kept.
   */
  liftTestStone(): 'holds' | 'snaps' | null {
    const strand = this.strandInHand();
    if (!strand) {
      this.g.toast('Hold loose fibres or cord to tie the stone on (take it out of your bag).', 'note');
      return null;
    }
    const result = tensileTest(strand);
    const holds = Math.round(strandStrength(strand));
    this.g.experiments.trial('cordStrength', strand, result);
    if (result === 'snaps') {
      this.g.spendHeld();
      this.g.science('tool.cord.snapped');
      this.g.toast(`The loose fibres snapped one by one: together they held only about ${holds} N, and the stone pulls about ${TEST_LOAD} N.`, 'bad');
    } else {
      this.g.science('tool.cord.held');
      this.g.toast(`It holds. The same fibres twisted into ${strand === 'twisted' ? 'cord' : 'a strand'} take about ${holds} N; the stone pulls about ${TEST_LOAD} N.`, 'good');
    }
    this.g.fx(result === 'snaps' ? 'snap' : 'strain', 0.6);
    this.changed();
    return result;
  }

  // ------------------------------------------------------------ the frame ground (triangles)

  /** The frame's bracing, or null while it is not yet a frame (two posts and a top bar). */
  bracing(): Bracing | null {
    const f = this.frame;
    if (f.posts < 2 || !f.bar) return null;
    return f.brace ? 'diagonal' : 'none';
  }

  /** Set the next frame piece from a straight stick you hold (or carry), or stand a folded frame up. */
  addFramePiece(): FrameAdd {
    const f = this.frame;
    if (f.folded) {
      f.folded = false;
      this.g.toast('You stand the frame up again.', 'info');
      this.changed();
      return 'raised';
    }
    if (f.posts >= 2 && f.bar && f.brace) return 'full';
    const fromHand = this.g.held === 'spindle';
    if (!fromHand && this.g.count('spindle') <= 0) {
      this.g.toast('The frame is built from straight sticks: bring one (snap a dry branch, or pick one up).', 'note');
      return 'needStick';
    }
    if (fromHand) this.g.spendHeld();
    else this.g.addItem('spindle', -1);
    let piece: FrameAdd;
    if (f.posts < 2) {
      f.posts++;
      piece = 'post';
    } else if (!f.bar) {
      f.bar = true;
      piece = 'bar';
    } else {
      f.brace = true;
      piece = 'brace';
    }
    this.g.fx('seat', 0.5);
    this.g.toast(
      piece === 'post'
        ? `Post ${f.posts} of 2 lashed upright.`
        : piece === 'bar'
          ? 'Top bar lashed on: a square frame. Push its top to test it.'
          : 'Diagonal brace lashed across: two triangles. Push it again.',
      'good',
    );
    this.changed();
    return piece;
  }

  /** Push the top of the frame sideways by `sideways` metres of hand travel. */
  pushFrame(sideways: number): 'folds' | 'holds' | null {
    const bracing = this.bracing();
    if (!bracing || this.frame.folded || Math.abs(sideways) < FRAME_TRIAL) return null;
    const result = rackTest(bracing, pushForce(sideways));
    this.g.experiments.trial('frameBracing', bracing, result);
    if (result === 'folds') {
      this.frame.folded = true;
      this.g.science('build.frame.racked');
      this.g.fx('creak', 0.7);
      this.g.toast('The square leaned into a slanted shape and folded flat. No stick bent: the joints turned like hinges.', 'bad');
    } else {
      this.g.science('build.frame.braced');
      this.g.fx('strain', 0.5);
      this.g.toast('The braced frame stood firm: a triangle cannot change shape without a stick breaking.', 'good');
    }
    this.changed();
    return result;
  }

  // ------------------------------------------------------------ the lever

  /** Lay the lever: the pole you hold goes under the boulder's edge, over the pivot stone. */
  rigLever(): RigResult {
    if (this.pole === 'set') return 'already';
    if (this.pole === 'down') {
      this.pole = 'set';
      this.g.toast('You slide the pole back under the boulder.', 'info');
      this.changed();
      return 'set';
    }
    const held = this.g.held;
    if (held === 'pole') {
      this.g.spendHeld();
      this.pole = 'set';
      this.g.toast('The pole lies over the pivot stone with its tip under the boulder. Push the far end down.', 'good');
      this.changed();
      return 'set';
    }
    if (held && STICKS.includes(held)) {
      this.g.toast('Too short to lever with: a lever needs a long pole (a dead sapling).', 'bad');
      return 'short';
    }
    this.g.toast(`Far too heavy to shift by hand: tipping it takes about ${TIP_FORCE} N, and your best shove is about ${MAX_PUSH} N. Bring a long pole.`, 'bad');
    this.g.fx('strain', 0.8);
    return 'needPole';
  }

  /** Move the pivot stone to a mark. */
  setPivot(id: PivotId): void {
    if (this.pivot === id) return;
    this.pivot = id;
    const p = PIVOTS.find((x) => x.id === id)!;
    this.g.toast(`Pivot stone moved ${p.name}.`, 'info');
    this.g.fx('seat', 0.4);
    this.changed();
  }

  /** A new push of the pole end begins (one trial per push). */
  beginPush(): boolean {
    this.pushCounted = false;
    return this.pole === 'set';
  }

  /**
   * The pole end is pushed `handDrop` metres down. Reports the trial once the push is a real one, and rolls
   * the boulder when its edge rises far enough. Returns the rule's result for the renderer.
   */
  push(handDrop: number): LeverPush | null {
    if (this.pole !== 'set') return null;
    const r = leverPush(this.pivot, handDrop);
    if (!this.pushCounted && handDrop >= LEVER_TRIAL) {
      this.pushCounted = true;
      if (this.pivot !== 'middle') this.g.experiments.trial('leverPivot', this.pivot, r.moves ? 'moves' : 'stuck');
      if (!r.moves) {
        this.g.science('tool.lever.stuck');
        this.g.fx('strain', 1);
        this.g.toast(`It will not move: from here the boulder needs about ${Math.round(r.effort)} N of push, and you can give about ${MAX_PUSH} N.`, 'bad');
      } else {
        this.g.toast(`It lifts! With the pivot here about ${Math.round(r.effort)} N is enough. Keep pushing down.`, 'good');
      }
    }
    if (r.rolls) this.roll();
    return r;
  }

  /** How far (m) the pole end must go down to roll the boulder with the pivot where it is. */
  dropNeeded(): number {
    return dropToRoll(this.pivot);
  }

  private roll(): void {
    const wasOpen = this.seamOpen();
    this.boulder.x -= LEVER_DIR.x * ROLL_STEP;
    this.boulder.z -= LEVER_DIR.z * ROLL_STEP;
    this.rolls++;
    this.pole = 'down';
    this.g.science('tool.lever.used');
    this.g.fx('thud', 1);
    if (!wasOpen && this.seamOpen()) {
      this.g.toast('The boulder rolled clear. Under it: a seam of dark, glassy flint.', 'good');
    } else {
      this.g.toast(`The boulder rolls over. ${this.seamOpen() ? '' : 'Set the pole under it again and roll it once more.'}`.trim(), 'good');
    }
    this.changed();
  }

  // ------------------------------------------------------------ the flint seam

  /** Break a flint nodule out of the uncovered seam: it needs a hammer. */
  takeFlint(): boolean {
    if (!this.seamOpen()) return false;
    const hammer = this.g.held === 'hammer' || this.g.count('hammer') > 0;
    if (!hammer) {
      this.g.toast('The nodules are locked in hard rock. Your hands cannot break them out: you need a hammer.', 'bad');
      return false;
    }
    if (this.seamCharges <= 0) {
      this.g.toast('No loose nodules left for now. Come back later.', 'note');
      return false;
    }
    if (!this.g.gather('flint', 'flintSeam')) return false;
    this.seamCharges--;
    if (this.seamRegrowAt <= 0) this.seamRegrowAt = this.g.time + SEAM_REGROW;
    this.jobs.add('hammer');
    this.g.fx('knap', 0.6);
    this.changed();
    return true;
  }

  // ------------------------------------------------------------ the tool test

  /** Something was gathered (Game.gather): a tool doing its job counts for the tool test. */
  gathered(item: ItemId, tool: ItemId | null): void {
    const held = this.g.held;
    const used = (t: ItemId, jobs: readonly ItemId[]) => (tool === t || held === t) && jobs.includes(item);
    if (used('knife', KNIFE_JOBS)) this.jobs.add('knife');
    if (used('axe', AXE_JOBS)) this.jobs.add('axe');
    if (used('hammer', HAMMER_JOBS)) this.jobs.add('hammer');
  }

  /** Lesson 04 events this yard listens to. */
  observe(e: GameEvent): void {
    if (e.type === 'gather') this.gathered(e.item, e.tool);
  }

  // ------------------------------------------------------------ the slow step (4 Hz)

  tick(dt: number): void {
    const g = this.g;
    // A full set of hafted tools.
    if (!g.hasEvent('tool.kit.made') && ever(g, 'knife') && ever(g, 'axe') && ever(g, 'hammer')) g.science('tool.kit.made');
    // A digging stick turned over a burning fire dries and hardens at the point.
    if (g.held === 'diggingStick' && !g.hasEvent('tool.point.hardened') && g.fire.stage === 'burning') {
      const pit = g.structures.find((s) => s.kind === 'firePit' && s.complete && Math.hypot(s.x - g.player.x, s.z - g.player.z) <= HARDEN_RANGE);
      if (pit && (this.hardenT += dt) >= HARDEN_SECONDS) {
        g.science('tool.point.hardened');
        g.toast('The point has dried over the heat: it is harder and stiffer now.', 'good');
      }
    }
    if (this.seamRegrowAt > 0 && g.time >= this.seamRegrowAt) {
      this.seamCharges = Math.min(SEAM_CHARGES, this.seamCharges + 1);
      this.seamRegrowAt = this.seamCharges < SEAM_CHARGES ? g.time + SEAM_REGROW : 0;
      this.changed();
    }
  }

  // ------------------------------------------------------------ save / load

  snapshot(): YardSave {
    return {
      v: 1,
      boulder: { ...this.boulder },
      rolls: this.rolls,
      pole: this.pole,
      pivot: this.pivot,
      frame: { ...this.frame },
      seam: this.seamCharges,
      seamAt: this.seamRegrowAt,
      jobs: [...this.jobs],
    };
  }

  /** Restore saved yard state; older saves have none (the yard starts as the world made it). */
  restore(s: YardSave | undefined): void {
    if (!s || s.v !== 1) return;
    if (Number.isFinite(s.boulder?.x) && Number.isFinite(s.boulder?.z)) Object.assign(this.boulder, { x: s.boulder.x, z: s.boulder.z });
    this.rolls = Math.max(0, s.rolls | 0);
    this.pole = s.pole === 'set' || s.pole === 'down' ? s.pole : 'none';
    this.pivot = PIVOTS.some((p) => p.id === s.pivot) ? s.pivot : 'middle';
    const f = s.frame ?? { posts: 0, bar: false, brace: false, folded: false };
    Object.assign(this.frame, { posts: Math.max(0, Math.min(2, f.posts | 0)), bar: !!f.bar, brace: !!f.brace, folded: !!f.folded });
    this.seamCharges = Math.max(0, Math.min(SEAM_CHARGES, s.seam ?? SEAM_CHARGES));
    this.seamRegrowAt = s.seamAt ?? 0;
    this.jobs.clear();
    for (const j of s.jobs ?? []) if (TOOL_JOBS.includes(j)) this.jobs.add(j);
    this.changed();
  }
}
