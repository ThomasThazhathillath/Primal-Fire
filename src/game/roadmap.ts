// Which Science Roadmap nodes are lit (the carved wall in the ruins, roadmap-system.ts).
// Worked out from what the player has actually done, never from a quest's position in a list, so the
// wall stays right whatever order lessons are played in and for saves from any version.

import type { Game } from './game.js';
import { LIVING_QUESTS } from './living-quests.js';
import { frameDone } from './shelter.js';

/** Nodes lit by a discovery: the node id on the wall and the proof that it was made. */
export const ROADMAP_PROOFS: ReadonlyArray<{ node: string; done: (g: Game) => boolean }> = [
  { node: 'fire', done: (g) => g.flag('fireLit') },
  { node: 'pottery', done: (g) => g.flag('potFired') },
  { node: 'charcoal', done: (g) => g.flag('charcoalMade') },
  { node: 'water', done: (g) => g.flag('waterSafe') },
  { node: 'chem', done: (g) => g.flag('finale') },
  { node: 'structure', done: (g) => g.structures.some((s) => s.kind === 'leanTo' && frameDone(s)) },
  { node: 'hydro', done: (g) => g.flag('shelterTested') },
];

/** Every lit node, in wall order (chain discoveries first, then field tasks). */
export function roadmapLit(g: Game): string[] {
  const out: string[] = [];
  for (const p of ROADMAP_PROOFS) if (p.done(g)) out.push(p.node);
  for (const q of LIVING_QUESTS) if (q.roadmapNode && g.living.has(q.id)) out.push(q.roadmapNode);
  return out;
}
