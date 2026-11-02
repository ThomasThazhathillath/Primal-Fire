import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import type { ItemId } from '../src/game/items.js';

function build(g: Game, kind: 'storage' | 'shelter' | 'firePit', x: number, z: number, key: ItemId, fill: Partial<Record<ItemId, number>>) {
  g.addItem(key);
  g.takeOut(key);
  const s = g.placeBlueprint(kind, x, z).structure!;
  for (const [id, n] of Object.entries(fill)) g.addItem(id as ItemId, n);
  s.spots.forEach((_, i) => g.fillSpot(s.id, i));
  expect(s.complete).toBe(true);
  return s;
}

describe('camp', () => {
  it('builds a storage basket, stashes and withdraws, and saves it', () => {
    const g = new Game();
    const box = build(g, 'storage', -1, -2, 'cane', { cane: 2, cord: 1 });
    g.player.x = -1;
    g.player.z = -2;
    g.addItem('twigs', 5);
    expect(g.stash('twigs', 3)).toBe(3);
    expect(g.count('twigs')).toBe(2);
    expect(g.storedCount(box)).toBe(3);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    g2.player.x = -1;
    g2.player.z = -2;
    expect(g2.withdraw('twigs', 10)).toBe(3);
    expect(g2.count('twigs')).toBe(5);
  });

  it('cannot stash away from storage', () => {
    const g = new Game();
    g.addItem('twigs');
    expect(g.stash('twigs')).toBe(0);
  });

  it('builds a shelter and counts camp structures around the fire', () => {
    const g = new Game();
    build(g, 'firePit', -1, -2, 'dryStone', { dryStone: 3 });
    expect(g.camp().length).toBe(1);
    build(g, 'shelter', -1, 3, 'branch', { branch: 2, twigs: 1, cloth: 1 });
    expect(g.camp().map((s) => s.kind).sort()).toEqual(['firePit', 'shelter']);
  });
});
