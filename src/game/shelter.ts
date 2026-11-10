// Chapter 2, the first shelter (docs/CHAPTER2_SHELTER_SPEC.md, plan in docs/CHAPTER2_SHELTER_PLAN.md).
// Pure rules over a placed `leanTo` structure: which stage it is at, how well each roof panel keeps
// rain out, the rain test, the drainage channel, and resting inside. Everything is derived from the
// structure's filled spots (saved with it) plus a small saved test block, so any stage survives a
// reload. No three.js, no allocation per call beyond small arrays.

import { BLUEPRINTS, openStage, type PlacedStructure, STAGE_NAMES } from './blueprint.js';
import type { ItemId } from './items.js';

export const PANELS = 3;
/** How much a roof layer keeps out: the bark base, overlapped leaves, then a thatch of grass. */
export const LAYER_WEIGHT: Record<'roofBark' | 'roofLeaf' | 'roofGrass', number> = { roofBark: 0.45, roofLeaf: 0.35, roofGrass: 0.3 };
/** A panel keeps the rain out at this much protection or more. */
export const PROTECT_NEED = 0.8;
/** Seconds of dry shelter (no leaks, channel dug) the rain test needs to pass. */
export const HOLD_DRY = 12;
/** The rain eases off after this many seconds if the test was not passed (it comes back later). */
export const RAIN_MAX = 300;
/** Seconds before the next shower after an eased-off one. */
export const RAIN_PAUSE = 25;
/** Seconds standing inside during the rain to count as having rested there. */
export const REST_SECONDS = 10;
/** Footprint (local x, z) of the sheltered floor under the roof. */
export const INTERIOR = { xMin: -0.95, xMax: 0.95, zMin: -0.95, zMax: 0.55 };

const defOf = () => BLUEPRINTS.leanTo;

/** Stage the build is at: 1 uprights ... 7 roof, 8 once everything is placed. The key (left upright) is placed with the plan. */
export function currentStage(s: PlacedStructure): number {
  const st = openStage(defOf(), s.spots);
  return Number.isFinite(st) ? st : 8;
}

export function stageName(stage: number): string {
  return stage >= 8 ? 'finished' : (STAGE_NAMES[stage] ?? 'frame');
}

/** Filled and total spots of one stage. */
export function stageCount(s: PlacedStructure, stage: number): { done: number; total: number } {
  let done = 0;
  let total = 0;
  defOf().spots.forEach((sp, i) => {
    if ((sp.stage ?? 0) !== stage) return;
    total++;
    if (s.spots[i] !== null && s.spots[i] !== undefined) done++;
  });
  return { done, total };
}

/** The frame (uprights, ridge, ribs, cross-supports, lashings and small branches) is complete. */
export function frameDone(s: PlacedStructure): boolean {
  return !s.keyOpen && defOf().spots.every((sp, i) => (sp.stage ?? 0) >= 7 || s.spots[i] !== null);
}

/** Roof layers on a panel, by spot role. */
export function panelLayers(s: PlacedStructure, panel: number): Array<'roofBark' | 'roofLeaf' | 'roofGrass'> {
  const out: Array<'roofBark' | 'roofLeaf' | 'roofGrass'> = [];
  defOf().spots.forEach((sp, i) => {
    if (sp.panel === panel && s.spots[i] && (sp.role === 'roofBark' || sp.role === 'roofLeaf' || sp.role === 'roofGrass')) out.push(sp.role);
  });
  return out;
}

/** How well panel `p` keeps rain out (0 none .. 1.1 everything). */
export function panelProtection(s: PlacedStructure, p: number): number {
  let sum = 0;
  for (const role of panelLayers(s, p)) sum += LAYER_WEIGHT[role];
  return sum;
}

/** Every panel has at least one layer: the roof is on (and may still leak). */
export function roofed(s: PlacedStructure): boolean {
  for (let p = 0; p < PANELS; p++) if (panelLayers(s, p).length === 0) return false;
  return true;
}

/** Panels that let rain through right now (empty when the roof is not on yet). */
export function leakingPanels(s: PlacedStructure): number[] {
  const out: number[] = [];
  if (!roofed(s)) return out;
  for (let p = 0; p < PANELS; p++) if (panelProtection(s, p) < PROTECT_NEED - 1e-9) out.push(p);
  return out;
}

/** The layer to add to a leaking panel, in the order that helps most (what is missing, bark first). */
export function repairFor(s: PlacedStructure, panel: number): { item: ItemId; label: string } | null {
  const have = panelLayers(s, panel);
  const options: Array<['roofBark' | 'roofLeaf' | 'roofGrass', ItemId, string]> = [
    ['roofBark', 'bark', 'bark'],
    ['roofLeaf', 'leafLitter', 'dry leaves'],
    ['roofGrass', 'dryGrass', 'dry grass'],
  ];
  for (const [role, item, label] of options) if (!have.includes(role)) return { item, label };
  return null;
}

/** Panel centre in the structure's local frame (for drips and wet patches). */
export function panelCentre(p: number): { x: number; y: number; z: number } {
  return { x: (p - 1) * 0.62, y: 0.9, z: -0.4 };
}

