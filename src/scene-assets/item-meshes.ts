// Small procedural meshes for gatherable resources and items in hand.
// Built once per kind and cloned (geometry/materials stay shared).

import {
  DoubleSide,
  Box3,
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  type Material,
  Mesh,
  type Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { ITEMS, type ItemId } from '../game/items.js';
import { mulberry32, range } from '../game/rng.js';
import type { ResourceLook } from '../game/world-layout.js';
import { lambert, weather } from './materials.js';
import { ROCK_STONES } from './rock-stones.data.js';
import { MeshLambertMaterial } from '@iwsdk/core';
import { toolMesh } from './tool-meshes.js';

const rng = mulberry32(77);
const r = (a: number, b: number) => range(rng, a, b);

function at<T extends Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

function sticks(count: number, color: number, len: [number, number], radius: number): Group {
  const g = new Group();
  for (let i = 0; i < count; i++) {
    const c = new Mesh(new CylinderGeometry(radius * 0.7, radius, r(len[0], len[1]), 5), lambert(color));
    g.add(at(c, r(-0.06, 0.06), 0.012 + i * 0.01, r(-0.06, 0.06), 0, r(0, 3), Math.PI / 2));
  }
  return g;
}

const stoneGeos: BufferGeometry[] = [];
/** One of the six baked rock shapes (Poly Haven Rock Moss Set 01, about 110 triangles), vertex-coloured from its texture. */
export function rockGeometry(i: number): BufferGeometry {
  if (!stoneGeos[i]) {
    const d = ROCK_STONES[i % ROCK_STONES.length];
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(d.P), 3));
    g.setAttribute('normal', new BufferAttribute(Float32Array.from(d.N), 3));
    // Source colours are sRGB bytes; vertex colours are linear.
    g.setAttribute('color', new BufferAttribute(Float32Array.from(d.C, (v) => Math.pow(v / 255, 2.2)), 3));
    g.setIndex(d.I);
    stoneGeos[i] = g;
  }
  return stoneGeos[i];
}

/** A collectible stone: a small rock tinted by `color` (a darker tint reads as flint, a pale one as chalk). Decor boulders are big and mossy. */
function stone(color: number, size: number, rock = 0): Mesh {
  const mat = new MeshLambertMaterial({ vertexColors: true, color });
  const m = new Mesh(rockGeometry(rock), mat);
  m.scale.setScalar(size * 2.1);
  return m;
}

/** A long, straight, dry pole: slightly tapered, one end splintered, a snapped stub, lying on the ground. */
function poleMesh(): Object3D {
  const g = new Group();
  const shaft = new Mesh(new CylinderGeometry(0.032, 0.048, 1.6, 10), lambert(0x8a6a45));
  g.add(at(shaft, 0, 0.05, 0, 0, 0, Math.PI / 2));
  const stub = new Mesh(new CylinderGeometry(0.012, 0.02, 0.14, 10), lambert(0x7a5c3b));
  g.add(at(stub, 0.3, 0.1, 0.03, 0.9, 0, 0));
  const cap = new Mesh(new CylinderGeometry(0.048, 0.04, 0.05, 10), lambert(0xc9a86a));
  g.add(at(cap, -0.8, 0.05, 0, 0, 0, Math.PI / 2));
  return g;
}

