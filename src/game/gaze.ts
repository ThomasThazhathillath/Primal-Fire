// Gaze + pinch (docs/GAZE_PINCH_90FPS_SPEC.md): LOOK -> PINCH -> INTERACT.
// Pure and allocation-free on the per-frame path, so it is tested directly.
//   - GazeTargeter: which candidate the gaze ray means, with a cone, per-kind reach and priority,
//     an occlusion check run only for the winner, and hysteresis so the target never flickers.
//   - GazePinchGate: one hand's pinch as start / hold / release, debounced, one activation per pinch,
//     ignoring the first moments after tracking returns.
//   - gazeAction: the one table that says what a pinch on the gaze target does.
// GazeTargetSystem feeds it the gaze ray (eye gaze, else head, else the mouse) and applies the result.

export type GazeKind = 'resource' | 'drop' | 'mark' | 'bench' | 'firePit' | 'ui';

export interface GazeCandidate {
  kind: GazeKind;
  /** Stable identity across rebuilds (hysteresis follows the key, not the slot). */
  key: string;
  x: number;
  y: number;
  z: number;
  /** Rough radius (m) of what you look at: big things are easier to hit. */
  r: number;
  /** Index into the system's own source list (spot, drop id, mark...). */
  ref: number;
  /** Not currently usable (e.g. a mark that does not take the held part): highlighted, never acted on as a take. */
  enabled: boolean;
}

export const GAZE = {
  /** Half-angle (deg) a target must come within to be picked up by gaze. */
  enterDeg: 7,
  /** The current target is kept until the gaze leaves this wider half-angle (deg): hysteresis. */
  keepDeg: 11,
  /** Nothing nearer than this (m): that is direct-hand territory. */
  minDist: 0.25,
  /** Per-kind reach (m). Gaze is far interaction, but not across the forest. */
  maxDist: { resource: 6, drop: 6, mark: 7, bench: 7, firePit: 7, ui: 2.5 } as Record<GazeKind, number>,
  /** Per-kind bias added to the score (things you build on win over loose things behind them). */
  priority: { resource: 0, drop: 0.05, mark: 0.15, bench: 0.1, firePit: 0.1, ui: 0.6 } as Record<GazeKind, number>,
  /** A challenger must beat the current target's score by this much... */
  switchMargin: 0.15,
  /** ...for this long (s) before the target switches. */
  switchDwell: 0.12,
  /** After the gaze leaves every target, the last one stays this long (s): blinks and saccades never drop it. */
  exitGrace: 0.15,
  /** Seconds of steady gaze before the name label appears. */
  labelDwell: 0.3,
};

/** Score of `c` for a gaze ray (origin o, unit direction d); -1 when outside `halfDeg` or reach. */
export function gazeScore(c: GazeCandidate, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, halfDeg: number, cfg = GAZE): number {
  const vx = c.x - ox;
  const vy = c.y - oy;
  const vz = c.z - oz;
  const dist = Math.hypot(vx, vy, vz);
  if (dist < cfg.minDist || dist > cfg.maxDist[c.kind]) return -1;
  const along = (vx * dx + vy * dy + vz * dz) / dist;
  if (along <= 0) return -1;
  const ang = (Math.acos(Math.min(1, along)) * 180) / Math.PI;
  // Angular radius of the target: looking at its edge counts as looking at it.
  const size = (Math.atan2(c.r, dist) * 180) / Math.PI;
  const off = Math.max(0, ang - size);
  if (off > halfDeg) return -1;
  return 1 - off / halfDeg - (dist / cfg.maxDist[c.kind]) * 0.2 + cfg.priority[c.kind];
}

/** Scores closer than this are a tie between two gaze targets: the nearer one wins. */
const GAZE_TIE = 0.04;

/** Is `a` behind `b` as seen from the eye (almost the same direction, clearly farther)? */
function behindOf(a: GazeCandidate, b: GazeCandidate, ox: number, oy: number, oz: number): boolean {
  const ax = a.x - ox;
  const ay = a.y - oy;
  const az = a.z - oz;
  const bx = b.x - ox;
  const by = b.y - oy;
  const bz = b.z - oz;
  const da = Math.hypot(ax, ay, az);
  const db = Math.hypot(bx, by, bz);
  if (da < db + 0.3) return false;
  const cos = (ax * bx + ay * by + az * bz) / (da * db);
  return cos > Math.cos((3 * Math.PI) / 180);
}

