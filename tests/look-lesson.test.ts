import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { gazeStats } from '../src/game/gaze.js';
import { LESSONS } from '../src/game/tutorial-lessons.js';

describe('LOOK AND PINCH lesson task 3', () => {
  it('counts a part seated by a release over the outline, not only a gaze placement', () => {
    const g = new Game();
    const look = LESSONS.find((l) => l.id === 'look')!;
    look.setup?.(g);
    const pit = g.structures.find((s) => s.kind === 'firePit')!;
    const task = look.tasks[2];
    expect(gazeStats.placed).toBe(0);
    expect(task.done({} as never, g)).toBe(false);
    // A quick pinch picks the stone and lets it go over the mark: the release path seats it.
    g.takeOut('dryStone');
    const ok = g.fillSpot(pit.id, 0, 'dryStone');
    expect(ok).toBe(true);
    expect(gazeStats.placed).toBe(0);
    expect(task.done({} as never, g)).toBe(true);
  });
});
