// Small pictures beside the names in list panels (bag rows, recipe rows, build
// book rows): the same real in-game meshes the hint panel draws, rendered once
// into small cached textures. A pool of flat planes rides on the panel, placed
// from each row's real layout, so nothing is measured by hand. A row with no
// picture simply shows none.

import { type Mesh, Mesh as MeshCtor, MeshBasicMaterial, PlaneGeometry, type Texture, type UIKitMLAsset } from '@iwsdk/core';
import type { HintView } from '../game/hint-info.js';
import type { ItemId } from '../game/items.js';
import { sharedImages } from './hint-images.js';
import type { WebGLRenderer } from '@iwsdk/core';

/** A picture a row could show: one item, or a ready-made view (a workbench). */
export type RowPicture = { key: string; view: HintView } | null;

export const itemPicture = (id: ItemId): RowPicture => ({ key: `item:${id}`, view: { pieces: [{ kind: 'item', id, x: 0, z: 0 }], caption: '' } });

const geo = new PlaneGeometry(0.5, 0.375);

export class RowThumbs {
  private meshes: Mesh[] = [];
  private mats: MeshBasicMaterial[] = [];
  private rows: Array<{ el: string; pic: RowPicture }> = [];

  constructor(
    private panel: UIKitMLAsset,
    private renderer: WebGLRenderer,
    private max: number,
  ) {}

  /** Which row element shows which picture (replaces the previous set). */
  setRows(rows: Array<{ el: string; pic: RowPicture }>): void {
    this.rows = rows;
    this.update();
  }

  /** Re-place each picture on its row (call a few times a second while the panel is open). */
  update(): void {
    let used = 0;
    for (const r of this.rows) {
      if (used >= this.max || !r.pic) continue;
      const el = this.panel.requireElementById(r.el);
      const size = el.size?.peek?.();
      const gm = el.globalMatrix?.peek?.();
      if (!size || !gm || size[1] < 1) continue;
      const tex: Texture | null = sharedImages(this.renderer).thumb(r.pic.key, r.pic.view);
      if (!tex) continue; // nothing drawable: no broken image, just no picture
      const m = this.mesh(used++);
      const mat = this.mats[used - 1];
      if (mat.map !== tex) {
        mat.map = tex;
        mat.needsUpdate = true;
      }
      const e = gm.elements;
      m.position.set(e[12] - (size[0] / 2) * 0.01 + 0.36, e[13], 0.03);
      m.visible = true;
    }
    for (let i = used; i < this.meshes.length; i++) this.meshes[i].visible = false;
  }

  private mesh(i: number): Mesh {
    while (this.meshes.length <= i) {
      const mat = new MeshBasicMaterial({ toneMapped: false });
      const m = new MeshCtor(geo, mat);
      m.visible = false;
      this.panel.add(m);
      this.meshes.push(m);
      this.mats.push(mat);
    }
    return this.meshes[i];
  }
}
