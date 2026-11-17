// Left / Right turn buttons: a short eased pan, not an instant jump of the whole view.
import { describe, expect, it } from 'vitest';
import { SmoothTurn, TURN_SECONDS } from '../src/game/smooth-turn.js';

const RAD45 = Math.PI / 4;

/** Run the turn at 72 fps until it stops; returns every frame's step. */
function run(turn: SmoothTurn, dt = 1 / 72): number[] {
  const steps: number[] = [];
  for (let i = 0; i < 1000 && turn.active; i++) steps.push(turn.step(dt));
  return steps;
}

describe('SmoothTurn', () => {
  it('turns exactly 45 degrees, spread over about a third of a second, not in one frame', () => {
    const t = new SmoothTurn();
    t.start(RAD45);
    const steps = run(t);
    expect(steps.reduce((a, b) => a + b, 0)).toBeCloseTo(RAD45, 10);
    expect(steps.length).toBe(Math.ceil(TURN_SECONDS * 72));
    // No single frame carries more than a small share of the turn.
    expect(Math.max(...steps)).toBeLessThan(RAD45 * 0.1);
    expect(t.active).toBe(false);
  });

  it('eases in and out: slow at both ends, fastest in the middle, never backwards', () => {
    const t = new SmoothTurn();
    t.start(-RAD45);
    const steps = run(t).map((s) => -s);
    expect(steps.every((s) => s >= 0)).toBe(true);
    const mid = steps[Math.floor(steps.length / 2)];
    expect(steps[0]).toBeLessThan(mid / 3);
    expect(steps[steps.length - 1]).toBeLessThan(mid / 3);
  });

  it('pressing again mid-turn joins the rest of the turn to the new one', () => {
    const t = new SmoothTurn();
    t.start(RAD45);
    let turned = 0;
    for (let i = 0; i < 8; i++) turned += t.step(1 / 72);
    t.start(RAD45);
    turned += run(t).reduce((a, b) => a + b, 0);
    expect(turned).toBeCloseTo(2 * RAD45, 10);
  });

  it('left then right before it finishes ends where it started', () => {
    const t = new SmoothTurn();
    t.start(RAD45);
    let turned = t.step(1 / 72) + t.step(1 / 72);
    t.start(-RAD45);
    turned += run(t).reduce((a, b) => a + b, 0);
    expect(turned).toBeCloseTo(0, 10);
  });

  it('a long frame (a hitch) finishes the turn without overshooting; idle steps are zero', () => {
    const t = new SmoothTurn();
    expect(t.step(1 / 72)).toBe(0);
    t.start(RAD45);
    expect(t.step(2)).toBeCloseTo(RAD45, 10);
    expect(t.active).toBe(false);
    expect(t.step(1 / 72)).toBe(0);
  });
});
