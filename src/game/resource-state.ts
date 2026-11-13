// The pure rules for a gather spot's charges and regrowth, shared by ResourceSystem and the tests.
// State is only kept for spots that are not full: { c: charges left, r: game time the next charge returns (0 = none due) }.

export interface SpotState {
  c: number;
  r: number;
}
export interface SpotRule {
  charges: number;
  /** Seconds for one charge to grow back; 0 = never. */
  regrow: number;
}

/** A charge was taken at game time `now`. */
export function afterGather(prev: SpotState | undefined, spot: SpotRule, now: number): SpotState {
  const c = Math.max(0, (prev?.c ?? spot.charges) - 1);
  // A pending return keeps its time; a stale one (already past, e.g. from an old save or a paused clock) starts
  // over, so a spot never refills in the same moment it was emptied.
  const r = prev?.r && prev.r > now ? prev.r : spot.regrow > 0 ? now + spot.regrow : 0;
  return { c, r };
}

/** One charge returns if it is due; null means the spot is full again (drop its saved state). */
export function afterRegrow(prev: SpotState, spot: SpotRule, now: number): SpotState | null | 'wait' {
  if (prev.r <= 0 || now < prev.r) return 'wait';
  const c = Math.min(spot.charges, prev.c + 1);
  return c >= spot.charges ? null : { c, r: now + spot.regrow };
}

/** Charges a spot has when the world loads: saved state wins, clamped to what the spot can hold. */
export const loadedCharges = (saved: SpotState | undefined, spot: SpotRule): number => (saved ? Math.max(0, Math.min(spot.charges, saved.c)) : spot.charges);

/**
 * Off-view regrowth: a spot within this distance (m) of the player and in front of them (the eye can see it
 * come back) waits until they look away or walk off. Nothing visibly refills under the player's hand.
 */
export const REGROW_HIDDEN = { near: 6, frontDot: 0.2 };

/** May a spot at (x, z) grow back now, for a player at (px, pz) facing (fx, fz)? */
export function regrowHidden(x: number, z: number, px: number, pz: number, fx: number, fz: number, cfg = REGROW_HIDDEN): boolean {
  const dx = x - px;
  const dz = z - pz;
  const d = Math.hypot(dx, dz);
  if (d > cfg.near) return true;
  if (d < 0.01) return false;
  return (dx * fx + dz * fz) / d < cfg.frontDot;
}
