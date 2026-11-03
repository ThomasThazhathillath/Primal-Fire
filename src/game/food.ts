// Level 3 "Camp": food. Pure rules on top of Game; FishingSystem and
// FarmSystem turn hand/mouse actions into calls and draw the world.
//
//   fishing:  fish swim in the stream. You see their image, which light
//             bending at the surface (refraction) lifts towards you, so a
//             spear thrust at the image passes over the real fish. Aim below.
//   cooking:  hold a fish over the burning fire until it is cooked through.
//   farming:  dig a plot with the digging stick, plant a tuber or seeds,
//             water it from the pot; it grows over game time while watered
//             and in light, then harvest it.

import type { Game } from './game.js';
import type { ItemId } from './items.js';
import { mulberry32, type Rng } from './rng.js';
import { nearestTreeDistance, STREAM, STREAM_BANK, STREAM_HALF_WIDTH, streamDistance } from './world-layout.js';

// ----------------------------------------------------------------- fish

/** Refractive index of water (air ≈ 1). */
export const WATER_INDEX = 1.33;
/** Stream surface height (m). */
export const WATER_Y = 0.02;
/** A thrust must pass this close (m) to the real fish at its depth. */
export const SPEAR_TOLERANCE = 0.1;
/** Fish swim this close to the player (m) so there are always some to try for. */
export const FISH_RANGE = 9;
export const FISH_COUNT = 5;

export interface Fish {
  id: number;
  /** True position (m); `depth` below the surface. */
  x: number;
  z: number;
  depth: number;
  heading: number;
  speed: number;
  /** Seconds until it picks a new heading. */
  turn: number;
  /** Seconds of fright after a miss (darts fast, ignores you). */
  scared: number;
}

/**
 * Where you see the fish. Looking down through the surface, an underwater
 * object appears at about depth / n (paraxial approximation), directly above
 * where it really is. Away from straight down the shift is larger; the game
 * keeps the simple vertical model and lets the spear geometry do the rest.
 */
export function apparentDepth(depth: number): number {
  return depth / WATER_INDEX;
}

/**
 * Does a thrust from `eye` along `dir` reach the fish? The spear travels in
 * a straight line (it does not bend at the surface), so we find where that
 * line is at the fish's TRUE depth and compare with the fish's position.
 * Returns the miss distance there (m) and whether it is a hit.
 */
export function spearHit(
  eye: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  fish: Pick<Fish, 'x' | 'z' | 'depth'>,
): { hit: boolean; miss: number; overshoot: boolean } {
  const targetY = WATER_Y - fish.depth;
  if (dir.y >= -1e-4) return { hit: false, miss: Infinity, overshoot: false };
  const t = (targetY - eye.y) / dir.y;
  const px = eye.x + dir.x * t;
  const pz = eye.z + dir.z * t;
  const miss = Math.hypot(px - fish.x, pz - fish.z);
  // Overshoot: the line reached the fish's depth beyond it (aimed at the raised image).
  const toFish = Math.hypot(fish.x - eye.x, fish.z - eye.z);
  const toHit = Math.hypot(px - eye.x, pz - eye.z);
  return { hit: miss <= SPEAR_TOLERANCE, miss, overshoot: toHit > toFish };
}

/** A point on the stream centreline near (x, z), for spawning fish. */
function streamPointNear(x: number, z: number, rng: Rng): { x: number; z: number } {
  let best = { x: STREAM[0][0], z: STREAM[0][1], d: Infinity };
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [ax, az] = STREAM[i];
    const [bx, bz] = STREAM[i + 1];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < best.d) best = { x: px, z: pz, d };
    }
  }
  return { x: best.x + (rng() - 0.5) * 0.6, z: best.z + (rng() - 0.5) * 3 };
}

// --------------------------------------------------------------- farming

export const PLOT_LIMIT = 4;
/** Game seconds of watered, sunny growth to ripen. */
export const GROW_SECONDS = 120;
/** One watering keeps the soil moist this long (game seconds). */
export const MOIST_SECONDS = 60;
/** Under a canopy closer than this (m), plants get too little light and grow slowly. */
export const SHADE_DISTANCE = 1.6;
export const SHADE_FACTOR = 0.35;

export interface Plot {
  id: number;
  x: number;
  z: number;
  crop: 'tuber' | 'seeds' | null;
  /** 0..1 */
  growth: number;
  /** Seconds of moisture left. */
  moist: number;
  shaded: boolean;
}

// ----------------------------------------------------------------- cook

/** Seconds over a burning fire to cook a fish through. */
export const COOK_SECONDS = 8;

export interface FoodSave {
  plots: Plot[];
  cook: number;
  nextId: number;
}

export interface FoodAction {
  id: 'digPlot' | 'plant' | 'water' | 'harvest' | 'cook' | 'eat' | 'eatRaw';
  label: string;
  at: { x: number; z: number };
  plotId?: number;
}

