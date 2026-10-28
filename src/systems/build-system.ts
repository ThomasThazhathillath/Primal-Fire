// Snap-to-blueprint building. While you hold a structure's key part (a stone
// for a fire pit, a slab for a workbench), a ghost outline follows the point
// where your hand ray (or mouse) meets the ground. Pinch to place it, then
// pinch each glowing snap spot to fill it from your hand or satchel.
//
// In VR, closing a pinch swings the hand's aim ray, so building listens to
// WebXR selectstart and uses where the ray pointed ~150 ms before the pinch,
// and a pinch near (not exactly on) a snap spot fills it.

import {
  CircleGeometry,
  createSystem,
  DoubleSide,
  type Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  Pressed,
  RayInteractable,
  RingGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import {
  BLUEPRINTS,
  blueprintsForKeyItem,
  checkPlacement,
  type BlueprintDef,
  type PlacedStructure,
  spotWorldPosition,
} from '../game/blueprint.js';
import type { GameEvent } from '../game/game.js';
import { BlueprintGhost, SnapSpot } from '../components/game-components.js';
import { itemMesh } from '../scene-assets/item-meshes.js';
import { getGame } from './shared.js';

/** How far away (m) you can point to place a blueprint. */
const MAX_PLACE_DISTANCE = 6;
/** How far back to look for a steady aim when a pinch starts (s). */
const AIM_LOOKBACK = 0.15;
/** A VR pinch within this distance (m) of an empty snap spot fills it. */
const SPOT_RADIUS = 0.45;
const HISTORY = 24;

const ghostOk = new MeshBasicMaterial({ color: 0x7fd37f, transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide });
const ghostBad = new MeshBasicMaterial({ color: 0xff8a6a, transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide });
const spotMat = new MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.85 });
const ashMat = new MeshBasicMaterial({ color: 0x2b241e });

interface StructureView {
  root: Entity;
  spots: Entity[];
}

