// NPE milestone E: assistance modes and accessibility options. Persisted, applied at once, never rule changes.
import { describe, expect, it } from 'vitest';
import { defaultSettings, loadSettings, saveSettings, SETTINGS_KEY, type Settings, tuning } from '../src/game/settings.js';
import { SURVIVAL_SAVE_KEY, type KeyStore } from '../src/game/tutorial-mode.js';

function store(): KeyStore & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('assistance modes', () => {
  it('a first-time player starts Guided; an existing game starts Standard', () => {
    expect(defaultSettings(true).mode).toBe('guided');
    expect(defaultSettings(false).mode).toBe('standard');
  });

  it('Guided helps sooner and forgives more than Standard; Explorer less', () => {
    const g = tuning({ ...defaultSettings(true), mode: 'guided' });
    const s = tuning({ ...defaultSettings(true), mode: 'standard' });
    const e = tuning({ ...defaultSettings(true), mode: 'explorer' });
    expect(g.helpDelay).toBeLessThan(s.helpDelay);
    expect(e.helpDelay).toBeGreaterThan(s.helpDelay);
    expect(g.forgiveAfter).toBeLessThan(s.forgiveAfter);
    expect(e.forgiveAfter).toBeGreaterThan(s.forgiveAfter);
    expect(g.arrowLevel).toBeLessThan(s.arrowLevel);
    expect(g.sensitivity).toBeGreaterThan(s.sensitivity);
    expect(e.compass).toBe(false);
    expect(s.compass).toBe(true);
    // Every mode still needs the real actions: no mode makes help instant or turns failures off.
    for (const t of [g, s, e]) {
      expect(t.helpDelay).toBeGreaterThan(0);
      expect(t.forgiveAfter).toBeGreaterThanOrEqual(2);
    }
  });

  it('accessibility options change only what they say', () => {
    const base = defaultSettings(false);
    expect(tuning({ ...base, textSize: 'large' }).textScale).toBeGreaterThan(1);
    expect(tuning({ ...base, textSize: 'small' }).textScale).toBeLessThan(1);
    expect(tuning({ ...base, hints: 'high' }).helpDelay).toBeLessThan(tuning(base).helpDelay);
    expect(tuning({ ...base, hints: 'low' }).helpDelay).toBeGreaterThan(tuning(base).helpDelay);
    expect(tuning({ ...base, sensitivity: 'high' }).sensitivity).toBeGreaterThan(1);
    expect(tuning({ ...base, seated: true }).reach).toBeGreaterThan(1);
    expect(tuning({ ...base, guidance: 'minimal' }).highlightBudget).toBeLessThan(tuning(base).highlightBudget);
    expect(tuning({ ...base, mode: 'explorer', guidance: 'full' }).compass).toBe(true);
  });
});

describe('settings persistence', () => {
  it('saved and reloaded exactly, under their own key (never inside the game save)', () => {
    const s = store();
    const want: Settings = { v: 1, mode: 'explorer', textSize: 'large', hints: 'low', guidance: 'full', sensitivity: 'high', seated: true };
    saveSettings(s, want);
    expect(loadSettings(s, true)).toEqual(want);
    expect([...s.m.keys()]).toEqual([SETTINGS_KEY]);
    expect(s.m.has(SURVIVAL_SAVE_KEY)).toBe(false);
  });

  it('a missing, broken or partly unknown value falls back to the default', () => {
    const s = store();
    expect(loadSettings(s, true)).toEqual(defaultSettings(true));
    s.setItem(SETTINGS_KEY, '{not json');
    expect(loadSettings(s, false)).toEqual(defaultSettings(false));
    s.setItem(SETTINGS_KEY, JSON.stringify({ mode: 'turbo', textSize: 'large', seated: 'yes' }));
    expect(loadSettings(s, false)).toEqual({ ...defaultSettings(false), textSize: 'large' });
  });
});
