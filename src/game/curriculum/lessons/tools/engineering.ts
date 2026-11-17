// Lesson 04 (Tools): the engineering rules, pure and unit-tested (tests/tools-lesson.test.ts).
//
// Everything the Tool Yard experiments decide comes from these functions, fed with what the player
// actually did (a blow's speed and angle, which strand they tied on, where the pivot stone sits, whether
// the frame has a brace). Numbers are rough teaching values (docs/SCIENCE.md: rule of thumb); the ideas
// behind them are textbook: conchoidal fracture needs an angled blow near an edge, twisted fibres share a
// load by friction, effort x effort arm = load x load arm, and a triangle cannot change shape.

import { KNAP_ANGLE, KNAP_EDGE, KNAP_MAX, KNAP_MIN } from '../../../interact.js';

// ------------------------------------------------------------------ the yard

/** The Tool Yard, on the north side of Split Rock (world-layout.ts landmark `splitRock`). */
export const YARD = { x: -4, z: 22.4, r: 6 };
/** No building outlines start this close to the yard centre (a held pole is a lever here, not a lean-to). */
export const YARD_NO_BUILD = 4.5;
/** Where the boulder lies at first: on top of a seam of good flint. */
export const BOULDER_START = { x: -5.6, z: 23 };
export const BOULDER_R = 0.5;
/** Unit vector from the boulder toward the free end of the lever (east). The boulder rolls the other way. */
export const LEVER_DIR = { x: 1, z: 0 };
/** The test bough (tensile test) and the frame-test ground. */
export const BOUGH = { x: -1.7, z: 21.6 };
export const FRAME_SPOT = { x: -3.6, z: 20.6 };

// ------------------------------------------------------------- strike angle

export type BlowAngle = 'angled' | 'square';

/**
 * Which value of the strike-angle experiment a knapping blow was, or null when it was not a fair trial:
 * too soft, too hard or away from the edge (then something other than the angle decided the outcome).
 * `edgeDistance` is the distance the knap rule judged (after any assistance scaling).
 */
export function blowAngle(speed: number, edgeDistance: number, angleDeg: number): BlowAngle | null {
  if (speed < KNAP_MIN || speed > KNAP_MAX || edgeDistance > KNAP_EDGE) return null;
  if (angleDeg < KNAP_ANGLE[0]) return null; // a skimming blow: neither of the two angles compared
  return angleDeg > KNAP_ANGLE[1] ? 'square' : 'angled';
}

// ----------------------------------------------------------- tensile test

export type Strand = 'loose' | 'twisted';

/** Breaking load (N) of one plant fibre, and fibres in a strand: rough teaching values. */
export const FIBRE_BREAK = 1.8;
export const STRAND_FIBRES = 30;
/**
 * Share of the fibres that carry a pull together. Loose, the tightest few take it first and snap, and short
 * fibres slide past each other. Twisted, friction between them passes the load along so most share it
 * (a little less than all: the twist tilts each fibre off the line of pull).
 */
export const LOAD_SHARE: Record<Strand, number> = { loose: 0.15, twisted: 0.75 };
/** The test stone: about 2 kg, so about 20 N of weight. */
export const TEST_LOAD = 20;

export function strandStrength(s: Strand): number {
  return FIBRE_BREAK * STRAND_FIBRES * LOAD_SHARE[s];
}

export function tensileTest(s: Strand, load = TEST_LOAD): 'holds' | 'snaps' {
  return strandStrength(s) >= load ? 'holds' : 'snaps';
}

/** How far (m) the stone must be lifted before the strand carries its full weight. */
export const LIFT_NEEDED = 0.1;

// ------------------------------------------------------------------- levers

export type PivotId = 'near' | 'middle' | 'far';

/** Length (m) of the lever pole. */
export const POLE_LENGTH = 2;
/** Where the pivot stone can sit: its distance (m) from the pole's tip under the boulder (the load arm). */
export const PIVOTS: ReadonlyArray<{ id: PivotId; arm: number; name: string }> = [
  { id: 'near', arm: 0.3, name: 'close to the boulder' },
  { id: 'middle', arm: 1, name: 'in the middle' },
  { id: 'far', arm: 1.6, name: 'close to your hands' },
];
export const pivotArm = (id: PivotId): number => PIVOTS.find((p) => p.id === id)!.arm;
/** Force (N) needed at the boulder's edge to tip it over: about half its weight (a boulder of roughly 140 kg). */
export const TIP_FORCE = 700;
/** The hardest push (N) a person gives, leaning their weight on a pole or shoving with both hands. */
export const MAX_PUSH = 250;
/** How high (m) the edge must rise before the boulder rolls over, and how far (m) one roll moves it. */
export const ROLL_LIFT = 0.06;
export const ROLL_STEP = 0.7;
/** The boulder has rolled clear of the flint seam once it is this far (m) from where it lay. */
export const SEAM_CLEAR = 1.2;
/** A push of the pole end at least this far down (m) is a real attempt (a trial). */
export const LEVER_TRIAL = 0.08;

