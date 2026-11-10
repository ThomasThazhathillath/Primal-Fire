// Quest performance: stops three.js recomputing matrices for scenery that
// never moves. Every frame three.js walks the whole scene and, for each
// object with matrixAutoUpdate, rebuilds its local matrix and multiplies it
// into the world matrix; with ~3500 objects that was the largest source of
// per-frame allocation and a measurable share of CPU. The forest, rocks,
// ruins and resource-spot meshes are placed once, so after the world has
// settled their matrices are frozen. Anything dynamic (the player's things,
// panels, structures, drops) keeps updating. `window.__perf.unfreeze()` undoes it.

import { CanvasTexture, Color, createSystem, InstancedMesh, Matrix4, type Object3D, Quaternion, RayInteractable, Sprite, SpriteMaterial, Vector3, VisibilityState } from '@iwsdk/core';
import { Gatherable } from '../components/game-components.js';
import { PerfStats } from '../game/perf-stats.js';

/** Frame statistics shared by the probe, the overlay and `window.__perf.sample()`. */
export const perfStats = new PerfStats(900);
const probe = { start: 0, lastStart: 0, cpu: 0, calls: 0, triangles: 0 };

/**
 * Runs first every frame (registered at a very low priority): marks the start of the page's frame work.
 * The scene's onAfterRender (installed by PerfSystem) marks the end, so CPU = systems + render submission.
 */
export class PerfProbeSystem extends createSystem({}) {
  update(): void {
    const now = performance.now();
    if (probe.lastStart > 0 && probe.cpu > 0) perfStats.push(now - probe.lastStart, probe.cpu);
    probe.lastStart = now;
    probe.start = now;
    probe.cpu = 0;
  }
}


/** Level-root children that never move. */
const STATIC_ROOTS = new Set([
  'Forest Ground',
  'Stream',
  'Forest Trees',
  'Ground Detail',
  'Mountain Ring',
  'Undergrowth',
  'Lightning Glade Tree',
  'The Ruins',
  'Split Rock',
]);
/** Instanced scenery split into spatial chunks so what is behind you is frustum-culled (one bounding sphere per chunk). */
const CHUNK_ROOTS = new Set(['Forest Trees', 'Ground Detail', 'Undergrowth']);
/** Chunk size (m) and the smallest instanced mesh worth splitting. */
const CHUNK = 31;
/** Only meshes drawing at least this many triangles are split: small ones cost more in draw calls than they save. */
const CHUNK_MIN_TRIS = 15000;
/** Resource spots keep their pointer target (raycast every frame by IWSDK's InputSystem) only within this range (m). */
const RAY_RANGE = 7.5;

/** Splits an instanced mesh into one instanced mesh per CHUNK x CHUNK cell (same geometry and material). */
export function chunkInstanced(mesh: InstancedMesh): InstancedMesh[] {
  const m = new Matrix4();
  const col = new Color();
  const cells = new Map<string, number[]>();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    const k = `${Math.floor(m.elements[12] / CHUNK)},${Math.floor(m.elements[14] / CHUNK)}`;
    let l = cells.get(k);
    if (!l) cells.set(k, (l = []));
    l.push(i);
  }
  if (cells.size < 2) return [mesh];
  const out: InstancedMesh[] = [];
  for (const list of cells.values()) {
    const c = new InstancedMesh(mesh.geometry, mesh.material, list.length);
    c.name = `${mesh.name || 'instanced'}#chunk`;
    c.castShadow = mesh.castShadow;
    c.receiveShadow = mesh.receiveShadow;
    c.renderOrder = mesh.renderOrder;
    c.position.copy(mesh.position);
    c.quaternion.copy(mesh.quaternion);
    c.scale.copy(mesh.scale);
    list.forEach((src, j) => {
      mesh.getMatrixAt(src, m);
      c.setMatrixAt(j, m);
      if (mesh.instanceColor) {
        mesh.getColorAt(src, col);
        c.setColorAt(j, col);
      }
    });
    c.instanceMatrix.needsUpdate = true;
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
    c.computeBoundingSphere();
    out.push(c);
  }
  return out;
}

