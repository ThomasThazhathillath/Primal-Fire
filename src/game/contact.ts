// What two materials sound and look like when they meet. One table drives
// procedural audio (AudioSystem) and pooled particles (ContactFxSystem):
// stone on stone clicks, flint on stone knaps with sparks, an axe chops wood,
// leaves rustle, clay squishes, water splashes.

import type { Material } from './items.js';

export type ContactSound = 'click' | 'crack' | 'knap' | 'thud' | 'chop' | 'knock' | 'rustle' | 'squish' | 'splash' | 'scrape' | 'clink';
export type ContactParticle = 'chips' | 'dust' | 'sparks' | 'leaves' | 'splash' | 'none';

export interface ContactProfile {
  sound: ContactSound;
  /** Base pitch (Hz) of the sound's tonal / filter part; randomised per hit. */
  pitch: number;
  particle: ContactParticle;
  /** Loudness 0..1 at full strength. */
  volume: number;
}

const P = (sound: ContactSound, pitch: number, particle: ContactParticle, volume: number): ContactProfile => ({
  sound,
  pitch,
  particle,
  volume,
});

/** Pair key: the two materials in alphabetical order. */
const key = (a: Material, b: Material) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const TABLE: Record<string, ContactProfile> = {
  [key('stone', 'stone')]: P('click', 2400, 'dust', 0.7),
  [key('flint', 'stone')]: P('knap', 4200, 'sparks', 0.8),
  [key('flint', 'flint')]: P('knap', 4800, 'sparks', 0.8),
  [key('stone', 'wood')]: P('knock', 700, 'chips', 0.6),
  [key('flint', 'wood')]: P('chop', 900, 'chips', 0.6),
  [key('wood', 'wood')]: P('knock', 500, 'chips', 0.55),
  [key('soil', 'stone')]: P('thud', 160, 'dust', 0.5),
  [key('flint', 'soil')]: P('thud', 180, 'dust', 0.45),
  [key('soil', 'wood')]: P('thud', 120, 'dust', 0.45),
  [key('leaf', 'soil')]: P('rustle', 2000, 'leaves', 0.3),
  [key('leaf', 'wood')]: P('rustle', 2200, 'leaves', 0.3),
  [key('leaf', 'stone')]: P('rustle', 2400, 'leaves', 0.3),
  [key('fibre', 'soil')]: P('rustle', 1600, 'none', 0.2),
  [key('clay', 'soil')]: P('squish', 300, 'none', 0.4),
  [key('clay', 'stone')]: P('squish', 380, 'none', 0.4),
  [key('clay', 'wood')]: P('squish', 340, 'none', 0.4),
  [key('soil', 'water')]: P('splash', 900, 'splash', 0.5),
  [key('stone', 'water')]: P('splash', 700, 'splash', 0.6),
  [key('water', 'wood')]: P('splash', 600, 'splash', 0.5),
  [key('bone', 'stone')]: P('clink', 3000, 'dust', 0.5),
  [key('sand', 'soil')]: P('scrape', 2600, 'dust', 0.25),
  [key('cloth', 'soil')]: P('rustle', 1200, 'none', 0.15),
  [key('ember', 'soil')]: P('rustle', 3000, 'sparks', 0.2),
};

/** The axe's edge biting bark and wood: a chop, not a knock. */
export const TOOL_ON_WOOD = P('chop', 260, 'chips', 0.9);

export function contactProfile(a: Material, b: Material): ContactProfile {
  return TABLE[key(a, b)] ?? P('thud', 220, 'dust', 0.35);
}

/** Volume for an impact at `speed` m/s (soft touches are quiet, blows are loud). */
export function contactGain(profile: ContactProfile, speed: number): number {
  return profile.volume * Math.min(1, 0.15 + speed / 4);
}
