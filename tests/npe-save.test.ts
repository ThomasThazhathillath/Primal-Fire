// NPE milestone F: the save format is unchanged and old saves load; help state is per session, never saved.
import { describe, expect, it } from 'vitest';
import { Game, type SaveData } from '../src/game/game.js';

describe('save compatibility', () => {
  it('a game with struggles in progress saves without any new field, and restores', () => {
    const g = new Game();
    g.gather('dryStone');
    g.struggle.fail('fail:grab.tooHeavy');
    g.struggle.grow('idle', 'idle', 30);
    const snap = JSON.parse(JSON.stringify(g.snapshot())) as Record<string, unknown>;
    expect(Object.keys(snap)).not.toContain('struggle');
    expect(Object.keys(snap)).not.toContain('settings');
    const g2 = Game.restore(snap as unknown as SaveData);
    expect(g2.gatheredCount('dryStone')).toBe(1);
    expect(g2.struggle.level('idle')).toBe(0);
  });

  it('a save from before this work (no objectives, no assist, no story) still loads and shows a next action', () => {
    const old = { v: 1, time: 50, xp: 0, level: 1, questIndex: 0, satchel: { dryStone: 1 }, gathered: { dryStone: 1 }, notebook: [], structures: [], discovered: [], flags: [], player: { x: 1, z: 2 } } as unknown as SaveData;
    const g = Game.restore(old);
    expect(g.count('dryStone')).toBe(1);
    const v = g.objectives.view();
    expect(v).not.toBeNull();
    expect(v!.instruction.length).toBeGreaterThan(0);
  });
});
