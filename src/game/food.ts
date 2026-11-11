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
import { type ItemId, itemName } from './items.js';
import { FORAGE_PATCHES, FORAGE_REGROW } from './forage.js';
import { mulberry32, type Rng } from './rng.js';
import { nearestTreeDistance, STREAM, STREAM_BANK, STREAM_HALF_WIDTH, streamDistance } from './world-layout.js';

// ----------------------------------------------------------------- fish

/** Refractive index of water (air ≈ 1). */
export const WATER_INDEX = 1.33;
/** Stream surface height (m). */
export const WATER_Y = 0.02;
/** A thrust must pass this close (m) to the real fish at its depth. */
export const SPEAR_TOLERANCE = 0.08;
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
  /** 0 small, 1 medium, 2 large: bigger fish are slower to scare and feed more. */
  size: number;
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
  return { x: best.x + (rng() - 0.5) * 0.4, z: best.z + (rng() - 0.5) * 3 };
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

export type CropStage = 'seed' | 'sprout' | 'young' | 'mature' | 'harvestable';
export const CROP_STAGES: CropStage[] = ['seed', 'sprout', 'young', 'mature', 'harvestable'];
/** The growth stage of a plant (growth runs 0..1; shown differently at each stage). */
export function cropStage(growth: number): CropStage {
  return growth >= 1 ? 'harvestable' : growth >= 0.65 ? 'mature' : growth >= 0.3 ? 'young' : growth >= 0.08 ? 'sprout' : 'seed';
}

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

/** Wild tuber plants at the sunny edges of clearings: gather once, regrow. */
export const WILD_REGROW = 150;
export const WILD_TUBERS: ReadonlyArray<{ x: number; z: number }> = [
  { x: 11.5, z: 12 },
  { x: 13, z: 18.5 },
  { x: 24, z: 12.5 },
  { x: -11.5, z: 9 },
  { x: -12, z: 14.5 },
  { x: -2.5, z: 5.5 },
];

// ----------------------------------------------------------------- cook

/** Seconds over a burning fire to cook a fish through. */
export const COOK_SECONDS = 8;

/** Seconds of game time a stack of each food keeps before one of it goes bad. Preserved food lasts far longer; nuts and seeds keep. */
export const SHELF_LIFE: Partial<Record<ItemId, number>> = { fish: 360, cookedFish: 720, berries: 540, tuber: 2400, driedFish: 6000 };
/** The share of its shelf life after which a stack is shown as going off. */
export const AGEING_AT = 0.6;
export type Freshness = 'fresh' | 'ageing' | 'keeps';

export interface FoodSave {
  /** Seconds each rack has been drying its current batch, by structure id (so a reload does not restart it). */
  rack?: Record<number, number>;
  /** Age (s) of the satchel stack of each perishable food. */
  spoil?: Record<string, number>;
  plots: Plot[];
  wild?: number[];
  /** Seconds until each foraging patch regrows. */
  forage?: number[];
  cook: number;
  nextId: number;
}

