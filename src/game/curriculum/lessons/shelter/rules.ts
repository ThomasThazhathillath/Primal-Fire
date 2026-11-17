// Lesson 01 (Shelter), Phase 2: the rules behind its experiments, run from Game's 4 Hz slow step.
//
// Every reading comes from the body simulation (survival/body.ts heatFlow) and the real structures:
// - the insulation test: resting under the roof, the body's conduction into the ground is measured against
//   what bare ground would take, with the bed under you (or none) as the variable;
// - the night test: on a cold night, how fast you lose heat out in the open and resting on your bed in the
//   shelter (heat out over heat made, from the same model);
// - the night proof that completes the lesson: resting on the bed under the roof at night, warmth holds steady;
// - the push test: how far the lean-to frame leans under a push (shelter.ts framePush).
// Nothing here is saved: readings are remeasured after a reload, and experiments keep their own trials.

import type { PlacedStructure } from '../../../blueprint.js';
import type { Game } from '../../../game.js';
import { type ItemId, itemName } from '../../../items.js';
import { type FramePushResult, framePush } from '../../../shelter.js';
import { COMFORT_AIR, type HeatFlow, heatFlow, heatRatio } from '../../../survival/body.js';
import { type Microclimate, microclimate } from '../../../survival/climate.js';
import { bedInsulation, bedMaterialOf, bedMoisture } from '../../../survival/materials.js';

/** Seconds of standing (or resting) still before a reading counts. */
export const STILL_TRIAL = 3;
/** A night cold enough to test the shelter: dark and the air at or below this (deg C). */
export const NIGHT_COLD = 12;
/** Heat out over heat made at or below this: your warmth holds steady. */
export const STEADY_RATIO = 1.3;
/** ...and at or below this you lose warmth slowly; above it, fast. */
export const SLOW_RATIO = 1.8;
/** Seconds resting steady on the bed under the roof at night that prove the shelter works. */
export const NIGHT_HOLD = 12;
/** How close (m) to a bed's centre you must be to lie on it. */
export const BED_REACH = 0.9;
/** The hour "Rest until midnight" skips to: the cold part of the night. */
export const COLD_HOUR = 23;

export type BedValue = 'bare' | 'dryGrass' | 'leafLitter' | 'dampMoss';

/** The parts of a bed: its first handful (the key) and every layer, in order. */
export function bedParts(s: PlacedStructure): Array<ItemId | null> {
  return [s.keyOpen ? null : s.key, ...s.spots];
}

/** The bed under a point, if any (finished or not). */
export function bedUnder(g: Game, x: number, z: number): PlacedStructure | null {
  for (const s of g.structures) if (s.kind === 'bedding' && Math.hypot(s.x - x, s.z - z) < BED_REACH) return s;
  return null;
}

/** A whole, dry bed: the fair setting for the night test (a damp or thin bed is a different experiment). */
export function dryBed(s: PlacedStructure | null): boolean {
  if (!s) return false;
  const parts = bedParts(s);
  return parts.every((p) => !!p) && bedInsulation(parts) >= 0.6 && bedMoisture(parts) <= 0.3;
}

/** Heat out over heat made as a short phrase ("2.4x"). */
const times = (r: number): string => `${r.toFixed(1)}x`;
const windWord = (w: number): string => (w < 0.2 ? 'calm' : w < 0.5 ? 'a breeze' : w < 0.8 ? 'windy' : 'a strong wind');

export class ShelterRules {
  /** Seconds standing still anywhere / resting still under the roof / resting steady on the bed at night. */
  private stillT = 0;
  private restT = 0;
  private steadyT = 0;
  private lastX = Number.NaN;
  private lastZ = 0;
  /** One-off messages already said this session. */
  private readonly said = new Set<string>();
  private readonly flow: HeatFlow = { gain: 0, loss: 0, ground: 0 };
  private readonly flowB: HeatFlow = { gain: 0, loss: 0, ground: 0 };
  /** The last push on the frame. */
  lastPush: FramePushResult | null = null;
  /** The last bed reading: what you rested on, and the share of bare ground's heat flow that got through. */
  lastBed: { value: BedValue | null; label: string; through: number } | null = null;
  /** The last night reading where you are: heat out over heat made, and whether the night was cold enough. */
  lastNight: { cold: boolean; ratio: number } | null = null;

