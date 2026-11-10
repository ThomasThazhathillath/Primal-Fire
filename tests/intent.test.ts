import { describe, expect, it } from 'vitest';
import { spotWorldPosition } from '../src/game/blueprint.js';
import { Game } from '../src/game/game.js';
import { type IntentAction, type IntentTarget, resolveIntent } from '../src/game/intent.js';
import type { ItemId } from '../src/game/items.js';

const fire = (o: Partial<NonNullable<IntentTarget['fire']>> = {}) => ({ burning: false, embedded: false, layBuilt: false, stage: 'cold', carrying: false, ...o });
const pot = (water: 'empty' | 'raw' | 'filtered' | 'safe' | 'boiledRaw', fired = true) => ({ fired, dry: true, water });
const T = {
  markStone: { kind: 'mark', accepts: ['dryStone', 'wetStone'] } as IntentTarget,
  markSlab: { kind: 'mark', accepts: ['slab'] } as IntentTarget,
  pitCold: { kind: 'firePit', fire: fire() } as IntentTarget,
  pitLay: { kind: 'firePit', fire: fire({ layBuilt: true, stage: 'lay' }) } as IntentTarget,
  pitEmber: { kind: 'firePit', fire: fire({ embedded: true, stage: 'lay' }) } as IntentTarget,
  pitBurning: { kind: 'firePit', fire: fire({ burning: true, stage: 'burning' }), pot: pot('raw') } as IntentTarget,
  pitBurningRaw: { kind: 'firePit', fire: fire({ burning: true, stage: 'burning' }), pot: pot('raw') } as IntentTarget,
  pitBurningUnfired: { kind: 'firePit', fire: fire({ burning: true, stage: 'burning' }), pot: pot('empty', false) } as IntentTarget,
  streamEmpty: { kind: 'stream', pot: pot('empty') } as IntentTarget,
  streamFull: { kind: 'stream', pot: pot('raw') } as IntentTarget,
  filterRaw: { kind: 'filter', pot: pot('raw') } as IntentTarget,
  filterEmpty: { kind: 'filter', pot: pot('empty') } as IntentTarget,
  moundOpen: { kind: 'mound', mound: { sealed: false, burning: false, fireLit: true } } as IntentTarget,
  moundBurningSealed: { kind: 'mound', mound: { sealed: true, burning: true, fireLit: true } } as IntentTarget,
  plotEmpty: { kind: 'plot', plot: { hasCrop: false, ripe: false, moist: false } } as IntentTarget,
  plotRipe: { kind: 'plot', plot: { hasCrop: true, ripe: true, moist: true } } as IntentTarget,
  plotGrowing: { kind: 'plot', plot: { hasCrop: true, ripe: false, moist: false }, pot: pot('raw') } as IntentTarget,
  ground: { kind: 'ground', canDig: true, canMound: false } as IntentTarget,
  soft: { kind: 'softPlant' } as IntentTarget,
  wood: { kind: 'wood' } as IntentTarget,
  stone: { kind: 'stone' } as IntentTarget,
};

type Row = [ItemId | null, keyof typeof T, IntentAction | null];

describe('intent table: held x target -> the one sensible action', () => {
  const rows: Row[] = [
    // marks: only a part the mark accepts
    ['dryStone', 'markStone', 'place'],
    ['wetStone', 'markStone', 'place'],
    ['twigs', 'markStone', null],
    [null, 'markStone', null],
    ['slab', 'markSlab', 'place'],
    ['dryStone', 'markSlab', null],
    // the fire pit
    ['twigs', 'pitCold', 'feedFire'],
    ['dryGrass', 'pitCold', 'feedFire'],
    ['logs', 'pitLay', 'feedFire'],
    ['twigs', 'pitEmber', null], // never smother an ember with fuel
    ['bowDrill', 'pitLay', 'sawDrill'],
    ['bowDrill', 'pitCold', null],
    ['dryStone', 'pitCold', null],
    ['cord', 'pitLay', null],
    ['pot', 'pitBurningRaw', 'boilPot'],
    ['pot', 'pitBurningUnfired', 'firePot'],
    ['fish', 'pitBurning', 'cookFish'],
    ['fish', 'pitCold', null],
    // water
    ['pot', 'streamEmpty', 'fillPot'],
    ['pot', 'streamFull', null],
    ['dryStone', 'streamEmpty', null],
    [null, 'streamEmpty', null],
    ['pot', 'filterRaw', 'pourFilter'],
    ['pot', 'filterEmpty', null],
    ['twigs', 'filterRaw', null],
    // charcoal mound
    ['clay', 'moundOpen', 'sealMound'],
    ['torch', 'moundOpen', 'lightMound'],
    ['dryStone', 'moundOpen', null],
    [null, 'moundBurningSealed', 'openMound'],
    ['clay', 'moundBurningSealed', 'openMound'],
    // food plots
    ['tuber', 'plotEmpty', 'plant'],
    ['seeds', 'plotEmpty', 'plant'],
    ['dryStone', 'plotEmpty', null],
    [null, 'plotRipe', 'harvest'],
    ['pot', 'plotGrowing', 'waterPlot'],
    ['diggingStick', 'ground', 'digPlot'],
    ['axe', 'ground', null],
    // tools on what they are for
    ['flake', 'soft', 'cut'],
    ['knife', 'soft', 'cut'],
    ['dryStone', 'soft', null],
    ['axe', 'wood', 'chop'],
    ['flake', 'wood', null],
    ['flint', 'stone', 'knap'],
    ['dryStone', 'stone', null],
  ];
  for (const [held, target, want] of rows) {
    it(`${held ?? 'empty hand'} at ${target} -> ${want ?? 'nothing'}`, () => {
      expect(resolveIntent(held, T[target])).toBe(want);
    });
  }
  it('an empty hand punching or pushing anything harvests, cuts and builds nothing', () => {
    for (const k of Object.keys(T) as Array<keyof typeof T>) {
      const a = resolveIntent(null, T[k]);
      expect(['place', 'feedFire', 'cut', 'chop', 'plant', 'digPlot', 'knap', 'fillPot']).not.toContain(a);
    }
  });
});

