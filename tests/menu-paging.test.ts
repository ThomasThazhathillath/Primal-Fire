import { describe, expect, it } from 'vitest';
import { keepsGridOpen, MenuStack, pageLayout } from '../src/game/menu.js';
import { TouchTracker, type TipSample, type TouchIcon } from '../src/game/ui-touch.js';

describe('menu paging', () => {
  it('the page arrows, Menu and the snap turns keep the row open; icons that act fold it', () => {
    for (const id of ['menu', 'turn-left', 'turn-right', 'prev', 'next']) expect(keepsGridOpen(id)).toBe(true);
    for (const id of ['satchel', 'reload', 'exit', 'restart']) expect(keepsGridOpen(id)).toBe(false);
  });

  it('paging with next reaches every icon, including Reload and Exit, and back returns', () => {
    const ids = ['satchel', 'quest', 'hint', 'guide', 'notebook', 'stow', 'drop', 'turn-left', 'turn-right', 'remove', 'reload', 'exit', 'book', 'restart'];
    const seen = new Set<string>();
    let page = 0;
    const grid = new MenuStack();
    grid.gridOpen = true;
    for (let guard = 0; guard < 20; guard++) {
      const pg = pageLayout(ids.length, page, 4);
      ids.slice(pg.start, pg.end).forEach((i) => seen.add(i));
      if (!pg.hasNext) break;
      // Tapping "next": the row stays open and the page advances.
      expect(keepsGridOpen('next')).toBe(true);
      page = pg.page + 1;
      expect(grid.gridVisible).toBe(true);
    }
    expect(seen.has('reload') && seen.has('exit')).toBe(true);
    expect(seen.size).toBe(ids.length);
    expect(pageLayout(ids.length, page, 4).hasPrev).toBe(true);
    expect(pageLayout(ids.length, page - 1, 4).page).toBe(page - 1);
  });

  it('the page is clamped when icons disappear', () => {
    expect(pageLayout(3, 5, 4).page).toBe(0);
    expect(pageLayout(0, 0, 4)).toMatchObject({ pages: 1, hasPrev: false, hasNext: false });
  });
});

describe('pinch and resting-hand guards', () => {
  const icons: TouchIcon[] = [{ x: 0.05, y: 0, r: 0.02, enabled: true }];
  const DT = 1 / 72;
  const poke = (t: TouchTracker, extra: Partial<TipSample>): { hits: number[]; reason: string | null } => {
    const hits: number[] = [];
    let reason: string | null = null;
    for (let z = 0.1; z >= -0.03; z -= 0.4 * DT) {
      hits.push(t.update(DT, icons, { x: 0.05, y: 0, z, dz: -1, tracked: true, ...extra }));
      if (t.reject) reason = t.reject;
    }
    return { hits: hits.filter((h) => h >= 0), reason };
  };
  it('a pinching hand does not activate the icon and says why', () => {
    const r = poke(new TouchTracker(), { pinchDist: 0.012 });
    expect(r.hits).toEqual([]);
    expect(r.reason).toBe('pinching');
  });
  it('a resting hand (not pointing) does not activate the icon and says why', () => {
    const t = new TouchTracker();
    t.requirePoint = true;
    const r = poke(t, { pointing: false });
    expect(r.hits).toEqual([]);
    expect(r.reason).toBe('notPointing');
  });
  it('a pointing, open hand does activate it', () => {
    const t = new TouchTracker();
    t.requirePoint = true;
    expect(poke(t, { pointing: true, pinchDist: 0.1 }).hits).toEqual([0]);
  });
});
