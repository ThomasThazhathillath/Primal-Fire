// NPE milestone C: progressive contextual assistance (cue -> instruction -> explicit, cleared on success).
import { afterEach, describe, expect, it } from 'vitest';
import { failHelp, STRUGGLE, StruggleTracker } from '../src/game/adaptive.js';
import { BENCH_ASSIST, BENCH_RECIPES, BenchSession } from '../src/game/bench.js';

afterEach(() => {
  STRUGGLE.delay = 1;
});

describe('struggle tracker', () => {
  it('a repeated failure escalates cue, instruction, explicit, each offered once', () => {
    const s = new StruggleTracker();
    const levels: number[] = [];
    for (let i = 0; i < 6; i++) {
      s.fail('fail:bench.wrongMotion');
      const h = s.due();
      if (h) levels.push(h.level);
    }
    expect(levels).toEqual([1, 2, 3]);
    expect(s.due()).toBeNull();
  });

  it('time-based struggles wait for their delay; success removes the help', () => {
    const s = new StruggleTracker();
    s.grow('look:r:stone-1', 'look', STRUGGLE.look[0] - 0.5);
    expect(s.due()).toBeNull();
    s.grow('look:r:stone-1', 'look', 1);
    expect(s.due()?.level).toBe(1);
    s.succeed('look');
    expect(s.level('look:r:stone-1')).toBe(0);
    expect(s.due()).toBeNull();
  });

  it('the hint-frequency setting scales every delay; Infinity turns automatic help off', () => {
    const s = new StruggleTracker();
    STRUGGLE.delay = 2;
    s.grow('idle', 'idle', STRUGGLE.idle[0] * 1.5);
    expect(s.level('idle')).toBe(0);
    STRUGGLE.delay = 0.5;
    expect(s.level('idle')).toBe(2);
    STRUGGLE.delay = Infinity;
    s.fail('fail:x');
    s.fail('fail:x');
    s.fail('fail:x');
    expect(s.due()).toBeNull();
  });

  it('the highest due level wins when several struggles are due at once', () => {
    const s = new StruggleTracker();
    s.grow('idle', 'idle', STRUGGLE.idle[0]);
    for (let i = 0; i < STRUGGLE.fail[2]; i++) s.fail('fail:grab.tooHeavy');
    expect(s.due()).toMatchObject({ key: 'fail:grab.tooHeavy', level: 3 });
    expect(s.due()).toMatchObject({ key: 'idle', level: 1 });
  });

  it('says what the step needs without doing it', () => {
    expect(failHelp('bench.wrongMotion', 'this step needs: saw', 2)).toMatch(/saw/i);
    expect(failHelp('grab.tooHeavy', undefined, 3)).toMatch(/both hands/i);
    expect(failHelp('knap.offEdge', undefined, 2)).toMatch(/edge/i);
  });
});

describe('category C tolerance at the bench', () => {
  it('after a few wrong-motion refusals a near miss still moves the step on, slowly; the right motion is still best', () => {
    const r = BENCH_RECIPES.find((x) => x.steps.some((st) => st.motion === 'saw'))!;
    const b = new BenchSession(r, 1);
    while (b.step && b.step.motion !== 'saw') b.work(b.step.motion, 1e6);
    expect(b.step?.motion).toBe('saw');
    let refusals = 0;
    for (let i = 0; i < 200 && refusals < BENCH_ASSIST.forgiveAfter; i++) if (b.work('press', 0.1) === 'wrong') refusals++;
    expect(refusals).toBe(BENCH_ASSIST.forgiveAfter);
    const before = b.progress;
    b.work('press', 0.1);
    expect(b.progress).toBeGreaterThan(before);
    expect(b.progress).toBeLessThan(0.5); // never instant
  });
});