  private say(g: Game, key: string, text: string, kind: 'note' | 'good' | 'bad' = 'note'): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    g.toast(text, kind);
  }

  /** The 4 Hz step. `resting`: still, under a roof that does not leak (the body's own flag). */
  slowStep(g: Game, m: Microclimate, resting: boolean, dt: number): void {
    const { x, z } = g.player;
    const moved = Number.isNaN(this.lastX) ? 1 : Math.hypot(x - this.lastX, z - this.lastZ);
    this.lastX = x;
    this.lastZ = z;
    this.stillT = moved < 0.05 * Math.max(1, dt / 0.25) ? this.stillT + dt : 0;
    this.restT = resting ? this.restT + dt : 0;
    this.bedTest(g, m);
    this.nightTest(g, m, resting, dt);
  }

  // ------------------------------------------------------------ the insulation test

  private bedTest(g: Game, m: Microclimate): void {
    if (this.restT < STILL_TRIAL) return;
    const bare = 0.02 * Math.max(0, COMFORT_AIR - m.ground);
    if (bare < 0.005) {
      this.lastBed = { value: null, label: 'warm ground', through: 0 };
      return;
    }
    const bed = bedUnder(g, g.player.x, g.player.z);
    const parts = bed ? bedParts(bed) : [];
    let value: BedValue | null = null;
    let label = 'bare ground';
    if (!bed || parts.every((p) => !p)) value = 'bare';
    else if (parts.some((p) => !p)) label = 'an unfinished bed';
    else {
      const mat = bedMaterialOf(parts);
      value = mat === 'dryGrass' || mat === 'leafLitter' || mat === 'dampMoss' ? mat : null;
      label = mat ? `a bed of ${itemName(mat).toLowerCase()}` : 'a mixed bed';
    }
    // The body's own conduction into the ground this tick, against what bare ground would take.
    const through = Math.max(0, Math.min(1, g.body.flow.ground / bare));
    this.lastBed = { value, label, through };
    const open = g.experiments.phase('bedMaterials');
    if (open !== 'predict' && open !== 'testing') return;
    if (!value) {
      this.say(g, `bed.${label}`, label === 'a mixed bed' ? 'A mixed bed: for a fair test, make the whole bed of one material.' : 'Finish the bed first: compare beds of the same thickness.');
      return;
    }
    const outcome = through >= 0.6 ? 'most' : through >= 0.25 ? 'some' : 'little';
    g.experiments.trial('bedMaterials', value, outcome);
    if (value === 'dampMoss') g.science('shelter.bed.damp');
    if (value === 'dryGrass' || value === 'leafLitter') g.science('shelter.bed.dry');
    const pct = Math.round(through * 100);
    this.say(
      g,
      `bed.${value}`,
      value === 'bare'
        ? 'Bare ground: the cold earth draws your heat straight out of you (100%).'
        : `On ${label}: ${pct}% of bare ground's heat flow still gets through.`,
      outcome === 'little' ? 'good' : 'note',
    );
    if (g.experiments.concluded('bedMaterials')) g.science('shelter.bed.compared');
  }

  // ------------------------------------------------------------ the night

  private nightTest(g: Game, m: Microclimate, resting: boolean, dt: number): void {
    const cold = m.night > 0.5 && m.air <= NIGHT_COLD;
    const ratio = heatRatio(heatFlow(m, g.body.wet, resting, this.flow));
    this.lastNight = { cold, ratio };
    const bed = bedUnder(g, g.player.x, g.player.z);
    const onBed = !!bed && bedInsulation(bedParts(bed)) > 0;
    const onDryBed = dryBed(bed);
    if (!cold) {
      this.steadyT = 0;
      return;
    }
    const outcome = ratio <= STEADY_RATIO ? 'steady' : ratio <= SLOW_RATIO ? 'slow' : 'fast';
    const phase = g.experiments.phase('nightShelter');
    const testing = phase === 'predict' || phase === 'testing';
    if (!g.insideShelter(g.player.x, g.player.z) && m.fire === 0 && this.stillT >= STILL_TRIAL) {
      g.science('shelter.night.exposed');
      if (testing) {
        g.experiments.trial('nightShelter', 'open', outcome);
        this.say(g, 'night.open', `Out in the open tonight you lose heat ${times(ratio)} as fast as your body makes it.`, 'note');
      }
    } else if (resting && onDryBed && this.restT >= STILL_TRIAL && testing) {
      g.experiments.trial('nightShelter', 'shelter', outcome);
      this.say(g, 'night.shelter', `On your bed under the roof: heat out is ${times(ratio)} what your body makes.`, outcome === 'steady' ? 'good' : 'note');
    }
    // The proof: resting on the bed under a roof that does not leak, warmth holds steady through the night.
    if (resting && onBed && outcome === 'steady') {
      this.steadyT += dt;
      if (this.steadyT >= NIGHT_HOLD && !g.hasEvent('shelter.night.warm')) {
        g.science('shelter.night.warm');
        g.toast('Warmth steady: the roof keeps off rain and wind, and the dry bed keeps the cold ground from drawing your heat away.', 'good');
      }
    } else this.steadyT = 0;
  }

  /** What stands between you and a steady night right now (for the card's tip). */
  nightAdvice(g: Game): string {
    const n = this.lastNight;
    const { x, z } = g.player;
    if (!n?.cold) return 'Wait for a cold night, or use Rest until midnight on the experiment card.';
    const trials = g.experiments.state('nightShelter').trials;
    const inside = g.insideShelter(x, z);
    if (!trials.has('open') && !g.experiments.concluded('nightShelter')) return 'Step out into the open and stand still for a few seconds: feel what the night takes.';
    const lean = g.leanTo();
    if (inside && !(g.climate?.sheltered ?? false)) return lean ? 'Your roof drips: add a layer over the leak.' : 'Build a roof first.';
    const bed = bedUnder(g, x, z);
    if (!inside || !bed) return 'Go under your roof and stand still on your bed.';
    const parts = bedParts(bed);
    if (bedInsulation(parts) <= 0) return 'Lay your bed: the bare ground draws heat out of you.';
    if (bedMoisture(parts) > 0.3) return 'This damp bed soaks you and lets the cold through: rebuild it with dry grass or leaves.';
    if (parts.some((p) => !p)) return 'Your bed is thin: fill every part of it.';
    if (n.ratio > STEADY_RATIO && g.body.wet > 0.1) return 'You are wet, and wet clothes carry heat away. Stay on your bed and dry out.';
    if (n.ratio > STEADY_RATIO) return 'Stand still on your bed; you are still losing heat.';
    return `Warmth holding steady (${Math.min(NIGHT_HOLD, Math.round(this.steadyT))} of ${NIGHT_HOLD} s).`;
  }

  /**
   * The open against your shelter, from the body model for tonight's weather: heat out over heat made
   * standing in the open, and resting on your bed under your roof.
   */
  nightCompare(g: Game): { air: number; wind: number; open: number; shelter: number | null } {
    const env = g.env;
    const w = { hour: env.hour, night: env.night, cloud: env.cloud, rain: env.rain, wind: env.windStrength };
    const wet = g.body.wet;
    const open = microclimate(w, { sheltered: false, onBed: false, fireDist: Infinity, fireBurning: false });
    const rOpen = heatRatio(heatFlow(open, wet, false, this.flowB));
    const lean = g.leanTo();
    const bed = lean ? g.structures.find((s) => s.kind === 'bedding' && g.insideShelter(s.x, s.z)) : undefined;
    let rShelter: number | null = null;
    if (lean && bed) {
      const parts = bedParts(bed);
      const inside = microclimate(w, { sheltered: true, onBed: bed.complete, fireDist: Infinity, fireBurning: false, bedInsulation: bedInsulation(parts), bedMoisture: bedMoisture(parts) });
      rShelter = heatRatio(heatFlow(inside, wet, true, this.flowB));
    }
    return { air: open.air, wind: env.windStrength, open: rOpen, shelter: rShelter };
  }

  nightReadout(g: Game): string {
    const c = this.nightCompare(g);
    const rain = g.env.rain > 0.2 ? ', rain' : '';
    const shelter = c.shelter === null ? 'build your bed under the roof to compare' : `your shelter, on the bed ${times(c.shelter)}`;
    return `Now: air ${Math.round(c.air)} C, ${windWord(c.wind)}${rain}. Heat out vs heat made - open ${times(c.open)}, ${shelter}.`;
  }

  bedReadout(): string {
    const b = this.lastBed;
    if (!b || this.restT < STILL_TRIAL) return 'Stand still under your roof to measure the heat flowing into the ground.';
    if (b.label === 'warm ground') return 'The ground is about as warm as you need right now. Try again this evening.';
    return `Resting on ${b.label}: ${Math.round(b.through * 100)}% of bare ground's heat flow gets through.`;
  }

  // ------------------------------------------------------------ the push test

  /** Should the bare frame wait for a push before its ribs go on? (Lesson 01 is on the frame step, not pushed yet.) */
  wantsPush(g: Game, s: PlacedStructure): boolean {
    if (!g.focusIs('frame') || g.experiments.concluded('framePush')) return false;
    if (g.experiments.state('framePush').trials.has('unbraced')) return false;
    return framePush(s).bracing === 'unbraced';
  }

  /** Push on the lean-to frame: it leans, and the push is a trial of the frame test. */
  push(g: Game, s: PlacedStructure): FramePushResult {
    const r = framePush(s);
    this.lastPush = r;
    if (r.bracing === 'posts') {
      g.toast('Set both posts and the ridge pole first: then there is a frame to push.', 'note');
      return r;
    }
    s.pushFirst = false;
    const outcome = r.holds ? 'holds' : 'folds';
    if (r.bracing === 'unbraced') {
      g.science('shelter.frame.racked');
      g.experiments.trial('framePush', 'unbraced', outcome);
      g.toast('It leans right over! Two posts and a ridge make a box with the ground, and a box folds flat. Now lean the ribs in.', 'note');
    } else if (r.bracing === 'braced') {
      g.science('shelter.frame.braced');
      g.experiments.trial('framePush', 'braced', outcome);
      g.toast('Solid. Each rib makes a triangle with a post and the ridge, and the cross-supports tie them together.', 'good');
    } else {
      g.toast(`It leans less (${r.ribs} of 3 ribs, ${r.crosses} of 2 cross-supports in). Push again when they are all in.`, 'note');
    }
    return r;
  }

  pushReadout(): string {
    const r = this.lastPush;
    if (!r) return 'Push a post or the ridge pole (pinch or click it) to test the frame.';
    if (r.bracing === 'posts') return 'Set both posts and the ridge pole, then push.';
    return `Last push: it leaned ${Math.round(r.rack * 100)}% of the way over (${r.ribs} of 3 ribs, ${r.crosses} of 2 cross-supports).`;
  }
}
