// Frame statistics for the dev perf overlay and playtest reports (docs/PERF_REPORT.md).
// Pure: a fixed ring buffer, nothing allocated per push. CPU time is what the page spends from the first
// system of a frame to the end of the render call; frame time is the interval between frames.

export const FRAME_BUDGET_90 = 1000 / 90;

export class PerfStats {
  private frame: Float32Array;
  private cpu: Float32Array;
  private sorted: Float32Array;
  private i = 0;
  private n = 0;
  /** Frames over 1.5x the budget since the last reset (a visible hitch). */
  spikes = 0;
  /** Longest frame since the last reset (ms). */
  worst = 0;

  constructor(
    readonly size = 600,
    readonly budgetMs = FRAME_BUDGET_90,
  ) {
    this.frame = new Float32Array(size);
    this.cpu = new Float32Array(size);
    this.sorted = new Float32Array(size);
  }

  reset(): void {
    this.i = this.n = 0;
    this.spikes = 0;
    this.worst = 0;
  }

  push(frameMs: number, cpuMs: number): void {
    this.frame[this.i] = frameMs;
    this.cpu[this.i] = cpuMs;
    this.i = (this.i + 1) % this.size;
    this.n = Math.min(this.size, this.n + 1);
    if (frameMs > this.budgetMs * 1.5) this.spikes++;
    if (frameMs > this.worst) this.worst = frameMs;
  }

  get count(): number {
    return this.n;
  }

  private mean(a: Float32Array, last: number): number {
    const k = Math.min(last, this.n);
    if (!k) return 0;
    let s = 0;
    for (let j = 1; j <= k; j++) s += a[(this.i - j + this.size) % this.size];
    return s / k;
  }

  /** Mean frame time (ms) over the last `last` frames. */
  frameMs(last = this.n): number {
    return this.mean(this.frame, last);
  }

  cpuMs(last = this.n): number {
    return this.mean(this.cpu, last);
  }

  fps(last = this.n): number {
    const f = this.frameMs(last);
    return f > 0 ? 1000 / f : 0;
  }

  /** Percentile (0..1) of frame time, or CPU time with `cpu`. */
  percentile(p: number, cpu = false): number {
    if (!this.n) return 0;
    const src = cpu ? this.cpu : this.frame;
    for (let j = 0; j < this.n; j++) this.sorted[j] = src[j];
    const view = this.sorted.subarray(0, this.n);
    view.sort();
    return view[Math.min(this.n - 1, Math.floor(p * this.n))];
  }

  /** Share (0..1) of frames within the budget. */
  withinBudget(): number {
    if (!this.n) return 0;
    let k = 0;
    for (let j = 0; j < this.n; j++) if (this.frame[j] <= this.budgetMs * 1.05) k++;
    return k / this.n;
  }
}

/**
 * The display rate to ask for: `target` when the runtime lists it, else null (keep the runtime default).
 * Never asks for a rate the device did not offer.
 */
export function pickFrameRate(supported: ArrayLike<number> | null | undefined, target = 90): number | null {
  if (!supported) return null;
  for (let i = 0; i < supported.length; i++) if (Math.abs(supported[i] - target) < 0.5) return supported[i];
  return null;
}