const builders: Record<ResourceLook, () => Object3D> = {
  pole: poleMesh,
  grass: () => {
    const g = new Group();
    for (let i = 0; i < 18; i++) {
      const h = r(0.28, 0.48);
      g.add(at(new Mesh(new ConeGeometry(0.02, h, 4), lambert([0xd9c27a, 0xcbb066, 0xe2cf8c][i % 3])), r(-0.1, 0.1), h / 2, r(-0.1, 0.1), r(-0.25, 0.25), 0, r(-0.25, 0.25)));
    }
    return g;
  },
  fibrePlant: () => {
    const g = new Group();
    for (let i = 0; i < 9; i++) {
      const h = r(0.5, 0.75);
      g.add(at(new Mesh(new ConeGeometry(0.014, h, 3), lambert([0x6f8f3a, 0x7a9a42][i % 2])), r(-0.06, 0.06), h / 2, r(-0.06, 0.06), r(-0.35, 0.35), 0, r(-0.35, 0.35)));
    }
    g.add(at(new Mesh(new SphereGeometry(0.03, 6, 4), lambert(0xd8d06a)), 0, 0.72, 0));
    return g;
  },
  twigPile: () => sticks(7, 0x7d6a55, [0.25, 0.4], 0.012),
  fallenLog: () => at(new Mesh(new CylinderGeometry(0.16, 0.19, 1.8, 9), lambert(0x5a4636)), 0, 0.17, 0, 0, 0, Math.PI / 2),
  sapling: () => {
    // A slim trunk with soft, smooth-shaded leaf masses (no faceted solids).
    const g = new Group();
    g.add(at(new Mesh(new CylinderGeometry(0.02, 0.035, 1.2, 10), lambert(0x6b5a3a)), 0, 0.6, 0));
    const tones = [0x3f6e2a, 0x4a7a30, 0x55883a];
    [[0.7, 0.2], [0.95, 0.18], [1.2, 0.14]].forEach(([y, s], i) => {
      const puff = new Mesh(new SphereGeometry(s, 10, 8), lambert(tones[i]));
      puff.scale.set(1, 0.8, 1);
      g.add(at(puff, r(-0.05, 0.05), y, r(-0.05, 0.05)));
    });
    return g;
  },
  mossRock: () => {
    const g = new Group();
    g.add(at(stone(0xb0aca0, 0.11, 3), 0, 0, 0));
    g.add(at(new Mesh(new SphereGeometry(0.21, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), lambert(0x3f6a33)), 0, 0.17, 0));
    return g;
  },
  straightStick: () => at(new Mesh(new CylinderGeometry(0.02, 0.022, 0.8, 10), lambert(0xc49a66)), 0, 0.36, 0, 0, 0, -0.3),
  board: () => at(new Mesh(new BoxGeometry(0.55, 0.04, 0.16), lambert(0x9a7650)), 0, 0.02, 0),
  clayPatch: () => {
    const g = new Group();
    g.add(at(new Mesh(new CircleGeometry(0.45, 20), lambert(0xb06a45)), 0, 0.013, 0, -Math.PI / 2));
    for (let i = 0; i < 5; i++) g.add(at(new Mesh(new DodecahedronGeometry(0.06), lambert(0xa65f3d)), r(-0.25, 0.25), 0.03, r(-0.25, 0.25)));
    return g;
  },
  sandBar: () => {
    const m = at(new Mesh(new CircleGeometry(0.55, 20), lambert(0xe0cf9a)), 0, 0.014, 0, -Math.PI / 2);
    m.scale.set(1, 0.6, 1);
    return m;
  },
  gravelBed: () => {
    const g = new Group();
    for (let i = 0; i < 9; i++) g.add(at(stone([0xc8c8c8, 0xa8a49c, 0xe0dacc][i % 3], r(0.014, 0.026), i % 6), r(-0.25, 0.25), 0, r(-0.18, 0.18)));
    return g;
  },
  cloth: () => at(new Mesh(new BoxGeometry(0.34, 0.01, 0.24), lambert(0xe8e2d0)), 0, 0.03, 0, 0.1, 0.5, 0.05),
  lens: () => {
    const g = new Group();
    g.add(at(new Mesh(new TorusGeometry(0.06, 0.012, 6, 16), lambert(0xb8a070)), 0, 0.07, 0, Math.PI / 2.4));
    g.add(at(new Mesh(new CircleGeometry(0.058, 16), lambert(0xcfe8ff, { transparent: true, opacity: 0.55 })), 0, 0.07, 0, Math.PI / 2.4 - Math.PI / 2));
    return g;
  },
  stone: () => stone(0xe6d8c2, 0.09, 0),
  wetStone: () => stone(0x93a6b6, 0.09, 2),
  slab: () => at(new Mesh(weather(new BoxGeometry(0.6, 0.07, 0.42, 6, 1, 4), 0.012, 5), new MeshLambertMaterial({ color: ITEMS.slab.color, vertexColors: true })), 0, 0.035, 0),
  forkedStick: () => {
    const g = new Group();
    g.add(at(new Mesh(new CylinderGeometry(0.018, 0.022, 0.7, 10), lambert(0x8a6a45)), 0, 0.02, 0, 0, 0, Math.PI / 2));
    g.add(at(new Mesh(new CylinderGeometry(0.012, 0.016, 0.25, 10), lambert(0x8a6a45)), 0.3, 0.02, 0.06, 0, 0.5, Math.PI / 2));
    return g;
  },
  diggingStick: () => at(new Mesh(new ConeGeometry(0.03, 0.9, 6), lambert(0x7d5f3e)), 0, 0.03, 0, 0, 0, Math.PI / 2),
  cane: () => {
    const g = new Group();
    for (let i = 0; i < 5; i++) {
      const h = r(0.9, 1.4);
      g.add(at(new Mesh(new CylinderGeometry(0.018, 0.02, h, 10), lambert([0x9fae5a, 0x8f9e4a][i % 2])), r(-0.12, 0.12), h / 2, r(-0.12, 0.12), r(-0.08, 0.08), 0, r(-0.08, 0.08)));
    }
    return g;
  },
  dryBranch: () => {
    const g = new Group();
    g.add(at(new Mesh(new CylinderGeometry(0.02, 0.035, 1.1, 10), lambert(0x7a6248)), 0, 0.05, 0, 0, 0.4, Math.PI / 2 - 0.08));
    g.add(at(new Mesh(new CylinderGeometry(0.01, 0.018, 0.45, 10), lambert(0x6e583f)), 0.2, 0.09, 0.14, 0, -0.5, Math.PI / 2 - 0.2));
    return g;
  },
  leafLitter: () => {
    const g = new Group();
    for (let i = 0; i < 14; i++) {
      const leaf = new Mesh(new CircleGeometry(r(0.04, 0.07), 5), lambert([0xa8793a, 0x8c6230, 0xb98b45, 0x7a5528][i % 4], { side: DoubleSide }));
      g.add(at(leaf, r(-0.22, 0.22), 0.012 + i * 0.002, r(-0.22, 0.22), -Math.PI / 2, 0, r(0, 6)));
    }
    return g;
  },
  vine: () => {
    const g = new Group();
    for (let i = 0; i < 6; i++) {
      g.add(at(new Mesh(new CylinderGeometry(0.014, 0.014, 0.28, 10), lambert(0x4f7a34)), i * 0.1 - 0.25, 0.03, Math.sin(i * 1.3) * 0.08, 0, i * 0.5, Math.PI / 2 + Math.sin(i) * 0.3));
    }
    for (let i = 0; i < 4; i++) g.add(at(new Mesh(new CircleGeometry(0.05, 5), lambert(0x6fa040, { side: DoubleSide })), i * 0.14 - 0.2, 0.05, r(-0.08, 0.08), -Math.PI / 2, 0, r(0, 6)));
    return g;
  },
  bark: () => {
    const m = new Mesh(new CylinderGeometry(0.1, 0.1, 0.36, 8, 1, true, 0, Math.PI * 1.1), lambert(0x6e5238, { side: DoubleSide }));
    return at(m, 0, 0.09, 0, 0, 0.6, Math.PI / 2);
  },
  stoneDark: () => stone(0x6f7480, 0.14, 4),
  stonePale: () => stone(0xf0e2c0, 0.11, 1),
};