/** Who answers "is the line from the eye to this target blocked?" (cheap: a 2D grid lookup). */
export type OcclusionTest = (c: GazeCandidate) => boolean;

export class GazeTargeter {
  /** Key of the current target, or null. */
  key: string | null = null;
  /** Slot of the current target in the last list passed to update (-1 = none). */
  index = -1;
  /** Seconds the current target has been held. */
  dwell = 0;
  private challenger: string | null = null;
  private challengeFor = 0;
  private lostFor = 0;
  /** Number of target changes so far (flicker metric for tests and the perf overlay). */
  switches = 0;

  constructor(private cfg = GAZE) {}

  reset(): void {
    this.key = null;
    this.index = -1;
    this.dwell = 0;
    this.challenger = null;
    this.challengeFor = 0;
    this.lostFor = 0;
  }

  /** Lock: while a grab started by gaze is in progress, the target never changes. */
  locked = false;

  /**
   * Picks the target among `list[0..n)` for this frame's ray and returns its slot (or -1).
   * `occluded` is called at most twice a frame (current and best challenger).
   */
  update(list: readonly GazeCandidate[], n: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, dt: number, occluded?: OcclusionTest): number {
    const cfg = this.cfg;
    let cur = -1;
    let curScore = -1;
    let best = -1;
    let bestScore = -1;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const c = list[i];
      if (c.key === this.key) {
        cur = i;
        curScore = gazeScore(c, ox, oy, oz, dx, dy, dz, cfg.keepDeg * TOLERANCE.sensitivity, cfg);
        continue;
      }
      const s = gazeScore(c, ox, oy, oz, dx, dy, dz, cfg.enterDeg * TOLERANCE.sensitivity, cfg);
      if (s < 0) continue;
      // Nearest to the gaze first; when two are about equally near the gaze line, the closer one wins.
      const d = Math.hypot(c.x - ox, c.y - oy, c.z - oz);
      if (best < 0 || s > bestScore + GAZE_TIE || (s > bestScore - GAZE_TIE && d < bestDist)) {
        bestScore = s;
        best = i;
        bestDist = d;
      }
    }
    if (this.locked) {
      this.index = cur;
      if (cur >= 0) this.dwell += dt;
      return cur;
    }
    if (cur >= 0 && curScore >= 0 && occluded?.(list[cur])) curScore = -1;
    if (best >= 0 && occluded?.(list[best])) {
      best = -1;
      bestScore = -1;
    }
    if (curScore >= 0) {
      this.lostFor = 0;
      // Overlapping targets: only a clearly better one, held for a moment, takes over.
      if (best >= 0 && bestScore > curScore + cfg.switchMargin && !behindOf(list[best], list[cur], ox, oy, oz)) {
        if (this.challenger === list[best].key) this.challengeFor += dt;
        else {
          this.challenger = list[best].key;
          this.challengeFor = dt;
        }
        if (this.challengeFor >= cfg.switchDwell) return this.take(list[best], best);
      } else {
        this.challenger = null;
        this.challengeFor = 0;
      }
      this.index = cur;
      this.dwell += dt;
      return cur;
    }
    // The current one is gone (or there was none).
    if (best >= 0) return this.take(list[best], best);
    if (this.key !== null && cur >= 0 && (this.lostFor += dt) < cfg.exitGrace) {
      this.index = cur;
      return cur;
    }
    if (this.key !== null) this.switches++;
    this.reset();
    return -1;
  }

  private take(c: GazeCandidate, i: number): number {
    this.key = c.key;
    this.index = i;
    this.dwell = 0;
    this.lostFor = 0;
    this.challenger = null;
    this.challengeFor = 0;
    this.switches++;
    return i;
  }
}

// --------------------------------------------------------------- pinch gate

export const GAZE_PINCH = {
  /** A new pinch start within this time (s) of the last one is ignored (noisy tracking double-taps). */
  debounce: 0.25,
  /** After a hand's tracking returns, pinches are ignored this long (s): the first frames are noisy. */
  settle: 0.15,
};

export type PinchEdge = 'start' | 'hold' | 'release' | null;

/**
 * One hand's pinch for gaze selection. HandInputSystem already gives a pinch with hysteresis and a release
 * hold; this adds the selection rules: debounce, settle after tracking loss, and `consume()` so one pinch
 * never activates twice.
 */
export class GazePinchGate {
  private was = false;
  private lastStart = -1e9;
  private trackedFor = 0;
  private t = 0;
  /** The current pinch already did something (by gaze or by another handler). */
  consumed = false;

