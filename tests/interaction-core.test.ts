// Curriculum Phase 1, C12: the interaction core keeps its promises.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { springStep } from '../src/game/carry.js';
import { Game, type SaveData } from '../src/game/game.js';

const src = (f: string) => readFileSync(`src/systems/${f}`, 'utf8');

describe('pause freezes hand interactions', () => {
  it('every system that turns hand motion into world changes stops while paused', () => {
    for (const f of ['interaction-system.ts', 'craft-gesture-system.ts', 'lash-system.ts', 'bench-system.ts', 'fire-system.ts', 'fishing-system.ts']) {
      expect(src(f), f).toMatch(/interactionsPaused\(this\.world\)/);
    }
  });
});

describe('one pinch does one thing', () => {
  it('building and the bow ignore a pinch a UI tap, grab or mark already used', () => {
    expect(src('build-system.ts')).toMatch(/if \(pinchTaken\(this\.world, handedness === 'left' \? 0 : 1\)\) return;/);
    expect(src('bow-system.ts')).toMatch(/!pinchTaken\(this\.world, 0\)/);
  });
});

describe('haptics follow the hand that holds the tool', () => {
  it('tool blows and log drags buzz handClaims.holdHand, not a fixed hand', () => {
    const s = src('interaction-system.ts');
    expect(s).not.toMatch(/pulse\(this\.session, 1, 0\.2 \+ r\.jolt/);
    expect(s.match(/pulse\(this\.session, handClaims\.holdHand/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src('hand-input-system.ts')).toMatch(/export \{ pulse \} from '\.\/haptics\.js'/);
  });
});

describe('objects stay where you leave them', () => {
  it('a dropped item keeps which way it came to rest', () => {
    const g = new Game();
    g.addItem('logs');
    g.takeOut('logs');
    const d = g.dropItem('logs', 2, 3)!;
    d.ry = 1.25;
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())) as SaveData);
    expect(back.drops.find((x) => x.id === d.id)?.ry).toBeCloseTo(1.25);
  });

  it('a dragged log keeps its new place across a reload', () => {
    const g = new Game();
    g.moveSpot('log_7', 4.5, -2, 0.8);
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())) as SaveData);
    expect(back.movedSpots.get('log_7')).toEqual({ x: 4.5, z: -2, ry: 0.8 });
  });
});

describe('no per-frame allocation in the carry spring', () => {
  it('still settles on the target', () => {
    const pos = { x: 0, y: 0, z: 0 };
    const vel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 400; i++) springStep(pos, vel, { x: 1, y: 2, z: 3 }, 200, 1 / 90);
    expect(pos.x).toBeCloseTo(1, 2);
    expect(pos.y).toBeCloseTo(2, 2);
    expect(pos.z).toBeCloseTo(3, 2);
    expect(readFileSync('src/game/carry.ts', 'utf8')).not.toMatch(/for \(const k of \['x', 'y', 'z'\]/);
  });
});
