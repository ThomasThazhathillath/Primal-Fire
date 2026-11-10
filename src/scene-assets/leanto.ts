// The Chapter 2 shelter, drawn from what has been built so far (docs/CHAPTER2_SHELTER_SPEC.md).
// Nothing here is a prebuilt model: every pole, rib, lashing and roof layer appears because the
// matching spot of the placed structure is filled, so the shelter grows from a bare frame into a
// layered roof as the player works. Every member has a seeded wobble (no two poles are quite
// parallel) and its own wood or leaf colour. All members of a kind share one InstancedMesh, so a
// finished shelter is about six draw calls however many pieces it has.

import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { BLUEPRINTS, type PlacedStructure } from '../game/blueprint.js';
import { mulberry32 } from '../game/rng.js';
import { PANELS } from '../game/shelter.js';

const UP = new Vector3(0, 1, 0);
const a = new Vector3();
const b = new Vector3();
const dir = new Vector3();
const mid = new Vector3();
const q = new Quaternion();
const m4 = new Matrix4();
const sc = new Vector3();
const col = new Color();

// Shared geometry and materials (one set for every shelter).
const memberGeo = new CylinderGeometry(0.5, 0.5, 1, 6);
const wrapGeo = new TorusGeometry(1, 0.14, 4, 10);
const stripGeo = new BoxGeometry(1, 1, 1);
/** Shared by every shelter piece: ShelterSystem darkens it as rain wets the wood and leaves. */
export const shelterMaterial = new MeshLambertMaterial({ color: 0xffffff });
const lambert = shelterMaterial;
const wrapMat = new MeshLambertMaterial({ color: 0xe8dcc0 });
const trenchMat = new MeshLambertMaterial({ color: 0x4a3626 });
const waterMat = new MeshBasicMaterial({ color: 0x6fa8c8, transparent: true, opacity: 0.7 });
const bedMat = new MeshLambertMaterial({ color: 0xa8793a });

/** The ridge-to-ground slope of the roof: from the high front edge to the low back edge (local frame). */
export const ROOF_FRONT = { y: 1.34, z: 0.6 };
export const ROOF_BACK = { y: 0.04, z: -1.55 };

/** Height of the rib line at depth z (the roof surface under the cover). */
export function ribY(z: number): number {
  const t = (ROOF_FRONT.z - z) / (ROOF_FRONT.z - ROOF_BACK.z);
  return ROOF_FRONT.y + (ROOF_BACK.y - ROOF_FRONT.y) * Math.max(0, Math.min(1, t));
}

interface Inst {
  m: Matrix4;
  c: number;
}