export interface FoodAction {
  id: 'digPlot' | 'plant' | 'water' | 'harvest' | 'cook' | 'eat' | 'eatRaw' | 'gatherWild' | 'inspect' | 'forage' | 'eatItem' | 'cleanFish' | 'hang' | 'collectDried' | 'stackWood' | 'takeWood' | 'rest';
  wildIndex?: number;
  patchId?: number;
  structureId?: number;
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
  /** Seconds until each wild tuber plant has regrown (0 = ready). */
  readonly wild: number[] = WILD_TUBERS.map(() => 0);
  /** Foraging patches: seconds until regrown. */
  readonly forage: number[] = FORAGE_PATCHES.map(() => 0);
  /** Patches you have looked at closely this session. */
  private inspected = new Set<number>();
  private seenStage = new Map<number, number>();
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
      // Fish come in small schools: a few together, facing about the same way.
      while (this.fish.length < FISH_COUNT) {
        const s = streamPointNear(p.x + (this.rng() - 0.5) * 8, p.z + (this.rng() - 0.5) * 8, this.rng);
        const heading = this.rng() * Math.PI * 2;
        const n = Math.min(FISH_COUNT - this.fish.length, 1 + Math.floor(this.rng() * 3));
        for (let k = 0; k < n; k++) {
          const x = s.x + (this.rng() - 0.5) * 0.5;
          const z = s.z + (this.rng() - 0.5) * 0.5;
          this.fish.push({
            id: this.nextId++,
            x: streamDistance(x, z) < STREAM_HALF_WIDTH * 0.45 ? x : s.x,
            z: streamDistance(x, z) < STREAM_HALF_WIDTH * 0.45 ? z : s.z,
            depth: 0.3 + this.rng() * 0.15,
            heading: heading + (this.rng() - 0.5) * 0.4,
            speed: 0.15 + this.rng() * 0.2,
            turn: 1 + this.rng() * 3,
            scared: 0,
            size: this.rng() < 0.2 ? 2 : this.rng() < 0.5 ? 1 : 0,
          });
        }
      }
    }
    const loud = this.g.wildlife.playerSpeed;
    for (const f of this.fish) {
      // A fish bolts when you rush the bank beside it (big fish are bolder).
      if (loud > 1.6 && f.scared <= 0 && near(f, p, 2.2 - f.size * 0.4)) {
        f.scared = 1.5;
        this.g.science('food.fish.startled');
      }
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
      // Fish keep to the deeper middle of the channel.
      if (streamDistance(nx, nz) < STREAM_HALF_WIDTH * 0.45) {
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
      g.addItem('fish', best.f.size === 2 ? 2 : 1);
      g.science('food.fish.caught');
      if (best.f.size === 2) g.science('food.fish.large');
      g.toast(best.f.size === 2 ? 'A big one! Plenty of meat on it.' : 'Got one! A fish flaps on the spear.', 'good');
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

  // -------------------------------------------------------------- crops and camp

  /** Announce each growth stage once as a plant reaches it. */
  private tickStages(): void {
    for (const p of this.plots) {
      if (!p.crop) continue;
      const k = CROP_STAGES.indexOf(cropStage(p.growth));
      const was = this.seenStage.get(p.id) ?? 0;
      if (k > was) {
        this.seenStage.set(p.id, k);
        const st = CROP_STAGES[k];
        if (st === 'sprout') this.g.toast('A green shoot pushes through the soil.', 'info');
        if (st === 'young') this.g.toast('The plant is putting out leaves.', 'info');
        if (st === 'mature') this.g.toast('Nearly grown: stems thick, the tubers filling.', 'info');
        this.g.science(`farm.stage.${st}` as 'farm.stage.sprout');
      }
    }
  }

  private campStructure(kind: 'dryingRack' | 'woodStack' | 'bedding', at: { x: number; z: number }, r = 1.8) {
    return this.g.structures.find((s) => s.kind === kind && s.complete && near(s, at, r)) ?? null;
  }

  private static DRYABLE: ItemId[] = ['fish', 'berries'];
  private static WOOD: ItemId[] = ['logs', 'dryBranch', 'twigs'];
  static readonly RACK_SLOTS = 6;
  static readonly WOOD_SLOTS = 12;
  static readonly DRY_SECONDS = 90;

  private campAction(at: { x: number; z: number }, held: ItemId | null): FoodAction | null {
    const rack = this.campStructure('dryingRack', at);
    if (rack) {
      const dry = rack.store?.driedFish ?? 0;
      if (!held && dry > 0) return { id: 'collectDried', label: 'Take the dried fish', at: rack, structureId: rack.id };
      if (held && FoodState.DRYABLE.includes(held) && this.g.storedCount(rack) < FoodState.RACK_SLOTS) {
        return { id: 'hang', label: `Hang the ${held === 'fish' ? 'fish' : 'berries'} on the rack to dry`, at: rack, structureId: rack.id };
      }
    }
    const wood = this.campStructure('woodStack', at);
    if (wood) {
      if (held && FoodState.WOOD.includes(held) && this.g.storedCount(wood) < FoodState.WOOD_SLOTS) {
        return { id: 'stackWood', label: 'Stack it on the woodpile', at: wood, structureId: wood.id };
      }
      if (!held && this.g.storedCount(wood) > 0) return { id: 'takeWood', label: 'Take firewood from the stack', at: wood, structureId: wood.id };
    }
    const bed = this.campStructure('bedding', at, 1.6);
    if (bed && !held) return { id: 'rest', label: 'Lie down on the bed', at: bed, structureId: bed.id };
    return null;
  }

  private performCamp(a: FoodAction): boolean {
    const g = this.g;
    const st = g.structures.find((s) => s.id === a.structureId);
    if (!st) return false;
    switch (a.id) {
      case 'hang': {
        const h = g.held;
        if (!h || !FoodState.DRYABLE.includes(h)) return false;
        g.useItem(h);
        st.store ??= {};
        st.store[h] = (st.store[h] ?? 0) + 1;
        g.science('food.rack.loaded');
        g.toast('Hung in the open air. Dry food keeps because there is no water left for germs to grow in.', 'note');
        g.checkQuests();
        return true;
      }
      case 'collectDried': {
        const n = st.store?.driedFish ?? 0;
        if (!n || g.held) return false;
        delete st.store!.driedFish;
        g.addItem('driedFish', n);
        g.takeOut('driedFish');
        g.toast(`You take ${n} strip${n > 1 ? 's' : ''} of dried fish.`, 'good');
        return true;
      }
      case 'stackWood': {
        const h = g.held;
        if (!h || !FoodState.WOOD.includes(h)) return false;
        g.useItem(h);
        st.store ??= {};
        st.store[h] = (st.store[h] ?? 0) + 1;
        g.science('camp.wood.stored');
        g.checkQuests();
        return true;
      }
      case 'takeWood': {
        if (g.held || !st.store) return false;
        const id = FoodState.WOOD.find((w) => (st.store?.[w] ?? 0) > 0);
        if (!id) return false;
        st.store[id] = (st.store[id] ?? 0) - 1;
        if (st.store[id] === 0) delete st.store[id];
        g.addItem(id);
        g.takeOut(id);
        return true;
      }
      case 'rest':
        g.science('camp.bed.rested');
        g.toast('Off the cold ground, you can rest properly. Soft layers trap warm air.', 'note');
        g.checkQuests();
        return true;
      default:
        return false;
    }
  }

  // ---- spoilage: a stack in the satchel ages; at its shelf life one item goes bad, then one more every 15% of it.
  private spoilAge = new Map<string, number>();
  private spoilCount = new Map<string, number>();
  private tickSpoil(dt: number): void {
    const g = this.g;
    for (const key of Object.keys(SHELF_LIFE)) {
      const id = key as ItemId;
      const life = SHELF_LIFE[id]!;
      const n = g.count(id);
      const was = this.spoilCount.get(id) ?? n;
      let age = this.spoilAge.get(id) ?? 0;
      // New items join fresh: the stack's age is the average.
      if (n > was && n > 0) age = (age * was) / n;
      if (n === 0) age = 0;
      else age += dt;
      if (n > 0 && age >= life) {
        g.useItem(id);
        age = life * 0.85;
        g.toast(`One ${itemName(id).toLowerCase()} has spoiled. Food rots as microbes grow in it: cook it, dry it, or eat it soon.`, 'bad');
        g.science('food.spoiled');
      }
      this.spoilAge.set(id, age);
      this.spoilCount.set(id, g.count(id));
    }
  }

  /** How fresh the stack of `id` in the satchel is (for the satchel and notebook). */
  freshnessOf(id: ItemId): Freshness {
    const life = SHELF_LIFE[id];
    if (!life) return 'keeps';
    return (this.spoilAge.get(id) ?? 0) >= life * AGEING_AT ? 'ageing' : 'fresh';
  }

  /** Drying progresses in the open air and stops in rain; an uncovered woodpile gets wet in rain. */
  private campT = 0;
  private rackT = new Map<number, number>();
  private tickCamp(dt: number): void {
    if ((this.campT += dt) < 1) return;
    const step = this.campT;
    this.campT = 0;
    const g = this.g;
    const raining = g.env.rain > 0.3;
    for (const s of g.structures) {
      if (!s.complete) continue;
      if (s.kind === 'dryingRack' && s.store) {
        const wet = (s.store.fish ?? 0) + (s.store.berries ?? 0);
        if (wet > 0 && !raining && g.env.night < 0.6) {
          const t = (this.rackT.get(s.id) ?? 0) + step;
          if (t >= FoodState.DRY_SECONDS) {
            const fish = s.store.fish ?? 0;
            if (fish) {
              s.store.driedFish = (s.store.driedFish ?? 0) + fish;
              delete s.store.fish;
              g.science('food.fish.dried');
              g.toast('The fish on your rack has dried hard and light.', 'good');
            }
            if (s.store.berries) {
              g.science('food.berries.dried');
              // Dried berries are still berries: they just last. (Counted as berries again so the bag stays simple.)
            }
            this.rackT.set(s.id, 0);
          } else this.rackT.set(s.id, t);
        }
      }
      if (s.kind === 'woodStack' && raining && this.g.storedCount(s) > 0) {
        const roofed = !!s.spots[2];
        g.science(roofed ? 'camp.wood.kept.dry' : 'camp.wood.wet');
      }
    }
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
    for (let i = 0; i < this.wild.length; i++) this.wild[i] = Math.max(0, this.wild[i] - dt);
    for (let i = 0; i < this.forage.length; i++) this.forage[i] = Math.max(0, this.forage[i] - dt);
    this.tickStages();
    this.tickCamp(dt);
    this.tickSpoil(dt);
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
    if (held === 'driedFish') return { id: 'eatItem', label: 'Eat the dried fish', at };
    if (held === 'berries' || held === 'nuts') return { id: 'eatItem', label: `Eat the ${held === 'berries' ? 'berries' : 'nuts'}`, at };
    const camp = this.campAction(at, held);
    if (camp) return camp;
    if (held === 'fish' && !this.g.water.burningFireNear(at) && this.g.count('knife') + this.g.count('flake') > 0 && streamDistance(at.x, at.z) < STREAM_BANK + 1.5) {
      return { id: 'cleanFish', label: 'Gut and wash the fish in the stream', at };
    }
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
    const wi = WILD_TUBERS.findIndex((w, i) => this.wild[i] === 0 && near(w, at, USE_RADIUS));
    if (wi >= 0) return { id: 'gatherWild', label: 'Dig up the wild tuber plant', at: WILD_TUBERS[wi], wildIndex: wi };
    if (!held) {
      const fp = FORAGE_PATCHES.find((q) => this.forage[q.id] === 0 && near(q, at, USE_RADIUS));
      if (fp) {
        return this.inspected.has(fp.id)
          ? { id: 'forage', label: fp.edible ? `Pick the ${fp.kind === 'berry' ? 'berries' : fp.kind === 'nut' ? 'nuts' : 'root'}` : 'Pick it anyway?', at: fp, patchId: fp.id }
          : { id: 'inspect', label: 'Look closely at this plant', at: fp, patchId: fp.id };
      }
    }
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
        // Keep some for next season: seeds come back from every harvest.
        g.addItem('seeds', plot.crop === 'seeds' ? 2 : 1);
        g.science('farm.seeds.saved');
        this.seenStage.delete(plot.id);
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
      case 'gatherWild': {
        const i = a.wildIndex ?? -1;
        if (i < 0 || this.wild[i] > 0) return false;
        this.wild[i] = WILD_REGROW;
        g.addItem('tuber');
        g.addItem('seeds');
        g.gathered.set('tuber', (g.gathered.get('tuber') ?? 0) + 1);
        g.toast('A knobbly tuber, and a pinch of seeds from the flower head.', 'good');
        g.checkQuests();
        return true;
      }
      case 'inspect': {
        const fp = FORAGE_PATCHES.find((q) => q.id === a.patchId);
        if (!fp) return false;
        this.inspected.add(fp.id);
        g.toast(fp.look, fp.edible ? 'note' : 'bad');
        g.science('food.forage.inspected');
        g.science(fp.edible ? 'food.forage.identified' : 'food.forage.avoided');
        g.checkQuests();
        return true;
      }
      case 'forage': {
        const fp = FORAGE_PATCHES.find((q) => q.id === a.patchId);
        if (!fp || this.forage[fp.id] > 0) return false;
        if (!fp.edible) {
          g.science('food.forage.avoided');
          g.toast('You leave it. Not knowing is reason enough: a wrong guess here can kill you.', 'bad');
          return true;
        }
        this.forage[fp.id] = FORAGE_REGROW;
        g.addItem(fp.yield, 2);
        g.gathered.set(fp.yield, (g.gathered.get(fp.yield) ?? 0) + 2);
        g.science('food.forage.picked');
        g.toast('Picked what you could name. It will regrow in time.', 'good');
        g.checkQuests();
        return true;
      }
      case 'eatItem': {
        const h = g.held;
        if (h !== 'berries' && h !== 'nuts' && h !== 'driedFish') return false;
        g.useItem(h);
        g.science('body.eat');
        if (h === 'driedFish') g.science('food.preserved.eaten');
        g.toast(h === 'driedFish' ? 'Chewy and salty-smoky: dried fish keeps and still feeds.' : 'A small, sweet, filling handful.', 'good');
        g.checkQuests();
        return true;
      }
      case 'cleanFish':
        if (g.held !== 'fish') return false;
        g.science('food.fish.cleaned');
        g.toast('Gutted with a sharp edge and rinsed in running water: the guts spoil first, and they carry the germs.', 'note');
        g.checkQuests();
        return true;
      case 'hang':
      case 'collectDried':
      case 'stackWood':
      case 'takeWood':
      case 'rest':
        return this.performCamp(a);
      case 'eatRaw':
        g.science('food.raw.refused');
        g.toast('Raw fish can carry parasites and bacteria. Cook it first.', 'bad');
        return true;
    }
  }

  snapshot(): FoodSave {
    return {
      plots: this.plots.map((p) => ({ ...p })),
      wild: [...this.wild],
      forage: [...this.forage],
      cook: 0,
      nextId: this.nextId,
      rack: Object.fromEntries(this.rackT),
      spoil: Object.fromEntries(this.spoilAge),
    };
  }

  restore(s: FoodSave): void {
    this.plots.push(...s.plots.map((p) => ({ ...p })));
    this.nextId = Math.max(this.nextId, s.nextId);
    for (const [k, v] of Object.entries(s.rack ?? {})) this.rackT.set(Number(k), v);
    for (const [k, v] of Object.entries(s.spoil ?? {})) this.spoilAge.set(k, v);
    s.wild?.forEach((v, i) => i < this.wild.length && (this.wild[i] = v));
    s.forage?.forEach((v, i) => i < this.forage.length && (this.forage[i] = v));
    // Plants already past a stage in the save do not re-announce it.
    for (const p of this.plots) this.seenStage.set(p.id, CROP_STAGES.indexOf(cropStage(p.growth)));
  }
}
