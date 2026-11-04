import { describe, expect, it } from 'vitest';
import { handSqueeze, PinchDetector } from '../src/game/pinch.js';
import { mayStart, type HandBusy } from '../src/game/priority.js';

const idle: HandBusy = { held: false, ui: false, grab: false, move: false };

describe('hand priority', () => {
  it('an idle hand may start anything', () => {
    for (const a of ['held', 'ui', 'grab', 'move', 'gesture'] as const) expect(mayStart(a, idle)).toBe(true);
  });
  it('a held object blocks everything below it', () => {
    const s = { ...idle, held: true };
    expect(mayStart('ui', s)).toBe(false);
    expect(mayStart('grab', s)).toBe(false);
    expect(mayStart('move', s)).toBe(false);
    expect(mayStart('gesture', s)).toBe(false);
  });
  it('a UI tap blocks grabs, moves and gestures but not itself', () => {
    const s = { ...idle, ui: true };
    expect(mayStart('ui', s)).toBe(true);
    expect(mayStart('grab', s)).toBe(false);
    expect(mayStart('move', s)).toBe(false);
  });
  it('a grab blocks a teleport on the same hand', () => {
    const s = { ...idle, grab: true };
    expect(mayStart('move', s)).toBe(false);
    expect(mayStart('gesture', s)).toBe(false);
    expect(mayStart('ui', s)).toBe(true);
  });
  it('movement only blocks other gestures', () => {
    const s = { ...idle, move: true };
    expect(mayStart('gesture', s)).toBe(false);
    expect(mayStart('grab', s)).toBe(true);
  });
});

describe('tracking loss', () => {
  const lost = { tipTracked: false, distance: Infinity, vr: true, select: false, squeeze: false };
  it('a pinch survives a short loss: no release', () => {
    const p = new PinchDetector();
    handSqueeze(p, { ...lost, tipTracked: true, distance: 0.005 });
    for (let i = 0; i < 60; i++) expect(handSqueeze(p, { ...lost, dt: 1 / 72 }).squeeze).toBe(true);
  });
  it('a pinch that never comes back is let go after the timeout, not held forever', () => {
    const p = new PinchDetector();
    handSqueeze(p, { ...lost, tipTracked: true, distance: 0.005 });
    let held = true;
    for (let i = 0; i < 72 * 6 && held; i++) held = handSqueeze(p, { ...lost, dt: 1 / 72 }).squeeze;
    expect(held).toBe(false);
  });
  it('recovery with an open hand releases once, with no launch from the gap', () => {
    const p = new PinchDetector();
    handSqueeze(p, { ...lost, tipTracked: true, distance: 0.005 });
    for (let i = 0; i < 30; i++) handSqueeze(p, { ...lost, dt: 1 / 72 });
    expect(handSqueeze(p, { ...lost, tipTracked: true, distance: 0.09 }).squeeze).toBe(false);
  });
});
