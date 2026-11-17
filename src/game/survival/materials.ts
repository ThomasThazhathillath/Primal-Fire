// Bed materials (Lesson 01, Phase 2): how well each keeps the cold ground from drawing heat out of you.
//
// A simplified teaching model (docs/SCIENCE.md): insulation is the share of the ground's pull on your heat
// that a full bed of the material stops. Dry grass and leaves are loose and full of still air, which conducts
// heat poorly; damp moss holds water in those spaces, and water conducts heat more than twenty times better
// than air, so it stops little and soaks into you as well. The numbers are relative, not measured values.
// Each part of a bed (its first handful and every layer) is an equal share of its thickness, and a gap stops
// nothing, so a thin or unfinished bed insulates less.

import type { ItemId } from '../items.js';

export interface BedMaterial {
  /** Share of the ground's pull on your heat a full bed of it stops (0..1). */
  insulation: number;
  /** How much water it holds (0..1): water fills the air spaces and soaks into you. */
  moisture: number;
  /** Why, in one short line (cards are read in a headset). */
  why: string;
}

export const BED_MATERIALS: Partial<Record<ItemId, BedMaterial>> = {
  dryGrass: { insulation: 0.9, moisture: 0.05, why: 'Hollow stems and loose blades hold pockets of still air.' },
  leafLitter: { insulation: 0.85, moisture: 0.1, why: 'Dry, curled leaves pile loosely, with air between them.' },
  dampMoss: { insulation: 0.3, moisture: 0.85, why: 'Water fills the spaces where air would be, and water carries heat away.' },
};

/** Share of the ground's pull a bed of these parts stops (each part an equal share; a gap stops nothing). */
export function bedInsulation(parts: ReadonlyArray<ItemId | null | undefined>): number {
  if (!parts.length) return 0;
  let sum = 0;
  for (const p of parts) sum += (p && BED_MATERIALS[p]?.insulation) || 0;
  return sum / parts.length;
}

/** How damp a bed of these parts is (0..1), averaged over the parts that are there. */
export function bedMoisture(parts: ReadonlyArray<ItemId | null | undefined>): number {
  let sum = 0;
  let n = 0;
  for (const p of parts) {
    if (!p) continue;
    sum += BED_MATERIALS[p]?.moisture ?? 0;
    n++;
  }
  return n ? sum / n : 0;
}

/** The one material a whole bed is made of, or null when it has gaps or mixes materials (not a fair test). */
export function bedMaterialOf(parts: ReadonlyArray<ItemId | null | undefined>): ItemId | null {
  const first = parts[0];
  if (!first || !BED_MATERIALS[first]) return null;
  for (const p of parts) if (p !== first) return null;
  return first;
}
