import { describe, expect, it } from 'vitest';
import { openMarks } from '../src/game/assist.js';
import { Game } from '../src/game/game.js';

const pitGame = (stones: number) => {
  const g = new Game();
  g.addItem('dryStone', stones);
  const s = g.placeFromBook('firePit', 0, -1).structure!;
  g.player.x = s.x;
  g.player.z = s.z + 1.5;
  return { g, s };
};
const stones = (g: Game) => g.count('dryStone') + (g.held === 'dryStone' ? 1 : 0);

describe('auto-refill while building', () => {
  it('after placing a held stone the next one appears in the hand, until the build is full', () => {
    const { g, s } = pitGame(6);
    g.takeOut('dryStone');
    let placed = 0;
    for (let guard = 0; guard < 6 && g.held === 'dryStone'; guard++) {
      const m = openMarks(g.structures)[0];
      if (!m) break;
      expect(g.seatNear('dryStone', m.x, m.z, { say: true })).toBe(true);
      placed++;
    }
    expect(placed).toBe(4); // the ring needs four stones
    expect(s.complete).toBe(true);
    // Placed four from a bag of six: two stones left, and none forced into the hand once nothing wants them.
    expect(stones(g)).toBe(2);
    expect(g.held).toBeNull();
  });
  it('stops when the bag runs out', () => {
    const { g } = pitGame(2);
    g.takeOut('dryStone');
    const m1 = openMarks(g.structures)[0];
    g.seatNear('dryStone', m1.x, m1.z);
    expect(g.held).toBe('dryStone'); // the last one came to the hand
    const m2 = openMarks(g.structures)[0];
    g.seatNear('dryStone', m2.x, m2.z);
    expect(g.held).toBeNull();
    expect(stones(g)).toBe(0);
  });
  it('Put away stops it; taking something out by hand starts it again', () => {
    const { g } = pitGame(6);
    g.takeOut('dryStone');
    g.cancelRefill();
    const m = openMarks(g.structures)[0];
    g.seatNear('dryStone', m.x, m.z);
    expect(g.held).toBeNull();
    g.takeOut('dryStone');
    expect(g.autoRefill).toBe(true);
    const m2 = openMarks(g.structures)[0];
    g.seatNear('dryStone', m2.x, m2.z);
    expect(g.held).toBe('dryStone');
  });
  it('walking away from the build stops it', () => {
    const { g, s } = pitGame(6);
    g.takeOut('dryStone');
    const m = openMarks(g.structures)[0];
    g.player.x = s.x + 30;
    g.seatNear('dryStone', m.x, m.z);
    expect(g.held).toBeNull();
  });
  it('never refills for a part the build does not want', () => {
    const g = new Game();
    g.addItem('dryStone', 4);
    g.addItem('twigs', 4);
    const s = g.placeFromBook('firePit', 0, -1).structure!;
    g.player.x = s.x;
    g.player.z = s.z + 1;
    g.takeOut('twigs');
    expect(g.seatNear('twigs', s.x, s.z)).toBe(false);
    expect(g.held).toBe('twigs');
  });
});

describe('fill from the mark with an empty hand', () => {
  it('fills a fire pit in four moves, one mark each, with nothing in the hand', () => {
    const { g, s } = pitGame(5);
    for (let i = 0; i < 4; i++) {
      const m = openMarks(g.structures)[0];
      expect(g.fillFromBag(m.structure.id, m.index)).toBe(true);
    }
    expect(s.complete).toBe(true);
    expect(g.held).toBeNull();
    expect(g.count('dryStone')).toBe(1);
  });
  it('fills a workbench: three supports from the bag, then the slab is brought to the hand', () => {
    const g = new Game();
    g.addItem('dryStone', 3);
    g.addItem('slab');
    const s = g.placeFromBook('workbench', 0, -1).structure!;
    for (let i = 0; i < 3; i++) {
      const m = openMarks(g.structures)[0];
      expect(g.fillFromBag(s.id, m.index)).toBe(true);
    }
    const key = openMarks(g.structures)[0];
    expect(key.index).toBe(-1);
    // The top is lifted on with both hands: the mark brings it to the hand and says so.
    expect(g.fillFromBag(s.id, -1)).toBe(false);
    expect(g.held).toBe('slab');
    expect(g.placeKey(s.id, s.x, s.z, 2)).toBe(true);
    expect(s.complete).toBe(true);
  });
  it('a mark with nothing in the bag that fits says what it needs and widens the help', () => {
    const g = new Game();
    g.addItem('twigs');
    const s = g.placeFromBook('firePit', 0, -1).structure!;
    const msgs: string[] = [];
    g.on((e) => e.type === 'toast' && msgs.push(e.text));
    const m = openMarks(g.structures)[0];
    expect(g.fillFromBag(s.id, m.index)).toBe(false);
    expect(msgs.join(' ')).toMatch(/needs .*stone.* none in your bag/);
    expect(g.assist.level('place')).toBe(0); // one miss changes nothing yet
  });
  it('a filled or unknown mark is not filled twice', () => {
    const { g, s } = pitGame(3);
    const m = openMarks(g.structures)[0];
    expect(g.fillFromBag(s.id, m.index)).toBe(true);
    expect(g.fillFromBag(s.id, m.index)).toBe(false);
    expect(g.fillFromBag(999, 0)).toBe(false);
  });
});
