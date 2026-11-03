// The build book: every buildable in one list. Choosing a structure places its
// outline in front of you; you then fill every part (the key part too). Recipes
// made at the workbench are listed for reference. Entries unlock with your
// level or when you have found a key material, and say how while locked.
// Pure data and rules: BuildBookSystem only draws it.

import { BLUEPRINTS, checkPlacement, type PlacedStructure, type StructureKind } from './blueprint.js';
import { BENCH_RECIPES } from './bench.js';
import type { Game } from './game.js';
import { itemName, type ItemId } from './items.js';

export interface BookPart {
  /** "Stone", "Forked stick"... what the slot takes (alternatives joined by " or "). */
  label: string;
  need: number;
  /** How many you carry (bag + hand) that would fit. */
  have: number;
}

export interface BookEntry {
  id: string;
  kind: 'structure' | 'recipe';
  structure?: StructureKind;
  name: string;
  description: string;
  parts: BookPart[];
  unlocked: boolean;
  /** One line on how to unlock it (shown while locked). */
  hint: string;
  /** Every part is in your bag (a structure can still be placed without). */
  haveAll: boolean;
}

interface Unlock {
  /** Open at this game level or later. */
  level?: number;
  /** ...or once you have gathered any of these. */
  gathered?: ItemId[];
  /** ...or once any of these science events fired. */
  events?: string[];
  /** ...or once a finished structure of this kind stands. */
  built?: StructureKind;
  hint: string;
}

const DESCRIPTIONS: Record<StructureKind, string> = {
  firePit: 'A ring of stones to keep a fire in one place.',
  workbench: 'Stones carry a flat slab: a steady table to make tools on.',
  storage: 'A woven basket that keeps your things at camp.',
  filter: 'A tripod of layers that clears murky water.',
  shelter: 'A lean-to of branches, twigs and a roof cover.',
};

const UNLOCKS: Record<StructureKind, Unlock> = {
  firePit: { level: 1, hint: '' },
  workbench: { level: 1, hint: '' },
  storage: { level: 3, gathered: ['cane'], hint: 'Find hollow cane by the stream, or reach the Camp level.' },
  filter: { level: 2, gathered: ['charcoal'], hint: 'Make charcoal, or reach the Clean Water level.' },
  shelter: { level: 3, gathered: ['twigs'], events: ['shelter.site.chosen'], hint: 'Gather twigs, or reach the Camp level.' },
};

const RECIPE_UNLOCK: Unlock = { built: 'workbench', hint: 'Build a workbench first.' };

/** Do two ordered id lists match, for grouping slots that take the same parts? */
const sameParts = (a: ItemId[], b: ItemId[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function groupParts(game: Game, slots: ItemId[][]): BookPart[] {
  const groups: Array<{ accepts: ItemId[]; need: number }> = [];
  for (const accepts of slots) {
    const g = groups.find((x) => sameParts(x.accepts, accepts));
    if (g) g.need++;
    else groups.push({ accepts, need: 1 });
  }
  return groups.map((g) => ({
    label: g.accepts.map((id) => itemName(id)).join(' or '),
    need: g.need,
    have: g.accepts.reduce((n, id) => n + game.count(id) + (game.held === id ? 1 : 0), 0),
  }));
}

function isUnlocked(game: Game, u: Unlock): boolean {
  if (u.level !== undefined && game.gameLevel.n >= u.level) return true;
  if (u.gathered?.some((id) => game.gatheredCount(id) > 0)) return true;
  if (u.events?.some((e) => game.events.has(e))) return true;
  if (u.built && game.structures.some((s) => s.kind === u.built && s.complete)) return true;
  return false;
}

export function bookEntries(game: Game): BookEntry[] {
  const out: BookEntry[] = [];
  for (const def of Object.values(BLUEPRINTS)) {
    const slots: ItemId[][] = [def.keyAccepts, ...def.spots.map((s) => s.accepts)];
    const parts = groupParts(game, slots);
    out.push({
      id: def.kind,
      kind: 'structure',
      structure: def.kind,
      name: def.name,
      description: DESCRIPTIONS[def.kind],
      parts,
      unlocked: isUnlocked(game, UNLOCKS[def.kind]),
      hint: UNLOCKS[def.kind].hint,
      haveAll: parts.every((p) => p.have >= p.need),
    });
  }
  const bench = isUnlocked(game, RECIPE_UNLOCK);
  for (const r of BENCH_RECIPES) {
    const parts = Object.entries(r.inputs).map(([id, need]) => ({
      label: itemName(id as ItemId),
      need: need ?? 1,
      have: game.count(id as ItemId) + (game.held === id ? 1 : 0),
    }));
    out.push({
      id: `recipe:${r.id}`,
      kind: 'recipe',
      name: r.name,
      description: 'Made at the workbench.',
      parts,
      unlocked: bench,
      hint: RECIPE_UNLOCK.hint,
      haveAll: parts.every((p) => p.have >= p.need),
    });
  }
  return out;
}

/** Distances (m) and sideways turns (rad) tried, in order, when placing from the book. */
const REACHES = [1.7, 1.5, 2.0, 2.4];
const TURNS = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6];

/**
 * A spot 1.5-2 m (a bit more when crowded) in front of the player on ground
 * checkPlacement accepts, trying a few offsets. rotY faces the structure to the player.
 */
export function findBookSpot(
  kind: StructureKind,
  px: number,
  pz: number,
  dirX: number,
  dirZ: number,
  structures: readonly PlacedStructure[],
): { x: number; z: number; rotY: number } | null {
  const len = Math.hypot(dirX, dirZ) || 1;
  const base = Math.atan2(dirZ / len, dirX / len);
  for (const r of REACHES) {
    for (const t of TURNS) {
      const a = base + t;
      const x = px + Math.cos(a) * r;
      const z = pz + Math.sin(a) * r;
      if (checkPlacement(kind, x, z, structures).ok) return { x, z, rotY: Math.atan2(px - x, pz - z) };
    }
  }
  return null;
}
