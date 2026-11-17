// Hint = Find: the card lists every gatherable item (the step's needs first), and the map has plenty of what players
// hunt for (Quest test 2026-11-17: "it is so hard to find things"; the whole map had 5 log piles).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIND_SLOTS, findableItems, findOrder, MAX_BEACONS, nearestFirst } from '../src/game/find.js';
import { stepById } from '../src/game/curriculum/registry.js';
import { Game } from '../src/game/game.js';
import { ABUNDANCE_RULES, RESOURCES } from '../src/game/world-layout.js';

const count = (item: string) => RESOURCES.filter((r) => r.itemId === item).length;

describe('Find card items', () => {
  const items = findableItems(RESOURCES);

  it('offers every item a spot gives, once each, and they all fit on the card', () => {
    expect(new Set(items).size).toBe(items.length);
    for (const r of RESOURCES) expect(items).toContain(r.itemId);
    expect(items.length).toBeLessThanOrEqual(FIND_SLOTS);
  });

  it('puts what the step on the card needs first, then the rest; unknown or repeated needs are ignored', () => {
    const o = findOrder(items, ['slab', 'logs', 'slab', 'notAnItem' as never]);
    expect(o.slice(0, 2)).toEqual([
      { item: 'slab', needed: true },
      { item: 'logs', needed: true },
    ]);
    expect(o.filter((x) => x.needed)).toHaveLength(2);
    expect(o).toHaveLength(items.length);
    expect(new Set(o.map((x) => x.item)).size).toBe(o.length);
  });

  it('the first Lesson 01 steps name their items, so the card leads with them', () => {
    const g = new Game();
    expect(stepById('firstStone')?.find?.(g)).toEqual(['dryStone', 'wetStone']);
    expect(findOrder(items, stepById('flatStone')?.find?.(g) ?? [])[0]).toEqual({ item: 'slab', needed: true });
  });

  it('beacons go to the nearest spots first, at most MAX_BEACONS', () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ x: i, z: 0 }));
    const near = nearestFirst(pts, 50.2, 0);
    expect(near).toHaveLength(MAX_BEACONS);
    expect(near[0].x).toBe(50);
    expect(near.every((p) => Math.abs(p.x - 50.2) <= 32.5)).toBe(true);
  });
});

describe('more resources on the map', () => {
  it('has plenty of the things players hunt for', () => {
    expect(count('logs')).toBeGreaterThanOrEqual(25);
    expect(count('pole')).toBeGreaterThanOrEqual(25);
    expect(count('slab')).toBeGreaterThanOrEqual(15);
    expect(count('greenBranch')).toBeGreaterThanOrEqual(15);
    expect(count('dryGrass')).toBeGreaterThanOrEqual(40);
    for (const item of ['spindle', 'board', 'forkedStick', 'diggingStick'] as const) expect(count(item), item).toBeGreaterThanOrEqual(5);
  });

  it('places almost every extra spot it asks for (the map has room)', () => {
    const asked = ABUNDANCE_RULES.reduce((n, r) => n + r.count, 0);
    expect(RESOURCES.length).toBeGreaterThan(774 + asked * 0.9);
  });

  it('the original spots keep their ids (saves match spots by id)', () => {
    // A few ids from before the extra pass, at the places they always had.
    const first = RESOURCES.slice(0, 3).map((r) => r.id);
    expect(first).toEqual(['stone-1', 'stone-2', 'wetStone-1']);
    expect(RESOURCES.find((r) => r.id === 'stone-1')).toMatchObject({ x: -2.2, z: -2.6 });
  });
});

describe('the Find card markup (hint.uikitml)', () => {
  const ui = readFileSync('public/ui/hint.uikitml', 'utf8');
  it('has every item button and label, Back and Clear beacons', () => {
    const ids = ['hint-close', 'find-clear', 'find-clear-label', 'find-note'];
    for (let i = 0; i < FIND_SLOTS; i++) ids.push(`find-${i}`, `find-${i}-label`);
    for (const id of ids) expect(ui.includes(`id="${id}"`), id).toBe(true);
  });
});
