// Usability rules for the whole game (docs/TUTORIAL_USABILITY_SPEC.md, part B):
// which object an action goes to, whether a part may be placed there and why
// not, how a held part is drawn toward its mark, when a thrown part is caught,
// which few things get highlighted, and which hint effects a hint level turns
// on. Pure: no three.js and nothing allocated per call beyond a result object.
// The systems (carry, drop, highlight, hint) only feed it positions and apply
// what it says, so the same rules serve hands, controllers and the desktop.

import { BLUEPRINTS, spotWorldPosition, type PlacedStructure } from './blueprint.js';
import { ITEMS, type ItemId } from './items.js';

// ---------------------------------------------------------------- tuning

export const ASSIST = {
  /** A part let go within this distance (m) of an open mark that wants it seats there. Generous: no fine positioning. */
  releaseRadius: 1.2,
  /** Seats from further away only when nothing else is near, up to the old build-area reach. */
  buildArea: 3,
  /** Touching the mark with the held part (moving it into the mark) seats it. */
  touchRadius: 0.16,
  /** A held correct part is drawn toward its mark inside this distance... */
  magnetRadius: 0.55,
  /** ...at up to this speed (m/s) at the edge, easing to nothing at the mark. */
  magnetSpeed: 0.9,
  /** A thrown correct part entering this distance (m) of an open mark is caught. */
  catchRadius: 0.7,
  /** A thrown part must be moving slower than this (m/s) to be caught: a gentle throw, not a hard one. */
  catchMaxSpeed: 6,
  /** A strike (m/s, downward) with a compatible part within this distance (m) counts as placing it. */
  strikeRadius: 0.3,
  strikeSpeed: 1.6,
  /** A mark further than this (m) is "too far" rather than "nothing here". */
  hintRange: 8,
  /** At most this many things are highlighted at once. */
  highlightBudget: 6,
};

// ----------------------------------------------------------------- marks

export interface Mark {
  structure: PlacedStructure;
  /** Spot index, or -1 for the key part. */
  index: number;
  x: number;
  y: number;
  z: number;
  accepts: readonly ItemId[];
  label: string;
}

/** Every open mark of every unfinished structure: the spots still empty and the key part when it may go. */
export function openMarks(structures: readonly PlacedStructure[], out: Mark[] = []): Mark[] {
  out.length = 0;
  for (const s of structures) {
    if (s.complete) continue;
    const def = BLUEPRINTS[s.kind];
    const allFilled = s.spots.every((v) => v !== null);
    if (def.keyLast && !s.keyPlaced && allFilled) {
      const p = spotWorldPosition(s, -1);
      out.push({ structure: s, index: -1, x: p.x, y: p.y, z: p.z, accepts: def.keyAccepts, label: 'the top' });
    } else if (s.keyOpen) {
      const p = spotWorldPosition(s, -1);
      out.push({ structure: s, index: -1, x: p.x, y: p.y, z: p.z, accepts: def.keyAccepts, label: 'the first mark' });
    }
    if (s.keyPlaced) continue;
    def.spots.forEach((spot, i) => {
      if (s.spots[i] !== null) return;
      const p = spotWorldPosition(s, i);
      out.push({ structure: s, index: i, x: p.x, y: p.y, z: p.z, accepts: spot.accepts, label: spot.label });
    });
  }
  return out;
}

const nameOf = (ids: readonly ItemId[]): string => ids.map((i) => ITEMS[i].name.toLowerCase()).join(' or ');

/** What a mark needs, in a few words: "dry stone or wet stone". */
export function needText(m: Pick<Mark, 'accepts'>): string {
  return nameOf(m.accepts);
}

/** Nearest open mark that accepts `item` within `radius` of (x, z), or null. */
export function nearestMark(marks: readonly Mark[], item: ItemId, x: number, z: number, radius: number): { mark: Mark; d: number } | null {
  let best: { mark: Mark; d: number } | null = null;
  for (const m of marks) {
    if (!m.accepts.includes(item)) continue;
    const d = Math.hypot(m.x - x, m.z - z);
    if (d <= radius && (!best || d < best.d)) best = { mark: m, d };
  }
  return best;
}

