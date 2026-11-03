// Physical hand interactions as pure rules. The input layer (hand-input-system)
// turns tracked hands, controllers or the desktop mouse into the numbers these
// functions take; the interaction system renders the result. Nothing here
// knows about three.js, so every threshold is unit-tested.
//
// Design rule: hand movement, force direction, contact and release decide the
// outcome. Nothing completes on a timer or a single click, and small motions
// never finish an action (seated play: short wrist movements still count, but
// they must be deliberate).

import type { ItemId } from './items.js';

/**
 * Why an attempt failed. Emitted as `{ type: 'interaction', code }` events so
 * the guide system can explain what went wrong.
 */
export type GuideFailureCode =
  | 'grab.tooHeavy'
  | 'bend.notEnough'
  | 'bend.green'
  | 'bend.released'
  | 'swing.weak'
  | 'swing.glancing'
  | 'swing.stone'
  | 'swing.soil'
  | 'knap.tooSoft'
  | 'knap.tooHard'
  | 'knap.offEdge'
  | 'knap.badAngle'
  | 'knap.coreSpent'
  | 'cord.tooLoose'
  | 'cord.sameDirection'
  | 'cord.notSplit'
  | 'drag.tooHeavy'
  | 'place.tooFar'
  | 'place.blocked'
  | 'support.tooFar'
  | 'slab.beforeSupports'
  | 'slab.notOnSupports'
  | 'slab.offCentre'
  | 'bench.wrongMotion'
  | 'bench.missingParts';

// ------------------------------------------------------------------ grab

export type Hand = 0 | 1; // 0 = left, 1 = right

/** Max mass (kg) you can lift with one hand / both hands. Heavier things are dragged. */
export const ONE_HAND_LIFT = 3;
export const TWO_HAND_LIFT = 12;

export type GrabEvent = { kind: 'grab'; hand: Hand; target: string } | { kind: 'release'; hand: Hand; target: string } | null;

/**
 * Tracks what each hand holds. A grab happens on the frame the grip closes
 * while a target is in reach; release on the frame it opens. Holding a grip
 * closed and then moving onto something does not grab it (no accidental pickups).
 */
export class GrabTracker {
  readonly held: [string | null, string | null] = [null, null];
  private wasGripping: [boolean, boolean] = [false, false];

  update(hand: Hand, gripping: boolean, candidate: string | null): GrabEvent {
    const was = this.wasGripping[hand];
    this.wasGripping[hand] = gripping;
    if (gripping && !was && candidate && !this.held[hand]) {
      this.held[hand] = candidate;
      return { kind: 'grab', hand, target: candidate };
    }
    if (!gripping && was && this.held[hand]) {
      const target = this.held[hand]!;
      this.held[hand] = null;
      return { kind: 'release', hand, target };
    }
    return null;
  }

  /** Both hands hold the same thing. */
  twoHanded(target: string): boolean {
    return this.held[0] === target && this.held[1] === target;
  }

  /** Can this mass be lifted with the hands currently on it? */
  static canLift(mass: number, hands: number): boolean {
    return mass <= (hands >= 2 ? TWO_HAND_LIFT : ONE_HAND_LIFT);
  }

  clear(): void {
    this.held[0] = this.held[1] = null;
  }
}

// ------------------------------------------------------------- branch snap

/**
 * Wood toughness: how much sustained bending (rad·s beyond the yield angle)
 * a piece takes to break. Green wood is elastic: it never snaps.
 */
export const TOUGHNESS: Partial<Record<ItemId, number>> = {
  twigs: 0.15,
  dryBranch: 0.55,
  branch: 0.7,
  spindle: 0.9,
  greenBranch: Infinity,
};

/** Bend angle (rad) at which wood starts to take damage instead of springing back. */
export const BEND_YIELD = 0.35;
/** Bend angle at which a dry branch is fully loaded (more bend adds stress faster). */
export const BEND_MAX = 1.1;
/** Stress lost per second while you ease off (wood partly recovers). */
export const BEND_RECOVER = 0.15;

export type BendEvent = 'creak' | 'crack' | 'snap' | null;

/**
 * Two-hand snap. `angle` is how far the hands have bent the piece from
 * straight (each wrist rotated against the other, or the ends pushed down
 * around the thumbs). Below the yield angle the wood just flexes; above it,
 * stress builds with time and with how far past yield you are. Two cracks
 * come first, then the snap. Easing off lets stress fall again.
 */
export class BendState {
  stress = 0;
  cracks = 0;
  snapped = false;
  /** 0..1 visual flex (how bent the mesh should look). */
  flex = 0;
  private creakTimer = 0;

