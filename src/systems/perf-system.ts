// Quest performance: stops three.js recomputing matrices for scenery that
// never moves. Every frame three.js walks the whole scene and, for each
// object with matrixAutoUpdate, rebuilds its local matrix and multiplies it
// into the world matrix; with ~3500 objects that was the largest source of
// per-frame allocation and a measurable share of CPU. The forest, rocks,
// ruins and resource-spot meshes are placed once, so after the world has
// settled their matrices are frozen. Anything dynamic (the player's things,
// panels, structures, drops) keeps updating. `window.__perf.unfreeze()` undoes it.

import { createSystem, type Object3D } from '@iwsdk/core';

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
/** Seconds after start before freezing (the level and resource spots are built by then). */
const FREEZE_AFTER = 4;

export class PerfSystem extends createSystem({}) {
  private t = 0;
  private frozen: Object3D[] = [];
  private done = false;

  init(): void {
    (window as unknown as { __perf?: unknown }).__perf = {
      unfreeze: () => this.unfreeze(),
      frozen: () => this.frozen.length,
    };
  }

  update(delta: number): void {
    if (this.done) return;
    if ((this.t += delta) < FREEZE_AFTER) return;
    this.done = true;
    const root = this.scene.getObjectByName('LevelRoot');
    if (!root) return;
    root.updateMatrixWorld(true);
    for (const c of root.children) {
      if (STATIC_ROOTS.has(c.name) || c.name.startsWith('Resource_')) c.traverse((o) => this.freeze(o));
    }
    this.freeze(root);
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
