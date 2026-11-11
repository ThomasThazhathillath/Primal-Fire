import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { allTrees, CULL_COS, LOD_DISTANCE, lodFor, TREE_VARIANTS, understory, variantOf, worthDrawing } from '../src/game/tree-lod.js';
import { inClearing, streamDistance, TREES } from '../src/game/world-layout.js';

describe('tree placement stays the game data', () => {
  it('every game tree appears once, at its TREES position, ahead of the understory', () => {
    const all = allTrees();
    TREES.forEach((t, i) => {
      expect(all[i].tree).toBe(i);
      expect(all[i].x).toBe(t.x);
      expect(all[i].z).toBe(t.z);
    });
    expect(all.length).toBe(TREES.length + understory().length);
  });
  it('kinds map to the baked variants, every variant is used', () => {
    expect(variantOf(0, 2)).toBe('pine');
    expect(variantOf(2, 0)).toBe('snag');
    expect(new Set(allTrees().map((t) => t.variant))).toEqual(new Set(TREE_VARIANTS));
  });
  it('the understory is deterministic and keeps out of the clearing and the water', () => {
    expect(understory().map((t) => t.x)).toEqual(understory().map((t) => t.x));
    for (const t of understory()) {
      expect(inClearing(t.x, t.z, 0.5)).toBe(false);
      expect(streamDistance(t.x, t.z)).toBeGreaterThan(1.4);
    }
  });
});

describe('level of detail', () => {
  const at = (d: number) => d * d;
  it('steps down with distance', () => {
    expect(lodFor(at(2), null)).toBe(0);
    expect(lodFor(at(LOD_DISTANCE[0] + 3), null)).toBe(1);
    expect(lodFor(at(LOD_DISTANCE[1] + 3), null)).toBe(2);
    expect(lodFor(at(LOD_DISTANCE[2] + 3), null)).toBe(3);
  });
  it('does not flicker at a boundary (hysteresis)', () => {
    const edge = LOD_DISTANCE[0];
    expect(lodFor(at(edge + 1), 0)).toBe(0);
    expect(lodFor(at(edge + 1), 1)).toBe(1);
    expect(lodFor(at(edge - 1), 1)).toBe(1);
    expect(lodFor(at(edge - 3), 1)).toBe(0);
  });
  it('skips trees behind you, but never close ones', () => {
    expect(worthDrawing(30, 1)).toBe(true);
    expect(worthDrawing(30, CULL_COS - 0.1)).toBe(false);
    expect(worthDrawing(3, -1)).toBe(true);
  });
});

describe('baked GLBs', () => {
  it.each(TREE_VARIANTS)('%s has three detail levels inside the triangle budget and alpha-tested leaves', async (v) => {
    const doc = await new NodeIO().read(new URL(`../public/trees/${v}.glb`, import.meta.url).pathname);
    const tris: Record<string, number> = {};
    for (const m of doc.getRoot().listMeshes()) tris[m.getName()] = m.listPrimitives().reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
    const lod = (i: number) => (tris[`Trunk_LOD${i}`] ?? 0) + (tris[`Leaves_LOD${i}`] ?? 0);
    expect(lod(0)).toBeGreaterThan(lod(1));
    expect(lod(1)).toBeGreaterThan(lod(2));
    expect(lod(0)).toBeLessThanOrEqual(9000);
    expect(lod(1)).toBeLessThanOrEqual(1500);
    expect(lod(2)).toBeLessThanOrEqual(500);
    for (const mat of doc.getRoot().listMaterials()) if (mat.getName().endsWith('leaf')) expect(mat.getAlphaMode()).toBe('MASK');
  });
});
