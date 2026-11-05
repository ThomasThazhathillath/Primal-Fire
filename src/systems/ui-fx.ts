// Small, cheap UI motion and sound shared by every panel. Nothing here runs per
// frame unless something is actually animating, and nothing allocates per frame.
//   PopIn   - a card eases in (scale + a short slide up) and eases out before it hides.
//   tapSound - one soft tick for every accepted fingertip tap.

import type { Object3D } from '@iwsdk/core';

const IN_SECONDS = 0.2;
const OUT_SECONDS = 0.12;
/** How far (m) a card slides up as it opens. */
const SLIDE = 0.025;

const easeOutBack = (t: number): number => {
  const c = 1.4;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

export class PopIn {
  private t = 1;
  private mode: 'idle' | 'in' | 'out' = 'idle';
  private baseY = 0;
  private done: (() => void) | null = null;
  /** True while it is moving (the owner only calls update() then). */
  get busy(): boolean {
    return this.mode !== 'idle';
  }

  constructor(
    private obj: Object3D,
    private scale: () => number,
  ) {}

  /** Call right after the panel has been placed and made visible. */
  open(): void {
    this.baseY = this.obj.position.y;
    this.t = 0;
    this.mode = 'in';
    this.done = null;
    this.apply(0);
  }

  /** Ease out, then call `hide`. Opening again before it finishes cancels it. */
  close(hide: () => void): void {
    if (!this.obj.visible) return hide();
    this.baseY = this.obj.position.y;
    this.t = 0;
    this.mode = 'out';
    this.done = hide;
  }

  update(dt: number): void {
    if (this.mode === 'idle') return;
    this.t = Math.min(1, this.t + dt / (this.mode === 'in' ? IN_SECONDS : OUT_SECONDS));
    this.apply(this.t);
    if (this.t >= 1) {
      const done = this.done;
      this.mode = 'idle';
      this.done = null;
      if (this.mode === 'idle' && done) done();
      this.obj.scale.setScalar(this.scale());
      this.obj.position.y = this.baseY;
    }
  }

  private apply(t: number): void {
    const k = this.mode === 'in' ? easeOutBack(t) : 1 - t;
    const s = this.scale();
    const f = this.mode === 'in' ? 0.88 + 0.12 * k : 0.88 + 0.12 * k;
    this.obj.scale.setScalar(s * f);
    this.obj.position.y = this.baseY - (1 - Math.min(1, k)) * SLIDE;
  }
}

let ctx: AudioContext | null = null;

/** A soft two-note tick: quiet, short, never harsh. */
export function tapSound(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    if (ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1180, t);
    o.frequency.exponentialRampToValueAtTime(760, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.1);
  } catch {
    // No audio.
  }
}
