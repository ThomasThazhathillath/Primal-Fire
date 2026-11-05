import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sys = readFileSync('src/systems/objective-card-system.ts', 'utf8');
const ui = readFileSync('public/ui/objective.uikitml', 'utf8');

describe('objective card layout', () => {
  it('the card is sized to fit its rows (CARD_H is the tallest it ever gets, with the how-to open)', () => {
    const h = Number(/const CARD_H = (\d+)/.exec(sys)![1]);
    expect(Number(/\.root \{[^}]*height: (\d+)px/.exec(ui)![1])).toBe(h);
    // The how-to, the failure line and the substeps fold away to height 0 until needed; rows never use display:none.
    expect(h).toBeGreaterThanOrEqual(300);
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
    expect(sys).toMatch(/this\.doc\.visible = (show|true|false)/);
  });
});
