// Applies the render quality tier (game/quality.ts). Flat view: always 'high' (or what ?quality= / __quality.set says).
// In a headset session it starts at 'medium' and drops to 'low' by itself if the frame rate stays under ~88% of the
// session's rate for a few seconds. It leaves the session at 'high' again.

import { createSystem, VisibilityState } from '@iwsdk/core';
import { nextLower, quality, QualityGovernor, type Tier, TIERS } from '../game/quality.js';

export class QualitySystem extends createSystem({}) {
  private gov = new QualityGovernor();
  private forced = false;
  private immersive = false;

  init(): void {
    const q = new URLSearchParams(location.search).get('quality') as Tier | null;
    if (q && TIERS.includes(q)) {
      quality.set(q);
      this.forced = true;
    }
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        const imm = v !== VisibilityState.NonImmersive;
        if (imm === this.immersive) return;
        this.immersive = imm;
        this.gov.reset();
        if (!this.forced) quality.set(imm ? 'medium' : 'high');
      }),
    );
    (window as unknown as { __quality?: unknown }).__quality = {
      get: () => quality.tier,
      set: (t: Tier) => {
        this.forced = true;
        quality.set(t);
      },
      auto: () => {
        this.forced = false;
      },
    };
  }

  update(delta: number): void {
    if (!this.immersive || this.forced) return;
    const session = this.world.session as (XRSession & { frameRate?: number }) | undefined;
    const target = session?.frameRate ?? 72;
    if (this.gov.frame(Math.min(delta, 0.25), target)) {
      const t = nextLower(quality.tier);
      if (t !== quality.tier) {
        quality.set(t);
        console.info(`[quality] frame rate under target: tier ${t}`);
      }
    }
  }
}
