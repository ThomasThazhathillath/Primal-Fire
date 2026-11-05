// Where to find things, in words a newcomer understands: how far, which way
// relative to where you are FACING (ahead, to your left ...), and a landmark you
// can see (the big split rock, the stream, the rusted mast). Built from the
// real resource layout (world-layout.ts), so it never points at nothing.
// Pure: no three.js, no allocation beyond the returned string.

import type { ItemId } from './items.js';
import { LANDMARK_BY_ID, RESOURCES, streamDistance } from './world-layout.js';

/** Landmarks a player can actually see and recognise, with how to say it. */
const VISIBLE: Array<{ id: string; phrase: string; reach: number }> = [
  { id: 'splitRock', phrase: 'by the big split rock', reach: 10 },
  { id: 'ruins', phrase: 'at the old ruins, under the rusted mast', reach: 10 },
  { id: 'wake', phrase: 'close to where you woke up', reach: 7 },
];

/** Distance (m) within which a spot counts as "along the stream". */
const STREAM_NEAR = 3.5;
/** Closer than this the answer is "right beside you". */
const BESIDE = 3;

export interface Found {
  x: number;
  z: number;
  d: number;
  item: ItemId;
}

/** Nearest resource spot offering any of `items`, from (x, z). */
export function nearestSpot(items: readonly ItemId[], x: number, z: number): Found | null {
  let best: Found | null = null;
  for (const s of RESOURCES) {
    if (!items.includes(s.itemId)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (!best || d < best.d) best = { x: s.x, z: s.z, d, item: s.itemId };
  }
  return best;
}

/** A landmark phrase for a place: a recognisable landmark first, else the stream, else null. */
export function landmarkPhrase(x: number, z: number): string | null {
  for (const v of VISIBLE) {
    const l = LANDMARK_BY_ID[v.id];
    if (l && Math.hypot(x - l.x, z - l.z) < l.r + v.reach) return v.phrase;
  }
  return streamDistance(x, z) < STREAM_NEAR ? 'along the stream' : null;
}

/**
 * Which way (dx, dz) lies relative to a head facing `yaw` (0 = towards -Z, turning left is
 * positive), in the plain words ahead / to your left / behind you ...
 */
export function relativeDirection(dx: number, dz: number, yaw: number): string {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const ahead = dx * fx + dz * fz;
  const right = dx * rx + dz * rz;
  const a = (Math.atan2(right, ahead) * 180) / Math.PI; // 0 ahead, +90 right
  const side = a >= 0 ? 'right' : 'left';
  const m = Math.abs(a);
  if (m < 22.5) return 'straight ahead';
  if (m < 67.5) return `ahead to your ${side}`;
  if (m < 112.5) return `to your ${side}`;
  if (m < 157.5) return `behind you to the ${side}`;
  return 'behind you';
}

/** "about 12 metres ahead to your left, along the stream" for a place `from` a player. */
export function describePlace(x: number, z: number, from: { x: number; z: number }, yaw: number): string {
  const dx = x - from.x;
  const dz = z - from.z;
  const d = Math.hypot(dx, dz);
  const where = landmarkPhrase(x, z);
  if (d < BESIDE) return 'One is right beside you: look closely at the ground around your feet.';
  const m = Math.max(5, Math.round(d / 5) * 5);
  return `Nearest: about ${m} metres ${relativeDirection(dx, dz, yaw)}${where ? `, ${where}` : ''}.`;
}

/** Where to find the nearest of `items`, or null if the world holds none. */
export function whereIs(items: readonly ItemId[], from: { x: number; z: number }, yaw: number): string | null {
  const f = nearestSpot(items, from.x, from.z);
  return f ? describePlace(f.x, f.z, from, yaw) : null;
}

/** Where a named landmark is (the ruins, the split rock), for objectives that are a place. */
export function whereLandmark(id: string, from: { x: number; z: number }, yaw: number): string | null {
  const l = LANDMARK_BY_ID[id];
  if (!l) return null;
  const phrase = VISIBLE.find((v) => v.id === id)?.phrase;
  const dx = l.x - from.x;
  const dz = l.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < BESIDE + l.r) return `You are here${phrase ? `: ${phrase}` : ''}.`;
  const m = Math.max(5, Math.round(d / 5) * 5);
  return `About ${m} metres ${relativeDirection(dx, dz, yaw)}${phrase ? `, ${phrase}` : ''}.`;
}
