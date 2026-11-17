// Lesson 04 (Tools): new steps. Knapping and cutting reuse the beginner objectives in objectives.ts.
import type { Game } from '../../../game.js';
import type { HintInfo } from '../../../hint-info.js';
import type { ItemId } from '../../../items.js';
import type { Step } from '../../types.js';

const everHad = (g: Game, id: ItemId): boolean => g.gatheredCount(id) > 0 || g.count(id) > 0 || g.held === id;

export const TOOLS_STEPS: Step[] = [
  {
    id: 'axe',
    find: (g) => (everHad(g, 'axe') ? [] : (['dryStone', 'spindle'] as ItemId[]).filter((id) => g.count(id) === 0)),
    title: 'Make a stone axe',
    short: 'Make an axe at the bench',
    instruction: 'At your workbench, split a handle, seat a stone head in it and lash it tight with cord.',
    doneMessage: 'A stone axe: a long handle makes the head move fast, and a fast head hits hard.',
    teach: 'bench',
    done: (g) => g.hasEvent('tool.axe.made') || everHad(g, 'axe'),
    hint: {
      ref: 'axe',
      levels: [
        'A heavy head on a long handle moves faster than your hand can.',
        'A stone head, a straight handle and two cords to lash them.',
        'Make it at your workbench.',
        'Poke the workbench, choose the axe and follow each step: split, seat, lash.',
      ],
    },
  },
  {
    id: 'split',
    find: (g) => (g.gatheredCount('logs') > 0 ? [] : ['logs']),
    title: 'Split wood with the axe',
    short: 'Chop a log with the axe',
    instruction: 'Hold the axe and swing it at a fallen log. The edge drives in like a wedge and pushes the fibres apart.',
    doneMessage: 'A wedge turns a downward blow into a sideways push that splits wood along its grain.',
    teach: 'tool',
    done: (g) => g.hasEvent('tool.wedge.split'),
    hint: {
      ref: 'logs',
      levels: [
        'Wood splits easily along its grain and hardly at all across it.',
        'The axe edge is a wedge: it pushes the fibres sideways.',
        'Fallen logs lie where trees came down.',
        'Hold the axe and swing it down onto a log, along the grain.',
      ],
    },
  },
];

const item = (id: ItemId, x = 0, z = 0) => ({ kind: 'item' as const, id, x, z });

export const TOOLS_HINTS: Record<string, HintInfo> = {
  axe: {
    name: 'Stone axe',
    look: 'A fist-sized stone lashed into the split end of a straight handle.',
    why: 'The handle is a lever: the head travels further and faster than your hand, so it strikes harder.',
    avoid: 'A loose head: lash it crosswise so it cannot twist.',
    views: [{ pieces: [item('dryStone', -0.3, 0), item('spindle', 0.1, 0), item('cord', 0.45, 0)], caption: 'Stone, handle and cord' }],
  },
  split: {
    name: 'Splitting a log',
    look: 'A fallen log; swing the axe down along its length.',
    why: 'Wood fibres run along the grain, so a wedge driven along them pushes them apart easily.',
    avoid: 'Chopping across the grain: the fibres resist.',
    views: [{ pieces: [item('logs')], caption: 'A log to split' }],
  },
};
