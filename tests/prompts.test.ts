import { describe, expect, it } from 'vitest';
import { ITEMS, type ItemId } from '../src/game/items.js';
import { bagPrompt, gatherPrompt, ITEM_ACTIONS } from '../src/game/prompts.js';

describe('prompts', () => {
  it('only describe real items', () => {
    for (const id of Object.keys(ITEM_ACTIONS)) expect(ITEMS[id as ItemId]).toBeDefined();
  });
  it('is context-sensitive', () => {
    const none = new Set<ItemId>();
    expect(gatherPrompt('logs', null, none)).toContain('axe');
    expect(gatherPrompt('logs', 'axe', none)).toContain('Swing');
    expect(gatherPrompt('fibers', 'knife', none)).toContain('knife');
    expect(gatherPrompt('dryStone', null, none)).toContain('sharp flake');
    expect(gatherPrompt('ember', null, none)).toContain('ember');
  });
  it('bag prompt names the actions', () => {
    expect(bagPrompt('twigs', true)).toContain('stash');
  });
});