/** Result slot for `nearestMarkIndex` (so per-frame code allocates nothing). */
export const scan = { d: 0 };

/** Index in `marks` of the nearest open mark accepting `item` within `radius`, or -1; distance in `scan.d`. No allocation. */
export function nearestMarkIndex(marks: readonly Mark[], item: ItemId, x: number, z: number, radius: number): number {
  let best = -1;
  let bestD = radius;
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (!m.accepts.includes(item)) continue;
    const d = Math.hypot(m.x - x, m.z - z);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  scan.d = bestD;
  return best;
}

// -------------------------------------------------------------- snapping

export type SnapReason = 'wrongMaterial' | 'tooFar' | 'complete' | 'none';
export type SnapVerdict = { ok: true; mark: Mark; d: number } | { ok: false; reason: SnapReason; message: string };

const MSG = {
  none: '',
};

/**
 * May `item`, let go (or touched in) at (x, z), be placed? Accepts the nearest correct open mark within
 * `radius` (forgiving: no pixel-perfect aim) and rejects with ONE short reason otherwise:
 * a wrong material names what the mark wants, too far says to move closer, a finished build says so.
 */
export function snapVerdict(structures: readonly PlacedStructure[], marks: readonly Mark[], item: ItemId, x: number, z: number, radius = ASSIST.releaseRadius): SnapVerdict {
  const hit = nearestMark(marks, item, x, z, radius);
  if (hit) return { ok: true, mark: hit.mark, d: hit.d };
  // Why not? Nearest thing the player is clearly trying to build on.
  let wrong: Mark | null = null;
  let wrongD = radius;
  for (const m of marks) {
    const d = Math.hypot(m.x - x, m.z - z);
    if (d <= wrongD && !m.accepts.includes(item)) {
      wrongD = d;
      wrong = m;
    }
  }
  if (wrong) return { ok: false, reason: 'wrongMaterial', message: `Not that: this mark needs ${needText(wrong)}.` };
  for (const s of structures) {
    if (!s.complete) continue;
    if (Math.hypot(s.x - x, s.z - z) <= BLUEPRINTS[s.kind].radius + 0.4) {
      return { ok: false, reason: 'complete', message: `Your ${BLUEPRINTS[s.kind].name.toLowerCase()} is already finished.` };
    }
  }
  if (nearestMark(marks, item, x, z, ASSIST.hintRange)) return { ok: false, reason: 'tooFar', message: 'Too far from the mark: bring it closer.' };
  return { ok: false, reason: 'none', message: MSG.none };
}

// ---------------------------------------------------------------- magnet

/**
 * Small magnetic pull of a held correct part toward its open mark: writes the displacement (m) for this frame
 * to `out` (zero when nothing is close enough). Strongest at the edge of the radius, easing to nothing at the
 * mark so it never snatches the part and the hand still feels in control.
 */
export function magnetPull(out: { x: number; z: number }, dt: number, px: number, pz: number, mx: number, mz: number, cfg = ASSIST): boolean {
  out.x = 0;
  out.z = 0;
  const dx = mx - px;
  const dz = mz - pz;
  const d = Math.hypot(dx, dz);
  if (d > cfg.magnetRadius || d < 1e-4) return false;
  const k = d / cfg.magnetRadius; // 1 at the edge, 0 at the mark
  const step = Math.min(d, cfg.magnetSpeed * k * dt);
  out.x = (dx / d) * step;
  out.z = (dz / d) * step;
  return true;
}

// ----------------------------------------------------------------- catch

