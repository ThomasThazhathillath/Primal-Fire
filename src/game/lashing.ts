// Lashing a joint with cord (docs/CHAPTER2_SHELTER_SPEC.md, step 4): wrap and tighten.
// Three ways to do the same thing, so nobody has to find one exact gesture:
//   two hands  - roll the wrists in opposite directions with the cord taut between them
//                (the existing Twist machine in interact.ts, reused as is);
//   one hand   - circle the cord around the joint (a wrap), the accessible alternative;
//   desktop    - scroll the mouse wheel at the joint.
// Each returns the fraction of a joint it tightened this frame. Pure; nothing allocates per call.

import { TwistState } from './interact.js';

export const LASH = {
  /** Wrist-roll multiplier: a joint is tightened by far less rolling than a whole cord is twisted. */
  twistGain: 2.5,
  /** Full circles of one hand around a joint to tighten it. */
  circleTurns: 2,
  /** Circling counts at this distance (m) from the joint, not closer (a fist in place) and not wider (waving). */
  circleMin: 0.04,
  circleMax: 0.3,
  /** Wheel units per joint. */
  wheelPerJoint: 16,
  /** Hand reach (m) to a joint to work on it; seated, in comfortable reach. */
  reach: 0.6,
};

export class LashGesture {
  private twist = new TwistState();
  private lastAng = 0;
  private hasAng = false;

  constructor() {
    this.twist.split = true; // the cord is already a cord: no pulling apart first
  }

  reset(): void {
    this.twist = new TwistState();
    this.twist.split = true;
    this.hasAng = false;
  }

  /** Two hands on the cord: `sep` hand distance (m), wrist roll changes this frame (rad). */
  twoHand(sep: number, dRollL: number, dRollR: number): number {
    const before = this.twist.progress;
    this.twist.update(sep, dRollL * LASH.twistGain, dRollR * LASH.twistGain);
    const d = this.twist.progress - before;
    if (this.twist.progress >= 1) this.reset();
    return d;
  }

  /** One hand circling the joint: (relX, relZ) = hand minus joint on the ground plane. Either direction counts. */
  circle(relX: number, relZ: number): number {
    const r = Math.hypot(relX, relZ);
    if (r < LASH.circleMin || r > LASH.circleMax) {
      this.hasAng = false;
      return 0;
    }
    const ang = Math.atan2(relZ, relX);
    if (!this.hasAng) {
      this.hasAng = true;
      this.lastAng = ang;
      return 0;
    }
    let d = ang - this.lastAng;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.lastAng = ang;
    // A wrap is a steady turn: ignore tracking jitter and a hand that jumps across the joint.
    if (Math.abs(d) < 0.01 || Math.abs(d) > 1.2) return 0;
    return Math.abs(d) / (Math.PI * 2 * LASH.circleTurns);
  }

  /** Mouse wheel scrolled `delta` units. */
  wheel(delta: number): number {
    return Math.abs(delta) / LASH.wheelPerJoint;
  }
}
