import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script
import { THEMED, themeCss, TOKENS, UI_DIR, withTheme } from '../scripts/ui-theme.mjs';

const read = (n: string): string => readFileSync(join(UI_DIR as string, `${n}.uikitml`), 'utf8');

describe('shared UI theme', () => {
  it('every themed panel carries the current theme block (run `npm run theme` after editing src/ui/theme.json)', () => {
    for (const n of THEMED as string[]) expect(withTheme(read(n)), n).toBe(read(n));
  });

  it('panels use theme classes that exist, and no light/dark pairs', () => {
    const css = themeCss() as string;
    const defined = new Set([...css.matchAll(/\.(t-[\w-]+)/g)].map((m) => m[1]));
    for (const n of THEMED as string[]) {
      const text = read(n);
      for (const m of text.matchAll(/\bt-[\w-]+/g)) expect(defined.has(m[0]), `${n}: ${m[0]}`).toBe(true);
      expect(text.includes(':dark'), `${n} has a :dark rule`).toBe(false);
    }
  });

  it('has one corner radius per kind and one type scale, with readable sizes for VR', () => {
    const t = TOKENS as { radius: Record<string, number>; font: Record<string, number> };
    expect(Object.keys(t.radius)).toEqual(['panel', 'control']);
    for (const k of ['title', 'name', 'lead', 'body', 'muted'] as const) expect(t.font[k]).toBeGreaterThanOrEqual(18);
    expect(t.font.title).toBeGreaterThan(t.font.name);
    expect(t.font.name).toBeGreaterThan(t.font.body);
  });
});
