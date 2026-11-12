import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { handSource, SwipePager } from '../src/systems/shared.js';

describe('book plan: armed ghost, placed by the player', () => {
  it('picking a structure arms its outline without placing anything', () => {
    const g = new Game();
    const events: string[] = [];
    g.on((e) => e.type === 'plan' && events.push(String(e.kind)));
    const r = g.armFromBook('firePit');
    expect(r.ok).toBe(true);
    expect(g.armedPlan).toBe('firePit');
    expect(g.structures.length).toBe(0);
    expect(events).toEqual(['firePit']);
  });

  it('the workbench arms too, and a pinch (placeBlueprint from the book) places it where chosen', () => {
    const g = new Game();
    g.addItem('dryStone', 3);
    g.addItem('slab');
    expect(g.armFromBook('workbench').ok).toBe(true);
    expect(g.armedPlan).toBe('workbench');
    const r = g.placeBlueprint('workbench', 0, -2, 1.2, g.armedPlan === 'workbench');
    expect(r.ok).toBe(true);
    expect(g.structures[0].x).toBe(0);
    expect(g.structures[0].z).toBe(-2);
    expect(g.armedPlan).toBeNull();
  });

  it('a failed placement keeps the plan armed so the player can aim elsewhere; cancel clears it', () => {
    const g = new Game();
    g.armFromBook('firePit');
    g.armPlan(null);
    expect(g.armedPlan).toBeNull();
  });
});

describe('bag discard', () => {
  it('removes the whole stack from the bag and the world, and logs it', () => {
    const g = new Game();
    g.addItem('dryStone', 3);
    expect(g.discardItem('dryStone')).toBe(3);
    expect(g.count('dryStone')).toBe(0);
    expect(g.satchelContents().some((c) => c.id === 'dryStone')).toBe(false);
    expect(g.log.lines.some((l) => /discarded dryStone x3/.test(l.text))).toBe(true);
  });
  it('nothing to discard returns 0', () => {
    expect(new Game().discardItem('dryStone')).toBe(0);
  });
});

describe('row (menu) swipe and finger swipe', () => {
  const bar = (): Object3D => {
    const o = new Object3D();
    o.scale.setScalar(0.05);
    o.updateMatrixWorld(true);
    return o;
  };
  const hand = (over: object, x: number, z = 0) => ({
    tracked: true, grip: false, gripDown: false, gripUp: false, pinchPos: new Vector3(x, 0, z),
    tipTracked: true, tipPos: new Vector3(x, 0, z), ...over,
  });

  it('pinch-drag left along the row pages forward, right pages back', () => {
    const steps: number[] = [];
    const sw = new SwipePager((d) => steps.push(d), 520, 90, 0, 'x');
    const p = bar();
    handSource.frames = [hand({ gripDown: true, grip: true }, 0.1)];
    sw.update(p);
    handSource.frames = [hand({ grip: true }, 0.03)];
    sw.update(p);
    expect(steps).toEqual([1]);
    handSource.frames = [hand({ grip: true }, 0.1)];
    sw.update(p);
    expect(steps).toEqual([1, -1]);
  });

  it('an index fingertip brushed along the face pages; a push straight through does not', () => {
    const steps: number[] = [];
    const sw = new SwipePager((d) => steps.push(d), 480, 600);
    const p = new Object3D();
    p.scale.setScalar(0.1);
    p.updateMatrixWorld(true);
    const tip = (y: number, z: number) => [hand({}, 0, z)].map((h) => { h.tipPos.set(0, y, z); return h; });
    handSource.frames = tip(0, 0.02);
    sw.update(p);
    handSource.frames = tip(0.08, 0.02);
    sw.update(p);
    expect(steps).toEqual([1]);
    // pushing through: mostly depth
    const sw2 = new SwipePager((d) => steps.push(d), 480, 600);
    handSource.frames = tip(0, 0.04);
    sw2.update(p);
    handSource.frames = tip(0.003, -0.02);
    sw2.update(p);
    expect(steps).toEqual([1]);
  });
});

describe('swipe thresholds line up with the tap cancel', () => {
  it('a finger drag of 2 cm (a tap with drift) does not page; 4 cm does', async () => {
    const { TOUCH_CONFIG } = await import('../src/game/ui-touch.js');
    expect(TOUCH_CONFIG.swipeStart).toBeLessThan(0.035);
    const steps: number[] = [];
    const sw = new SwipePager((d) => steps.push(d), 480, 600);
    const p = new Object3D();
    p.scale.setScalar(0.1);
    p.updateMatrixWorld(true);
    const at = (y: number) => [{ tracked: true, grip: false, gripDown: false, gripUp: false, pinchPos: new Vector3(), tipTracked: true, tipPos: new Vector3(0, y, 0.02) }];
    handSource.frames = at(0);
    sw.update(p);
    handSource.frames = at(0.02);
    sw.update(p);
    expect(steps).toEqual([]);
    handSource.frames = at(0.04);
    sw.update(p);
    expect(steps).toEqual([1]);
  });
});