  constructor(readonly toughness: number) {}

  update(angle: number, dt: number): BendEvent {
    if (this.snapped || dt <= 0) return null;
    const a = Math.max(0, angle);
    this.flex = Math.min(1, a / BEND_MAX);
    if (!Number.isFinite(this.toughness)) return null; // green wood only flexes
    const over = a - BEND_YIELD;
    if (over > 0) {
      this.stress += (over / (BEND_MAX - BEND_YIELD)) * (dt / this.toughness);
    } else {
      this.stress = Math.max(0, this.stress - BEND_RECOVER * dt);
    }
    const crackAt = Math.floor(Math.min(this.stress, 0.999) * 3);
    if (this.stress >= 1) {
      this.snapped = true;
      return 'snap';
    }
    if (crackAt > this.cracks) {
      this.cracks = crackAt;
      return 'crack';
    }
    if (over > 0 && (this.creakTimer -= dt) <= 0) {
      this.creakTimer = 0.35;
      return 'creak';
    }
    return null;
  }

  /** Why letting go now did not snap it. */
  releaseCode(): GuideFailureCode | null {
    if (this.snapped) return null;
    if (!Number.isFinite(this.toughness)) return 'bend.green';
    return this.stress > 0.05 ? 'bend.released' : 'bend.notEnough';
  }
}

// ------------------------------------------------------------------ swing

export type Material = 'wood' | 'stone' | 'soil';

/** Head speed (m/s) below which a blow does nothing useful; above STRONG it bites deep. */
export const SWING_WEAK = 1.6;
export const SWING_STRONG = 3.2;
/** Cosine between head velocity and the blade's cutting direction below which a blow glances off. */
export const SWING_ALIGN = 0.55;

/**
 * Speed of a tool head from the wrist: linear wrist speed plus angular
 * speed times the handle length. Short wrist flicks count (seated play).
 */
export function headSpeed(wristSpeed: number, angularSpeed: number, lever: number): number {
  return wristSpeed + Math.abs(angularSpeed) * lever;
}

export interface StrikeResult {
  outcome: 'chop' | 'weak' | 'glance' | 'bounce' | 'thud';
  /** Damage dealt to the target (0..1 of a notch per blow). */
  damage: number;
  code: GuideFailureCode | null;
  /** 0..1, for haptics and camera kick. */
  jolt: number;
}

/**
 * One blow of an axe (or hammer) head. `align` is the cosine between the head
 * velocity and the blade's cutting direction (1 = edge-on, 0 = flat or sideways).
 */
export function strike(speed: number, align: number, material: Material, tool: ItemId): StrikeResult {
  const jolt = Math.min(1, speed / 5);
  if (material === 'stone') return { outcome: 'bounce', damage: 0, code: 'swing.stone', jolt: Math.min(1, jolt + 0.4) };
  if (material === 'soil') return { outcome: 'thud', damage: 0, code: 'swing.soil', jolt: jolt * 0.5 };
  if (speed < SWING_WEAK) return { outcome: 'weak', damage: 0, code: 'swing.weak', jolt: jolt * 0.5 };
  if (align < SWING_ALIGN) return { outcome: 'glance', damage: 0.02, code: 'swing.glancing', jolt };
  const edge = tool === 'axe' ? 1 : tool === 'hammer' ? 0.3 : 0.5;
  // Damage grows with speed (energy ~ v^2, tempered) and with a clean edge-on hit.
  const power = Math.min(1, (speed - SWING_WEAK) / (SWING_STRONG * 1.5 - SWING_WEAK));
  const damage = edge * (0.12 + 0.28 * power) * (0.6 + 0.4 * align);
  return { outcome: 'chop', damage, code: null, jolt };
}

/** How far (m) from the middle of a target a blow still counts at all, and where it starts to lose force. */
export const HIT_RADIUS = 0.3;
export const HIT_SWEET = 0.1;

/**
 * Force kept by where the head landed: all of it near the middle of the
 * target, falling to 40% at the edge of reach (a glancing graze).
 */
export function impactQuality(lateral: number): number {
  if (lateral >= HIT_RADIUS) return 0;
  if (lateral <= HIT_SWEET) return 1;
  return 1 - 0.6 * ((lateral - HIT_SWEET) / (HIT_RADIUS - HIT_SWEET));
}

/**
 * Edge alignment of a hand-swung blow from the tool head's velocity. `down` is
 * the component of travel along the blade's cutting direction (negative =
 * an upward flick, which never cuts); `side` is the component along the blade
 * flat (a slap with the flat of the head loses up to 60%).
 */
