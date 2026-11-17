// The Quest froze (fps=0) in the tutorial right after the third bench support went in: pointing the hand ray at the
// slab's glowing mark (index -1) made the HUD read BLUEPRINTS.workbench.spots[-1].label, and a throw inside a
// system's update stops the frame loop for good. markDef resolves every mark index; guardSystems keeps one failing
// system from freezing the rest.
import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, markDef, spotWorldPosition, type StructureKind } from '../src/game/blueprint.js';
import { guardSystems } from '../src/system-guard.js';

describe('markDef: every glowing mark resolves', () => {
  it('the workbench top (index -1) is the slab, laid on from the bag', () => {
    const top = markDef('workbench', -1);
    expect(top).not.toBeNull();
    expect(top!.label).toBe('Top');
    expect(top!.accepts).toEqual(BLUEPRINTS.workbench.keyAccepts);
    // Same object every time: the HUD asks every frame while you point at it.
    expect(markDef('workbench', -1)).toBe(top);
  });

  it('every spot index of every blueprint is its spot; an index past the end is null, not a throw', () => {
    for (const kind of Object.keys(BLUEPRINTS) as StructureKind[]) {
      const def = BLUEPRINTS[kind];
      def.spots.forEach((sp, i) => expect(markDef(kind, i)).toBe(sp));
      expect(markDef(kind, def.spots.length)).toBeNull();
      expect(markDef(kind, -1)).not.toBeNull();
    }
  });

  it('the slab mark has a place in the world (the HUD and highlight put their label there)', () => {
    const p = spotWorldPosition({ kind: 'workbench', x: 1, z: -3, rotY: 0.4 }, -1);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
  });
});

describe('guardSystems: one failing system never stops the frame', () => {
  class Counter {
    frames = 0;
    update(): void {
      this.frames++;
    }
  }
  class Broken {
    update(): void {
      throw new TypeError("Cannot read properties of undefined (reading 'label')");
    }
  }

  it('a throw is reported once and the systems after it still update every frame', () => {
    const before = new Counter();
    const broken = new Broken();
    const after = new Counter();
    const reports: string[] = [];
    guardSystems([before, broken, after], (msg) => reports.push(msg));
    for (let f = 0; f < 90; f++) for (const s of [before, broken, after]) s.update(1 / 72, f / 72);
    expect(before.frames).toBe(90);
    expect(after.frames).toBe(90);
    expect(reports).toEqual(["Broken: Cannot read properties of undefined (reading 'label')"]);
  });

  it('passes delta and time through with the system as `this`', () => {
    const seen: number[] = [];
    const sys = {
      scale: 2,
      update(delta: number, time: number) {
        seen.push(delta * this.scale, time);
      },
    };
    guardSystems([sys], () => undefined);
    sys.update(0.5, 3);
    expect(seen).toEqual([1, 3]);
  });

  it('a new error from the same system is reported too, and non-Error throws are named', () => {
    let n = 0;
    const sys = {
      update() {
        n++;
        if (n === 1) throw new Error('first');
        if (n === 2) throw 'second';
      },
    };
    const reports: string[] = [];
    guardSystems([sys], (msg) => reports.push(msg));
    sys.update(0, 0);
    sys.update(0, 0);
    sys.update(0, 0);
    expect(reports).toEqual(['Object: first', 'Object: second']);
  });
});