/** Seconds after start before freezing (the level and resource spots are built by then). */
const FREEZE_AFTER = 4;

export class PerfSystem extends createSystem({
  spots: { required: [Gatherable] },
}) {
  private rayIn = 0;
  private head = new Vector3();
  private spotPos = new Vector3();
  /** Instanced meshes split / chunks made (for the report). */
  chunked = { from: 0, to: 0 };
  private t = 0;
  private frozen: Object3D[] = [];
  private done = false;

  private overlay: Sprite | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  private overlayTex: CanvasTexture | null = null;
  private overlayIn = 0;
  private tmpV = new Vector3();
  private tmpQ = new Quaternion();
  private fwd = new Vector3();

  init(): void {
    const info = this.renderer.info;
    this.scene.onAfterRender = () => {
      probe.cpu = performance.now() - probe.start;
      probe.calls = info.render.calls;
      probe.triangles = info.render.triangles;
    };
    // Dev-only overlay: `?perf` in the URL, or window.__perf.overlay(true). Never on for players by default.
    if (/[?&]perf(=1|=true)?(&|$)/.test(location.search)) this.setOverlay(true);
    (window as unknown as { __perf?: unknown }).__perf = {
      unfreeze: () => this.unfreeze(),
      frozen: () => this.frozen.length,
      chunked: () => ({ ...this.chunked }),
      overlay: (on = true) => this.setOverlay(on),
      reset: () => perfStats.reset(),
      /** Summary of the frames recorded since the last reset (used by the playtest report). */
      sample: () => this.summary(),
    };
  }

  private summary() {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const s = this.world.session as (XRSession & { frameRate?: number }) | undefined;
    return {
      frames: perfStats.count,
      fps: +perfStats.fps().toFixed(1),
      frameMs: +perfStats.frameMs().toFixed(2),
      frameP95: +perfStats.percentile(0.95).toFixed(2),
      frameP99: +perfStats.percentile(0.99).toFixed(2),
      worstMs: +perfStats.worst.toFixed(1),
      spikes: perfStats.spikes,
      withinBudget90: +perfStats.withinBudget().toFixed(3),
      cpuMs: +perfStats.cpuMs().toFixed(2),
      cpuP95: +perfStats.percentile(0.95, true).toFixed(2),
      drawCalls: probe.calls,
      triangles: probe.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      programs: this.renderer.info.programs?.length ?? 0,
      heapMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : null,
      xr: this.world.visibilityState.peek() !== VisibilityState.NonImmersive,
      displayHz: s?.frameRate ?? null,
      supportedHz: s && (s as unknown as { supportedFrameRates?: Float32Array }).supportedFrameRates ? Array.from((s as unknown as { supportedFrameRates: Float32Array }).supportedFrameRates) : null,
    };
  }

  private setOverlay(on: boolean): void {
    if (on && !this.overlay) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 128;
      this.overlayCtx = c.getContext('2d');
      this.overlayTex = new CanvasTexture(c);
      this.overlay = new Sprite(new SpriteMaterial({ map: this.overlayTex, depthTest: false, depthWrite: false, transparent: true }));
      this.overlay.name = 'PerfOverlay';
      this.overlay.scale.set(0.16, 0.08, 1);
      this.overlay.renderOrder = 99;
      this.overlay.frustumCulled = false;
      this.world.createTransformEntity(this.overlay);
    }
    if (this.overlay) this.overlay.visible = on;
  }

  private drawOverlay(): void {
    const c = this.overlayCtx;
    if (!c || !this.overlayTex) return;
    const s = this.world.session as (XRSession & { frameRate?: number }) | undefined;
    c.clearRect(0, 0, 256, 128);
    c.fillStyle = 'rgba(0,0,0,0.65)';
    c.fillRect(0, 0, 256, 128);
    c.font = 'bold 18px monospace';
    const fps = perfStats.fps(90);
    c.fillStyle = fps >= 88 ? '#7dff9a' : fps >= 70 ? '#ffd76a' : '#ff7a6a';
    c.fillText(`FPS ${fps.toFixed(0)}  avg ${perfStats.fps().toFixed(0)}`, 8, 22);
    c.fillStyle = '#ffffff';
    c.fillText(`CPU ${perfStats.cpuMs(90).toFixed(1)}ms  GPU n/a`, 8, 46);
    c.fillText(`spikes ${perfStats.spikes}  worst ${perfStats.worst.toFixed(0)}ms`, 8, 70);
    c.fillText(`draws ${probe.calls}  tris ${(probe.triangles / 1000).toFixed(0)}k`, 8, 94);
    c.fillText(`Hz ${s?.frameRate ?? '-'}`, 8, 118);
    this.overlayTex.needsUpdate = true;
  }

  update(delta: number): void {
    if (this.overlay?.visible) {
      // Hangs low in front of the head; redrawn twice a second (no per-frame canvas work).
      this.camera.getWorldPosition(this.tmpV);
      this.camera.getWorldQuaternion(this.tmpQ);
      this.fwd.set(0.12, -0.14, -0.5).applyQuaternion(this.tmpQ);
      this.overlay.position.copy(this.tmpV).add(this.fwd);
      if ((this.overlayIn -= delta) <= 0) {
        this.overlayIn = 0.5;
        this.drawOverlay();
      }
    }
    if ((this.rayIn -= delta) <= 0) {
      this.rayIn = 0.5;
      this.cullRays();
    }
    if (this.done) return;
    if ((this.t += delta) < FREEZE_AFTER) return;
    this.done = true;
    const root = this.scene.getObjectByName('LevelRoot');
    if (!root) return;
    root.updateMatrixWorld(true);
    for (const c of root.children) if (CHUNK_ROOTS.has(c.name)) this.chunk(c);
    for (const c of root.children) {
      if (STATIC_ROOTS.has(c.name) || c.name.startsWith('Resource_')) c.traverse((o) => this.freeze(o));
    }
    this.freeze(root);
  }

  /** Replace each big instanced mesh under `root` by spatial chunks. */
  private chunk(root: Object3D): void {
    const found: InstancedMesh[] = [];
    root.traverse((o) => {
      const im = o as InstancedMesh;
      if (!im.isInstancedMesh) return;
      const per = (im.geometry.index ? im.geometry.index.count : im.geometry.attributes.position.count) / 3;
      if (per * im.count >= CHUNK_MIN_TRIS) found.push(im);
    });
    for (const mesh of found) {
      const parts = chunkInstanced(mesh);
      if (parts.length < 2 || !mesh.parent) continue;
      const parent = mesh.parent;
      for (const p of parts) parent.add(p);
      parent.remove(mesh);
      this.chunked.from++;
      this.chunked.to += parts.length;
    }
  }

  /**
   * IWSDK raycasts every RayInteractable each frame. Resource spots out of reach cannot be gathered anyway, so
   * only those near you keep the component (checked twice a second, with a little hysteresis).
   */
  private cullRays(): void {
    this.camera.getWorldPosition(this.head);
    for (const e of this.queries.spots.entities) {
      const o = e.object3D;
      if (!o) continue;
      o.getWorldPosition(this.spotPos);
      const d = Math.hypot(this.spotPos.x - this.head.x, this.spotPos.z - this.head.z);
      const has = e.hasComponent(RayInteractable);
      if (has && d > RAY_RANGE + 0.5) e.removeComponent(RayInteractable);
      else if (!has && d < RAY_RANGE) e.addComponent(RayInteractable);
    }
  }

  private freeze(o: Object3D): void {
    if (!o.matrixAutoUpdate) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
    this.frozen.push(o);
  }

  private unfreeze(): void {
    for (const o of this.frozen) o.matrixAutoUpdate = true;
    this.frozen.length = 0;
  }
}
