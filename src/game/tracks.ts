// Animal tracks (Phase 3, milestone B). A fixed-size ring of footprints: animals drop one every
// stride while they walk or run, and a few old trails are laid at the start between the grazing
// ground and the water so there is always something to find. Prints fade with game time
// (freshness is what the player learns to read: sharp and dark = fresh, blurred and pale = old).
// Not saved: the seeded trails come back identical, and what you have identified lives in the
// science-event set. No allocation after construction.

import { mulberry32 } from './rng.js';
import { groundHeight, LANDMARK_BY_ID, STREAM, streamDistance } from './world-layout.js';
import type { Animal, Species } from './wildlife.js';

export const TRACK_CAP = 120;
/** Seconds until a print is gone. */
export const TRACK_LIFE = 700;
export const FRESH_SECONDS = 150;

export interface Print {
  x: number;
  z: number;
  heading: number;
  species: Species;
  /** Game time it was made (can be negative for the seeded trails). */
  born: number;
  /** Alternate left/right foot for the pair offset. */
  side: number;
  live: boolean;
  /** A quest-trail print: has its own slots and never expires, so fresh/old can always be compared. */
  seeded?: boolean;
}

export type Freshness = 'fresh' | 'recent' | 'old';

export const freshness = (age: number): Freshness => (age < FRESH_SECONDS ? 'fresh' : age < 400 ? 'recent' : 'old');

export class Tracks {
  readonly prints: Print[] = [];
  /** Bumped whenever a print is added or removed (so the renderer knows to rebuild). */
  version = 0;
  private next = 0;
  /** Slots [0, reserved) hold the seeded trails; animals' prints cycle through the rest. */
  private reserved = 0;
  private seeding = true;
  private lastX = new Map<number, number>();
  private lastZ = new Map<number, number>();

  constructor(seed = 77) {
    for (let i = 0; i < TRACK_CAP; i++) {
      this.prints.push({ x: 0, z: 0, heading: 0, species: 'deer', born: 0, side: 0, live: false });
    }
    // Seeded trails: from each grazing ground to the nearest stream point, aged differently.
    const rng = mulberry32(seed);
    const starts = [LANDMARK_BY_ID.meadow, LANDMARK_BY_ID.glade].map((l) => ({ x: l.x, z: l.z }));
    const trails: Array<{ species: Species; ageBase: number }> = [
      { species: 'deer', ageBase: 60 },
      { species: 'deer', ageBase: 380 },
      { species: 'rabbit', ageBase: 200 },
    ];
    trails.forEach((tr, k) => {
      const s = starts[k % starts.length];
      // Nearest stream point.
      let bx = STREAM[0][0];
      let bz = STREAM[0][1];
      let bd = Infinity;
      for (let i = 0; i < STREAM.length - 1; i++) {
        for (let j = 0; j <= 6; j++) {
          const px = STREAM[i][0] + (STREAM[i + 1][0] - STREAM[i][0]) * (j / 6);
          const pz = STREAM[i][1] + (STREAM[i + 1][1] - STREAM[i][1]) * (j / 6);
          const d = Math.hypot(px - s.x, pz - s.z);
          if (d < bd) {
            bd = d;
            bx = px;
            bz = pz;
          }
        }
      }
      // Stop at the bank, not in the water.
      const dx = bx - s.x;
      const dz = bz - s.z;
      const len = Math.hypot(dx, dz) || 1;
      const steps = Math.min(16, Math.floor((len - 2) / (tr.species === 'deer' ? 0.8 : 0.5)));
      const stride = tr.species === 'deer' ? 0.8 : 0.5;
      const offset = (k - 1) * 2.2;
      const heading = Math.atan2(dx, dz);
      for (let i = 0; i < steps; i++) {
        const t = i * stride;
        const wob = Math.sin(i * 0.6 + rng()) * 0.5;
        const x = s.x + (dx / len) * t + (dz / len) * (offset + wob);
        const z = s.z + (dz / len) * t - (dx / len) * (offset + wob);
        if (streamDistance(x, z) < 1.4) break;
        this.add(x, z, heading, tr.species, -(tr.ageBase + i * 3), i);
      }
    });
    this.seeding = false;
    this.reserved = this.next;
  }

  private add(x: number, z: number, heading: number, species: Species, born: number, side: number): void {
    const p = this.prints[this.next];
    p.seeded = this.seeding;
    this.next = this.seeding ? this.next + 1 : this.reserved + ((this.next + 1 - this.reserved) % (TRACK_CAP - this.reserved));
    p.x = x;
    p.z = z;
    p.heading = heading;
    p.species = species;
    p.born = born;
    p.side = side;
    p.live = true;
    this.version++;
  }

  /** Animals leave a print every stride while they move on the ground. */
  note(a: Animal, now: number): void {
    if (a.species === 'bird' || a.hidden || !a.active) return;
    if (a.state !== 'walk' && a.state !== 'run' && a.state !== 'flee') return;
    const lx = this.lastX.get(a.id) ?? a.x;
    const lz = this.lastZ.get(a.id) ?? a.z;
    const stride = a.species === 'deer' ? 0.8 : 0.5;
    if (Math.hypot(a.x - lx, a.z - lz) < stride) {
      if (!this.lastX.has(a.id)) {
        this.lastX.set(a.id, a.x);
        this.lastZ.set(a.id, a.z);
      }
      return;
    }
    this.lastX.set(a.id, a.x);
    this.lastZ.set(a.id, a.z);
    this.add(a.x, a.z, a.heading, a.species, now, (Math.round(now * 3) + a.id) & 1);
  }

  /** Remove prints that have faded away. */
  expire(now: number): void {
    for (const p of this.prints) if (p.live && !p.seeded && now - p.born > TRACK_LIFE) {
      p.live = false;
      this.version++;
    }
  }

  /** Nearest live print within `r` metres, or null. */
  nearest(x: number, z: number, r: number, now: number): { print: Print; index: number; age: number } | null {
    let best = -1;
    let bd = r;
    for (let i = 0; i < this.prints.length; i++) {
      const p = this.prints[i];
      if (!p.live) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best < 0 ? null : { print: this.prints[best], index: best, age: now - this.prints[best].born };
  }

  /** Height to draw a print at (just above the ground). */
  y(p: Print): number {
    return groundHeight(p.x, p.z) + 0.03;
  }
}
