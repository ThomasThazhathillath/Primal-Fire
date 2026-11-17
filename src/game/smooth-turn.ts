// The Left / Right turn buttons: a short eased pan instead of an instant jump of the whole view (the jump read as
// a teleport and was disorienting). Short on purpose: in a headset, a slow smooth turn is what brings on motion
// sickness, so the turn eases in and out and is over in a third of a second. Pure: the caller applies each step.

/** How long one turn takes (s). */
export const TURN_SECONDS = 0.3;

export class SmoothTurn {
  /** Radians this turn covers. */
  private total = 0;
  /** Radians turned so far. */
  private done = 0;
  /** Progress 0..1. */
  private t = 0;

  get active(): boolean {
    return this.total !== 0;
  }

  /** Start turning by `rad` (positive = left). Pressed again mid-turn: what is left and the new turn become one. */
  start(rad: number): void {
    this.total = this.total - this.done + rad;
    this.done = 0;
    this.t = 0;
  }

  /** Advance `dt` seconds; returns the radians to turn this frame (all of them add up to exactly the turn). */
  step(dt: number): number {
    if (this.total === 0) return 0;
    this.t = Math.min(1, this.t + Math.max(0, dt) / TURN_SECONDS);
    const k = this.t * this.t * (3 - 2 * this.t); // smoothstep: eases in and out
    const want = this.t >= 1 ? this.total : this.total * k;
    const step = want - this.done;
    this.done = want;
    if (this.t >= 1) this.total = this.done = 0;
    return step;
  }
}
