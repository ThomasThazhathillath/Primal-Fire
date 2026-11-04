import { describe, expect, it } from 'vitest';
import { BLUEPRINTS } from '../src/game/blueprint.js';
import { HINT_INFO, hintInfo, hintView, type HintPiece } from '../src/game/hint-info.js';
import { ITEMS, type ItemId } from '../src/game/items.js';
import { Game } from '../src/game/game.js';
import { OBJECTIVES } from '../src/game/objectives.js';
import { LOOK_MATERIAL } from '../src/game/interact.js';
import { RESOURCES } from '../src/game/world-layout.js';

const pieces = (): HintPiece[] => Object.values(HINT_INFO).flatMap((i) => i.views.flatMap((v) => v.pieces));

describe('hint info', () => {
  it('every beginner objective has a name, advice and at least one picture', () => {
    for (const o of OBJECTIVES) {
      if (o.id === 'science') continue; // a place, not an object
      const i = hintInfo(o.id);
      expect(i, o.id).toBeDefined();
      expect(i!.name.length).toBeGreaterThan(2);
      for (const k of ['look', 'why', 'avoid'] as const) expect(i![k].length, `${o.id}.${k}`).toBeGreaterThan(8);
      expect(i!.views.length).toBeGreaterThan(0);
    }
  });

  it('every picture shows real items and real scenery looks (no invented ids)', () => {
    for (const p of pieces()) {
      if (p.kind === 'item') expect(ITEMS[p.id as ItemId], p.id).toBeDefined();
      if (p.kind === 'look') expect(LOOK_MATERIAL[p.id] ?? RESOURCES.some((r) => r.look === p.id), p.id).toBeTruthy();
    }
  });

  it('the picture asked for a level exists: level 1 first, deeper levels the closer or second one', () => {
    expect(hintView('flatStone', 1)?.pieces[0]).toMatchObject({ id: 'slab' });
    expect(hintView('flatStone', 2)?.focusFirst).toBe(true);
    expect(hintView('nope', 1)).toBeNull();
  });

  it('the flat stone really is the workbench top and nothing else is offered as one', () => {
    expect(BLUEPRINTS.workbench.keyAccepts).toContain('slab');
    expect(ITEMS.slab.weight).toBeGreaterThan(ITEMS.dryStone.weight * 3);
    expect(hintInfo('flatStone')!.avoid.toLowerCase()).toContain('small');
  });

  it('the workbench picture is three supports and the slab, as the blueprint says', () => {
    const v = hintView('workbench', 1)!;
    expect(v.pieces.filter((p) => p.kind === 'item' && p.id === 'dryStone').length).toBe(BLUEPRINTS.workbench.spots.length);
    expect(v.pieces.some((p) => p.kind === 'item' && p.id === 'slab')).toBe(true);
    for (const p of v.pieces) if (p.kind === 'item' && p.id === 'dryStone') expect(BLUEPRINTS.workbench.spots[0].accepts).toContain(p.id);
  });

  it('dry grass is shown against green, and bark only as tinder (it is tinder in the item data)', () => {
    const v = hintView('tinder', 1)!;
    expect(v.pieces.some((p) => p.kind === 'item' && p.id === 'dryGrass')).toBe(true);
    expect(v.pieces.some((p) => p.kind === 'look' && p.tint !== undefined)).toBe(true);
    expect(ITEMS.bark.cats).toContain('tinder');
  });

  it('the shelter lists what the blueprint accepts', () => {
    const accepted = new Set<string>([...BLUEPRINTS.shelter.keyAccepts, ...BLUEPRINTS.shelter.spots.flatMap((s) => s.accepts)]);
    for (const p of hintView('shelter', 1)!.pieces) if (p.kind === 'item') expect(accepted.has(p.id), p.id).toBe(true);
  });

  it('every hint ref and level text exists and levels are four steps', () => {
    for (const o of OBJECTIVES) {
      expect(o.hint.levels.length).toBe(4);
      if (o.hint.ref) expect(ITEMS[o.hint.ref]).toBeDefined();
    }
  });
});

describe('hint levels persist', () => {
  it('unlocking goes one level at a time, never past four, and survives a save', () => {
    const g = new Game();
    expect(g.objectives.hintLevel('flatStone')).toBe(0);
    expect(g.objectives.unlockHint('flatStone')).toBe(1);
    expect(g.objectives.unlockHint('flatStone')).toBe(2);
    for (let i = 0; i < 6; i++) g.objectives.unlockHint('flatStone');
    expect(g.objectives.hintLevel('flatStone')).toBe(4);
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.objectives.hintLevel('flatStone')).toBe(4);
    expect(back.objectives.hintLevel('firstStone')).toBe(0);
  });
});
