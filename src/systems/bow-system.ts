// Bow and arrows. In VR: hold the bow in your right hand, pinch with the left
// to nock, pull back, and release the pinch; arrow speed follows how far you
// drew and flies along the line from your drawing hand to the bow hand.
// Browser fallback: press G to shoot along your view. A fixed pool of arrow
// meshes means nothing is allocated per frame.

import { ConeGeometry, createSystem, Group, Mesh, MeshBasicMaterial, Vector3, VisibilityState } from '@iwsdk/core';
import { type Arrow, drawSpeed, launch, MAX_DRAW, step } from '../game/projectile.js';
import { arrowTargets, getGame } from './shared.js';

const POOL = 8;
const geo = new ConeGeometry(0.012, 0.5, 5);
geo.rotateX(-Math.PI / 2); // tip along -Z
const mat = new MeshBasicMaterial({ color: 0xc49a66 });

export class BowSystem extends createSystem({}) {
  private pool: Array<{ a: Arrow; mesh: Mesh }> = [];
  private root = new Group();
  private bowPos = new Vector3();
  private drawPos = new Vector3();
  private dir = new Vector3();
  private head = new Vector3();
  private lookAt = new Vector3();
  private drawing = false;
  private draw = 0;

  init(): void {
    this.root.name = 'Arrows';
    this.world.createTransformEntity(this.root);
    for (let i = 0; i < POOL; i++) {
      const mesh = new Mesh(geo, mat);
      mesh.visible = false;
      this.root.add(mesh);
      this.pool.push({ a: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, alive: false }, mesh });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyG' && this.world.visibilityState.peek() === VisibilityState.NonImmersive) this.shootFromView();
    };
    window.addEventListener('keydown', onKey);
    const onStart = (ev: XRInputSourceEvent) => {
      if (ev.inputSource.handedness === 'left' && getGame(this.world).held === 'bow') {
        this.drawing = true;
        getGame(this.world).science('hunt.bow.drawn');
      }
    };
    const onEnd = (ev: XRInputSourceEvent) => {
      if (ev.inputSource.handedness !== 'left' || !this.drawing) return;
      this.drawing = false;
      this.releaseVR();
    };
    const onSession = () => {
      const s = this.renderer.xr.getSession();
      s?.addEventListener('selectstart', onStart);
      s?.addEventListener('selectend', onEnd);
    };
    this.renderer.xr.addEventListener('sessionstart', onSession);
    this.cleanupFuncs.push(() => {
      window.removeEventListener('keydown', onKey);
      this.renderer.xr.removeEventListener('sessionstart', onSession);
      const s = this.renderer.xr.getSession();
      s?.removeEventListener('selectstart', onStart);
      s?.removeEventListener('selectend', onEnd);
    });
    if (this.renderer.xr.getSession()) onSession();
  }

  private spawn(from: Vector3, dir: Vector3, speed: number): void {
    const slot = this.pool.find((p) => !p.a.alive);
    if (!slot || speed <= 0) return;
    if (!getGame(this.world).nockArrow()) return;
    launch(slot.a, from, dir, speed);
    slot.mesh.visible = true;
  }

  private shootFromView(): void {
    this.camera.getWorldPosition(this.head);
    this.camera.getWorldDirection(this.dir);
    this.spawn(this.head, this.dir, drawSpeed(0.5));
  }

  private releaseVR(): void {
    const g = this.player.gripSpaces;
    if (!g.right || !g.left) return;
    g.right.getWorldPosition(this.bowPos);
    g.left.getWorldPosition(this.drawPos);
    this.dir.subVectors(this.bowPos, this.drawPos);
    this.spawn(this.bowPos, this.dir, drawSpeed(Math.min(this.dir.length(), MAX_DRAW)));
  }

  update(delta: number): void {
    if (this.drawing) {
      const g = this.player.gripSpaces;
      if (g.right && g.left) {
        g.right.getWorldPosition(this.bowPos);
        g.left.getWorldPosition(this.drawPos);
        this.draw = this.bowPos.distanceTo(this.drawPos);
      }
    }
    for (const p of this.pool) {
      if (!p.a.alive) continue;
      const hit = step(p.a, delta, arrowTargets);
      p.mesh.position.set(p.a.x, p.a.y, p.a.z);
      this.lookAt.set(p.a.x + p.a.vx, p.a.y + p.a.vy, p.a.z + p.a.vz);
      p.mesh.lookAt(this.lookAt);
      if (hit !== 'none') {
        getGame(this.world).log.add(`arrow ${hit}`);
        if (hit === 'target') {
          getGame(this.world).science('hunt.arrow.hit');
          for (const t of arrowTargets) {
            if (Math.hypot(t.x - p.a.x, t.y - p.a.y, t.z - p.a.z) <= t.r + 0.6) {
              t.onHit?.();
              break;
            }
          }
        } else if (Math.random() < 0.6) {
          getGame(this.world).recoverArrow();
          p.mesh.visible = false;
        }
        // Stuck arrows stay visible for a moment, then hide on the next spawn reuse.
        if (hit === 'target') p.mesh.visible = false;
      }
    }
  }
}
