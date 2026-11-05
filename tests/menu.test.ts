import { describe, expect, it } from 'vitest';
import { MenuStack, RejectLog, rejectLine } from '../src/game/menu.js';
import { fitTarget, TOUCH_CONFIG, TouchTracker, type TipSample, type TouchIcon } from '../src/game/ui-touch.js';

describe('menu stack', () => {
  it('only one panel is open: opening a second closes the first', () => {
    const m = new MenuStack();
    const log: string[] = [];
    m.register('bag', () => log.push('bag closed'));
    m.register('book', () => log.push('book closed'));
    m.open('bag');
    m.open('book');
    expect(log).toEqual(['bag closed']);
    expect(m.current).toBe('book');
  });
  it('the grid folds while a panel is open and Back returns to it', () => {
    const m = new MenuStack();
    m.register('bag', () => undefined);
    m.toggleGrid();
    expect(m.gridVisible).toBe(true);
    m.open('bag');
    expect(m.gridVisible).toBe(false);
    m.back();
    expect(m.current).toBeNull();
    expect(m.gridVisible).toBe(true);
  });
  it('a panel that closes itself leaves the grid folded', () => {
    const m = new MenuStack();
    m.open('hint');
    m.closed('hint');
    expect(m.current).toBeNull();
    expect(m.gridVisible).toBe(false);
  });
  it('the Menu button goes back from a panel, and folds or unfolds the grid otherwise', () => {
    const m = new MenuStack();
    m.register('bag', () => undefined);
    m.toggleGrid();
    m.toggleGrid();
    expect(m.gridOpen).toBe(false);
    m.open('bag');
    m.toggleGrid();
    expect(m.current).toBeNull();
    expect(m.gridOpen).toBe(true);
  });
});

describe('reject log', () => {
  it('repeats of the same refusal are throttled, different ones are not', () => {
    const l = new RejectLog(1000);
    expect(l.shouldLog('a:slide', 0)).toBe(true);
    expect(l.shouldLog('a:slide', 500)).toBe(false);
    expect(l.shouldLog('a:tooSlow', 500)).toBe(true);
    expect(l.shouldLog('a:slide', 1500)).toBe(true);
  });
  it('writes one readable line', () => {
    expect(rejectLine('bag', 'item-2', 'tooSlow', 1)).toBe('tap rejected: tooSlow on bag/item-2 (right hand)');
  });
});

describe('tap targets', () => {
  it('are never smaller than 4.5 cm', () => {
    const small = fitTarget({ x: 0, y: 0, r: 0.01, enabled: true });
    expect(small.r * 2).toBeGreaterThanOrEqual(TOUCH_CONFIG.minTarget);
    const row = fitTarget({ x: 0, y: 0, r: 0.01, hw: 0.2, hh: 0.01, enabled: true });
    expect(row.hw).toBe(0.2);
    expect(row.hh! * 2).toBeGreaterThanOrEqual(TOUCH_CONFIG.minTarget);
  });
});

describe('rectangular rows and reasons', () => {
  const DT = 1 / 72;
  const rows: TouchIcon[] = [
    { x: 0, y: 0.03, r: 0.02, hw: 0.15, hh: 0.025, enabled: true },
    { x: 0, y: -0.03, r: 0.02, hw: 0.15, hh: 0.025, enabled: true },
  ];
  const poke = (t: TouchTracker, x: number, y: number, speed: number, over: Partial<TipSample> = {}) => {
    let hit = -1;
    let reason: string | null = null;
    for (let z = 0.1; z >= -0.03; z -= speed * DT) {
      const h = t.update(DT, rows, { x, y, z, dz: -1, tracked: true, ...over });
      if (h >= 0) hit = h;
      if (t.reject) reason = t.reject;
    }
    return { hit, reason };
  };
  it('a poke anywhere along a wide row hits that row', () => {
    expect(poke(new TouchTracker(), 0.12, 0.03, 0.4).hit).toBe(0);
    expect(poke(new TouchTracker(), -0.12, -0.03, 0.4).hit).toBe(1);
  });
  it('a too-slow poke says tooSlow', () => {
    const r = poke(new TouchTracker(), 0, 0.03, 0.09);
    expect(r.hit).toBe(-1);
    expect(r.reason).toBe('tooSlow');
  });
  it('a pinching hand says pinching and never taps', () => {
    const r = poke(new TouchTracker(), 0, 0.03, 0.4, { pinchDist: 0.01 });
    expect(r.hit).toBe(-1);
    expect(r.reason).toBe('pinching');
  });
  it('a hand that is not pointing is refused, unless this panel does not ask for pointing', () => {
    const strict = poke(new TouchTracker(), 0, 0.03, 0.4, { pointing: false });
    expect(strict.hit).toBe(-1);
    expect(strict.reason).toBe('notPointing');
    const open = new TouchTracker();
    open.requirePoint = false;
    expect(poke(open, 0, 0.03, 0.4, { pointing: false }).hit).toBe(0);
  });
  it('crossing beside a target says miss', () => {
    const r = poke(new TouchTracker(), 0.22, 0.03, 0.4);
    expect(r.hit).toBe(-1);
    expect(r.reason).toBe('miss');
  });
  it('a pinch still never taps even without the pointing rule', () => {
    const open = new TouchTracker();
    open.requirePoint = false;
    expect(poke(open, 0, 0.03, 0.4, { pinchDist: 0.01, pointing: false }).hit).toBe(-1);
  });
});