class Batch {
  items: Inst[] = [];
  add(m: Matrix4, color: number): void {
    this.items.push({ m: m.clone(), c: color });
  }
  mesh(geo: CylinderGeometry | BoxGeometry | TorusGeometry, mat: MeshLambertMaterial, name: string): InstancedMesh | null {
    if (!this.items.length) return null;
    const im = new InstancedMesh(geo, mat, this.items.length);
    im.name = name;
    this.items.forEach((it, i) => {
      im.setMatrixAt(i, it.m);
      im.setColorAt(i, col.setHex(it.c));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    return im;
  }
}

const WOOD = [0x8a6a45, 0x7d5f3e, 0x9a7a50, 0x6f5436];
const BARK = [0x6e5238, 0x5d452f, 0x7c5d40, 0x65503a];
const LEAF = [0xa8793a, 0x95692f, 0xb98a46, 0x8a6a2f, 0xa07a3c];
const GRASS = [0xd9c27a, 0xcbb066, 0xe2cf8c, 0xbfa95e];

/** A pole between two points, `d` thick. */
function member(batch: Batch, p: Vector3, r: Vector3, d: number, color: number): void {
  dir.subVectors(r, p);
  const len = dir.length();
  if (len < 1e-4) return;
  dir.divideScalar(len);
  q.setFromUnitVectors(UP, dir);
  mid.addVectors(p, r).multiplyScalar(0.5);
  m4.compose(mid, q, sc.set(d, len, d));
  batch.add(m4, color);
}

/** A flat piece lying on the roof plane at (across, along) from the panel centre. */
function layerPiece(batch: Batch, origin: Vector3, across: Vector3, along: Vector3, normal: Vector3, u: number, v: number, lift: number, w: number, t: number, l: number, yaw: number, color: number): void {
  mid.copy(origin).addScaledVector(across, u).addScaledVector(along, v).addScaledVector(normal, lift);
  // Basis: x = across, y = normal, z = along; then a small turn about the normal.
  m4.makeBasis(across, normal, along);
  q.setFromRotationMatrix(m4);
  if (yaw) {
    const turn = new Quaternion().setFromAxisAngle(normal, yaw);
    q.premultiply(turn);
  }
  m4.compose(mid, q, sc.set(w, t, l));
  batch.add(m4, color);
}

export interface LeanToBuild {
  group: Group;
}

/** Build everything the shelter (or its drainage channel) has so far. */
export function buildShelter(s: PlacedStructure): Group {
  const g = new Group();
  g.name = 'ShelterParts';
  const def = BLUEPRINTS[s.kind];
  const rng = mulberry32(s.id * 977 + 13);
  const jit = (amt: number) => (rng() - 0.5) * 2 * amt;
  const wood = () => WOOD[Math.floor(rng() * WOOD.length)];
  const poles = new Batch();
  const wraps = new Batch();
  const bark = new Batch();
  const leaves = new Batch();
  const grass = new Batch();

  if (s.kind === 'drainage') {
    const trench = new Batch();
    def.spots.forEach((sp, i) => {
      if (!s.spots[i]) return;
      const next = def.spots[i + 1] ?? def.spots[i];
      a.set(sp.x, 0.01, sp.z);
      b.set(next.x, 0.01, next.z);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.max(0.9, Math.hypot(dx, dz));
      mid.set(sp.x + dx * 0.1, 0.01, sp.z + dz * 0.1);
      q.setFromAxisAngle(UP, Math.atan2(dx || 1, dz));
      m4.compose(mid, q, sc.set(0.22, 0.05, len));
      trench.add(m4, 0x4a3626);
    });
    const tm = trench.mesh(stripGeo, lambert, 'DrainTrench');
    if (tm) g.add(tm);
    // Water in the channel (shown while it rains and the channel is complete: ShelterSystem toggles it).
    if (s.complete) {
      const w = new Mesh(new BoxGeometry(0.1, 0.02, 1), waterMat);
      w.name = 'DrainWater';
      w.visible = false;
      w.position.set(def.spots[1].x, 0.04, def.spots[1].z);
      w.scale.set(1, 1, 2.2);
      g.add(w);
    }
    void trenchMat;
    return g;
  }

  // ---- the frame
  const upright = (x: number, z: number) => {
    a.set(x + jit(0.02), 0, z + jit(0.02));
    b.set(x + jit(0.05), 1.38 + jit(0.03), z + jit(0.04));
    member(poles, a, b, 0.09 + jit(0.008), wood());
  };
  if (!s.keyOpen) upright(def.key.x, def.key.z);
  def.spots.forEach((sp, i) => {
    const filled = !!s.spots[i];
    switch (sp.role) {
      case 'upright':
        if (filled) upright(sp.x, sp.z);
        break;
      case 'ridge':
        if (filled) {
          a.set(-1.05 + jit(0.04), 1.34 + jit(0.02), 0.6 + jit(0.02));
          b.set(1.08 + jit(0.04), 1.34 + jit(0.03), 0.6 + jit(0.02));
          member(poles, a, b, 0.085, wood());
        }
        break;
      case 'rib':
        if (filled) {
          a.set(sp.x * 0.92 + jit(0.03), ROOF_FRONT.y - 0.04, ROOF_FRONT.z);
          b.set(sp.x * 1.1 + jit(0.06), ROOF_BACK.y, ROOF_BACK.z + jit(0.08));
          member(poles, a, b, 0.065 + jit(0.006), wood());
        }
        break;
      case 'cross':
        if (filled) {
          a.set(-1.0 + jit(0.05), ribY(sp.z) + 0.03, sp.z + jit(0.02));
          b.set(1.0 + jit(0.05), ribY(sp.z) + 0.03 + jit(0.02), sp.z + jit(0.02));
          member(poles, a, b, 0.052, wood());
        }
        break;
      case 'lattice':
        if (filled) {
          a.set(sp.x - 0.38, ribY(sp.z + 0.2) + 0.05, sp.z + 0.2);
          b.set(sp.x + 0.38, ribY(sp.z - 0.2) + 0.05, sp.z - 0.2);
          member(poles, a, b, 0.026, wood());
          a.x += 0.1;
          b.x -= 0.14;
          a.z -= 0.35;
          b.z += 0.3;
          a.y = ribY(a.z) + 0.05;
          b.y = ribY(b.z) + 0.05;
          member(poles, a, b, 0.022, wood());
        }
        break;
      default:
        break;
    }
    if (sp.role === 'lash') {
      const progress = filled ? 1 : (s.work?.[i] ?? 0);
      const turns = Math.ceil(progress * 7);
      for (let k = 0; k < turns; k++) {
        // Cord wraps stacked along the member: around the upright at the ridge, along the cross-support at the middle.
        const vertical = Math.abs(sp.x) > 0.5;
        mid.set(sp.x + (vertical ? 0 : (k - turns / 2) * 0.03), sp.y - (vertical ? k * 0.028 : 0), sp.z);
        q.setFromUnitVectors(new Vector3(0, 0, 1), vertical ? UP : new Vector3(1, 0, 0));
        m4.compose(mid, q, sc.set(0.07, 0.07, 0.07));
        wraps.add(m4, 0xe8dcc0);
      }
    }
  });

  // ---- the roof: each panel is a strip of the slope, with up to three layers on it
  const slope = new Vector3(0, ROOF_BACK.y - ROOF_FRONT.y, ROOF_BACK.z - ROOF_FRONT.z).normalize();
  const across = new Vector3(1, 0, 0);
  const normal = new Vector3().crossVectors(slope, across).normalize(); // up from the roof plane
  if (normal.y < 0) normal.negate();
  const slopeLen = Math.hypot(ROOF_BACK.y - ROOF_FRONT.y, ROOF_BACK.z - ROOF_FRONT.z);
  for (let p = 0; p < PANELS; p++) {
    const origin = new Vector3((p - 1) * 0.62, 0, 0).add(new Vector3(0, ROOF_FRONT.y, ROOF_FRONT.z)).addScaledVector(slope, slopeLen * 0.5);
    const hasRole = (role: string) => def.spots.some((sp, i) => sp.panel === p && sp.role === role && s.spots[i]);
    if (hasRole('roofBark')) {
      // Strips of bark side by side, each a little different in width and tone.
      for (let k = 0; k < 4; k++) {
        const u = -0.24 + k * 0.16 + jit(0.01);
        layerPiece(bark, origin, across, slope, normal, u, jit(0.03), 0.05, 0.15 + jit(0.015), 0.022, slopeLen * (0.94 + jit(0.03)), jit(0.03), BARK[Math.floor(rng() * BARK.length)]);
      }
    }
    if (hasRole('roofLeaf')) {
      // Overlapping shingles, upper rows over lower ones, like tiles.
      for (let row = 0; row < 7; row++) {
        for (let k = 0; k < 3; k++) {
          const v = (row / 6 - 0.5) * slopeLen * 0.88;
          layerPiece(leaves, origin, across, slope, normal, -0.2 + k * 0.2 + jit(0.03), v + jit(0.03), 0.085 + row * 0.002, 0.22, 0.012, 0.42, jit(0.35), LEAF[Math.floor(rng() * LEAF.length)]);
        }
      }
    }
    if (hasRole('roofGrass')) {
      // A thatch of dry grass: many thin blades laid down the slope, some hanging over the low edge.
      for (let k = 0; k < 22; k++) {
        const u = -0.3 + rng() * 0.6;
        const v = (rng() - 0.5) * slopeLen * 0.9;
        layerPiece(grass, origin, across, slope, normal, u, v, 0.12 + rng() * 0.02, 0.025, 0.02, 0.5 + rng() * 0.25, jit(0.5), GRASS[Math.floor(rng() * GRASS.length)]);
      }
    }
  }

  // ---- a bed of dry leaves on the floor once the roof is whole (the interior is somewhere to rest)
  if (s.complete) {
    const bed = new Mesh(new CircleGeometry(0.55, 14), bedMat);
    bed.name = 'ShelterBed';
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0.1, 0.02, 0.1);
    bed.scale.set(1, 1.5, 1);
    g.add(bed);
  }

  const add = (im: InstancedMesh | null) => im && g.add(im);
  add(poles.mesh(memberGeo, lambert, 'ShelterFrame'));
  add(wraps.mesh(wrapGeo as unknown as CylinderGeometry, wrapMat, 'ShelterLashings'));
  add(bark.mesh(stripGeo, lambert, 'ShelterRoofBark'));
  add(leaves.mesh(stripGeo, lambert, 'ShelterRoofLeaf'));
  add(grass.mesh(stripGeo, lambert, 'ShelterRoofGrass'));
  return g;
}