const near = (a: { x: number; z: number }, b: { x: number; z: number }, r: number) => Math.hypot(a.x - b.x, a.z - b.z) <= r;
const USE_RADIUS = 1.6;

export class FoodState {
  readonly fish: Fish[] = [];
  readonly plots: Plot[] = [];
  /** Seconds the held fish has spent over the fire. */
  cook = 0;
  private nextId = 1;
  private rng: Rng = mulberry32(77);

  constructor(private g: Game) {}

  // -------------------------------------------------------------- fish

  /** Keeps a few fish swimming in the stream near the player. */
  updateFish(dt: number): void {
    const p = this.g.player;
    for (let i = this.fish.length - 1; i >= 0; i--) {
      if (!near(this.fish[i], p, FISH_RANGE * 1.6)) this.fish.splice(i, 1);
    }
    if (streamDistance(p.x, p.z) < FISH_RANGE) {
      while (this.fish.length < FISH_COUNT) {
        const s = streamPointNear(p.x + (this.rng() - 0.5) * 8, p.z + (this.rng() - 0.5) * 8, this.rng);
        this.fish.push({
          id: this.nextId++,
          x: s.x,
          z: s.z,
          depth: 0.35 + this.rng() * 0.3,
          heading: this.rng() * Math.PI * 2,
          speed: 0.15 + this.rng() * 0.2,
          turn: 1 + this.rng() * 3,
          scared: 0,
        });
      }
    }
    for (const f of this.fish) {
      f.turn -= dt;
      f.scared = Math.max(0, f.scared - dt);
      if (f.turn <= 0) {
        f.heading += (this.rng() - 0.5) * 2.4;
        f.turn = 1 + this.rng() * 3;
      }
      const v = f.scared > 0 ? 1.4 : f.speed;
      const nx = f.x + Math.sin(f.heading) * v * dt;
      const nz = f.z + Math.cos(f.heading) * v * dt;
      // Stay in the channel: turn back at the banks.
      if (streamDistance(nx, nz) < STREAM_HALF_WIDTH * 0.85) {
        f.x = nx;
        f.z = nz;
      } else {
        f.heading += Math.PI * (0.6 + this.rng() * 0.8);
      }
    }
  }

