// What the current hint level puts in the world (docs/TUTORIAL_USABILITY_SPEC.md, part B.3):
// level 2 pulses suitable resources near you, level 3 raises a sky pillar over the ONE chosen
// target, level 4 marks that exact object or mark with an arrow. The target is chosen from what
// the objective still needs and how close it is, never an approximation and never an item you
// already have enough of. Nothing completes by itself. Pure: the system draws what this plans.

import { type HintEffects, hintEffects, type Mark, openMarks, type Spot, chooseTarget } from './assist.js';
import type { Game } from './game.js';
import type { ItemId } from './items.js';
import { LANDMARK_BY_ID } from './world-layout.js';

/** Nearby resources pulse within this distance (m), at most `PULSE_MAX` of them. */
export const PULSE_RANGE = 16;
export const PULSE_MAX = 4;
/** Standing this close (m) to the target ends the hint's world effects: you found it. */
export const ARRIVED = 2.2;

export interface HintTarget {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface HintPlan {
  level: number;
  effects: HintEffects;
  objective: string | null;
  needed: ItemId[];
  /** The one target a beacon and arrow mark, or null when the objective has nothing to point at. */
  target: HintTarget | null;
  /** Nearby suitable resources to pulse (level 2 and 3). */
  nearby: HintTarget[];
}

/**
 * Plan the hint effects for the current objective. `spots` are the resources still available that offer
 * the needed items (the caller knows which have charges left).
 */
export function planHint(g: Game, spots: readonly Spot[]): HintPlan {
  const o = g.objectives.current;
  const level = g.objectives.hintFxLevel();
  const effects = hintEffects(level);
  const plan: HintPlan = { level, effects, objective: o?.id ?? null, needed: [], target: null, nearby: [] };
  if (!o || level === 0) return plan;
  plan.needed = o.find?.(g) ?? [];
  const px = g.player.x;
  const pz = g.player.z;
  if (o.place) {
    const l = LANDMARK_BY_ID[o.place];
    if (l) plan.target = { id: `place_${o.place}`, x: l.x, y: 0, z: l.z };
    return plan;
  }
  if (plan.needed.length) {
    const t = chooseTarget(spots, plan.needed, px, pz);
    if (t) plan.target = { id: `res_${t.id}`, x: t.x, y: 0, z: t.z };
    // Pulse the few nearest suitable spots.
    const near = spots
      .filter((s) => plan.needed.includes(s.item))
      .map((s) => ({ s, d: Math.hypot(s.x - px, s.z - pz) }))
      .filter((e) => e.d <= PULSE_RANGE)
      .sort((a, b) => a.d - b.d)
      .slice(0, PULSE_MAX);
    plan.nearby = near.map((e) => ({ id: `res_${e.s.id}`, x: e.s.x, y: 0, z: e.s.z }));
    return plan;
  }
  if (o.structure) {
    // Building: the open mark that takes something you are carrying (held first), else the first open mark.
    const marks = openMarks(g.structures).filter((m) => m.structure.kind === o.structure);
    const has = (m: Mark) => m.accepts.some((i) => g.held === i || g.count(i) > 0);
    const m = marks.find(has) ?? marks[0];
    if (m) plan.target = { id: `mark_${m.structure.id}_${m.index}`, x: m.x, y: m.y, z: m.z };
  }
  return plan;
}

/** Has the player reached the target (so its pillar and arrow can go)? */
export function arrived(plan: HintPlan, px: number, pz: number): boolean {
  return !!plan.target && Math.hypot(plan.target.x - px, plan.target.z - pz) <= ARRIVED;
}

/** The ground glow goes exactly where the pillar goes (levels 3 and 4) and nowhere else. */
export function glowFor(plan: HintPlan): HintTarget | null {
  return plan.effects.beacon && plan.target ? plan.target : null;
}
