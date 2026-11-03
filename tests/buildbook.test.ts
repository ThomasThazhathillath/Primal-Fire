import { describe, expect, it } from 'vitest';
import { spotWorldPosition } from '../src/game/blueprint.js';
import { findBookSpot } from '../src/game/buildbook.js';
import { Game } from '../src/game/game.js';

const entry = (g: Game, id: string) => g.bookEntries().find((e) => e.id === id)!;
const at = (g: Game, id: number, i: number) => {
  const p = spotWorldPosition(g.structures.find((s) => s.id === id)!, i);
  return { x: p.x, z: p.z };
};

describe('build book entries', () => {
  it('lists every structure and bench recipe', () => {
    const ids = new Game().bookEntries().map((e) => e.id);
    for (const k of ['firePit', 'workbench', 'filter', 'shelter', 'storage']) expect(ids).toContain(k);
    expect(ids).toContain('recipe:axe');
  });

  it('fire pit and workbench are open from the start; the rest are locked with a hint', () => {
    const g = new Game();
    expect(entry(g, 'firePit').unlocked).toBe(true);
    expect(entry(g, 'workbench').unlocked).toBe(true);
    for (const id of ['filter', 'shelter', 'storage', 'recipe:axe']) {
      expect(entry(g, id).unlocked).toBe(false);
      expect(entry(g, id).hint.length).toBeGreaterThan(5);
    }
  });

  it('gathering a key material unlocks an entry', () => {
    const g = new Game();
    g.gather('cane' as never);
    expect(entry(g, 'storage').unlocked).toBe(true);
  });

  it('a finished workbench unlocks the recipes', () => {
    const g = new Game();
    g.addItem('slab');
    g.addItem('dryStone', 3);
    g.takeOut('slab');
    const s = g.placeBlueprint('workbench', 0, -2).structure!;
    for (let i = 0; i < 3; i++) g.fillSpot(s.id, i, undefined, at(g, s.id, i));
    g.placeKey(s.id, s.x, s.z, 2);
    expect(entry(g, 'recipe:axe').unlocked).toBe(true);
  });

  it('counts have / need across alternatives and the held part', () => {
    const g = new Game();
    g.addItem('dryStone', 2);
    g.addItem('wetStone', 1);
    const pit = entry(g, 'firePit');
    expect(pit.parts).toEqual([{ label: 'Dry stone or Wet stone', need: 4, have: 3 }]);
    expect(pit.haveAll).toBe(false);
    g.addItem('dryStone');
    expect(entry(g, 'firePit').haveAll).toBe(true);
  });

  it('announces a new unlock once, and not what a save already had', () => {
    const g = new Game();
    const msgs: string[] = [];
    g.on((e) => e.type === 'toast' && msgs.push(e.text));
    g.updateBook();
    expect(msgs).toEqual([]);
    g.gather('cane' as never);
    g.updateBook();
    g.updateBook();
    expect(msgs.filter((m) => m.includes('Storage basket'))).toHaveLength(1);
  });
});

describe('placing from the book', () => {
  it('puts the outline 1.5-2 m ahead with nothing in hand', () => {
    const g = new Game();
    const r = g.placeFromBook('firePit', 0, -1);
    expect(r.ok).toBe(true);
    const s = r.structure!;
    const d = Math.hypot(s.x - g.player.x, s.z - g.player.z);
    expect(d).toBeGreaterThanOrEqual(1.5);
    expect(d).toBeLessThanOrEqual(2.5);
    expect(s.keyOpen).toBe(true);
    expect(g.held).toBeNull();
  });

  it('fills the key part like any slot, in any order, and completes', () => {
    const g = new Game();
    g.addItem('dryStone', 4);
    const s = g.placeFromBook('firePit', 0, -1).structure!;
    expect(g.placementTarget('dryStone', at(g, s.id, -1).x, at(g, s.id, -1).z)?.index).toBe(-1);
    for (let i = 0; i < 3; i++) g.fillSpot(s.id, i);
    expect(s.complete).toBe(false);
    g.held = 'dryStone';
    g.addItem('dryStone', 0);
    expect(g.placeKey(s.id, at(g, s.id, -1).x, at(g, s.id, -1).z, 1)).toBe(true);
    expect(s.complete).toBe(true);
    expect(s.keyOpen).toBe(false);
  });

  it('the key can be filled first from the bag, too', () => {
    const g = new Game();
    g.addItem('dryStone', 4);
    const s = g.placeFromBook('firePit', 0, -1).structure!;
    const k = at(g, s.id, -1);
    expect(g.placeKey(s.id, k.x, k.z, 1)).toBe(true);
    expect(g.count('dryStone')).toBe(3);
    expect(s.complete).toBe(false);
  });

  it('a workbench from the book still needs the slab last, set with both hands', () => {
    const g = new Game();
    g.addItem('dryStone', 3);
    g.addItem('slab');
    const s = g.placeFromBook('workbench', 0, -1).structure!;
    expect(s.keyOpen).toBeUndefined();
    for (let i = 0; i < 3; i++) g.fillSpot(s.id, i, undefined, at(g, s.id, i));
    g.takeOut('slab');
    expect(g.placeKey(s.id, s.x, s.z, 2)).toBe(true);
    expect(s.complete).toBe(true);
  });

  it('a locked entry will not place and says how to unlock', () => {
    const g = new Game();
    const msgs: string[] = [];
    g.on((e) => e.type === 'toast' && msgs.push(e.text));
    expect(g.placeFromBook('filter', 0, -1).ok).toBe(false);
    expect(g.structures).toHaveLength(0);
    expect(msgs[0]).toMatch(/charcoal/i);
  });

  it('replaces an unfinished outline of the same kind and returns its parts', () => {
    const g = new Game();
    g.addItem('dryStone', 4);
    const a = g.placeFromBook('firePit', 0, -1).structure!;
    g.fillSpot(a.id, 0);
    expect(g.count('dryStone')).toBe(3);
    const b = g.placeFromBook('firePit', 1, 0).structure!;
    expect(g.structures).toEqual([b]);
    expect(g.count('dryStone')).toBe(4);
  });

  it('removing a book outline does not hand back a key part that was never placed', () => {
    const g = new Game();
    const s = g.placeFromBook('firePit', 0, -1).structure!;
    g.removeStructure(s.id);
    expect(g.count('dryStone')).toBe(0);
  });

  it('explains when there is no room', () => {
    const g = new Game();
    const msgs: string[] = [];
    g.on((e) => e.type === 'toast' && msgs.push(e.text));
    g.player.x = 500;
    expect(findBookSpot('firePit', 500, 0, 0, -1, [])).toBeNull();
    expect(g.placeFromBook('firePit', 0, -1).ok).toBe(false);
    expect(msgs.some((m) => /no room/i.test(m))).toBe(true);
  });

  it('saves and restores a half-filled book outline; old saves without keyOpen still load', () => {
    const g = new Game();
    g.addItem('dryStone', 4);
    const s = g.placeFromBook('firePit', 0, -1).structure!;
    g.fillSpot(s.id, 0);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.structures[0].keyOpen).toBe(true);
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    delete snap.structures[0].keyOpen; // an older save: the key counted as placed
    const g3 = Game.restore(snap);
    expect(g3.structures[0].keyOpen).toBeUndefined();
    g3.fillSpot(g3.structures[0].id, 1);
    g3.fillSpot(g3.structures[0].id, 2);
    expect(g3.structures[0].complete).toBe(true);
  });
});