export function bladeAlign(down: number, side: number): number {
  if (down <= 0) return 0;
  return down * (1 - 0.6 * Math.min(1, Math.abs(side)));
}

/** A notch cut into wood by repeated blows; the piece splits or falls at depth 1. */
export class Notch {
  depth = 0;
  blows = 0;

  /** Returns true when this blow finished the cut. */
  hit(damage: number, hardness = 1): boolean {
    if (this.depth >= 1 || damage <= 0) return false;
    this.blows++;
    this.depth = Math.min(1, this.depth + damage / hardness);
    return this.depth >= 1;
  }
}

// ------------------------------------------------------------------ knapping

/** Strike speed range (m/s) that detaches a flake. */
export const KNAP_MIN = 1.0;
export const KNAP_MAX = 3.6;
/** Distance (m) from the core's edge within which a blow can detach a flake. */
export const KNAP_EDGE = 0.02;
/** Best platform angles (degrees between blow and striking platform). */
export const KNAP_ANGLE: [number, number] = [45, 80];

export type KnapOutcome = 'flake' | 'crushed' | 'nothing';

export interface KnapResult {
  outcome: KnapOutcome;
  code: GuideFailureCode | null;
}

/**
 * One hammerstone blow on a core. Flint breaks in a cone (conchoidal
 * fracture) when struck near an edge at an acute angle with moderate force;
 * hit too hard and the edge crushes, too far in and the force just spreads.
 */
export function knap(speed: number, edgeDistance: number, angleDeg: number): KnapResult {
  if (speed < KNAP_MIN) return { outcome: 'nothing', code: 'knap.tooSoft' };
  if (edgeDistance > KNAP_EDGE) return { outcome: 'nothing', code: 'knap.offEdge' };
  if (speed > KNAP_MAX) return { outcome: 'crushed', code: 'knap.tooHard' };
  if (angleDeg < KNAP_ANGLE[0] || angleDeg > KNAP_ANGLE[1]) return { outcome: 'crushed', code: 'knap.badAngle' };
  return { outcome: 'flake', code: null };
}

/** A flint core yields a few flakes, then is spent. */
export class Core {
  constructor(public flakesLeft = 4) {}

  strike(speed: number, edgeDistance: number, angleDeg: number): KnapResult {
    if (this.flakesLeft <= 0) return { outcome: 'nothing', code: 'knap.coreSpent' };
    const r = knap(speed, edgeDistance, angleDeg);
    if (r.outcome === 'flake') this.flakesLeft--;
    return r;
  }
}

// ------------------------------------------------------------------ cordage

/** Hands must pull fibres this far apart (m) to split them into strands. */
export const SPLIT_PULL = 0.18;
/** Minimum separation (m) to keep the strands under tension while twisting. */
export const TWIST_MIN_SEP = 0.1;
/** Total counter-rotation (rad, summed over both wrists) that makes one cord. */
export const TWIST_NEEDED = Math.PI * 6;
/** Per-frame wrist roll below this (rad) is tremor, not twisting. */
const ROLL_NOISE = 0.002;

export type TwistEvent = 'split' | 'progress' | 'done' | null;

/**
 * Fibre to cord: first pull the bundle apart into strands (two-hand pull),
 * then twist with the wrists rolling in OPPOSITE directions while keeping the
 * strands taut. Same-direction roll just spins the bundle; slack hands do nothing.
 */
export class TwistState {
  split = false;
  progress = 0;
  lastCode: GuideFailureCode | null = null;
  private startSep = -1;
  private sameDir = 0;

  /** `sep` = hand separation (m); `dRollL/R` = this frame's wrist roll about the strand (rad). */
  update(sep: number, dRollL: number, dRollR: number): TwistEvent {
    this.lastCode = null;
    if (this.startSep < 0) this.startSep = sep;
    if (!this.split) {
      if (sep - this.startSep >= SPLIT_PULL) {
        this.split = true;
        return 'split';
      }
      if (Math.abs(dRollL) > ROLL_NOISE || Math.abs(dRollR) > ROLL_NOISE) this.lastCode = 'cord.notSplit';
      return null;
    }
    if (this.progress >= 1) return null;
    const l = Math.abs(dRollL) > ROLL_NOISE ? dRollL : 0;
    const r = Math.abs(dRollR) > ROLL_NOISE ? dRollR : 0;
    if (!l && !r) return null;
    if (sep < TWIST_MIN_SEP) {
      this.lastCode = 'cord.tooLoose';
      return null;
    }
    if (l && r && Math.sign(l) === Math.sign(r)) {
      this.sameDir += Math.min(Math.abs(l), Math.abs(r));
      if (this.sameDir > 0.6) this.lastCode = 'cord.sameDirection';
      return null;
    }
    // One wrist rolling alone still twists (the other hand anchors), at half value.
    const amount = l && r ? Math.abs(l) + Math.abs(r) : (Math.abs(l) + Math.abs(r)) * 0.5;
    this.progress = Math.min(1, this.progress + amount / TWIST_NEEDED);
    return this.progress >= 1 ? 'done' : 'progress';
  }
}