/** Is a world point under the roof (inside the shelter), given the structure's pose? */
export function inside(s: Pick<PlacedStructure, 'x' | 'z' | 'rotY'>, x: number, z: number): boolean {
  const dx = x - s.x;
  const dz = z - s.z;
  // Inverse of the spot transform in blueprint.ts (rotation about +Y by rotY).
  const c = Math.cos(s.rotY);
  const n = Math.sin(s.rotY);
  const lx = dx * c - dz * n;
  const lz = dx * n + dz * c;
  return lx >= INTERIOR.xMin && lx <= INTERIOR.xMax && lz >= INTERIOR.zMin && lz <= INTERIOR.zMax;
}

// ----------------------------------------------------------------- the rain test

export type TestPhase = 'idle' | 'rain' | 'pause' | 'passed';

export interface ShelterTestSave {
  phase: TestPhase;
  rainLeft: number;
  dry: number;
  pause: number;
  /** 0..1: water standing on the floor (rises while the channel is missing). */
  flood: number;
  /** Seconds rested inside during rain. */
  rested: number;
  /** A leak was seen at least once / sealed at least once (for the notebook). */
  leakSeen: boolean;
  sealed: boolean;
}

export interface TestInput {
  roofed: boolean;
  leaks: number;
  drained: boolean;
  /** The player is under the roof. */
  inside: boolean;
}

export type TestEvent = 'rainBegan' | 'leakSeen' | 'sealed' | 'drained' | 'rainEased' | 'passed' | 'rested' | null;

/**
 * The rain test as a small state machine: heavy rain is forced while it runs; leaks and a missing
 * drainage channel keep it from passing; a dry, drained shelter for HOLD_DRY seconds passes it. If
 * it is not passed in RAIN_MAX seconds the rain eases off and returns after RAIN_PAUSE.
 */
export class ShelterTest {
  phase: TestPhase = 'idle';
  rainLeft = 0;
  dry = 0;
  pause = 0;
  flood = 0;
  rested = 0;
  leakSeen = false;
  sealed = false;
  private hadLeaks = false;
  private wasDrained = false;

  get raining(): boolean {
    return this.phase === 'rain';
  }

  /** Begin the shower (the roof must be on). */
  start(): boolean {
    if (this.phase === 'rain' || this.phase === 'passed') return false;
    this.phase = 'rain';
    this.rainLeft = RAIN_MAX;
    this.dry = 0;
    return true;
  }

  /** Advance dt seconds; returns the event this step produced, if any (one at a time, most important first). */
  update(dt: number, inp: TestInput): TestEvent {
    if (this.phase === 'pause') {
      this.pause -= dt;
      if (this.pause <= 0) {
        this.phase = 'idle';
        if (inp.roofed) return this.start() ? 'rainBegan' : null;
      }
      return null;
    }
    if (this.phase === 'idle') {
      if (inp.roofed) return this.start() ? 'rainBegan' : null;
      return null;
    }
    if (this.phase !== 'rain') return null;
    this.rainLeft -= dt;
    // Water finds the floor when there is no channel: it rises while rain falls, drains once one is dug.
    this.flood = Math.max(0, Math.min(1, this.flood + (inp.drained ? -0.08 : 0.012) * dt));
    let ev: TestEvent = null;
    if (inp.leaks > 0) {
      this.hadLeaks = true;
      this.dry = 0;
      if (!this.leakSeen && inp.inside) {
        this.leakSeen = true;
        ev = 'leakSeen';
      }
    } else if (this.hadLeaks) {
      this.hadLeaks = false;
      if (!this.sealed) {
        this.sealed = true;
        ev = ev ?? 'sealed';
      }
    }
    if (inp.drained && !this.wasDrained) {
      this.wasDrained = true;
      ev = ev ?? 'drained';
    }
    if (inp.inside && inp.leaks === 0 && this.flood < 0.5) {
      const before = this.rested;
      this.rested += dt;
      if (before < REST_SECONDS && this.rested >= REST_SECONDS) ev = ev ?? 'rested';
    }
    if (inp.leaks === 0 && inp.drained && this.flood < 0.2) {
      this.dry += dt;
      if (this.dry >= HOLD_DRY) {
        this.phase = 'passed';
        this.rainLeft = 0;
        return 'passed';
      }
    } else if (inp.leaks > 0 || !inp.drained) this.dry = 0;
    if (this.rainLeft <= 0) {
      this.phase = 'pause';
      this.pause = RAIN_PAUSE;
      return ev ?? 'rainEased';
    }
    return ev;
  }

  snapshot(): ShelterTestSave {
    return { phase: this.phase, rainLeft: this.rainLeft, dry: this.dry, pause: this.pause, flood: this.flood, rested: this.rested, leakSeen: this.leakSeen, sealed: this.sealed };
  }

  restore(s: Partial<ShelterTestSave> | undefined): void {
    this.phase = s?.phase === 'rain' || s?.phase === 'pause' || s?.phase === 'passed' ? s.phase : 'idle';
    this.rainLeft = s?.rainLeft ?? 0;
    this.dry = s?.dry ?? 0;
    this.pause = s?.pause ?? 0;
    this.flood = Math.max(0, Math.min(1, s?.flood ?? 0));
    this.rested = s?.rested ?? 0;
    this.leakSeen = !!s?.leakSeen;
    this.sealed = !!s?.sealed;
    this.hadLeaks = false;
    this.wasDrained = false;
  }
}
