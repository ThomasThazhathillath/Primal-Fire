// Set pieces for the hidden places. Each is built around its own origin
// (floor contact at y = 0) and placed by the scene at its landmark.

import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  SphereGeometry,
  TorusGeometry,
} from '@iwsdk/core';
import { mulberry32, range } from '../game/rng.js';
import { lambert } from './materials.js';

const concrete = () => lambert(0x948e84);
const moss = () => lambert(0x4f6b35);
const rust = () => lambert(0x7a3e22);

function box(w: number, h: number, d: number, mat: ReturnType<typeof lambert>, x: number, y: number, z: number): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Lightning Glade: a dead tree shattered by a strike. */
export function createShatteredTree(): Object3D {
  const g = new Group();
  g.name = 'ShatteredTree';
  const grey = lambert(0x6e6760);
  const trunk = new Mesh(new CylinderGeometry(0.22, 0.35, 3.6, 8), grey);
  trunk.position.y = 1.8;
  trunk.name = 'Trunk';
  const charred = new Mesh(new CylinderGeometry(0.08, 0.22, 0.9, 6), lambert(0x2a2522));
  charred.position.set(0.05, 3.9, 0);
  charred.name = 'CharredTop';
  g.add(trunk, charred);
  for (const [y, a, l] of [
    [2.2, 0.6, 1.0],
    [2.8, 2.4, 0.8],
    [1.6, 4.4, 0.9],
  ]) {
    const b = new Mesh(new CylinderGeometry(0.04, 0.07, l, 5), grey);
    b.position.set(Math.cos(a) * l * 0.4, y, Math.sin(a) * l * 0.4);
    b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    g.add(b);
  }
  return g;
}

/**
 * The Ruins: a collapsed research station, the rusted mast that draws you
 * there from across the forest, and the Science Roadmap wall (local +Z face).
 */
export function createRuins(): Object3D {
  const g = new Group();
  g.name = 'Ruins';
  const walls = new Group();
  walls.name = 'Walls';
  walls.add(
    box(4, 2.2, 0.3, concrete(), 0.4, 1.1, -3.4),
    box(4, 0.08, 0.35, moss(), 0.4, 2.22, -3.4),
    box(0.3, 1.4, 3, concrete(), -2.6, 0.7, -1.9),
    box(0.3, 0.6, 1.4, concrete(), 2.6, 0.3, -2.6),
  );
  const roof = box(3.2, 0.12, 2.4, rust(), 0.6, 0.7, -2.2);
  roof.rotation.set(0.35, 0.1, 0.25);
  walls.add(roof);
  const rng = mulberry32(41);
  for (let i = 0; i < 12; i++) {
    walls.add(box(range(rng, 0.15, 0.4), range(rng, 0.08, 0.2), range(rng, 0.15, 0.35), concrete(), range(rng, -2.2, 2.2), 0.05, range(rng, -3, -0.8)));
  }
  g.add(walls);

  // The mast: ~13 m, visible over the canopy from most of the forest.
  const mast = new Group();
  mast.name = 'Mast';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    const leg = new Mesh(new CylinderGeometry(0.05, 0.08, 13, 4), rust());
    leg.position.set(Math.cos(a) * 0.35, 6.5, Math.sin(a) * 0.35);
    leg.rotation.set(Math.sin(a) * 0.05, 0, -Math.cos(a) * 0.05);
    mast.add(leg);
  }
  for (let y = 1; y < 12.5; y += 1.4) {
    const ringMesh = new Mesh(new TorusGeometry(0.42 - y * 0.012, 0.025, 4, 4), rust());
    ringMesh.rotation.set(Math.PI / 2, 0, Math.PI / 4);
    ringMesh.position.y = y;
    mast.add(ringMesh);
  }
  const dish = new Mesh(new SphereGeometry(0.7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3), rust());
  dish.position.set(0.3, 11.5, 0.2);
  dish.rotation.set(1.2, 0.3, 0.2);
  mast.add(dish);
  mast.position.set(-3.6, 0, -3.8);
  mast.rotation.z = 0.06;
  g.add(mast);

  g.add(createRoadmapWall());
  return g;
}

/**
 * The Science Roadmap: a carved stone wall of empty sockets from FIRE up to
 * ELECTRICITY. Sockets are named `RoadmapNode_<id>` so a system can light them.
 */
function createRoadmapWall(): Object3D {
  const wall = new Group();
  wall.name = 'RoadmapWall';
  wall.position.set(0.4, 0, -3.2);
  wall.add(box(3.6, 2.6, 0.3, lambert(0x8a8478), 0, 1.3, 0));
  const socket = new MeshBasicMaterial({ color: 0x1c1712 });
  const nodes: Array<[string, number, number]> = [
    ['fire', -1.4, 0.75],
    ['pottery', -0.7, 1.15],
    ['charcoal', -0.7, 0.45],
    ['water', 0, 0.8],
    ['chem', 0.6, 1.4],
    ['glass', 1.25, 2.0],
    ['soap', 1.25, 1.45],
    ['lime', 1.25, 0.9],
    ['electric', 1.5, 2.3],
  ];
  for (const [id, x, y] of nodes) {
    const disc = new Mesh(new CircleGeometry(0.13, 16), socket);
    disc.name = `RoadmapNode_${id}`;
    disc.position.set(x, y + 0.2, 0.152);
    wall.add(disc);
  }
  return wall;
}

/** Split Rock: a sun-bleached boulder cracked clean in two. */
export function createSplitRock(): Object3D {
  const g = new Group();
  g.name = 'SplitRock';
  const stone = lambert(0x9d978c);
  for (const side of [-1, 1]) {
    const half = new Mesh(new DodecahedronGeometry(1.5, 0), stone);
    half.name = side < 0 ? 'WestHalf' : 'EastHalf';
    half.scale.set(0.55, 0.85, 1);
    half.position.set(side * 0.75, 0.9, 0);
    half.rotation.set(0, side * 0.25, side * 0.12);
    g.add(half);
  }
  return g;
}
