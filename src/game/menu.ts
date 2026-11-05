// How the fingertip menu fits together (pure): which one panel is open, whether
// the icon grid is unfolded, and how refused taps are reported. The icon grid
// folds away while a panel is open; the panel's Back button returns to the grid.
// Only one panel is ever open: opening a second closes the first.

export class MenuStack {
  /** Id of the open panel, or null. */
  current: string | null = null;
  /** The icon grid is unfolded (it is hidden while a panel is open, and folded to the Menu button otherwise). */
  gridOpen = false;
  private closers = new Map<string, () => void>();

  /** A panel tells the stack how to close itself. */
  register(id: string, close: () => void): void {
    this.closers.set(id, close);
  }

  /** Is the full icon grid on show right now? */
  get gridVisible(): boolean {
    return this.current === null && this.gridOpen;
  }

  /** Open `id`: any other panel closes, the grid folds. */
  open(id: string): void {
    if (this.current && this.current !== id) {
      const prev = this.current;
      this.current = null;
      this.closers.get(prev)?.();
    }
    this.current = id;
    this.gridOpen = false;
  }

  /** The panel closed itself (X, objective change, mode change): nothing else changes. */
  closed(id: string): void {
    if (this.current === id) this.current = null;
  }

  /** The panel's Back button: close it and show the icon grid. */
  back(): void {
    const id = this.current;
    this.current = null;
    if (id) this.closers.get(id)?.();
    this.gridOpen = true;
  }

  /** The Menu button: with a panel open it goes back to the grid, otherwise it unfolds or folds the grid. */
  toggleGrid(): void {
    if (this.current) this.back();
    else this.gridOpen = !this.gridOpen;
  }
}

/** Keeps the play-test log readable: the same refusal on the same target is written at most once per `gapMs`. */
export class RejectLog {
  private last = new Map<string, number>();
  constructor(private gapMs = 1500) {}

  /** True if this refusal should be written now. */
  shouldLog(key: string, nowMs: number): boolean {
    const at = this.last.get(key);
    if (at !== undefined && nowMs - at < this.gapMs) return false;
    this.last.set(key, nowMs);
    if (this.last.size > 200) this.last.clear();
    return true;
  }
}

/** One line for the play-test log. */
export function rejectLine(panel: string, target: string, reason: string, hand: number): string {
  return `tap rejected: ${reason} on ${panel}/${target} (${hand === 0 ? 'left' : 'right'} hand)`;
}
