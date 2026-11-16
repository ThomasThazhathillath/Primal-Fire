import { Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { RowThumbs } from '../src/systems/row-thumbs.js';

vi.mock('../src/systems/hint-images.js', () => ({ sharedImages: () => ({ thumb: () => null }) }));

describe('row pictures', () => {
  it('clear() hides every picture and forgets the rows, so nothing floats over another view', () => {
    const panel = Object.assign(new Object3D(), { requireElementById: () => ({}) });
    const t = new RowThumbs(panel as never, {} as never, 5);
    const priv = t as unknown as { mesh: (i: number) => Object3D; rows: unknown[] };
    for (let i = 0; i < 3; i++) priv.mesh(i).visible = true;
    t.setRows([{ el: 'rec-0', pic: { key: 'k', view: { pieces: [], caption: '' } } }]);
    t.clear();
    expect(panel.children.filter((c) => c.visible)).toHaveLength(0);
    expect(priv.rows).toHaveLength(0);
    t.update();
    expect(panel.children.filter((c) => c.visible)).toHaveLength(0);
  });
});
