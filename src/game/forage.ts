// Wild food you have to judge before you trust it (Phase 3 milestone D; Lesson 05 plant judgement).
// A fixed set of patches is scattered deterministically at the forest edges. Each is a food plant from the
// field guide, a poisonous look-alike of one, or a plant the guide does not list. Looking closely reads out
// what you can observe (fruit, stem, leaves, smell); YOU decide safe, unsafe or not sure by comparing it
// with the field guide, and the truth is shown after you decide (food.ts `judge`). A wrong "safe" makes you
// ill for a while through the body simulation; never worse.
//
// The plants are made up for the game (docs/SCIENCE.md: no claims that real wild species are edible). What
// is true is the method: check every feature together, and if you cannot name a plant for certain, it is not
// food. Positions are generated, never saved; only regrow timers, stocks and your verdicts are.

import { mulberry32 } from './rng.js';
import { inClearing, nearestTreeDistance, streamDistance, STREAM_BANK, WORLD_RADIUS } from './world-layout.js';

export type ForageKind = 'berry' | 'nut' | 'root';
/** What a patch really is: the field guide's food plant, its look-alike, or a plant not in the guide. */
export type PlantTruth = 'food' | 'lookalike' | 'unknown';

/** What you can see, feel and smell, in the order the card lists it. */
export interface PlantFeatures {
  fruit: string;
  stem: string;
  leaves: string;
  smell: string;
}
export const FEATURE_NAMES: Record<keyof PlantFeatures, string> = { fruit: 'Fruit', stem: 'Stem', leaves: 'Leaves', smell: 'Smell' };

export interface ForagePatch {
  id: number;
  kind: ForageKind;
  x: number;
  z: number;
  /** Safe to eat (only the field guide's food plants are). */
  edible: boolean;
  truth: PlantTruth;
  features: PlantFeatures;
  /** Colour of its fruit or flowers in the world (a look-alike shares the food plant's colour). */
  color: number;
  /** Fruit grows in one upright spike (drawn that way) rather than loose clusters. */
  spike: boolean;
  /** One line of what you notice (kept for older callers; the judge card lists the features). */
  look: string;
  /** What you gain by picking it (edible only). */
  yield: 'berries' | 'nuts' | 'tuber';
}

/** The field guide: the three food plants of this forest, every feature that identifies them. */
export const FIELD_GUIDE: Record<ForageKind, { name: string; features: PlantFeatures }> = {
  berry: {
    name: 'Redcane berry',
    features: { fruit: 'Red berries in loose, drooping clusters', stem: 'A thorny, hairy cane', leaves: 'Toothed, pale underneath', smell: 'Sweet' },
  },
  nut: {
    name: 'Ringnut',
    features: { fruit: 'Brown nuts, each in a ragged green husk', stem: 'Many thin stems from the ground', leaves: 'Round, toothed and soft', smell: 'Faintly nutty' },
  },
  root: {
    name: 'Featherroot',
    features: { fruit: 'Small yellow flowers in a ball', stem: 'Green and hairy', leaves: 'Fine and feathery', smell: 'Sweet and earthy at the root' },
  },
};

/** Look-alikes match the food plant in some features and differ in two. */
const LOOKALIKE: Record<ForageKind, PlantFeatures> = {
  berry: { fruit: 'Red berries packed in one stiff, upright spike', stem: 'A smooth, hairless stalk', leaves: 'Toothed, pale underneath', smell: 'Sweet' },
  nut: { fruit: 'Brown nuts, each in a spiky green case', stem: 'One tall trunk', leaves: 'Round, toothed and soft', smell: 'Faintly nutty' },
  root: { fruit: 'Small yellow flowers in a ball', stem: 'Smooth, with purple blotches', leaves: 'Fine and feathery', smell: 'Musty, like a mouse nest' },
};

/** Plants the field guide does not list at all. */
const UNKNOWN: PlantFeatures[] = [
  { fruit: 'Shiny blue-black berries on a creeping vine', stem: 'Thin and twining', leaves: 'Heart-shaped, glossy', smell: 'None you can notice' },
  { fruit: 'Orange berries in small bunches', stem: 'Woody, with milky sap where it breaks', leaves: 'Long and narrow', smell: 'Sharp' },
];

const FOOD_COLOR: Record<ForageKind, number> = { berry: 0xc0243a, nut: 0xa9803f, root: 0xe8d040 };
const UNKNOWN_COLOR = [0x2a2f5a, 0xe07a24];

export const FORAGE_COUNT = { berry: 6, nut: 4, root: 3 };
/** Plants not in the field guide, added after the original patches (so those keep their places and ids). */
export const UNKNOWN_COUNT = 2;
/** Seconds a stripped patch needs before anything grows back (it then comes back thinner). */
export const FORAGE_REGROW = 240;
/** Handfuls a healthy patch carries, and seconds for one handful to grow back while some are left. */
export const PATCH_STOCK = 3;
export const STOCK_REGROW = 80;

function describe(f: PlantFeatures): string {
  return `${f.fruit}; ${f.stem.toLowerCase()}; leaves ${f.leaves.toLowerCase()}; smell: ${f.smell.toLowerCase()}.`;
}

function place(rng: () => number): { x: number; z: number } {
  let x = 12;
  let z = 0;
  for (let tries = 0; tries < 200; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 8 + rng() * 26;
    x = Math.cos(a) * r;
    z = Math.sin(a) * r;
    const td = nearestTreeDistance(x, z, 4);
    if (r < WORLD_RADIUS - 6 && streamDistance(x, z) > STREAM_BANK + 1 && td > 1 && td < 3 && !inClearing(x, z, -2)) break;
  }
  return { x, z };
}

function build(): ForagePatch[] {
  const rng = mulberry32(4242);
  const out: ForagePatch[] = [];
  const kinds: ForageKind[] = [];
  (Object.keys(FORAGE_COUNT) as ForageKind[]).forEach((k) => {
    for (let i = 0; i < FORAGE_COUNT[k]; i++) kinds.push(k);
  });
  kinds.forEach((kind, i) => {
    const { x, z } = place(rng);
    // Every third patch of a kind is the poisonous look-alike (never the first of its kind, so there is always a good one near).
    const edible = !(i % 3 === 2 || (kind === 'berry' && i === 3));
    const features = edible ? FIELD_GUIDE[kind].features : LOOKALIKE[kind];
    out.push({
      id: i,
      kind,
      x,
      z,
      edible,
      truth: edible ? 'food' : 'lookalike',
      features,
      color: FOOD_COLOR[kind],
      spike: !edible && kind === 'berry',
      look: describe(features),
      yield: kind === 'berry' ? 'berries' : kind === 'nut' ? 'nuts' : 'tuber',
    });
  });
  for (let u = 0; u < UNKNOWN_COUNT; u++) {
    const { x, z } = place(rng);
    out.push({
      id: out.length,
      kind: 'berry',
      x,
      z,
      edible: false,
      truth: 'unknown',
      features: UNKNOWN[u],
      color: UNKNOWN_COLOR[u],
      spike: false,
      look: describe(UNKNOWN[u]),
      yield: 'berries',
    });
  }
  return out;
}

export const FORAGE_PATCHES: ReadonlyArray<ForagePatch> = build();

/** The features where a patch differs from the field guide's plant of its kind (empty for the food plant itself). */
export function mismatches(p: ForagePatch): Array<keyof PlantFeatures> {
  const guide = FIELD_GUIDE[p.kind].features;
  return (Object.keys(FEATURE_NAMES) as Array<keyof PlantFeatures>).filter((k) => p.features[k] !== guide[k]);
}
