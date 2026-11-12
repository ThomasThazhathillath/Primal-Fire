import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { handSource, SwipePager } from '../src/systems/shared.js';

/** A card like the bag: 480 x 600 units at scale 0.1, centred at the origin facing +z. */
const card = (): Object3D => {
  const o = new Object3D();
  o.scale.setScalar(0.1);
  o.updateMatrixWorld(true);
  return o;
};
const frame = (over: Partial<{ tracked: boolean; grip: boolean; gripDown: boolean; gripUp: boolean }>, y: number, z = 0, x = 0) => ({
  tracked: true,
  grip: false,
  gripDown: false,
  gripUp: false,
  pinchPos: new Vector3(x, y, z),
  ...over,
});

describe('pinch-drag paging on a long card', () => {
  it('dragging the card up shows later rows (hand moves up -> next), down shows earlier', () => {
    const steps: number[] = [];
    const sw = new SwipePager((d) => steps.push(d), 480, 600);
    const p = card();
    handSource.frames = [frame({}, 0), frame({ gripDown: true, grip: true }, 0)];
    sw.update(p);
    handSource.frames = [frame({}, 0), frame({ grip: true }, 0.08)];
    sw.update(p);
    expect(steps).toEqual([1]);
    handSource.frames = [frame({}, 0), frame({ grip: true }, 0.0)];
    sw.update(p);
    expect(steps).toEqual([1, -1]);
  });

  it('a pinch on the header strip (the move handle) or off the card does not page', () => {
    const steps: number[] = [];
    const sw = new SwipePager((d) => steps.push(d), 480, 600);
    const p = card();
    // Header: the top 0.9 units of 3.0 half height -> y above 2.1 local = 0.21 m.
    handSource.frames = [frame({ gripDown: true, grip: true }, 0.27)];
    sw.update(p);
    handSource.frames = [frame({ grip: true }, 0.4)];
    sw.update(p);
    handSource.frames = [frame({ gripDown: true, grip: true }, 0, 0, 0.5)]; // off to the side
    sw.update(p);
    handSource.frames = [frame({ grip: true }, 0.2, 0, 0.5)];
    sw.update(p);
    expect(steps).toEqual([]);
  });

  it('a small wobble does not page; letting go ends the drag', () => {
    const steps: number[] = [];
    const sw = new SwipePager((d) => steps.push(d), 480, 600);
    const p = card();
    handSource.frames = [frame({ gripDown: true, grip: true }, 0)];
    sw.update(p);
    handSource.frames = [frame({ grip: true }, 0.03)];
    sw.update(p);
    handSource.frames = [frame({ gripUp: true }, 0.03)];
    sw.update(p);
    handSource.frames = [frame({ grip: true }, 0.5)]; // a new pinch must start with gripDown
    sw.update(p);
    expect(steps).toEqual([]);
  });
});

describe('lesson card text size', () => {
  it('task lines are larger on screen than the objective card body (font px x panel scale)', async () => {
    const { readFileSync } = await import('node:fs');
    const px = Number(/\.task \{[^}]*font-size: (\d+)px/.exec(readFileSync('public/ui/tutorial.uikitml', 'utf8'))![1]);
    const lesson = px * Number(/const PANEL_SCALE = ([0-9.]+)/.exec(readFileSync('src/systems/tutorial-system.ts', 'utf8'))![1]);
    const objective = 21 * Number(/const PANEL_SCALE = ([0-9.]+)/.exec(readFileSync('src/systems/objective-card-system.ts', 'utf8'))![1]);
    expect(lesson).toBeGreaterThanOrEqual(objective * 1.2);
  });
});
