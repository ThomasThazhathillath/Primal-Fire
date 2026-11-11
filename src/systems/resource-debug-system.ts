// Developer view of the resource layout, only when the page URL has ?resdebug. Draws one marker per
// gather spot (coloured by item, dimmed when used up), the interaction hit sphere of spots you can
// currently reach, and a ring round each habitat cluster, plus a small text panel with the counts.
// Instanced, so it costs three draw calls plus the rings. Never created in a normal session.

import {
  BufferGeometry,
  Color,
  ConeGeometry,
  createSystem,
  DynamicDrawUsage,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { Gatherable } from '../components/game-components.js';
import { CLUSTERS, groundHeight, RESOURCES } from '../game/world-layout.js';
import { getGame } from './shared.js';

export const resDebugEnabled = (search = typeof location === 'undefined' ? '' : location.search): boolean => /[?&]resdebug(=1|=true)?(&|$)/.test(search);

const COLORS: Record<string, number> = {
  flint: 0xff3b30,
  dryStone: 0xcfcfcf,
  wetStone: 0x6aa7ff,
  twigs: 0x9a6b3f,
  dryBranch: 0x7a4b25,
  bark: 0x8a5a2b,
  clay: 0xd9824a,
  sand: 0xf2e08a,
  gravel: 0x9aa0a6,
  fibers: 0x5fd36a,
  vine: 0x2f9e44,
};

export class ResourceDebugSystem extends createSystem({ spots: { required: [Gatherable] } }) {
  private markers!: InstancedMesh;
  private hits!: InstancedMesh;
  private panel!: HTMLDivElement;
  private t = 0;
  private dummy = new Object3D();
  private col = new Color();
  private head = new Vector3();

  init(): void {
    if (!resDebugEnabled()) return;
    const n = RESOURCES.length;
    this.markers = new InstancedMesh(new ConeGeometry(0.08, 0.35, 5), new MeshBasicMaterial({ color: 0xffffff }), n);
    this.markers.instanceMatrix.setUsage(DynamicDrawUsage);
    this.markers.frustumCulled = false;
    this.hits = new InstancedMesh(new SphereGeometry(0.55, 8, 6), new MeshBasicMaterial({ color: 0x00ffaa, wireframe: true, transparent: true, opacity: 0.35 }), n);
    this.hits.instanceMatrix.setUsage(DynamicDrawUsage);
    this.hits.frustumCulled = false;
    this.scene.add(this.markers, this.hits);
    RESOURCES.forEach((r, i) => {
      this.dummy.position.set(r.x, groundHeight(r.x, r.z) + 1.0, r.z);
      this.dummy.rotation.set(Math.PI, 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.markers.setMatrixAt(i, this.dummy.matrix);
      this.markers.setColorAt(i, this.col.setHex(COLORS[r.itemId] ?? 0xffffff));
    });
    for (const c of CLUSTERS) {
      const pts: Vector3[] = [];
      for (let k = 0; k <= 32; k++) pts.push(new Vector3(c.x + Math.cos((k / 32) * Math.PI * 2) * (c.r + 0.4), groundHeight(c.x, c.z) + 0.15, c.z + Math.sin((k / 32) * Math.PI * 2) * (c.r + 0.4)));
      const line = new Line(new BufferGeometry().setFromPoints(pts), new LineBasicMaterial({ color: c.kind === 'rocky' ? 0xff9500 : c.kind === 'fallen' ? 0x34c759 : 0x32ade6 }));
      line.name = `ClusterRing_${c.id}`;
      line.frustumCulled = false;
      this.scene.add(line);
    }
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;left:8px;top:8px;z-index:20;background:#000a;color:#9fe;font:11px monospace;padding:6px 8px;border-radius:4px;white-space:pre;pointer-events:none';
    document.body.appendChild(panel);
    this.panel = panel;
    this.cleanupFuncs.push(() => panel.remove());
    (window as unknown as { __resdebug: () => unknown }).__resdebug = () => this.stats();
  }

  /** Counts for the panel and for tests/scripts. */
  stats(): { total: number; active: number; byItem: Record<string, number>; clusters: Array<{ id: string; kind: string; counts: unknown }> } {
    const byItem: Record<string, number> = {};
    let active = 0;
    for (const e of this.queries.spots.entities) {
      if ((e.getValue(Gatherable, 'charges') ?? 0) <= 0) continue;
      active++;
      const spot = RESOURCES.find((r) => r.id === e.getValue(Gatherable, 'spotId'));
      if (spot) byItem[spot.itemId] = (byItem[spot.itemId] ?? 0) + 1;
    }
    return { total: RESOURCES.length, active, byItem, clusters: CLUSTERS.map((c) => ({ id: c.id, kind: c.kind, counts: c.counts })) };
  }

  update(delta: number): void {
    if (!this.markers) return;
    if ((this.t -= delta) > 0) return;
    this.t = 0.5;
    this.camera.getWorldPosition(this.head);
    const bySpot = new Map<string, number>();
    for (const e of this.queries.spots.entities) bySpot.set(e.getValue(Gatherable, 'spotId') ?? '', e.getValue(Gatherable, 'charges') ?? 0);
    let reachable = 0;
    RESOURCES.forEach((r, i) => {
      const live = (bySpot.get(r.id) ?? 0) > 0;
      this.dummy.position.set(r.x, groundHeight(r.x, r.z) + 1.0, r.z);
      this.dummy.rotation.set(Math.PI, 0, 0);
      this.dummy.scale.setScalar(live ? 1 : 0.0001);
      this.dummy.updateMatrix();
      this.markers.setMatrixAt(i, this.dummy.matrix);
      const near = live && Math.hypot(r.x - this.head.x, r.z - this.head.z) < 7.5;
      if (near) reachable++;
      this.dummy.position.y = groundHeight(r.x, r.z) + 0.45;
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(near ? 1 : 0.0001);
      this.dummy.updateMatrix();
      this.hits.setMatrixAt(i, this.dummy.matrix);
    });
    this.markers.instanceMatrix.needsUpdate = true;
    this.hits.instanceMatrix.needsUpdate = true;
    if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
    const st = this.stats();
    const g = getGame(this.world);
    this.panel.textContent = `RESDEBUG  spots ${st.total}  live ${st.active}  in ray range ${reachable}\n` + Object.entries(st.byItem).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  ') + `\nclusters ${st.clusters.length}  used ${g.spotState.size}`;
  }
}
