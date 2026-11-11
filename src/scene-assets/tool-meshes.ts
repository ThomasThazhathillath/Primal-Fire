// Procedural meshes for hand-made tools. Each lies along +X, centred on its
// bounding box, with the head at +X and the handle end at -X, so the grip
// points in ITEM_PHYSICS (handle end) line up with what you see.

import { BoxGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, Mesh, TorusGeometry } from '@iwsdk/core';
import type { ItemId } from '../game/items.js';
import { lambert } from './materials.js';

const wood = lambert(0x8a6a45);
const darkWood = lambert(0x6b4a2b);
const stone = lambert(0x857a6a);
const flint = lambert(0x4a4a55);
const cordMat = lambert(0xc9b48a);
const green = lambert(0x6a8a3a);

/** A stick of `len` along X, centred. */
function stick(len: number, r: number, mat = wood): Mesh {
  const m = new Mesh(new CylinderGeometry(r * 0.85, r, len, 10), mat);
  m.rotation.z = Math.PI / 2;
  return m;
}

function lashing(x: number, r: number): Mesh {
  const m = new Mesh(new TorusGeometry(r, 0.006, 4, 10), cordMat);
  m.rotation.y = Math.PI / 2;
  m.position.x = x;
  return m;
}

const builders: Partial<Record<ItemId, () => Group>> = {
  axe: () => {
    const g = new Group();
    g.add(stick(0.5, 0.016, darkWood));
    const head = new Mesh(new BoxGeometry(0.05, 0.12, 0.035), stone);
    head.position.set(0.2, 0.03, 0);
    g.add(head, lashing(0.2, 0.024), lashing(0.17, 0.022));
    return g;
  },
  hammer: () => {
    const g = new Group();
    g.add(stick(0.4, 0.016, darkWood));
    const head = new Mesh(new DodecahedronGeometry(0.045, 0), stone);
    head.scale.set(1, 1.3, 0.9);
    head.position.set(0.16, 0.02, 0);
    g.add(head, lashing(0.16, 0.026));
    return g;
  },
  knife: () => {
    const g = new Group();
    const handle = stick(0.12, 0.013, darkWood);
    handle.position.x = -0.05;
    const blade = new Mesh(new ConeGeometry(0.018, 0.1, 3), flint);
    blade.rotation.z = -Math.PI / 2;
    blade.scale.set(1, 1, 0.35);
    blade.position.x = 0.06;
    g.add(handle, blade, lashing(0.0, 0.016));
    return g;
  },
  diggingStick: () => {
    const g = new Group();
    g.add(stick(0.85, 0.016, wood));
    const tip = new Mesh(new ConeGeometry(0.016, 0.06, 6), wood);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 0.45;
    g.add(tip);
    return g;
  },
  bow: () => {
    const g = new Group();
    const limb = new Mesh(new TorusGeometry(0.75, 0.012, 5, 24, 1.5), green);
    limb.rotation.z = Math.PI / 2 - 0.75;
    limb.position.y = -0.6;
    const string = stick(1.02, 0.002, cordMat);
    string.position.y = 0.07;
    g.add(limb, string);
    return g;
  },
  arrow: () => {
    const g = new Group();
    g.add(stick(0.7, 0.005, wood));
    const head = new Mesh(new ConeGeometry(0.01, 0.04, 3), flint);
    head.rotation.z = -Math.PI / 2;
    head.position.x = 0.37;
    g.add(head);
    return g;
  },
  bowDrill: () => {
    const g = new Group();
    const bow = new Mesh(new TorusGeometry(0.4, 0.01, 5, 18, 1.4), green);
    bow.rotation.z = Math.PI / 2 - 0.7;
    bow.position.y = -0.3;
    const board = new Mesh(new BoxGeometry(0.3, 0.025, 0.1), lambert(0x9a7650));
    board.position.set(0, -0.06, 0.05);
    const spindle = stick(0.3, 0.01, wood);
    spindle.rotation.z = 0;
    spindle.position.set(0.05, 0.05, 0.05);
    g.add(bow, board, spindle);
    return g;
  },
  torch: () => {
    const g = new Group();
    g.add(stick(0.5, 0.016, darkWood));
    const head = new Mesh(new DodecahedronGeometry(0.035, 0), lambert(0x2b1a10));
    head.position.x = 0.25;
    g.add(head);
    return g;
  },
};

/** A tool mesh, or null when the item has none (use the generic item mesh). */
export function toolMesh(id: ItemId): Group | null {
  return builders[id]?.() ?? null;
}
