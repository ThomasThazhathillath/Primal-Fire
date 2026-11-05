// Reference pictures for the hint panel, rendered from the game's own item and
// resource meshes (never stock art): a small neutral scene, framed to fit the
// pieces, drawn once into a render target and cached. Anything that has no
// mesh is skipped, so a missing picture is simply not shown.

import {
  AmbientLight,
  Box3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Sphere,
  type Texture,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from '@iwsdk/core';
import type { HintPiece, HintView } from '../game/hint-info.js';
import type { ItemId } from '../game/items.js';
import type { ResourceLook } from '../game/world-layout.js';
import { itemMesh, resourceMesh } from '../scene-assets/item-meshes.js';
import { createRuins } from '../scene-assets/landmarks.scene-asset.js';

export const PIC_W = 512;
export const PIC_H = 384;

const BACKGROUND = 0xd9d3c6;
const FLOOR = 0xbdb6a6;

/** Recolour every material of a clone (so a tinted copy does not change the shared one). */
function tinted(o: Object3D, hex: number): Object3D {
  o.traverse((c) => {
    const m = c as Mesh;
    if (!m.isMesh) return;
    const mat = (m.material as MeshLambertMaterial).clone();
    mat.color.setHex(hex);
    m.material = mat;
  });
  return o;
}

function build(p: HintPiece): Object3D | null {
  try {
    if (p.kind === 'trunk') {
      const g = new Group();
      const trunk = new Mesh(new CylinderGeometry(0.12, 0.14, 1.2, 12), new MeshLambertMaterial({ color: 0x3a2f27 }));
      trunk.position.y = 0.6;
      g.add(trunk);
      // Curls of bark peeling off the trunk face (the real bark item mesh, standing against the trunk).
      for (const [y, a] of [[0.75, 0.15], [0.4, -0.45], [0.2, 0.7]] as const) {
        const b = itemMesh('bark');
        b.scale.set(1, 1, 1);
        b.rotation.set(0, a, Math.PI / 2);
        b.position.set(Math.cos(a) * 0.14, y, -Math.sin(a) * 0.14);
        g.add(b);
      }
      return g;
    }
    if (p.kind === 'landmark') return createRuins();
    const o = p.kind === 'item' ? itemMesh(p.id as ItemId) : resourceMesh(p.id as ResourceLook);
    if (p.tint !== undefined) tinted(o, p.tint);
    if (p.kind === 'item' && p.scale) o.scale.set(...p.scale);
    o.position.set(p.x, p.y ?? 0, p.z);
    return o;
  } catch {
    return null;
  }
}

export class HintImages {
  private cache = new Map<string, WebGLRenderTarget | null>();
  private scene = new Scene();
  private cam = new PerspectiveCamera(30, PIC_W / PIC_H, 0.01, 50);
  private floor: Mesh;
  private box = new Box3();
  private sphere = new Sphere();
  private dir = new Vector3(0, 0.62, 1).normalize();

  constructor(private renderer: WebGLRenderer) {
    this.scene.background = new Color(BACKGROUND);
    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const sun = new DirectionalLight(0xfff2dd, 2.2);
    sun.position.set(-1, 2.4, 1.6);
    this.scene.add(sun);
    this.floor = new Mesh(new CircleGeometry(1, 40), new MeshBasicMaterial({ color: FLOOR }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.001;
    this.scene.add(this.floor);
  }

  /** The picture for `view` (cached), or null if nothing in it could be drawn. */
  get(key: string, view: HintView): Texture | null {
    if (this.cache.has(key)) return this.cache.get(key)?.texture ?? null;
    const rt = this.render(view);
    this.cache.set(key, rt);
    return rt?.texture ?? null;
  }

  private render(view: HintView): WebGLRenderTarget | null {
    const objs: Object3D[] = [];
    for (const p of view.pieces) {
      const o = build(p);
      if (o) objs.push(o);
    }
    if (!objs.length) return null;
    const group = new Group();
    for (const o of objs) group.add(o);
    this.scene.add(group);
    group.updateMatrixWorld(true);
    this.box.makeEmpty();
    this.box.expandByObject(view.focusFirst ? objs[0] : group);
    this.box.getBoundingSphere(this.sphere);
    // Frame the pieces: far enough to fit with a margin, looking down a little.
    const r = Math.max(0.08, this.sphere.radius);
    const dist = (r * 0.95) / Math.sin((this.cam.fov * Math.PI) / 360);
    this.cam.position.copy(this.sphere.center).addScaledVector(this.dir, dist);
    this.cam.lookAt(this.sphere.center);
    this.cam.updateMatrixWorld(true);
    this.floor.scale.setScalar(Math.max(0.3, r * 1.7));
    this.floor.position.set(this.sphere.center.x, -0.001, this.sphere.center.z);

    const rt = new WebGLRenderTarget(PIC_W, PIC_H, { samples: 4, colorSpace: SRGBColorSpace });
    const r_ = this.renderer;
    const prevTarget = r_.getRenderTarget();
    const prevXr = r_.xr.enabled;
    r_.xr.enabled = false; // draw to the target, not into the headset
    r_.setRenderTarget(rt);
    r_.clear();
    r_.render(this.scene, this.cam);
    r_.setRenderTarget(prevTarget);
    r_.xr.enabled = prevXr;
    this.scene.remove(group);
    return rt;
  }

  /** Debug: a PNG data URL of a view (reads the pixels back). */
  dataUrl(view: HintView): string | null {
    const key = `dbg:${view.caption}`;
    this.get(key, view);
    const rt = this.cache.get(key);
    if (!rt) return null;
    const px = new Uint8Array(PIC_W * PIC_H * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, PIC_W, PIC_H, px);
    const c = document.createElement('canvas');
    c.width = PIC_W;
    c.height = PIC_H;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(PIC_W, PIC_H);
    for (let y = 0; y < PIC_H; y++) img.data.set(px.subarray((PIC_H - 1 - y) * PIC_W * 4, (PIC_H - y) * PIC_W * 4), y * PIC_W * 4);
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
}
