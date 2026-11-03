import { describe, expect, it } from 'vitest';
import { fitsPouch, ITEM_PHYSICS, ITEMS, twoHanded, type ItemId } from '../src/game/items.js';

describe('item physical properties', () => {
  it('every item has size, material, surface, interaction, grips and centre of mass', () => {
    for (const id of Object.keys(ITEMS) as ItemId[]) {
      const p = ITEM_PHYSICS[id];
      expect(p, id).toBeDefined();
      expect(p.size.every((v) => v > 0), id).toBe(true);
      expect(p.material, id).toBeTruthy();
      expect(p.surface, id).toBeTruthy();
      expect(['pouch', 'oneHand', 'twoHand', 'drag']).toContain(p.interaction);
      expect(p.grips.length, id).toBeGreaterThan(0);
      if (p.interaction === 'twoHand') expect(p.grips.length, id).toBe(2);
      expect(typeof p.breakable).toBe('boolean');
    }
  });
  it('tools have durability and grip at the handle end, head-heavy axes', () => {
    for (const t of ['axe', 'hammer', 'knife'] as ItemId[]) {
      expect(ITEM_PHYSICS[t].durability).toBeGreaterThan(0);
      expect(ITEM_PHYSICS[t].grips[0].x).toBeLessThan(0);
    }
    expect(ITEM_PHYSICS.axe.com.x).toBeGreaterThan(0);
  });
  it('big or heavy things do not fit the pouch', () => {
    expect(fitsPouch('dryStone')).toBe(true);
    expect(fitsPouch('slab')).toBe(false);
    expect(fitsPouch('logs')).toBe(false);
    expect(fitsPouch('axe')).toBe(true); // strapped to the pack
    expect(twoHanded('slab')).toBe(true);
    expect(twoHanded('logs')).toBe(true);
  });
});
