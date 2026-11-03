import { describe, expect, it } from 'vitest';
import { handSqueeze, nearestCandidate, PINCH_CONFIG, PinchDetector, releaseKind, restHeight } from '../src/game/pinch.js';

describe('pinch hysteresis', () => {
  it('starts below the start threshold and ends only above the release threshold', () => {
    const p = new PinchDetector();
    p.update(0.05, true);
    expect(p.pinch).toBe(false);
    p.update(PINCH_CONFIG.start - 0.002, true);
    expect(p.pinch && p.down).toBe(true);
    // In the dead band between the thresholds: still pinching, no events.
    p.update((PINCH_CONFIG.start + PINCH_CONFIG.release) / 2, true);
    expect(p.pinch).toBe(true);
    expect(p.down || p.up).toBe(false);
    p.update(PINCH_CONFIG.release + 0.002, true);
    expect(!p.pinch && p.up).toBe(true);
  });

  it('jitter around one threshold does not flicker', () => {
    const p = new PinchDetector();
    let changes = 0;
    let was = false;
    for (let i = 0; i < 100; i++) {
      p.update(0.03 + (i % 2 ? 0.004 : -0.004), true); // wobbles 0.026..0.034, inside the dead band
      if (p.pinch !== was) changes++;
      was = p.pinch;
    }
    expect(changes).toBe(0);
    p.update(0.02, true);
    for (let i = 0; i < 100; i++) {
      p.update(0.03 + (i % 2 ? 0.004 : -0.004), true);
      if (p.pinch !== was) changes++;
      was = p.pinch;
    }
    expect(changes).toBe(1);
  });

  it('tracking loss freezes the pinch: no release, no new pinch', () => {
    const p = new PinchDetector();
    p.update(0.01, true);
    p.update(0.5, false);
    expect(p.pinch).toBe(true);
    expect(p.up).toBe(false);
    p.update(Number.NaN, true);
    expect(p.pinch).toBe(true);
  });

  it('thresholds are configurable', () => {
    const p = new PinchDetector();
    p.update(0.03, true, { start: 0.04, release: 0.06 });
    expect(p.pinch).toBe(true);
  });
});

describe('release and placement', () => {
  it('a slow release near a surface is a placement', () => {
    expect(releaseKind(0.1, 0.05)).toBe('place');
    expect(releaseKind(PINCH_CONFIG.gentleSpeed, PINCH_CONFIG.placeHeight)).toBe('place');
  });
  it('a slow release high above the ground just drops', () => {
    expect(releaseKind(0.1, 0.9)).toBe('drop');
  });
  it('a quick release near the ground is not a placement', () => {
    expect(releaseKind(1.0, 0.05)).toBe('drop');
  });
  it('a fast release is a throw', () => {
    expect(releaseKind(3, 0.05)).toBe('throw');
    expect(releaseKind(PINCH_CONFIG.throwSpeed, 1)).toBe('throw');
  });
  it('rests on the surface: never floating, never sunk', () => {
    expect(restHeight(0.1, 0.04)).toBeCloseTo(0.14);
    expect(restHeight(0.1, -1)).toBeCloseTo(0.1);
  });
});

describe('nearest grab', () => {
  const list = [
    { id: 'a', x: 0, y: 0, z: 0 },
    { id: 'b', x: 0.1, y: 0, z: 0 },
    { id: 'far', x: 1, y: 0, z: 0 },
  ];
  it('takes the closest within reach', () => {
    expect(nearestCandidate(list, 0.08, 0, 0)?.id).toBe('b');
    expect(nearestCandidate(list, 0.02, 0, 0)?.id).toBe('a');
  });
  it('takes nothing out of reach', () => {
    expect(nearestCandidate(list, 0.5, 0.5, 0.5)).toBeNull();
  });
});

describe('tracking loss while holding', () => {
  const lost = { tipTracked: false, distance: Infinity, vr: true, select: false, squeeze: false };
  const seen = (distance: number) => ({ tipTracked: true, distance, vr: true, select: false, squeeze: false });

  it('keeps holding through tracking loss, with no release edge', () => {
    const p = new PinchDetector();
    expect(handSqueeze(p, seen(0.01)).squeeze).toBe(true);
    let was = true;
    for (let i = 0; i < 90; i++) {
      const r = handSqueeze(p, lost);
      expect(r.squeeze).toBe(true);
      expect(r.grip).toBe(true);
      was = r.squeeze;
    }
    expect(was).toBe(true);
  });

  it('resumes held if the pinch is still closed when tracking returns', () => {
    const p = new PinchDetector();
    handSqueeze(p, seen(0.01));
    handSqueeze(p, lost);
    expect(handSqueeze(p, seen(0.015)).squeeze).toBe(true);
  });

  it('only an actual pinch-open after recovery releases', () => {
    const p = new PinchDetector();
    handSqueeze(p, seen(0.01));
    handSqueeze(p, lost);
    expect(handSqueeze(p, seen(0.08)).squeeze).toBe(false);
    expect(p.up).toBe(true);
  });

  it('a hand that was not pinching stays free, and desktop never freezes', () => {
    const p = new PinchDetector();
    expect(handSqueeze(p, lost).squeeze).toBe(false);
    const q = new PinchDetector();
    handSqueeze(q, seen(0.01));
    expect(handSqueeze(q, { ...lost, vr: false }).squeeze).toBe(false);
  });
});
