// Phase 3 quests (docs/PHASE3_LIVING_WORLD_SPEC.md). Unlike the chain in quests.ts these are NOT
// sequential: each one is judged from state (science events, flags, farm and camp state) all the
// time, and you can be partway through several. Done-ness is stored in game.living, which is saved, and every step is derived from saved state so old saves line up.

import type { Game } from './game.js';
import type { Quest } from './quests.js';
import type { ScienceEventId } from './science-events.js';

export interface LivingQuest extends Quest {
  id: string;
}

const mark = (done: boolean): string => (done ? '[x]' : '[ ]');
const ev =
  (id: ScienceEventId) =>
  (g: Game): boolean =>
    g.hasEvent(id);

export const LIVING_QUESTS: LivingQuest[] = [
  {
    id: 'hiddenTrail',
    title: 'The Hidden Trail',
    roadmapNode: null,
    desc: 'The forest is not empty. Something passes through it, and it leaves a story on the ground.',
    recap: 'Every animal writes a trail: the shape of the print says who, the sharpness says how long ago, and the line of them says where.',
    steps: [
      {
        text: (g) => `Find an animal track ${mark(g.hasEvent('hunt.track.found'))}`,
        done: ev('hunt.track.found'),
        hints: ['Soft, bare ground keeps a footprint. Where do animals walk to?', 'Look between the open meadow and the stream, with your eyes low and slow.'],
        target: { items: [] },
      },
      {
        text: (g) => `Work out whose it is ${mark(g.hasEvent('hunt.track.deer') || g.hasEvent('hunt.track.rabbit'))}`,
        done: (g) => g.hasEvent('hunt.track.deer') || g.hasEvent('hunt.track.rabbit'),
        hints: ['Size and shape tell you who. Two long toes, or small and round?', 'Stand beside a print and look at it.'],
        target: { items: [] },
      },
      {
        text: (g) => `Tell a fresh track from an old one ${mark(g.hasEvent('hunt.track.fresh'))}`,
        done: ev('hunt.track.fresh'),
        hints: ['Sharp edges and dark soil are new; blurred and pale are old.', 'Compare two prints from different places.'],
        target: { items: [] },
      },
      {
        text: (g) => `Follow the trail ${mark(g.hasEvent('hunt.track.followed'))}`,
        done: ev('hunt.track.followed'),
        hints: ['One print points to the next.', 'Walk along the line of prints, one by one, in the direction they point.'],
        target: { items: [] },
      },
      {
        text: (g) => `See the one who made it, without frightening it ${mark(g.hasEvent('wild.quiet.approach'))}`,
        done: ev('wild.quiet.approach'),
        hints: ['Animals notice noise and quick movement from far away.', 'Move slowly and stop often as you come near.'],
        target: { items: [] },
      },
    ],
  },
];

/** Done quests are remembered in game.living (saved); call after any state change. Returns the ones that just finished. */
export function livingProgress(g: Game): LivingQuest[] {
  const finished: LivingQuest[] = [];
  for (const q of LIVING_QUESTS) {
    if (g.living.has(q.id)) continue;
    if (q.steps.every((s) => s.done(g))) {
      g.living.add(q.id);
      finished.push(q);
    }
  }
  return finished;
}

export const livingDone = (g: Game, id: string): boolean => g.living.has(id);