  constructor(private cfg = GAZE_PINCH) {}

  update(pinch: boolean, tracked: boolean, dt: number): PinchEdge {
    this.t += dt;
    this.trackedFor = tracked ? this.trackedFor + dt : 0;
    if (!tracked && !pinch) {
      // Lost while open: nothing to report. (A pinch frozen through a loss stays held: HandInputSystem.)
      const up = this.was;
      this.was = false;
      return up ? 'release' : null;
    }
    if (pinch && !this.was) {
      this.was = true;
      this.consumed = false;
      if (this.t - this.lastStart < this.cfg.debounce || this.trackedFor < this.cfg.settle) {
        this.consumed = true; // too soon: this pinch does nothing
        return 'hold';
      }
      this.lastStart = this.t;
      return 'start';
    }
    if (!pinch && this.was) {
      this.was = false;
      return 'release';
    }
    return pinch ? 'hold' : null;
  }

  /** Mark this pinch as used: further frames of it report 'hold' only. */
  consume(): void {
    this.consumed = true;
  }
}

// ------------------------------------------------------------- action table

export type GazeVerb = 'none' | 'take' | 'pickUp' | 'fillFromBag' | 'seatHeld' | 'wrongPart' | 'openBench' | 'useAtFire' | 'pressUi';

export interface GazeActionCtx {
  kind: GazeKind | null;
  /** Something is held (by either hand). */
  held: boolean;
  /** The target takes the held item (marks) / has a useful action with it (fire pit). */
  fits: boolean;
  /** Mark only: the bag holds something it takes. */
  bagFits: boolean;
  /** A higher-priority handler owns this pinch: held by this hand, a UI tap, a near grab, or a ray hover. */
  owned: boolean;
}

/** What one pinch on the gaze target does. Object-specific rules stay with the game APIs the verb maps to. */
export function gazeAction(c: GazeActionCtx): GazeVerb {
  if (c.owned || !c.kind) return 'none';
  switch (c.kind) {
    case 'resource':
      return c.held ? 'none' : 'take';
    case 'drop':
      return c.held ? 'none' : 'pickUp';
    case 'mark':
      if (c.held) return c.fits ? 'seatHeld' : 'wrongPart';
      return c.bagFits ? 'fillFromBag' : 'wrongPart';
    case 'bench':
      return c.held ? 'none' : 'openBench';
    case 'firePit':
      return c.held && c.fits ? 'useAtFire' : 'none';
    case 'ui':
      return 'pressUi';
  }
}

/** Counts the tutorial's LOOK AND PINCH lesson reads (reset when the lesson starts). */
export const gazeStats = {
  /** Things taken or picked up by gaze + pinch. */
  picks: 0,
  /** A gaze-picked thing was let go afterwards. */
  releases: 0,
  /** Parts seated (or marks filled) by gaze + pinch. */
  placed: 0,
  reset(): void {
    this.picks = this.releases = this.placed = 0;
  },
};

/**
 * Is the XZ segment from (ax, az) to (bx, bz) blocked? Samples every `step` m with `solidAt`, skipping the
 * last `skipEnd` m (a stone may lie against a trunk) and the first 0.3 m (your own position).
 */
export function segmentBlocked(ax: number, az: number, bx: number, bz: number, solidAt: (x: number, z: number) => boolean, step = 0.35, skipEnd = 0.45): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const end = len - skipEnd;
  for (let s = 0.3; s < end; s += step) {
    const k = s / len;
    if (solidAt(ax + (bx - ax) * k, az + (bz - az) * k)) return true;
  }
  return false;
}

// ------------------------------------------------- stable selection (NPE milestone A)

/**
 * Interaction tolerances shared by gaze and the hand ray (docs/NPE_PLAN.md, A). `sensitivity` is the player's
 * setting (settings.ts): above 1 the cones and pickup radii widen, below 1 they narrow.
 */
export const TOLERANCE = {
  sensitivity: 1,
  /** Hand-ray pick cone half-angle (deg) at sensitivity 1. */
  rayDeg: 12,
  /** Two targets whose angular offsets differ by less than this (deg) are a tie: the nearer one wins. */
  tieDeg: 2.5,
  /** A target within this angle (deg) of a nearer valid one, and at least `behindGap` m farther, is behind it: never chosen. */
  behindDeg: 3,
  behindGap: 0.3,
  /** A target must stay under the ray this long (s) to count as stable for the pinch lock. */
  stableFor: 0.08,
  /** The stable target is remembered this long (s) after the ray leaves it (the ray swings while the fingers close). */
  stableMemory: 0.35,
};

