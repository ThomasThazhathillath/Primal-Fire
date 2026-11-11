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
  const r = prev?.r && prev.r > 0 ? prev.r : spot.regrow > 0 ? now + spot.regrow : 0;
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
