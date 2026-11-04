// The one priority order for what a hand's pinch or poke means, used by every
// system that starts something from a hand (hands-only spec, phase 6):
//   1. an object already held   2. a UI tap   3. a grab   4. movement   5. other gestures
// A lower action may only start on a hand when nothing above it is using that
// hand. Pure, so the order is tested once instead of re-implemented per system.

export type HandAction = 'held' | 'ui' | 'grab' | 'move' | 'gesture';

export const HAND_PRIORITY: readonly HandAction[] = ['held', 'ui', 'grab', 'move', 'gesture'];

/** What one hand is doing right now. */
export interface HandBusy {
  /** This hand holds the carried object (or the hand's pinch is what keeps it held). */
  held: boolean;
  /** The fingertip is on / has just tapped a UI icon. */
  ui: boolean;
  /** This hand's pinch is a grab in progress. */
  grab: boolean;
  /** This hand's pinch is a teleport aim in progress. */
  move: boolean;
}

/** May `action` start on a hand in state `s`? Nothing of higher priority may be using it. */
export function mayStart(action: HandAction, s: HandBusy): boolean {
  for (const a of HAND_PRIORITY) {
    if (a === action) return true;
    if (a === 'held' && s.held) return false;
    if (a === 'ui' && s.ui) return false;
    if (a === 'grab' && s.grab) return false;
    if (a === 'move' && s.move) return false;
  }
  return true;
}