  /**
   * A spear thrust along a line. Hits the first fish the line reaches;
   * otherwise records why it missed. Needs a fishing spear in hand.
   */
  thrust(eye: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }): 'hit' | 'refraction' | 'miss' | 'noSpear' {
    const g = this.g;
    if (g.held !== 'fishingSpear') return 'noSpear';
    let best: { f: Fish; r: ReturnType<typeof spearHit> } | null = null;
    for (const f of this.fish) {
      const r = spearHit(eye, dir, f);
      if (!best || r.miss < best.r.miss) best = { f, r };
    }
    if (!best || best.r.miss > 1.2) return 'miss';
    if (best.r.hit && best.f.scared <= 0) {
      this.fish.splice(this.fish.indexOf(best.f), 1);
      g.addItem('fish');
      g.science('food.fish.caught');
      g.toast('Got one! A fish flaps on the spear.', 'good');
      g.checkQuests();
      return 'hit';
    }
    best.f.scared = 2.5;
    // Aimed at the image: the straight spear passes above the fish and lands beyond it.
    if (best.r.overshoot && best.r.miss < 0.5) {
      g.science('food.fish.miss.refraction');
      g.toast('The spear struck just beyond the fish. It is deeper and closer than it looks: aim below it.', 'bad');
      return 'refraction';
    }
    g.toast('Missed. The fish darts away.', 'bad');
    return 'miss';
  }

  // -------------------------------------------------------------- farm

  plotNear(at: { x: number; z: number }): Plot | null {
    return this.plots.find((p) => near(p, at, USE_RADIUS)) ?? null;
  }

  canDig(at: { x: number; z: number }): boolean {
    return (
      this.plots.length < PLOT_LIMIT &&
      streamDistance(at.x, at.z) > STREAM_BANK + 0.5 &&
      !this.plots.some((p) => near(p, at, 0.9)) &&
      !this.g.structures.some((s) => near(s, at, 1.2))
    );
  }

  tick(dt: number): void {
    this.updateFish(dt);
    for (const p of this.plots) {
      if (!p.crop || p.growth >= 1) continue;
      if (p.moist > 0) {
        p.moist = Math.max(0, p.moist - dt);
        p.growth = Math.min(1, p.growth + (dt / GROW_SECONDS) * (p.shaded ? SHADE_FACTOR : 1));
        if (p.growth >= 1) this.g.toast('A plant in your plot is ready to harvest.', 'good');
        if (p.moist === 0 && p.growth < 1) {
          this.g.science('farm.dry');
          this.g.toast('The soil in a plot has dried out; the leaves droop. Water it.', 'bad');
        }
      }
    }
    // Cooking only counts while the fish is held over the fire.
    if (this.g.held !== 'fish') this.cook = 0;
  }

  /** Cooking progress while you hold the fish over a burning fire (called each frame by the input layer). */
  cookOver(dt: number): boolean {
    const g = this.g;
    if (g.held !== 'fish' || !g.water.burningFireNear()) return false;
    this.cook += dt;
    if (this.cook < COOK_SECONDS) return false;
    this.cook = 0;
    g.useItem('fish');
    g.addItem('cookedFish');
    g.takeOut('cookedFish');
    g.science('food.cooked');
    g.science('food.fish.opaque');
    g.toast('The flesh turned white and opaque and flakes apart: cooked through.', 'good');
    g.checkQuests();
    return true;
  }

  available(at = this.g.player, held: ItemId | null = this.g.held): FoodAction | null {
    const plot = this.plotNear(at);
    if (held === 'cookedFish') return { id: 'eat', label: 'Eat the cooked fish', at };
    if (held === 'fish') {
      if (this.g.water.burningFireNear(at)) return { id: 'cook', label: 'Hold the fish over the fire to cook it', at };
      return { id: 'eatRaw', label: 'Eat the fish raw?', at };
    }
    if (plot) {
      if (plot.crop && plot.growth >= 1) return { id: 'harvest', label: 'Harvest the ripe plant', at: plot, plotId: plot.id };
      if (!plot.crop && (held === 'tuber' || held === 'seeds')) return { id: 'plant', label: `Plant the ${held === 'tuber' ? 'tuber' : 'seeds'}`, at: plot, plotId: plot.id };
      if (plot.crop && held === 'pot' && this.g.water.potWater !== 'empty') return { id: 'water', label: 'Water the plot from the pot', at: plot, plotId: plot.id };
      return null;
    }
    if (held === 'diggingStick' && this.canDig(at)) return { id: 'digPlot', label: 'Dig a planting plot', at };
    return null;
  }

  perform(a: FoodAction): boolean {
    const g = this.g;
    const plot = a.plotId != null ? this.plots.find((p) => p.id === a.plotId) : null;
    switch (a.id) {
      case 'digPlot':
        if (g.held !== 'diggingStick' || !this.canDig(a.at)) return false;
        this.plots.push({ id: this.nextId++, x: a.at.x, z: a.at.z, crop: null, growth: 0, moist: 0, shaded: nearestTreeDistance(a.at.x, a.at.z) < SHADE_DISTANCE });
        g.science('farm.plot.dug');
        g.toast('Loose, dark soil: ready to plant.', 'info');
        g.checkQuests();
        return true;
      case 'plant': {
        if (!plot || plot.crop || (g.held !== 'tuber' && g.held !== 'seeds')) return false;
        plot.crop = g.held;
        g.useItem(g.held);
        g.science('farm.planted');
        if (plot.shaded) {
          g.science('farm.shade');
          g.toast('Planted, but the trees shade this plot. It will grow slowly.', 'info');
        } else g.toast('Planted. Now it needs water.', 'info');
        g.checkQuests();
        return true;
      }
      case 'water':
        if (!plot || !plot.crop || g.held !== 'pot' || g.water.potWater === 'empty') return false;
        g.water.potWater = 'empty';
        plot.moist = MOIST_SECONDS;
        g.science('farm.watered');
        g.toast('You soak the soil around the plant.', 'info');
        g.checkQuests();
        return true;
      case 'harvest':
        if (!plot || !plot.crop || plot.growth < 1) return false;
        g.addItem('tuber', plot.crop === 'tuber' ? 3 : 2);
        if (plot.crop === 'seeds') g.addItem('seeds', 2);
        plot.crop = null;
        plot.growth = 0;
        g.science('farm.harvested');
        g.toast('A good harvest: fat tubers, full of stored starch.', 'good');
        g.checkQuests();
        return true;
      case 'cook':
        g.toast('Hold it there until it turns opaque...', 'info');
        return true;
      case 'eat':
        if (g.held !== 'cookedFish') return false;
        g.useItem('cookedFish');
        g.science('body.eat');
        g.toast('Hot, flaky fish. Your strength comes back.', 'good');
        g.checkQuests();
        return true;
      case 'eatRaw':
        g.science('food.raw.refused');
        g.toast('Raw fish can carry parasites and bacteria. Cook it first.', 'bad');
        return true;
    }
  }

  snapshot(): FoodSave {
    return { plots: this.plots.map((p) => ({ ...p })), cook: 0, nextId: this.nextId };
  }

  restore(s: FoodSave): void {
    this.plots.push(...s.plots.map((p) => ({ ...p })));
    this.nextId = Math.max(this.nextId, s.nextId);
  }
}