/** Effort (N) at the pole end to lift `load` at the tip: effort x effort arm = load x load arm. */
export function leverEffort(loadArm: number, length = POLE_LENGTH, load = TIP_FORCE): number {
  const effortArm = Math.max(0.05, length - loadArm);
  return (load * loadArm) / effortArm;
}

/** Can the boulder be tipped with the pivot here? */
export function leverMoves(pivot: PivotId): boolean {
  return leverEffort(pivotArm(pivot)) <= MAX_PUSH;
}

export interface LeverPush {
  /** The pole end goes down (false: the boulder is too heavy from here and nothing moves). */
  moves: boolean;
  /** Effort (N) this pivot position needs. */
  effort: number;
  /** How far (m) the pole end is down (0 when stuck), and how high the boulder edge rose. */
  drop: number;
  lift: number;
  /** The edge rose far enough: the boulder rolls over. */
  rolls: boolean;
}

/**
 * Pushing the free end of the pole down by `handDrop` metres. The pole turns about the pivot: the end
 * travels the effort arm, the tip the load arm, so the edge rises handDrop x loadArm / effortArm. If the
 * effort needed is more than a person can push, the pole does not move at all.
 */
export function leverPush(pivot: PivotId, handDrop: number): LeverPush {
  const loadArm = pivotArm(pivot);
  const effort = leverEffort(loadArm);
  if (effort > MAX_PUSH) return { moves: false, effort, drop: 0, lift: 0, rolls: false };
  const drop = Math.max(0, handDrop);
  const lift = (drop * loadArm) / (POLE_LENGTH - loadArm);
  return { moves: true, effort, drop, lift, rolls: lift >= ROLL_LIFT };
}

/** Hand drop (m) needed to roll the boulder with this pivot (Infinity when it cannot be done). */
export function dropToRoll(pivot: PivotId): number {
  const a = pivotArm(pivot);
  return leverMoves(pivot) ? (ROLL_LIFT * (POLE_LENGTH - a)) / a : Infinity;
}

// ------------------------------------------------------------------- frames

export type Bracing = 'none' | 'diagonal';

/** Sideways force (N) the friction in lashed joints alone resists: a little. */
export const JOINT_HOLD = 15;
/** Sideways force (N) a braced stick frame takes before a stick buckles or a lashing gives. */
export const BRACE_LIMIT = 600;
/** Push force per metre a hand moves the frame top sideways (a stiff spring model). */
export const PUSH_STIFFNESS = 500;
/** A push moving the hand at least this far (m) sideways is a real test. */
export const FRAME_TRIAL = 0.06;

/**
 * Push test of an upright stick frame. Lashed joints act like hinges, so a four-sided frame can lean into a
 * parallelogram without any stick bending: it folds. A diagonal brace splits it into triangles, and a
 * triangle's shape is fixed by its side lengths: it stands.
 */
export function rackTest(bracing: Bracing, push: number): 'folds' | 'holds' {
  if (bracing === 'none') return push > JOINT_HOLD ? 'folds' : 'holds';
  return push > BRACE_LIMIT ? 'folds' : 'holds';
}

export const pushForce = (sideways: number): number => Math.abs(sideways) * PUSH_STIFFNESS;

/** Pieces of the test frame, in building order: two posts, the top bar, then (to compare) a diagonal brace. */
export const FRAME_PIECES = ['post', 'post', 'bar', 'brace'] as const;

// ------------------------------------------------------------------ hardening

/** Seconds a digging stick must turn over a burning fire, and how close (m) to the pit. */
export const HARDEN_SECONDS = 6;
export const HARDEN_RANGE = 1.8;

// ------------------------------------------------------------------ the seam

/** Flint nodules in the uncovered seam, and seconds for one to be worked loose again. */
export const SEAM_CHARGES = 3;
export const SEAM_REGROW = 120;
