// Joint-based pinch and the rules around grabbing and letting go (hands-only
// spec, phase 2). Pure: HandInputSystem feeds it the thumb-tip / index-tip
// distance once per frame; PinchGrabSystem and CarrySystem use the helpers.

export const PINCH_CONFIG = {
  /** Thumb-tip to index-tip distance (m) that starts a pinch. */
  start: 0.024,
  /** The pinch only ends once the tips are this far apart (m): hysteresis, so it never flickers. */
  release: 0.042,
  /** A pinching hand that has been untracked this long (s) is let go (nothing is launched). */
  lossTimeout: 4,
  /** Direct grab: an object this close (m) to the pinch point can be taken. */
  grabRadius: 0.16,
  /** Let go slower than this (m/s) and close enough to a surface: it is set down, not dropped. */
  gentleSpeed: 0.7,
  /** ...and with the object's underside within this height (m) of the surface. */
  placeHeight: 0.3,
  /** Faster than this (m/s) is a throw. */
  throwSpeed: 1.6,
};

export interface PinchState {
  /** Pinch held. */
  pinch: boolean;
  /** Closed / opened this frame. */
  down: boolean;
  up: boolean;
}

/** One per hand. Tracking loss freezes the state: no release, no flicker. */
export class PinchDetector implements PinchState {
  pinch = false;
  down = false;
  up = false;

  /** Seconds of tracking loss while pinching. */
  lostFor = 0;

  reset(): void {
    this.pinch = this.down = this.up = false;
    this.lostFor = 0;
  }

  update(distance: number, tracked: boolean, cfg: Pick<typeof PINCH_CONFIG, 'start' | 'release'> = PINCH_CONFIG): void {
    this.down = this.up = false;
    if (!tracked || !Number.isFinite(distance)) return;
    if (!this.pinch && distance <= cfg.start) {
      this.pinch = true;
      this.down = true;
    } else if (this.pinch && distance >= cfg.release) {
      this.pinch = false;
      this.up = true;
    }
  }
}

export interface HandSignals {
  /** Joint pinch distance is valid this frame (a tracked hand, not a controller). */
  tipTracked: boolean;
  distance: number;
  /** In an immersive session (desktop never freezes). */
  vr: boolean;
  /** Controller buttons, used when there are no hand joints. */
  select: boolean;
  squeeze: boolean;
  /** Frame time (s), to time out a long tracking loss. */
  dt?: number;
}

/**
 * The hand's squeeze (what holds things) and grip this frame. A pinching hand
 * that loses tracking keeps pinching: nothing is released or launched until
 * tracking returns and the pinch actually opens.
 */
export function handSqueeze(p: PinchDetector, h: HandSignals): { squeeze: boolean; grip: boolean } {
  if (h.tipTracked) {
    p.lostFor = 0;
    p.update(h.distance, true);
    return { squeeze: p.pinch, grip: p.pinch };
  }
  // Frozen through a loss, but not for ever: a hand that never returns lets go.
  if (h.vr && p.pinch && !h.select && !h.squeeze && (p.lostFor += h.dt ?? 0) < PINCH_CONFIG.lossTimeout) return { squeeze: true, grip: true };
  p.reset();
  return { squeeze: h.squeeze, grip: h.select || h.squeeze };
}

export type ReleaseKind = 'place' | 'drop' | 'throw';

/**
 * What letting go means: slow and near a surface settles the object right
 * there; fast is a throw; anything else just drops with the hand's momentum.
 * `speed` is the hand's speed (m/s), `height` the object's underside above the surface.
 */
export function releaseKind(speed: number, height: number, cfg = PINCH_CONFIG): ReleaseKind {
  if (speed >= cfg.throwSpeed) return 'throw';
  if (speed <= cfg.gentleSpeed && height <= cfg.placeHeight) return 'place';
  return 'drop';
}

/** Where a placed object rests: on the surface, never floating and never sunk into it. */
export function restHeight(surfaceY: number, halfHeight: number): number {
  return surfaceY + Math.max(0, halfHeight);
}

export interface GrabCandidate {
  id: string;
  x: number;
  y: number;
  z: number;
}

/** The candidate closest to the pinch point within `radius`, or null. */
export function nearestCandidate<T extends GrabCandidate>(list: readonly T[], x: number, y: number, z: number, radius = PINCH_CONFIG.grabRadius): T | null {
  let best: T | null = null;
  let bestD = radius;
  for (const c of list) {
    const d = Math.hypot(c.x - x, c.y - y, c.z - z);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