/** Is a thrown part at (x, z) moving at (vx, vz) close enough to an open correct mark, and gentle enough, to be caught? */
export function catchesThrown(marks: readonly Mark[], item: ItemId, x: number, z: number, speed: number, cfg = ASSIST): Mark | null {
  if (speed > cfg.catchMaxSpeed) return null;
  const hit = nearestMark(marks, item, x, z, cfg.catchRadius);
  return hit ? hit.mark : null;
}

/**
 * Same as `catchesThrown`, for a body in flight with a height: also within 0.6 m of the mark's height, and the part
 * must be something a mark can take on its own (a spot, or the open key slot; never a two-hand slab on its supports).
 */
export function catchesThrownAt(marks: readonly Mark[], item: ItemId, x: number, y: number, z: number, speed: number, cfg = ASSIST): Mark | null {
  const i = nearestMarkIndex(marks, item, x, z, cfg.catchRadius);
  if (i < 0 || speed > cfg.catchMaxSpeed) return null;
  const m = marks[i];
  if (Math.abs(y - m.y) > 0.6) return null;
  if (m.index < 0 && !m.structure.keyOpen) return null;
  return m;
}

// ---------------------------------------------------------- placement intent

export type Intent = 'release' | 'drop' | 'touch' | 'throw' | 'strike';

/**
 * Which way a part reaches a mark, from what the hand did. All of them mean "place it" when the held part is
 * correct and a mark is near; nothing else is turned into a placement (an empty hand never is).
 */
export function placementIntent(ctx: { distance: number; speed: number; downSpeed: number; thrown: boolean; letGo: boolean }, cfg = ASSIST): Intent | null {
  if (ctx.thrown) return ctx.speed <= cfg.catchMaxSpeed && ctx.distance <= cfg.catchRadius ? 'throw' : null;
  if (ctx.letGo) return ctx.distance <= cfg.buildArea ? (ctx.speed > 1.2 ? 'drop' : 'release') : null;
  if (ctx.downSpeed >= cfg.strikeSpeed && ctx.distance <= cfg.strikeRadius) return 'strike';
  if (ctx.distance <= cfg.touchRadius) return 'touch';
  return null;
}

/** Empty-hand punches and swings never harvest or build: only a held part, or a tool made for the job, acts. */
export function punchActs(held: ItemId | null): boolean {
  return held !== null;
}

// ------------------------------------------------------- target resolution

export interface Candidate {
  id: string;
  /** Distance (m) from the hand or the head. */
  dist: number;
  /** The player is pointing at / touching exactly this one. */
  aimed: boolean;
  /** Within reach and allowed right now (a spot that accepts, a resource that is open ...). */
  valid: boolean;
  /** The held item is what it wants. */
  matchesHeld: boolean;
}

/**
 * The one object an action goes to. Order: the object directly targeted, then the nearest valid one, then
 * the one that matches the held item, then any other valid one. Invalid things are never chosen, so a stray
 * flick cannot touch something unrelated.
 */
export function resolveTarget(cands: readonly Candidate[]): Candidate | null {
  let aimed: Candidate | null = null;
  let nearest: Candidate | null = null;
  let match: Candidate | null = null;
  let other: Candidate | null = null;
  for (const c of cands) {
    if (!c.valid) continue;
    if (c.aimed && (!aimed || c.dist < aimed.dist)) aimed = c;
    if (!nearest || c.dist < nearest.dist) nearest = c;
    if (c.matchesHeld && (!match || c.dist < match.dist)) match = c;
    if (!other || c.dist < other.dist) other = c;
  }
  return aimed ?? (match && nearest && match.dist <= nearest.dist + 0.35 ? match : nearest) ?? match ?? other;
}

// ------------------------------------------------------------ highlights

export type HighlightKind = 'target' | 'fits' | 'blocked' | 'hint' | 'exact';
export interface Highlight {
  id: string;
  kind: HighlightKind;
  x: number;
  y: number;
  z: number;
  /** Larger first. */
  priority: number;
}

