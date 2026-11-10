import { describe, expect, it } from 'vitest';
import { FRAME_BUDGET_90, PerfStats, pickFrameRate } from '../src/game/perf-stats.js';

describe('perf stats', () => {
  it('averages, counts spikes and percentiles', () => {
    const s = new PerfStats(10);
    for (let i = 0; i < 9; i++) s.push(10, 5);
    s.push(40, 20);
    expect(s.frameMs()).toBeCloseTo(13);
    expect(s.cpuMs()).toBeCloseTo(6.5);
    expect(s.spikes).toBe(1);
    expect(s.worst).toBe(40);
    expect(s.percentile(0.5)).toBe(10);
    expect(s.percentile(0.99)).toBe(40);
    expect(s.withinBudget()).toBeCloseTo(0.9);
    expect(s.fps(9)).toBeCloseTo(1000 / ((8 * 10 + 40) / 9));
  });

  it('wraps around without growing', () => {
    const s = new PerfStats(4);
    for (let i = 0; i < 100; i++) s.push(FRAME_BUDGET_90, 3);
    expect(s.count).toBe(4);
    expect(s.fps()).toBeCloseTo(90);
  });
});

describe('frame rate request', () => {
  it('asks for 90 only where the runtime offers it', () => {
    expect(pickFrameRate([72, 90, 120])).toBe(90);
    expect(pickFrameRate(new Float32Array([72, 80]))).toBeNull();
    expect(pickFrameRate(undefined)).toBeNull();
    expect(pickFrameRate([])).toBeNull();
  });
});