describe('Game.intentAt builds the targets from the world', () => {
  const pit = (g: Game) => {
    g.addItem('dryStone', 8);
    const s = g.placeFromBook('firePit', 0, -1).structure!;
    for (let i = 0; i < s.spots.length; i++) {
      const p = spotWorldPosition(s, i);
      g.fillSpot(s.id, i, undefined, { x: p.x, z: p.z });
    }
    const k = spotWorldPosition(s, -1);
    g.placeKey(s.id, k.x, k.z, 1);
    return s;
  };
  it('fuel touching the pit feeds it, and the same fuel far away does nothing', () => {
    const g = new Game();
    const s = pit(g);
    expect(s.complete).toBe(true);
    expect(g.intentAt('twigs', s.x + 0.3, s.z)?.action).toBe('feedFire');
    expect(g.intentAt('twigs', s.x + 3, s.z + 3)).toBeNull();
    expect(g.intentAt('dryStone', s.x, s.z)).toBeNull();
  });
  it('runIntent feeds the fire with the held fuel and uses it up', () => {
    const g = new Game();
    const s = pit(g);
    g.addItem('dryGrass', 2);
    g.takeOut('dryGrass');
    expect(g.runIntent('dryGrass', s.x, s.z + 0.2)).toBe('feedFire');
    expect(g.fire.tinder).toBe(1);
    expect(g.held).toBeNull();
  });
  it('digging happens only on a deliberate set-down, never while carrying the stick', () => {
    const g = new Game();
    g.addItem('diggingStick');
    expect(g.intentAt('diggingStick', 20, 20, 'touch')).toBeNull();
    // (digging itself needs open soil: only the touch rule is checked here)
  });
  it('an unrelated target never fires: a stone near the pit does nothing', () => {
    const g = new Game();
    const s = pit(g);
    g.addItem('dryStone');
    g.takeOut('dryStone');
    expect(g.runIntent('dryStone', s.x, s.z)).toBeNull();
  });
});

describe('intentAt sees marks (a stone on a mark is a placement)', () => {
  it('a stone on, or let go near, a mark resolves to place; the wrong part and a far stone do not', async () => {
    const { openMarks } = await import('../src/game/assist.js');
    const g = new Game();
    g.addItem('dryStone', 3);
    g.placeFromBook('firePit', 0, -1);
    const m = openMarks(g.structures)[0];
    expect(g.intentAt('dryStone', m.x, m.z, 'touch')?.action).toBe('place');
    expect(g.intentAt('dryStone', m.x + 0.8, m.z, 'release')?.action).toBe('place');
    expect(g.intentAt('dryStone', m.x + 0.8, m.z, 'touch')).toBeNull(); // a touch needs to be on it
    expect(g.intentAt('twigs', m.x, m.z, 'release')).toBeNull();
    expect(g.intentAt('dryStone', m.x + 9, m.z, 'release')).toBeNull();
  });
  it('runIntent places it, with auto-refill, through the same path as everything else', async () => {
    const { openMarks } = await import('../src/game/assist.js');
    const g = new Game();
    g.addItem('dryStone', 4);
    const s = g.placeFromBook('firePit', 0, -1).structure!;
    g.player.x = s.x;
    g.player.z = s.z + 1;
    g.takeOut('dryStone');
    const m = openMarks(g.structures)[0];
    expect(g.runIntent('dryStone', m.x, m.z, 'release')).toBe('place');
    expect(g.held).toBe('dryStone'); // the next stone came to the hand
  });
});

describe('every seat path refills the hand', () => {
  it('a direct fillSpot of the held stone (hammered home, ray press) refills too', async () => {
    const { openMarks } = await import('../src/game/assist.js');
    const g = new Game();
    g.addItem('dryStone', 4);
    const s = g.placeFromBook('firePit', 0, -1).structure!;
    g.player.x = s.x;
    g.player.z = s.z + 1;
    g.takeOut('dryStone');
    const m = openMarks(g.structures).find((k) => k.index >= 0)!;
    expect(g.fillSpot(s.id, m.index, undefined, { x: m.x, z: m.z })).toBe(true);
    expect(g.held).toBe('dryStone');
  });
  it('placing the plan keeps the key part for that pinch', () => {
    const g = new Game();
    g.addItem('slab');
    g.takeOut('slab');
    expect(g.placeBlueprint('workbench', 0, -1.6, 0).ok).toBe(true);
    expect(g.held).toBe('slab');
    expect(g.time - g.planPlacedAt).toBeLessThan(1);
  });
});