/** One thing the hand ray could mean. `r` is its rough radius (m); `inReach` false = visible but too far to take. */
export interface RayCandidate {
  key: string;
  x: number;
  y: number;
  z: number;
  r: number;
  inReach: boolean;
}

const MAX_PICK = 512;
const offs = new Float32Array(MAX_PICK);
const dists = new Float32Array(MAX_PICK);

/**
 * Which candidate a ray (origin o, unit direction d) means, or -1. Rules, in order: only targets inside the cone
 * (`halfDeg`, widened by sensitivity, counted to the target's edge); in-reach targets beat out-of-reach ones; a
 * target directly behind a nearer candidate is never chosen; the smallest angle wins, and within `tieDeg` the
 * nearer one wins. Deterministic and allocation-free.
 */
export function pickByRay(list: readonly RayCandidate[], n: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, halfDeg = TOLERANCE.rayDeg, cfg = TOLERANCE): number {
  const half = halfDeg * cfg.sensitivity;
  const m = Math.min(n, MAX_PICK);
  let anyReach = false;
  for (let i = 0; i < m; i++) {
    const c = list[i];
    const vx = c.x - ox;
    const vy = c.y - oy;
    const vz = c.z - oz;
    const dist = Math.hypot(vx, vy, vz);
    dists[i] = dist;
    offs[i] = -1;
    if (dist < 0.05) continue;
    const along = (vx * dx + vy * dy + vz * dz) / dist;
    if (along <= 0) continue;
    const ang = (Math.acos(Math.min(1, along)) * 180) / Math.PI;
    const size = (Math.atan2(c.r * cfg.sensitivity, dist) * 180) / Math.PI;
    const off = Math.max(0, ang - size);
    if (off > half) continue;
    offs[i] = off;
    if (c.inReach) anyReach = true;
  }
  let best = -1;
  for (let i = 0; i < m; i++) {
    if (offs[i] < 0) continue;
    const c = list[i];
    if (anyReach && !c.inReach) continue;
    if (isBehind(list, m, i, ox, oy, oz, cfg)) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const tie = Math.abs(offs[i] - offs[best]) < cfg.tieDeg;
    if (tie ? dists[i] < dists[best] : offs[i] < offs[best]) best = i;
  }
  return best;
}

/** Is candidate `i` hidden behind a nearer candidate along almost the same line from the eye/hand? */
function isBehind(list: readonly RayCandidate[], m: number, i: number, ox: number, oy: number, oz: number, cfg: typeof TOLERANCE): boolean {
  const c = list[i];
  const di = dists[i];
  for (let j = 0; j < m; j++) {
    if (j === i || offs[j] < 0 || dists[j] + cfg.behindGap > di) continue;
    const o = list[j];
    const dj = dists[j];
    const cos = ((c.x - ox) * (o.x - ox) + (c.y - oy) * (o.y - oy) + (c.z - oz) * (o.z - oz)) / (di * dj);
    const sep = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (sep < cfg.behindDeg) return true;
  }
  return false;
}

/**
 * Pinch-time target lock for one hand. Feed it the per-frame target under the ray (`track`); it keeps the last
 * target that stayed put for `stableFor` seconds. At pinch start (`begin`) that stable target is locked, not
 * whatever the swinging ray happens to be on; the lock holds until `end` (the pinch opens).
 */
export class PinchLock {
  /** The last stable target (null once forgotten). */
  stable: string | null = null;
  /** The target this pinch acts on, from `begin` until `end`. */
  locked: string | null = null;
  private cand: string | null = null;
  private candFor = 0;
  private away = 0;

  constructor(private cfg = TOLERANCE) {}

  track(key: string | null, dt: number): void {
    if (key === this.cand) this.candFor += dt;
    else {
      this.cand = key;
      this.candFor = 0;
    }
    if (key !== null && this.candFor >= this.cfg.stableFor) {
      this.stable = key;
      this.away = 0;
    } else if (this.stable !== null && key !== this.stable && (this.away += dt) > this.cfg.stableMemory) {
      this.stable = null;
      this.away = 0;
    } else if (key === this.stable) this.away = 0;
  }

  /** The pinch closed: lock the stable target, or the current one when nothing was stable. */
  begin(current: string | null): string | null {
    this.locked = this.stable ?? current;
    return this.locked;
  }

  /** The pinch opened (or the action resolved): release the lock cleanly. */
  end(): void {
    this.locked = null;
  }
}
