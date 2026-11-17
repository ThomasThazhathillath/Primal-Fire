// Sky beacons (Hint = Find, game/find.ts): choose an item on the Find card and every spot of it on the map that still
// has some, plus any you dropped, gets a tall beam of light up into the sky (like a beacon in a block-building game)
// with a wider soft glow round it, and a glowing ring on the ground, so you can see where to go from anywhere. Beams
// ignore fog so they show through the mist, and draw before the cards so they never cover one. Cores, glows and rings
// are one instanced mesh each (three draw calls however many beacons); spots are re-read twice a second, so a spot
// you empty loses its beacon and one that grows back gets it again.

import {
  AdditiveBlending,
  CanvasTexture,
  createSystem,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  RingGeometry,
} from '@iwsdk/core';
import { MAX_BEACONS, nearestFirst } from '../game/find.js';
import type { ItemId } from '../game/items.js';
import { groundHeight } from '../game/world-layout.js';
import { ResourceSystem } from './resource-system.js';
import { getGame, getUi } from './shared.js';

/** Beam height (m): far taller than the trees, so it shows over the canopy. */
const BEAM_HEIGHT = 70;
const BEAM_RADIUS = 0.3;
const BEAM_COLOR = 0x7fe6ff;
/** The soft glow round each beam, as a multiple of its radius. */
const GLOW_SCALE = 3.2;
/** Seconds between re-reading which spots still have the item. */
const REFRESH_SECONDS = 0.5;

/** Bright at the foot, fading out toward the top. */
function fadeTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  // Canvas top = the beam's top (texture v = 1).
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.92, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  return new CanvasTexture(c);
}

export class BeaconSystem extends createSystem({}) {
  private beams!: InstancedMesh;
  private glows!: InstancedMesh;
  private rings!: InstancedMesh;
  private beamMat!: MeshBasicMaterial;
  private glowMat!: MeshBasicMaterial;
  private ringMat!: MeshBasicMaterial;
  private item: ItemId | null = null;
  private count = 0;
  private t = 0;
  private refreshT = 0;
  private m = new Matrix4();
  private glowM = new Matrix4().makeScale(GLOW_SCALE, 1, GLOW_SCALE);

  init(): void {
    const beamGeo = new CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEAM_HEIGHT, 12, 1, true);
    beamGeo.translate(0, BEAM_HEIGHT / 2, 0);
    this.beamMat = new MeshBasicMaterial({
      color: BEAM_COLOR,
      map: fadeTexture(),
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
      toneMapped: false,
    });
    this.beams = new InstancedMesh(beamGeo, this.beamMat, MAX_BEACONS);
    this.glowMat = this.beamMat.clone();
    this.glowMat.opacity = 0.22;
    this.glows = new InstancedMesh(beamGeo, this.glowMat, MAX_BEACONS);
    this.ringMat = new MeshBasicMaterial({
      color: BEAM_COLOR,
      transparent: true,
      opacity: 0.75,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    this.rings = new InstancedMesh(new RingGeometry(0.35, 0.55, 32).rotateX(-Math.PI / 2), this.ringMat, MAX_BEACONS);
    for (const mesh of [this.beams, this.glows, this.rings]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      // Instances spread over the whole map: the mesh's own bounds would cull them wrongly.
      mesh.frustumCulled = false;
      // Before the cards and panels (transparent too, drawn later): a beam behind a card never shows over it.
      mesh.renderOrder = -1;
    }
    this.beams.name = 'FindBeacons';
    this.rings.name = 'FindBeaconRings';
    const root = new Group();
    root.name = 'FindBeaconRoot';
    root.add(this.glows, this.beams, this.rings);
    root.visible = false;
    this.world.createTransformEntity(root);

    const ui = getUi(this.world);
    ui.findItem = (item) => this.show(item);
    ui.findClear = () => this.clear();
    ui.findShowing = () => this.item;
    (window as unknown as { __beacon?: unknown }).__beacon = {
      show: (item: ItemId) => this.show(item),
      clear: () => this.clear(),
      state: () => ({ item: this.item, count: this.count }),
    };
  }

  /** Beacons on every spot of `item`; returns how many there are now. */
  show(item: ItemId): number {
    this.item = item;
    this.refreshT = 0;
    this.refresh();
    getGame(this.world).log.add(`find: ${item}, ${this.count} beacons`);
    return this.count;
  }

  clear(): void {
    this.item = null;
    this.count = 0;
    this.beams.count = 0;
    this.glows.count = 0;
    this.rings.count = 0;
    this.beams.parent!.visible = false;
  }

  /** Where the item is now: spots with some left, and your own drops of it (nearest first, capped). */
  private refresh(): void {
    const item = this.item;
    if (!item) return;
    const g = getGame(this.world);
    const points: Array<{ x: number; z: number }> = this.world.getSystem(ResourceSystem)?.liveSpots([item]) ?? [];
    for (const d of g.drops) if (d.item === item) points.push({ x: d.x, z: d.z });
    const near = nearestFirst(points, g.player.x, g.player.z);
    for (let i = 0; i < near.length; i++) {
      const p = near[i];
      const y = groundHeight(p.x, p.z);
      this.m.makeTranslation(p.x, y, p.z);
      this.beams.setMatrixAt(i, this.m);
      this.glowM.setPosition(p.x, y, p.z);
      this.glows.setMatrixAt(i, this.glowM);
      this.m.makeTranslation(p.x, y + 0.05, p.z);
      this.rings.setMatrixAt(i, this.m);
    }
    this.count = near.length;
    this.beams.count = this.count;
    this.glows.count = this.count;
    this.rings.count = this.count;
    this.beams.instanceMatrix.needsUpdate = true;
    this.glows.instanceMatrix.needsUpdate = true;
    this.rings.instanceMatrix.needsUpdate = true;
    this.beams.parent!.visible = this.count > 0;
  }

  update(delta: number): void {
    if (!this.item) return;
    // A slow shimmer, so the beams read as light, not as poles.
    this.t += delta;
    this.beamMat.opacity = 0.75 + 0.15 * Math.sin(this.t * 2.4);
    this.glowMat.opacity = 0.2 + 0.08 * Math.sin(this.t * 2.4 + 1);
    this.ringMat.opacity = 0.55 + 0.25 * Math.sin(this.t * 3.1);
    if ((this.refreshT += delta) >= REFRESH_SECONDS) {
      this.refreshT = 0;
      this.refresh();
    }
  }
}
