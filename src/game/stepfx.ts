// What the workbench parts do while you work them (scraped, pressed, wrapped,
// twisted, struck): pure maths for BenchSystem's visuals, so each action is
// driven by the hands and the same numbers can be tested. Nothing allocates.

/** Smoothed effort per second, from the work added each frame. */
export class WorkRate {
  rate = 0;

  reset(): void {
    this.rate = 0;
  }

  /** `added` = effort this frame (in the step's own units); returns the smoothed rate (units/s). */
  update(dt: number, added: number): number {
    if (dt <= 0) return this.rate;
    const k = Math.min(1, dt * 8);
    this.rate += (added / dt - this.rate) * k;
    if (this.rate < 1e-4) this.rate = 0;
    return this.rate;
  }
}

/** Has the player started this step? The looping ghost-hand cue is only for before that. */
export function stepStarted(progress: number, rate: number): boolean {
  return progress > 0.015 || rate > 0.02;
}

/** How many of `n` cord rings are wound after `progress` of a lashing (0..1). */
export function ringsWound(progress: number, n: number): number {
  return Math.max(0, Math.min(n, Math.floor(progress * n + 1e-6)));
}

/** Stroke phase advances with the work done, so the part moves exactly as fast as the hand: no hand, no motion. */
export function strokePhase(phase: number, added: number, strokeLength: number): number {
  return phase + (added / Math.max(1e-3, strokeLength)) * Math.PI;
}

/** Sideways offset of a part being scraped or sawn at stroke phase `phase`. */
export function strokeOffset(phase: number, amplitude: number): number {
  return Math.sin(phase) * amplitude;
}

/** How far the pressed part has sunk toward its seat (0 at the start, `depth` when the step is done). */
export function pressSink(progress: number, depth: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return p * p * (3 - 2 * p) * depth;
}

/**
 * One cord strand being twisted: segment `s` of `segments`, strand `k` of `strands`, with `twist` radians of
 * rotation accumulated. Returns the strand's offset around the cord's axis (y, z): the strands spiral round each
 * other, tighter towards the twisted end, and untwisted ones lie side by side.
 */
export function strandOffset(out: { y: number; z: number }, k: number, strands: number, s: number, segments: number, twist: number, radius: number): void {
  const along = segments > 1 ? s / (segments - 1) : 0;
  const a = (k / strands) * Math.PI * 2 + twist * (0.4 + 0.6 * along);
  out.y = Math.cos(a) * radius;
  out.z = Math.sin(a) * radius;
}

/** Wrap angle (rad) of the cord end circling the part: one turn per `perTurn` of wrap work. */
export function wrapAngle(totalWork: number, perTurn = Math.PI * 2): number {
  return (totalWork / perTurn) * Math.PI * 2;
}
