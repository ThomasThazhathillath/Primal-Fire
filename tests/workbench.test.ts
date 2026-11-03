import { describe, expect, it } from 'vitest';
import { spotWorldPosition } from '../src/game/blueprint.js';
import { Game } from '../src/game/game.js';

function outline(g: Game) {
  g.addItem('slab');
  g.takeOut('slab');
  const s = g.placeBlueprint('workbench', -1, -2).structure!;
  expect(g.held).toBe('slab'); // the plan does not use up the slab
  g.addItem('dryStone', 3);
  const failures: string[] = [];
  g.on((e) => e.type === 'interaction' && failures.push(`${e.code}${e.detail ? `:${e.detail}` : ''}`));
  return { s, failures };
}

const at = (g: Game, id: number, i: number, dx = 0, dz = 0) => {
  const p = spotWorldPosition(g.structures.find((s) => s.id === id)!, i);
  return { x: p.x + dx, z: p.z + dz };
};

describe('physical workbench', () => {
  it('a support released too far from its mark does not seat', () => {
    const g = new Game();
    const { s, failures } = outline(g);
    expect(g.fillSpot(s.id, 0, undefined, at(g, s.id, 0, 0.4, 0))).toBe(false);
    expect(failures[0]).toMatch(/^support\.tooFar/);
    expect(g.fillSpot(s.id, 0, undefined, at(g, s.id, 0, 0.05, 0))).toBe(true);
  });

  it('the slab cannot go on before the supports', () => {
    const g = new Game();
    const { s, failures } = outline(g);
    expect(g.placeKey(s.id, s.x, s.z, 2)).toBe(false);
    expect(failures).toEqual(['slab.beforeSupports:3 still to place']);
    expect(g.held).toBe('slab');
  });

  it('a slab needs both hands', () => {
    const g = new Game();
    const { s, failures } = outline(g);
    for (let i = 0; i < 3; i++) g.fillSpot(s.id, i, undefined, at(g, s.id, i));
    expect(g.placeKey(s.id, s.x, s.z, 1)).toBe(false);
    expect(failures).toEqual(['grab.tooHeavy']);
  });

  it('wobbles when the slab is off-centre, names the support, and can be fixed', () => {
    const g = new Game();
    const { s, failures } = outline(g);
    for (let i = 0; i < 3; i++) g.fillSpot(s.id, i, undefined, at(g, s.id, i));
    // Set the slab far over to one side of the supports.
    const far = at(g, s.id, 0);
    expect(g.placeKey(s.id, s.x + (far.x - s.x) * 1.9, s.z + (far.z - s.z) * 1.9, 2)).toBe(true);
    expect(s.complete).toBe(false);
    expect(failures.at(-1)).toMatch(/^slab\.notOnSupports:the (first|second|third) support/);
    // Lift it back off and set it centred: stable now.
    expect(g.takeBack(s.id, -1)).toBe(true);
    expect(g.held).toBe('slab');
    expect(g.placeKey(s.id, s.x, s.z, 2)).toBe(true);
    expect(s.complete).toBe(true);
  });

  it('a support can be re-seated only with the slab off', () => {
    const g = new Game();
    const { s } = outline(g);
    for (let i = 0; i < 3; i++) g.fillSpot(s.id, i, undefined, at(g, s.id, i));
    g.stow();
    expect(g.takeBack(s.id, 1)).toBe(true);
    expect(g.held).toBe('dryStone');
    expect(s.spots[1]).toBeNull();
  });

  it('survives save and load mid-assembly', () => {
    const g = new Game();
    const { s } = outline(g);
    g.fillSpot(s.id, 0, undefined, at(g, s.id, 0, 0.03, 0));
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.structures[0].spotPos?.[0]?.x).toBeCloseTo(at(g, s.id, 0).x); // seated on its mark
    expect(g2.structures[0].keyPlaced).toBe(false);
  });
});

describe('placement targets', () => {
  it('finds the open spot for a held stone, then the key position for the slab', () => {
    const g = new Game();
    const { s } = outline(g);
    const p0 = at(g, s.id, 0);
    expect(g.placementTarget('dryStone', p0.x, p0.z)).toEqual({ structure: s, index: 0 });
    expect(g.placementTarget('slab', s.x, s.z)).toBeNull(); // supports first
    for (let i = 0; i < 3; i++) g.fillSpot(s.id, i, undefined, at(g, s.id, i));
    expect(g.placementTarget('slab', s.x + 0.1, s.z)?.index).toBe(-1);
    expect(g.placementTarget('dryStone', p0.x, p0.z)).toBeNull();
    expect(g.wantsItem('slab', s.x + 3, s.z)).toBe(true);
    expect(g.wantsItem('slab', s.x + 30, s.z)).toBe(false);
  });
});

describe('taking a finished workbench apart', () => {
  it('slab first, then the stones; the plan clears and rebuilding gives no second reward', () => {
    const g = new Game();
    const { s } = outline(g);
    for (let i = 0; i < 3; i++) g.fillSpot(s.id, i, undefined, at(g, s.id, i));
    g.placeKey(s.id, s.x, s.z, 2);
    expect(s.complete).toBe(true);
    const xp = g.xp;
    expect(g.takeBack(s.id, 0)).toBe(false); // slab still on
    expect(g.takeBack(s.id, -1)).toBe(true);
    expect(g.held).toBe('slab');
    expect(s.complete).toBe(false);
    g.placeKey(s.id, s.x, s.z, 2);
    expect(s.complete).toBe(true);
    expect(g.xp).toBe(xp); // rebuilt, not rewarded twice
    g.takeBack(s.id, -1);
    for (let i = 0; i < 3; i++) expect(g.takeBack(s.id, i)).toBe(true);
    expect(g.structures).not.toContain(s);
  });
});

describe('removing an unfinished build', () => {
  it('clears the outline, returns placed parts, and allows a new plan', () => {
    const g = new Game();
    const { s } = outline(g);
    g.fillSpot(s.id, 0, undefined, at(g, s.id, 0));
    const stones = g.count('dryStone');
    expect(g.removeStructure(s.id)).toBe(true);
    expect(g.structures).not.toContain(s);
    expect(g.count('dryStone')).toBe(stones + 1);
    expect(g.held).toBe('slab'); // the slab never left your hand
    expect(g.placeBlueprint('workbench', -1, -2).ok).toBe(true); // the same ground is free again
  });
});

describe('re-placing an outline', () => {
  it('a new outline clears the unfinished one and returns its parts', () => {
    const g = new Game();
    const { s } = outline(g);
    g.fillSpot(s.id, 0, undefined, at(g, s.id, 0));
    const stones = g.count('dryStone');
    const res = g.placeBlueprint('workbench', -1, -2); // same ground: the old plan no longer blocks it
    expect(res.ok).toBe(true);
    expect(g.structures.filter((t) => t.kind === 'workbench')).toEqual([res.structure]);
    expect(g.count('dryStone')).toBe(stones + 1);
  });
});
