import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';

function withStorage(g: Game): void {
  g.addItem('cane');
  g.takeOut('cane');
  const s = g.placeBlueprint('storage', -1, -2).structure!;
  g.addItem('cane', 2);
  g.addItem('cord');
  s.spots.forEach((_, i) => g.fillSpot(s.id, i));
  g.player.x = -1;
  g.player.z = -2;
}

describe('drop and stash', () => {
  it('dropping removes weight, picking up restores it', () => {
    const g = new Game();
    g.addItem('slab');
    const w = g.carriedWeight;
    const d = g.dropItem('slab', 2, 3)!;
    expect(g.carriedWeight).toBeCloseTo(w - 6);
    expect(g.drops).toHaveLength(1);
    expect(g.pickUpDrop(d.id)).toBe(true);
    expect(g.carriedWeight).toBeCloseTo(w);
    expect(g.drops).toHaveLength(0);
  });

  it('can drop the held item', () => {
    const g = new Game();
    g.addItem('axe');
    g.takeOut('axe');
    expect(g.dropItem('axe', 0, 0)).not.toBeNull();
    expect(g.held).toBeNull();
  });

  it('cannot drop what you do not have', () => {
    expect(new Game().dropItem('logs', 0, 0)).toBeNull();
  });

  it('drops persist in the save', () => {
    const g = new Game();
    g.addItem('logs');
    g.dropItem('logs', 4, 5);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.drops).toEqual(g.drops);
    g2.dropItem('logs', 0, 0); // none left: ignored
    g2.addItem('logs');
    expect(g2.dropItem('logs', 1, 1)!.id).toBeGreaterThan(g.drops[0].id);
  });

  it('refuses to pick up with full pockets', () => {
    const g = new Game();
    g.addItem('twigs');
    const d = g.dropItem('twigs', 0, 0)!;
    g.addItem('twigs', 20);
    expect(g.pickUpDrop(d.id)).toBe(false);
  });

  it('stashes held or carried items into storage, with weight updates', () => {
    const g = new Game();
    expect(g.stashItem('twigs')).toBe(false);
    withStorage(g);
    g.addItem('slab');
    g.takeOut('slab');
    const w = g.carriedWeight;
    expect(g.stashItem('slab')).toBe(true);
    expect(g.carriedWeight).toBeCloseTo(w - 6);
    expect(g.nearbyStorage()!.store!.slab).toBe(1);
  });
});
