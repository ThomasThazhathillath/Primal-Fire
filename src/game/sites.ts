// Shelter sites (Lesson 01, Phase 2): a few authored low hollows and slightly raised spots around the
// Waking Clearing. The terrain mesh itself stays as it is (groundHeight is shared by trees, tracks and
// wildlife, and structures sit at y = 0), so these are data: ShelterSystem marks them on the ground (a
// damp, dark hollow where mist gathers on calm nights; a pale, dry rise), the body feels the cold air that
// pools in a hollow at night (climate.ts HOLLOW_CHILL), and starting a lean-to in a hollow is turned down
// with the reason (blueprint.ts checkPlacement, guide failure site.lowGround).

export type SiteKind = 'hollow' | 'rise';

export interface SiteFeature {
  id: string;
  kind: SiteKind;
  x: number;
  z: number;
  /** Radius (m) of the low or raised ground. */
  r: number;
}

/** Inside the Waking Clearing, where the ground is level and there are no trees (checked in tests/lesson01.test.ts). */
export const SITE_FEATURES: readonly SiteFeature[] = [
  { id: 'westHollow', kind: 'hollow', x: -4.6, z: -2.2, r: 1.9 },
  { id: 'southHollow', kind: 'hollow', x: 0.8, z: -4.9, r: 1.6 },
  { id: 'northRise', kind: 'rise', x: -3.8, z: 3.2, r: 1.7 },
  { id: 'birchRise', kind: 'rise', x: -0.8, z: 5.0, r: 1.4 },
];

export interface SiteHere {
  kind: SiteKind | 'flat';
  /** 0 at the edge .. 1 at the centre (0 on flat ground). */
  depth: number;
  feature: SiteFeature | null;
}

/** What the ground is like at (x, z): in a hollow, on a rise, or plain flat ground. No allocation per call. */
export function siteAt(x: number, z: number, out: SiteHere = { kind: 'flat', depth: 0, feature: null }): SiteHere {
  out.kind = 'flat';
  out.depth = 0;
  out.feature = null;
  for (const f of SITE_FEATURES) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d >= f.r) continue;
    const k = 1 - d / f.r;
    const depth = k * k * (3 - 2 * k);
    if (depth > out.depth) {
      out.kind = f.kind;
      out.depth = depth;
      out.feature = f;
    }
  }
  return out;
}

/** How deep in a hollow (x, z) is (0..1): what the body feels of the cold air pooling there. */
export function hollowDepth(x: number, z: number): number {
  let best = 0;
  for (const f of SITE_FEATURES) {
    if (f.kind !== 'hollow') continue;
    const d = Math.hypot(x - f.x, z - f.z);
    if (d >= f.r) continue;
    const k = 1 - d / f.r;
    best = Math.max(best, k * k * (3 - 2 * k));
  }
  return best;
}

/** The nearest slightly raised spot to (x, z), for hints. */
export function nearestRise(x: number, z: number): SiteFeature | null {
  let best: SiteFeature | null = null;
  let bd = Infinity;
  for (const f of SITE_FEATURES) {
    if (f.kind !== 'rise') continue;
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}
