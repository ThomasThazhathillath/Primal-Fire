import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sys = readFileSync('src/systems/objective-card-system.ts', 'utf8');
const ui = readFileSync('public/ui/objective.uikitml', 'utf8');

describe('objective card layout', () => {
  it('panel height matches CARD_H so substeps, failure and tip rows are not clipped', () => {
    const h = Number(/const CARD_H = (\d+)/.exec(sys)![1]);
    expect(Number(/\.root \{[^}]*height: (\d+)px/.exec(ui)![1])).toBe(h);
    // header + instruction(2 lines) + progress + substeps + one explanation line (2 lines) + gaps/padding
    expect(h).toBeGreaterThanOrEqual(250);
  });
  it('toggled text rows never start as blank text and are never display-toggled (both left them zero-size/undrawn)', () => {
    for (const id of ['obj-subs', 'obj-note', 'obj-bad']) {
      const m = new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(ui)!;
      expect(m[1].trim().length).toBeGreaterThan(0);
      expect(sys).not.toContain(`show('${id}'`);
    }
  });
  it('hides the UIKit document too when the card closes (ScreenSpace reparents it)', () => {
    expect(sys).toMatch(/findUIKitDocument\(panel\)/);
    expect(sys).toMatch(/this\.doc\.visible = show/);
  });
});
