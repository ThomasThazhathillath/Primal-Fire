// Lesson 03 (Water): the filter's layers and what comes out of its spout.
//
// The filter's four layer marks (blueprint.ts) each take cloth, charcoal, sand or gravel. Layers go in
// from the bottom up, so the order you put them in is the order water passes them, top to bottom. With
// the same four materials only the order changes (a fair test), and the order decides the result:
//   - nothing holds the grains (no cloth at the bottom): sand and grit wash out of the spout (washout);
//   - the mud meets fine sand before coarse gravel: the sand clogs and only a trickle comes through;
//   - cloth at the bottom and coarse gravel above the sand: it runs clear (with no sand at all, cloudy).
// Charcoal anywhere in the stack takes up some of the earthy smell (adsorption). Germs always remain:
// a filter makes water clearer, never safe.

import { BLUEPRINTS, type PlacedStructure } from '../../../blueprint.js';
import type { ItemId } from '../../../items.js';

/** What a layer mark takes. */
export const LAYERS: readonly ItemId[] = ['cloth', 'charcoal', 'sand', 'gravel'];

export type FilterFlow = 'clear' | 'cloudy' | 'clogged' | 'washout';
/** The layer-order experiment's values (null: this stack does not compare coarse with fine). */
export type Arrangement = 'coarseFirst' | 'fineFirst' | 'noSupport';

export interface FilterResult {
  flow: FilterFlow;
  arrangement: Arrangement | null;
  /** Charcoal in the stack: some of the smell is taken up. */
  charcoal: boolean;
  /** One short line for the toast: what came out, and always that germs remain when it ran. */
  text: string;
}

/** Spot indices of the four layer marks of BLUEPRINTS.filter, bottom to top. */
export const LAYER_SPOTS: readonly number[] = BLUEPRINTS.filter.spots
  .map((s, i) => (s.accepts.includes('sand') ? i : -1))
  .filter((i) => i >= 0)
  .sort((a, b) => BLUEPRINTS.filter.spots[a].y - BLUEPRINTS.filter.spots[b].y);

/** The order every filter had before the layers could be chosen (bottom to top). */
const CLASSIC: readonly ItemId[] = ['cloth', 'charcoal', 'sand', 'gravel'];

/** The layers of a placed filter, bottom to top (null = an empty mark). */
export function filterLayers(s: Pick<PlacedStructure, 'spots'>): Array<ItemId | null> {
  // A record with no layer data at all (odd or hand-made saves) had the one fixed order.
  if (s.spots.length < BLUEPRINTS.filter.spots.length) return [...CLASSIC];
  return LAYER_SPOTS.map((i) => s.spots[i] ?? null);
}

/**
 * What pouring water through these layers (bottom to top) gives. `muddy`: stream water with mud in it
 * (only mud can clog the sand; clear rainwater just runs through).
 */
export function filterResult(layers: ReadonlyArray<ItemId | null>, muddy = true): FilterResult {
  const charcoal = layers.includes('charcoal');
  if (layers[0] !== 'cloth') {
    return { flow: 'washout', arrangement: muddy ? 'noSupport' : null, charcoal, text: 'Sand and grit washed out of the spout: muddy water. Nothing at the bottom held the grains.' };
  }
  if (!muddy) return { flow: 'clear', arrangement: null, charcoal, text: 'The rainwater ran through. It was clear already, and a filter cannot take out germs.' };
  // The first of sand or gravel the water meets on its way down (layers are listed bottom to top).
  let first: ItemId | null = null;
  for (let i = layers.length - 1; i >= 0 && !first; i--) if (layers[i] === 'sand' || layers[i] === 'gravel') first = layers[i];
  if (first === 'sand') {
    return { flow: 'clogged', arrangement: 'fineFirst', charcoal, text: 'The mud met the fine sand first and clogged it: only a trickle came through.' };
  }
  if (!layers.includes('sand')) {
    return { flow: 'cloudy', arrangement: null, charcoal, text: 'It ran fast but cloudy: no fine layer caught the silt. Germs are still in it.' };
  }
  const smell = charcoal ? 'and smells fresher' : 'but still smells earthy';
  return { flow: 'clear', arrangement: 'coarseFirst', charcoal, text: `It ran clear ${smell}. Clear is not safe: germs are still in it.` };
}

/** A finished filter that runs clear (the lesson's working setup). */
export function filterWorks(s: PlacedStructure): boolean {
  return s.kind === 'filter' && s.complete && filterResult(filterLayers(s)).flow === 'clear';
}
