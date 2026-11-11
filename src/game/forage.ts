// Wild food you have to identify before you trust it (Phase 3, milestone D). A fixed set of patches
// is scattered deterministically at the forest edges. Each is edible or a poisonous look-alike; you
// learn which by looking closely (an inspect action that reads out its features) and picking only
// what you recognise. Positions are generated, never saved; only regrow timers are.

import { mulberry32 } from './rng.js';
import { inClearing, nearestTreeDistance, streamDistance, STREAM_BANK, WORLD_RADIUS } from './world-layout.js';

export type ForageKind = 'berry' | 'nut' | 'root';

export interface ForagePatch {
  id: number;
  kind: ForageKind;
  x: number;
  z: number;
  edible: boolean;
  /** What you notice when you look closely. */
  look: string;
  /** What you gain by picking it (edible only). */
  yield: 'berries' | 'nuts' | 'tuber';
}

const LOOKS: Record<string, string> = {
  berryGood: 'Glossy red berries in loose clusters on a thorny cane, toothed leaves with a pale underside. These are wild raspberries: safe.',
  berryBad: 'Waxy white berries with a dark dot, on thick red stalks in one upright spike. It looks like a berry bush but the colour is a warning: baneberry, poisonous.',
  nutGood: 'A shrub with round, toothed leaves and nuts wrapped in a ragged green husk. Hazel: the nuts are safe and rich in fat.',
  nutBad: 'Glossy dark seeds in spiky capsules on a tall tree, bitter smell. Not a food: leave it.',
  rootGood: 'A plant with feathery leaves, a hairy stem and a carrot smell from the root. A wild carrot: the root is safe.',
  rootBad: 'Smooth, hairless, purple-blotched stem with a musty smell. A look-alike of wild carrot that is deadly: never dig it.',
};

export const FORAGE_COUNT = { berry: 6, nut: 4, root: 3 };
export const FORAGE_REGROW = 240;

function build(): ForagePatch[] {
  const rng = mulberry32(4242);
  const out: ForagePatch[] = [];
  const kinds: ForageKind[] = [];
  (Object.keys(FORAGE_COUNT) as ForageKind[]).forEach((k) => {
    for (let i = 0; i < FORAGE_COUNT[k]; i++) kinds.push(k);
  });
  kinds.forEach((kind, i) => {
    let x = 12;
    let z = 0;
    for (let tries = 0; tries < 200; tries++) {
      const a = rng() * Math.PI * 2;
      const r = 8 + rng() * 26;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      const td = nearestTreeDistance(x, z, 4);
      if (r < WORLD_RADIUS - 6 && streamDistance(x, z) > STREAM_BANK + 1 && td > 1 && td < 3 && !inClearing(x, z, -2)) break;
    }
    // Every third patch of a kind is the poisonous look-alike (never the first of its kind, so there is always a good one near).
    const edible = !(i % 3 === 2 || (kind === 'berry' && i === 3));
    out.push({
      id: i,
      kind,
      x,
      z,
      edible,
      look: LOOKS[`${kind}${edible ? 'Good' : 'Bad'}`],
      yield: kind === 'berry' ? 'berries' : kind === 'nut' ? 'nuts' : 'tuber',
    });
  });
  return out;
}

export const FORAGE_PATCHES: ReadonlyArray<ForagePatch> = build();