/**
 * Bakes a multi-part model into one mesh per material, so a grass clump of 18
 * blades costs one draw call instead of 18.
 */
function flatten(root: Object3D): Object3D {
  root.updateMatrixWorld(true);
  const groups = new Map<Material, BufferGeometry[]>();
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const src = o.geometry as BufferGeometry;
    const g = src.index ? src.toNonIndexed() : src.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(o.matrixWorld);
    const mat = o.material as Material;
    if (!groups.has(mat)) groups.set(mat, []);
    groups.get(mat)!.push(g);
  });
  const out = new Group();
  for (const [mat, parts] of groups) {
    const merged = new BufferGeometry();
    for (const name of parts[0].attributes.color ? ['position', 'normal', 'color'] : ['position', 'normal']) {
      const arr = new Float32Array(parts.reduce((n, g) => n + g.attributes[name].array.length, 0));
      let offset = 0;
      for (const g of parts) {
        arr.set(g.attributes[name].array as Float32Array, offset);
        offset += g.attributes[name].array.length;
      }
      merged.setAttribute(name, new BufferAttribute(arr, 3));
    }
    out.add(new Mesh(merged, mat));
  }
  return out;
}

const resourceCache = new Map<ResourceLook, Object3D>();

/** A fresh clone of the world mesh for a resource spot. */
export function resourceMesh(look: ResourceLook): Object3D {
  let proto = resourceCache.get(look);
  if (!proto) resourceCache.set(look, (proto = flatten(builders[look]())));
  return wrap(proto);
}