// ------------------------------------------------------------------ drag

/** Pull force (N-ish) a hand can apply; heavier objects follow slower. */
export const PULL = 85;
/** If the hand gets this far (m) ahead of a dragged object, it slips out of your grip. */
export const DRAG_SLIP = 1.2;

/**
 * Dragging something too heavy to lift: it slides on the ground toward the
 * hand with lag set by its mass, and never leaves the ground.
 */
export class DragState {
  constructor(
    public x: number,
    public z: number,
    readonly mass: number,
    public hands = 1,
  ) {}

  /** Max ground speed (m/s) for this mass and number of hands. */
  get maxSpeed(): number {
    return Math.min(2.5, (PULL * this.hands) / Math.max(1, this.mass) / 4);
  }

  /** Moves toward the hand's ground point; returns false when the grip slips. */
  update(hx: number, hz: number, dt: number): boolean {
    const dx = hx - this.x;
    const dz = hz - this.z;
    const d = Math.hypot(dx, dz);
    if (d > DRAG_SLIP) return false;
    if (d < 1e-4) return true;
    const step = Math.min(d, this.maxSpeed * dt);
    this.x += (dx / d) * step;
    this.z += (dz / d) * step;
    return true;
  }

  /** 0..1 strain on the grip, for sound and hand feedback. */
  strain(hx: number, hz: number): number {
    return Math.min(1, Math.hypot(hx - this.x, hz - this.z) / DRAG_SLIP);
  }
}

// --------------------------------------------------------------- placement

export interface PlaceCheck {
  ok: boolean;
  code: GuideFailureCode | null;
  /** Distance (m) from the intended spot. */
  error: number;
}

/** Releasing a held part near a snap spot: within `tolerance` it seats there. */
export function checkPlace(x: number, z: number, spotX: number, spotZ: number, tolerance: number): PlaceCheck {
  const error = Math.hypot(x - spotX, z - spotZ);
  return error <= tolerance ? { ok: true, code: null, error } : { ok: false, code: 'place.tooFar', error };
}

// --------------------------------------------------------------- workbench

export interface Point {
  x: number;
  z: number;
}

/** How far (m) a support can sit from its marked spot and still count. */
export const SUPPORT_TOLERANCE = 0.18;
/** The slab's footprint radius (m): every support must be under it. */
export const SLAB_RADIUS = 0.34;

export interface Stability {
  stable: boolean;
  code: GuideFailureCode | null;
  /** Index of the support at fault, when one is. */
  support: number | null;
}

