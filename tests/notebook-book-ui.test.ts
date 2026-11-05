import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('notebook and build book UI', () => {
  it('the objective card hides while the notebook is open', () => {
    expect(read('src/systems/objective-card-system.ts')).toMatch(/notebookOpen\?\.\(\)/);
    expect(read('src/systems/hud-system.ts')).toMatch(/ui\.notebookOpen = \(\) => this\.card\.visible/);
  });
  it('the flat notebook is centred (no side offset)', () => {
    expect(read('src/systems/hud-system.ts')).toMatch(/placeInFront\(this\.card, this\.camera, 0\.75, 0, /);
  });
  it('build book row text matches the bag on screen (px * scale)', () => {
    const px = Number(/\.bagtext \{ font-size: (\d+)px/.exec(read('public/ui/buildbook.uikitml'))![1]);
    const scale = Number(/const VR_SCALE = ([0-9.]+)/.exec(read('src/systems/build-book-system.ts'))![1]);
    const bag = Number(/\.bagtext \{ font-size: (\d+)px/.exec(read('public/ui/satchel.uikitml'))![1]) * 0.1;
    expect(px * scale).toBeGreaterThanOrEqual(bag - 1e-9);
  });
});