/** Clone inside a fresh group, so callers can position it freely. */
function wrap(proto: Object3D): Group {
  const g = new Group();
  g.add(proto.clone());
  return g;
}

const ITEM_LOOK: Partial<Record<ItemId, ResourceLook>> = {
  dryGrass: 'grass',
  twigs: 'twigPile',
  spindle: 'straightStick',
  board: 'board',
  clay: 'clayPatch',
  gravel: 'gravelBed',
  dryBranch: 'dryBranch',
  leafLitter: 'leafLitter',
  vine: 'vine',
  bark: 'bark',
  cloth: 'cloth',
  lens: 'lens',
  dryStone: 'stone',
  flint: 'stoneDark',
  wetStone: 'wetStone',
  slab: 'slab',
  forkedStick: 'forkedStick',
  diggingStick: 'diggingStick',
  pole: 'pole',
};

const itemCache = new Map<ItemId, Object3D>();

/** A hand-sized mesh for an item you hold or place. */
/** A fish: silver-blue raw, browned and opaque once cooked (the colour change is what you read at a glance). */
export const FISH_COLORS = { raw: 0x8fa7b3, cooked: 0xc4864a };
function fishMesh(cooked: boolean): Group {
  const col = cooked ? FISH_COLORS.cooked : FISH_COLORS.raw;
  const g = new Group();
  const body = new Mesh(new SphereGeometry(0.5, 10, 6), lambert(col));
  body.scale.set(0.3, 0.07, 0.1);
  g.add(at(body, 0, 0.04, 0));
  const tail = new Mesh(new ConeGeometry(0.05, 0.1, 4), lambert(col));
  g.add(at(tail, -0.17, 0.04, 0, 0, 0, Math.PI / 2));
  return g;
}

export function itemMesh(id: ItemId): Object3D {
  let proto = itemCache.get(id);
  if (!proto) {
    const look = ITEM_LOOK[id];
    const tool = toolMesh(id);
    if (id === 'fish' || id === 'cookedFish') {
      proto = fishMesh(id === 'cookedFish');
    } else if (tool) {
      proto = tool;
    } else if (look) {
      proto = builders[look]();
    } else {
      // Generic bundle in the item's colour.
      proto = new Group();
      proto.add(at(new Mesh(new IcosahedronGeometry(0.06, 0), lambert(ITEMS[id].color)), 0, 0.06, 0));
    }
    // Logs and saplings are too big to hold; shrink the world look.
    if (id === 'logs') proto = at(new Mesh(new CylinderGeometry(0.05, 0.056, 0.36, 10), lambert(ITEMS.logs.color)), 0, 0.05, 0, 0, 0, Math.PI / 2);
    itemCache.set(id, proto);
  }
  return wrap(proto);
}

const HAND_SIZE = 0.1;
const box = new Box3();
const size = new Vector3();

/** An item mesh scaled down to fit in a hand (~10 cm across). */
export function heldItemMesh(id: ItemId): Object3D {
  const g = itemMesh(id);
  box.setFromObject(g).getSize(size);
  const biggest = Math.max(size.x, size.y, size.z);
  if (biggest > HAND_SIZE) g.scale.setScalar(HAND_SIZE / biggest);
  return g;
}