export class BuildSystem extends createSystem({
  ghost: { required: [BlueprintGhost] },
  ghostPressed: { required: [BlueprintGhost, Pressed] },
  spots: { required: [SnapSpot] },
  spotPressed: { required: [SnapSpot, Pressed] },
}) {
  private ghostEntity!: Entity;
  private ghostRoot!: Group;
  private ghostKind: BlueprintDef['kind'] | null = null;
  private ghostDisc!: Mesh;
  private views = new Map<number, StructureView>();
  private pointer = new Vector2(0, 0);
  private origin = new Vector3();
  private dir = new Vector3();
  private head = new Vector3();
  private pulse = 0;
  private hand: 'left' | 'right' = 'right';
  private aimX = new Float32Array(HISTORY);
  private aimZ = new Float32Array(HISTORY);
  private aimT = new Float32Array(HISTORY).fill(-1);
  private aimOk = new Uint8Array(HISTORY);
  private aimHead = 0;
  private clock = 0;
  private stable = new Vector3();

  init(): void {
    const game = getGame(this.world);
    this.ghostRoot = new Group();
    this.ghostRoot.name = 'BlueprintGhost';
    this.ghostRoot.visible = false;
    this.ghostEntity = this.world.createTransformEntity(this.ghostRoot);
    this.ghostEntity.addComponent(BlueprintGhost, { kind: '', valid: false });
    this.ghostEntity.addComponent(RayInteractable);

    // Track the mouse for browser play (in VR the hand/controller ray is used).
    const canvas = this.renderer.domElement;
    const onMove = (ev: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    };
    canvas.addEventListener('pointermove', onMove);
    this.cleanupFuncs.push(() => canvas.removeEventListener('pointermove', onMove));

    this.cleanupFuncs.push(
      game.on((e: GameEvent) => {
        if (e.type === 'held') this.setGhost(e.item ? (blueprintsForKeyItem(e.item)[0] ?? null) : null);
        if (e.type === 'structure') this.renderStructure(e.structure);
      }),
      // Pointer presses drive the browser; VR uses selectstart (below).
      this.queries.ghostPressed.subscribe('qualify', () => !this.immersive() && this.placeGhost()),
      this.queries.spotPressed.subscribe('qualify', (e) => !this.immersive() && this.fill(e)),
    );
    const onSelectStart = (ev: XRInputSourceEvent) => this.onXRSelect(ev.inputSource.handedness);
    const onSessionStart = () => this.renderer.xr.getSession()?.addEventListener('selectstart', onSelectStart);
    this.renderer.xr.addEventListener('sessionstart', onSessionStart);
    this.cleanupFuncs.push(() => {
      this.renderer.xr.removeEventListener('sessionstart', onSessionStart);
      this.renderer.xr.getSession()?.removeEventListener('selectstart', onSelectStart);
    });
    if (this.renderer.xr.getSession()) onSessionStart();
    for (const s of game.structures) this.renderStructure(s);
    if (game.held) this.setGhost(blueprintsForKeyItem(game.held)[0] ?? null);
  }

  private setGhost(def: BlueprintDef | null): void {
    this.ghostRoot.clear();
    this.ghostKind = def?.kind ?? null;
    this.ghostRoot.visible = false;
    if (!def) return;
    this.ghostEntity.setValue(BlueprintGhost, 'kind', def.kind);
    // The disc is what your ray hits: pinch it to place.
    this.ghostDisc = new Mesh(new CircleGeometry(def.radius, 28), ghostOk);
    this.ghostDisc.rotation.x = -Math.PI / 2;
    this.ghostDisc.position.y = 0.02;
    this.ghostRoot.add(this.ghostDisc);
    const key = itemMesh(def.keyAccepts[0]);
    key.position.set(def.key.x, def.key.y, def.key.z);
    this.ghostRoot.add(key);
    for (const s of def.spots) {
      const ring = new Mesh(new RingGeometry(0.06, 0.09, 20), spotMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(s.x, 0.03, s.z);
      this.ghostRoot.add(ring);
    }
  }

  private immersive(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  /** A pinch (hand) or trigger (controller) in VR. */
  private onXRSelect(handedness: XRHandedness): void {
    if (handedness !== 'left' && handedness !== 'right') return;
    if (handedness !== this.hand) {
      // The other hand takes over aiming; its first pinch only switches hands.
      this.hand = handedness;
      this.aimT.fill(-1);
      return;
    }
    if (!this.steadyAim(this.stable)) return;
    const game = getGame(this.world);
    if (this.ghostKind) {
      // placeBlueprint explains (toast) when the ground is unsuitable.
      this.moveGhostTo(this.stable.x, this.stable.z);
      this.placeGhost();
      return;
    }
    // Fill the nearest empty snap spot near where you pointed.
    let bestId = -1;
    let bestIndex = -1;
    let bestD = SPOT_RADIUS;
    for (const s of game.structures) {
      if (s.complete) continue;
      for (let i = 0; i < s.spots.length; i++) {
        if (s.spots[i]) continue;
        const p = spotWorldPosition(s, i);
        const d = Math.hypot(p.x - this.stable.x, p.z - this.stable.z);
        if (d < bestD) {
          bestD = d;
          bestId = s.id;
          bestIndex = i;
        }
      }
    }
    if (bestId >= 0) game.fillSpot(bestId, bestIndex);
  }

  /** The ground point the aim ray had ~AIM_LOOKBACK s ago (steadier than now). */
  private steadyAim(out: Vector3): boolean {
    let pick = -1;
    for (let k = 0; k < HISTORY; k++) {
      const i = (this.aimHead - 1 - k + HISTORY * 2) % HISTORY;
      if (this.aimT[i] < 0) break;
      if (this.aimOk[i]) pick = i;
      if (this.clock - this.aimT[i] >= AIM_LOOKBACK) break;
    }
    if (pick < 0) return false;
    out.set(this.aimX[pick], 0, this.aimZ[pick]);
    return true;
  }

  /** Where the active pointer ray meets the ground, or null. */
  private groundHit(out: Vector3): boolean {
    const immersive = this.immersive();
    if (immersive) {
      const space = this.player.raySpaces[this.hand];
      if (!space) return false;
      space.getWorldPosition(this.origin);
      space.getWorldDirection(this.dir).negate(); // rays point along local −Z
    } else {
      this.camera.getWorldPosition(this.origin);
      this.dir.set(this.pointer.x, this.pointer.y, 0.5).unproject(this.camera).sub(this.origin).normalize();
    }
    if (this.dir.y > -0.02) return false;
    const t = -this.origin.y / this.dir.y;
    out.copy(this.origin).addScaledVector(this.dir, t);
    this.camera.getWorldPosition(this.head);
    return Math.hypot(out.x - this.head.x, out.z - this.head.z) <= MAX_PLACE_DISTANCE;
  }

  /** Moves the ghost to (x, z) and colours it by whether you can build there. */
  moveGhostTo(x: number, z: number): boolean {
    if (!this.ghostKind) return false;
    const game = getGame(this.world);
    this.camera.getWorldPosition(this.head);
    this.ghostRoot.position.set(x, 0, z);
    this.ghostRoot.rotation.y = Math.atan2(this.head.x - x, this.head.z - z);
    this.ghostRoot.visible = true;
    const ok = checkPlacement(this.ghostKind, x, z, game.structures).ok;
    this.ghostDisc.material = ok ? ghostOk : ghostBad;
    this.ghostEntity.setValue(BlueprintGhost, 'valid', ok);
    return ok;
  }

  placeGhost(): boolean {
    if (!this.ghostKind || !this.ghostRoot.visible) return false;
    const { x, z } = this.ghostRoot.position;
    const res = getGame(this.world).placeBlueprint(this.ghostKind, x, z, this.ghostRoot.rotation.y);
    return res.ok;
  }

  private fill(e: Entity): void {
    getGame(this.world).fillSpot(e.getValue(SnapSpot, 'structureId') ?? 0, e.getValue(SnapSpot, 'index') ?? 0);
  }

  private renderStructure(s: PlacedStructure): void {
    const old = this.views.get(s.id);
    if (old) {
      for (const e of old.spots) e.destroy();
      old.root.object3D?.removeFromParent();
      old.root.destroy();
    }
    const def = BLUEPRINTS[s.kind];
    const root = new Group();
    root.name = `Structure_${s.kind}_${s.id}`;
    root.position.set(s.x, 0, s.z);
    root.rotation.y = s.rotY;
    const key = itemMesh(s.key);
    // An unfinished workbench shows its slab floating where it will rest.
    key.position.set(def.key.x, def.key.y, def.key.z);
    root.add(key);
    if (s.kind === 'firePit' && s.complete) {
      const ash = new Mesh(new CircleGeometry(0.3, 20), ashMat);
      ash.rotation.x = -Math.PI / 2;
      ash.position.y = 0.012;
      root.add(ash);
    }
    const view: StructureView = { root: this.world.createTransformEntity(root), spots: [] };
    def.spots.forEach((spotDef, i) => {
      const filled = s.spots[i];
      if (filled) {
        const m = itemMesh(filled);
        m.position.set(spotDef.x, s.kind === 'workbench' ? 0 : 0, spotDef.z);
        if (s.kind === 'workbench') m.scale.set(1.6, 3.2, 1.6); // stacked stone legs
        root.add(m);
        return;
      }
      const ring = new Mesh(new TorusGeometry(0.08, 0.015, 6, 20), spotMat);
      ring.rotation.x = -Math.PI / 2;
      const p = spotWorldPosition(s, i);
      ring.position.set(p.x, Math.max(0.05, p.y), p.z);
      ring.name = `SnapSpot_${s.id}_${i}`;
      const e = this.world.createTransformEntity(ring);
      e.addComponent(SnapSpot, { structureId: s.id, index: i });
      e.addComponent(RayInteractable);
      view.spots.push(e);
    });
    this.views.set(s.id, view);
  }

  update(delta: number): void {
    this.clock += delta;
    const hit = this.groundHit(this.origin);
    if (this.immersive()) {
      const i = this.aimHead;
      this.aimX[i] = this.origin.x;
      this.aimZ[i] = this.origin.z;
      this.aimT[i] = this.clock;
      this.aimOk[i] = hit ? 1 : 0;
      this.aimHead = (i + 1) % HISTORY;
    }
    if (this.ghostKind) {
      if (hit) this.moveGhostTo(this.origin.x, this.origin.z);
      else this.ghostRoot.visible = false;
    }
    this.pulse += delta;
    const s = 1 + Math.sin(this.pulse * 4) * 0.15;
    for (const e of this.queries.spots.entities) e.object3D?.scale.setScalar(s);
  }
}