const KIND_PRIORITY: Record<HighlightKind, number> = { target: 100, exact: 90, fits: 60, hint: 40, blocked: 10 };

/** Priority for a highlight of `kind` at distance `dist` (nearer is more important within a kind). */
export function highlightPriority(kind: HighlightKind, dist: number): number {
  return KIND_PRIORITY[kind] - Math.min(9, dist);
}

/** The few highlights to draw: the best `budget` by priority, one per id. */
export function pickHighlights(all: readonly Highlight[], budget = ASSIST.highlightBudget, out: Highlight[] = []): Highlight[] {
  out.length = 0;
  for (const h of all) {
    const dup = out.findIndex((o) => o.id === h.id);
    if (dup >= 0) {
      if (out[dup].priority < h.priority) out[dup] = h;
      continue;
    }
    // Insert keeping out sorted by priority descending, capped at the budget.
    let i = out.length;
    while (i > 0 && out[i - 1].priority < h.priority) i--;
    if (i < budget) {
      out.splice(i, 0, h);
      if (out.length > budget) out.length = budget;
    }
  }
  return out;
}

/** Which ids must be removed and which are new, between what was shown and what should be (clean-up). */
export function diffHighlights(shown: ReadonlySet<string>, want: readonly Highlight[], removed: string[] = [], added: string[] = []): { removed: string[]; added: string[] } {
  removed.length = 0;
  added.length = 0;
  const wanted = new Set<string>();
  for (const h of want) {
    wanted.add(h.id);
    if (!shown.has(h.id)) added.push(h.id);
  }
  for (const id of shown) if (!wanted.has(id)) removed.push(id);
  return { removed, added };
}

// ----------------------------------------------------------------- hints

export interface HintEffects {
  /** Level 1: a text clue. */
  clue: boolean;
  /** Level 2: suitable nearby resources pulse. */
  pulse: boolean;
  /** Level 3: the sky pillar over the chosen target. */
  beacon: boolean;
  /** Level 4: the exact object or snap point is outlined, with an arrow. */
  exact: boolean;
}

/** What each hint level turns on. Each level keeps the earlier clue; the beacon and pulse give way to the exact marker at 4. */
export function hintEffects(level: number): HintEffects {
  const l = Math.max(0, Math.min(4, Math.floor(level)));
  return { clue: l >= 1, pulse: l === 2 || l === 3, beacon: l >= 3, exact: l >= 4 };
}

export interface Spot {
  id: string;
  x: number;
  z: number;
  item: ItemId;
}

/**
 * The target a beacon or arrow marks: the nearest spot offering something still NEEDED (in the order the
 * objective lists them), never one the player already has enough of.
 */
export function chooseTarget(spots: readonly Spot[], needed: readonly ItemId[], px: number, pz: number): Spot | null {
  let best: Spot | null = null;
  let bestD = Infinity;
  for (const s of spots) {
    if (!needed.includes(s.item)) continue;
    const d = Math.hypot(s.x - px, s.z - pz);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// -------------------------------------------------------------- messages

/** Short contextual messages: one at a time, never repeated within `gap` seconds, gone after `life` seconds. */
export class MessageGate {
  text = '';
  left = 0;
  private lastAt = new Map<string, number>();

  constructor(
    readonly gap = 20,
    readonly life = 4.5,
  ) {}

  /** Say `text` for `key` unless that key was said recently (or something more urgent is showing). Returns true if shown. */
  say(now: number, key: string, text: string, urgent = false): boolean {
    const last = this.lastAt.get(key);
    if (last !== undefined && now - last < this.gap) return false;
    if (this.left > 0 && !urgent) return false;
    this.lastAt.set(key, now);
    this.text = text;
    this.left = this.life;
    return true;
  }

  tick(dt: number): void {
    if (this.left > 0 && (this.left -= dt) <= 0) {
      this.left = 0;
      this.text = '';
    }
  }

  clear(): void {
    this.left = 0;
    this.text = '';
  }
}
