// Render quality tiers for the Quest (the competition needs 60 fps, 72 is the goal). The look is kept as close as
// possible: each tier only trims the per-pixel and per-frame cost that is hardest to see. QualityGovernor is the pure
// auto-switch rule (tested); QualitySystem feeds it frame times and applies the tier.

export type Tier = 'high' | 'medium' | 'low';
export const TIERS: Tier[] = ['high', 'medium', 'low'];

export interface QualityConfig {
  /** Ground fragment shader: 2 = full (two samples per layer, normal maps, all noise), 1 = one sample per layer, no normal maps, 0 = pre-blended colour only. */
  ground: 0 | 1 | 2;
  /** Water fragment shader: 2 = full, 1 = single normal layer, no cloud reflection or rock foam, 0 = also no glint noise. */
  water: 0 | 1 | 2;
  /** Grass tufts and mid-distance clumps (1 = all), and the mid layer's reach (1 = 15 m). */
  grassCount: number;
  grassReach: number;
  /** Procedural cloud dome (the photo clouds stay); the physical (Preetham) sky box. */
  /** Trees, bushes and ferns switch to coarser levels at this fraction... of the distance divided by it (1.2 = 17% sooner). */
  lodScale: number;
  proceduralClouds: boolean;
  physicalSky: boolean;
  /** Seconds between image-based-light rebuilds (each renders and filters a cube map). */
  iblPeriod: number;
  skyEnvPeriod: number;
}

export const QUALITY: Record<Tier, QualityConfig> = {
  high: { ground: 2, water: 2, grassCount: 1, grassReach: 1, lodScale: 1, proceduralClouds: true, physicalSky: true, iblPeriod: 4, skyEnvPeriod: 6 },
  medium: { ground: 1, water: 1, grassCount: 0.7, grassReach: 0.8, lodScale: 1.2, proceduralClouds: false, physicalSky: true, iblPeriod: 20, skyEnvPeriod: 30 },
  low: { ground: 0, water: 0, grassCount: 0.4, grassReach: 0.6, lodScale: 1.5, proceduralClouds: false, physicalSky: false, iblPeriod: 60, skyEnvPeriod: 90 },
};

/** The live tier: systems read `quality.cfg` (and `quality.version` to know when to re-apply). */
export const quality = {
  tier: 'high' as Tier,
  cfg: QUALITY.high,
  version: 0,
  set(t: Tier): void {
    if (t === this.tier) return;
    this.tier = t;
    this.cfg = QUALITY[t];
    this.version++;
  },
};

/**
 * Drops one tier when the frame rate stays below `fraction` of the target for `holdSeconds` in a row (checked every
 * `windowSeconds`). Never climbs back up while the session runs: oscillating tiers would be worse than a stable one.
 */
export class QualityGovernor {
  private acc = 0;
  private frames = 0;
  private low = 0;
  constructor(
    private windowSeconds = 1.5,
    private holdWindows = 3,
    private fraction = 0.88,
    private settleSeconds = 4,
  ) {}
  private since = 0;

  reset(): void {
    this.acc = this.frames = this.low = 0;
    this.since = 0;
  }

  /** Feed one frame; returns true when the tier should drop now. */
  frame(dt: number, targetFps: number): boolean {
    this.since += dt;
    // Right after entering a session or switching tier the first frames are not representative.
    if (this.since < this.settleSeconds) return false;
    this.acc += dt;
    this.frames++;
    if (this.acc < this.windowSeconds) return false;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    this.low = fps < targetFps * this.fraction ? this.low + 1 : 0;
    if (this.low >= this.holdWindows) {
      this.low = 0;
      this.since = 0;
      return true;
    }
    return false;
  }
}

export const nextLower = (t: Tier): Tier => TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(t) + 1)];