/** Is p inside triangle abc (on the ground plane)? */
export function inTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const s = (p1: Point, p2: Point, p3: Point) => (p1.x - p3.x) * (p2.z - p3.z) - (p2.x - p3.x) * (p1.z - p3.z);
  const d1 = s(p, a, b);
  const d2 = s(p, b, c);
  const d3 = s(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * The push test: a slab is stable when every support is under it and its
 * centre sits inside the triangle the three supports make. The result names
 * the first support that is not doing its job.
 */
export function slabStability(supports: readonly (Point | null)[], slab: Point): Stability {
  if (supports.length < 3 || supports.some((s) => !s)) {
    const missing = supports.findIndex((s) => !s);
    return { stable: false, code: 'slab.beforeSupports', support: missing < 0 ? supports.length : missing };
  }
  const [a, b, c] = supports as Point[];
  let worst = -1;
  let worstD = SLAB_RADIUS;
  supports.forEach((s, i) => {
    const d = Math.hypot(s!.x - slab.x, s!.z - slab.z);
    if (d > worstD) {
      worstD = d;
      worst = i;
    }
  });
  if (worst >= 0) return { stable: false, code: 'slab.notOnSupports', support: worst };
  if (!inTriangle(slab, a, b, c)) {
    // The support farthest from the centre leaves the biggest gap on the other side.
    let far = 0;
    let farD = -1;
    supports.forEach((s, i) => {
      const d = Math.hypot(s!.x - slab.x, s!.z - slab.z);
      if (d > farD) {
        farD = d;
        far = i;
      }
    });
    return { stable: false, code: 'slab.offCentre', support: far };
  }
  return { stable: true, code: null, support: null };
}

/** Human names for supports in failure messages. */
export const SUPPORT_NAMES = ['first', 'second', 'third'];

/** Plain-language explanation for a failure code (the guide system can override). */
export const FAILURE_TEXT: Record<GuideFailureCode, string> = {
  'grab.tooHeavy': 'Too heavy to lift - use both hands, or drag it.',
  'bend.notEnough': 'Bend it further: wood has to pass its limit before it breaks.',
  'bend.green': 'Green wood just bends - it is full of water and flexible fibres. Use dead, dry wood.',
  'bend.released': 'You eased off: the fibres were cracking. Keep the bend on until it snaps.',
  'swing.weak': 'Too slow - swing faster so the head carries more energy.',
  'swing.glancing': 'The blade glanced off - hit with the edge, straight into the wood.',
  'swing.stone': 'The head bounced off stone - that only blunts your axe.',
  'swing.soil': 'Thud - soil just swallows the blow.',
  'knap.tooSoft': 'Too gentle - strike with more force.',
  'knap.tooHard': 'Too hard - the edge crushed instead of flaking.',
  'knap.offEdge': 'Strike near the edge - force in the middle just spreads out.',
  'knap.badAngle': 'Hit the edge at a sharper angle (less than 90 degrees to the platform).',
  'knap.coreSpent': 'This core is used up - find another flint nodule.',
  'cord.tooLoose': 'Keep the strands taut - pull your hands apart while you twist.',
  'cord.sameDirection': 'Twist your wrists in opposite directions, like wringing a cloth.',
  'cord.notSplit': 'First pull the fibre bundle apart into strands.',
  'drag.tooHeavy': 'It slipped out of your grip - pull more slowly, or use both hands.',
  'place.tooFar': 'Not close enough to the marked spot - set it down on the glow.',
  'place.blocked': 'Something is in the way here.',
  'support.tooFar': 'That support is too far from its mark.',
  'slab.beforeSupports': 'Set all three support stones first, then lift the slab onto them.',
  'slab.notOnSupports': 'The slab is not resting on all three supports.',
  'slab.offCentre': 'The slab hangs off-centre - it tips toward the gap.',
  'bench.wrongMotion': 'That is not the motion this step needs.',
  'bench.missingParts': 'You are missing parts for that.',
};

// -------------------------------------------------------- what things are made of

/** Material and hardness (blows of notch depth) of each resource look, for swings. */
export const LOOK_MATERIAL: Record<string, { material: Material; hardness: number }> = {
  fallenLog: { material: 'wood', hardness: 2.5 },
  sapling: { material: 'wood', hardness: 1.5 },
  dryBranch: { material: 'wood', hardness: 0.8 },
  twigPile: { material: 'wood', hardness: 0.3 },
  straightStick: { material: 'wood', hardness: 0.5 },
  board: { material: 'wood', hardness: 1.2 },
  forkedStick: { material: 'wood', hardness: 0.5 },
  diggingStick: { material: 'wood', hardness: 0.5 },
  bark: { material: 'wood', hardness: 0.4 },
  cane: { material: 'wood', hardness: 0.4 },
  grass: { material: 'wood', hardness: 0.2 },
  fibrePlant: { material: 'wood', hardness: 0.3 },
  vine: { material: 'wood', hardness: 0.3 },
  leafLitter: { material: 'soil', hardness: 1 },
  stone: { material: 'stone', hardness: 1 },
  stoneDark: { material: 'stone', hardness: 1 },
  stonePale: { material: 'stone', hardness: 1 },
  wetStone: { material: 'stone', hardness: 1 },
  slab: { material: 'stone', hardness: 1 },
  mossRock: { material: 'stone', hardness: 1 },
  clayPatch: { material: 'soil', hardness: 1 },
  sandBar: { material: 'soil', hardness: 1 },
  gravelBed: { material: 'soil', hardness: 1 },
};

export function materialOf(look: string): { material: Material; hardness: number } {
  return LOOK_MATERIAL[look] ?? { material: 'soil', hardness: 1 };
}

/** Tools that are swung (head speed and contact decide the blow). */
export const SWING_TOOLS: readonly ItemId[] = ['axe', 'hammer'];
/** Handle length (m) from the grip to the head. */
export const HANDLE_LENGTH = 0.42;
