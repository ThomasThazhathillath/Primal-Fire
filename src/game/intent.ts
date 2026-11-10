// Interaction intent (docs/TUTORIAL_USABILITY_SPEC.md, part B.1): from what is HELD and what it is NEAR
// or aimed at, decide the ONE sensible action, so players never have to learn a gesture per action.
// Any natural motion near a valid target (let go, touch, tap, a gentle push, a strike) does that
// target's action; an unrelated target never fires. This file is the table; `Game.intentAt` builds the
// targets from game state and runs the action through the same code the dedicated systems use.
// Pure: no three.js, nothing allocated.

import { FUEL_ITEMS } from './fire.js';
import type { ItemId } from './items.js';

export type TargetKind = 'mark' | 'firePit' | 'stream' | 'filter' | 'mound' | 'plot' | 'ground' | 'softPlant' | 'wood' | 'stone';

export type IntentAction =
  | 'place'
  | 'feedFire'
  | 'sawDrill'
  | 'carryEmber'
  | 'firePot'
  | 'boilPot'
  | 'cookFish'
  | 'fillPot'
  | 'pourFilter'
  | 'sealMound'
  | 'lightMound'
  | 'openMound'
  | 'digMound'
  | 'plant'
  | 'waterPlot'
  | 'harvest'
  | 'digPlot'
  | 'knap'
  | 'cut'
  | 'chop';

/** Actions that are a continuous motion done by their own system (sawing, knapping, cutting, chopping), not a one-shot. */
export const CONTINUOUS: ReadonlySet<IntentAction> = new Set<IntentAction>(['sawDrill', 'knap', 'cut', 'chop', 'cookFish']);

export type PotWater = 'empty' | 'raw' | 'filtered' | 'safe' | 'boiledRaw';

export interface IntentTarget {
  kind: TargetKind;
  /** mark: what the mark takes. */
  accepts?: readonly ItemId[];
  /** firePit */
  fire?: { burning: boolean; embedded: boolean; layBuilt: boolean; stage: string; carrying: boolean };
  /** the pot's state, when it matters */
  pot?: { fired: boolean; dry: boolean; water: PotWater };
  /** mound */
  mound?: { sealed: boolean; burning: boolean; fireLit: boolean };
  /** plot */
  plot?: { hasCrop: boolean; ripe: boolean; moist: boolean };
  /** ground: a plot could be dug here / a charcoal pit stacked here */
  canDig?: boolean;
  canMound?: boolean;
}

const SOFT_CUTTERS: readonly ItemId[] = ['flake', 'knife'];

/**
 * The action holding `held` (null = empty hand) does at `t`, or null when nothing sensible happens.
 * Empty-handed punches, swings and pushes never harvest or build: with nothing in hand only taps on things
 * that are made to be tapped act (the open mound, a ripe plot, an ember carried to the tinder).
 */
export function resolveIntent(held: ItemId | null, t: IntentTarget): IntentAction | null {
  switch (t.kind) {
    case 'mark':
      return held && t.accepts?.includes(held) ? 'place' : null;
    case 'firePit': {
      const f = t.fire;
      if (!f) return null;
      if (held === null) return f.carrying ? 'carryEmber' : null;
      if (held === 'bowDrill') return f.layBuilt && f.stage === 'lay' && !f.carrying ? 'sawDrill' : null;
      if (FUEL_ITEMS[held] && !f.embedded) return 'feedFire';
      if (held === 'pot' && t.pot?.fired === false && f.burning) return 'firePot';
      if (held === 'pot' && t.pot?.fired && f.burning && (t.pot.water === 'raw' || t.pot.water === 'filtered')) return 'boilPot';
      if (held === 'fish' && f.burning) return 'cookFish';
      return null;
    }
    case 'stream':
      return held === 'pot' && t.pot?.fired && (t.pot.water === 'empty' || t.pot.water === 'boiledRaw') ? 'fillPot' : null;
    case 'filter':
      return held === 'pot' && t.pot?.fired && t.pot.water === 'raw' ? 'pourFilter' : null;
    case 'mound': {
      const m = t.mound;
      if (!m) return null;
      if (!m.burning && !m.sealed && held === 'clay') return 'sealMound';
      if (!m.burning && m.fireLit && (held === 'torch' || held === 'ember')) return 'lightMound';
      if (m.burning && m.sealed) return 'openMound';
      return null;
    }
    case 'plot': {
      const p = t.plot;
      if (!p) return null;
      if (p.hasCrop && p.ripe) return 'harvest';
      if (!p.hasCrop && (held === 'tuber' || held === 'seeds')) return 'plant';
      if (p.hasCrop && held === 'pot' && t.pot && t.pot.water !== 'empty') return 'waterPlot';
      return null;
    }
    case 'ground':
      if (held === 'diggingStick' && t.canDig) return 'digPlot';
      if (held === 'diggingStick' && t.canMound) return 'digMound';
      return null;
    case 'softPlant':
      return held && SOFT_CUTTERS.includes(held) ? 'cut' : null;
    case 'wood':
      return held === 'axe' ? 'chop' : null;
    case 'stone':
      return held === 'flint' ? 'knap' : null;
  }
}
