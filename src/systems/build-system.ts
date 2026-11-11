// Snap-to-blueprint building. While you hold a structure's key part (a stone
// for a fire pit, a slab for a workbench), a ghost outline follows the point
// where your hand ray (or mouse) meets the ground. Pinch to place it. Parts
// then go on by hand: InteractionSystem previews the held part and seats it
// where you release it (if it lands close enough to its glowing mark).
// Pressing a part of an unfinished structure takes it back (supports) or
// pushes on it to test stability (the slab).
//
// In VR, closing a pinch swings the hand's aim ray, so placing an outline
// listens to WebXR selectstart and uses where the ray pointed ~150 ms before.

import {
  CircleGeometry,
  CylinderGeometry,
  MeshLambertMaterial,
  ShaderMaterial,
  createSystem,
  DoubleSide,
  type Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Pressed,
  RayInteractable,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import {
  BLUEPRINTS,
  blueprintsForKeyItem,
  checkPlacement,
  isSpotLocked,
  type BlueprintDef,
  type PlacedStructure,
  spotWorldPosition,
} from '../game/blueprint.js';
import type { GameEvent } from '../game/game.js';
import { findBookSpot } from '../game/buildbook.js';
import { buildShelter } from '../scene-assets/leanto.js';
import { BlueprintGhost, SnapSpot, StructurePart } from '../components/game-components.js';
import { itemMesh } from '../scene-assets/item-meshes.js';
import type { ItemId } from '../game/items.js';
import { hands, mouse } from './hand-input-system.js';
import { getGame, getUi } from './shared.js';

/** How far away (m) you can point to place a blueprint. */
const MAX_PLACE_DISTANCE = 6;
/** How far back to look for a steady aim when a pinch starts (s). */
const AIM_LOOKBACK = 0.15;
const HISTORY = 24;

const ghostOk = new MeshBasicMaterial({ color: 0x4dff7a, transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide });
/** The ghost of what can go on next: faint, so a roof of ghost layers never hides the real one. */
const ghostSoft = new MeshBasicMaterial({ color: 0x4dff7a, transparent: true, opacity: 0.2, depthWrite: false });
const ghostBad = new MeshBasicMaterial({ color: 0xff4a2e, transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide });
const spotMat = new MeshBasicMaterial({ color: 0xffc766, transparent: true, opacity: 0.95 });
/** The soft glow under every open mark, so it reads from a distance. */
const spotGlowMat = new MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide });
const spotGlowGeo = new CircleGeometry(0.17, 18);
/** Joints that are tied by hand with cord: a cooler ring than the set-down marks. */
const lashMat = new MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.95 });
const ashMat = new MeshLambertMaterial({ color: 0x4e4944 });
/** Soot: near-black at the centre, fading to nothing at the edge, with a ragged outline. */
const scorchMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {},
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y); }
    void main() {
      float r = length(vUv) + (n(vUv * 5.0) - 0.5) * 0.28;
      float a = smoothstep(1.0, 0.25, r) * 0.88;
      vec3 c = mix(vec3(0.02, 0.016, 0.012), vec3(0.09, 0.07, 0.05), smoothstep(0.2, 0.9, r));
      gl_FragColor = vec4(c, a);
    }`,
});
const charGeo = new CylinderGeometry(0.032, 0.045, 0.62, 8);
const charMat = new MeshLambertMaterial({ color: 0x191310 });
const emberGeo = new SphereGeometry(0.03, 6, 5);
const emberMat = new MeshBasicMaterial({ color: 0xff6a22 });
const partGeo = new SphereGeometry(0.16, 8, 6);
const partMat = new MeshBasicMaterial({ visible: false });

interface StructureView {
  root: Entity;
  spots: Entity[];
}

export class BuildSystem extends createSystem({
  ghost: { required: [BlueprintGhost] },
  ghostPressed: { required: [BlueprintGhost, Pressed] },
  spots: { required: [SnapSpot] },
  partPressed: { required: [StructurePart, Pressed] },
  spotPressed: { required: [SnapSpot, Pressed] },
}) {
  private ghostEntity!: Entity;
  private ghostRoot!: Group;
  private ghostKind: BlueprintDef['kind'] | null = null;
  /** A finished stage of the shelter: its frame settles with a little bounce. */
  private bounce: { id: number; t: number } | null = null;
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
        if (e.type === 'held') this.setGhost(this.ghostFor(e.item));
        if (e.type === 'structure') {
          this.renderStructure(e.structure);
          this.setGhost(this.ghostFor(getGame(this.world).held));
        }
        // Lashing a joint: the cord wraps grow with every twist.
        if (e.type === 'lash') {
          const st = getGame(this.world).structures.find((t) => t.id === e.id);
          if (st) this.renderStructure(st);
        }
        // A stage was finished: the whole frame settles with a small bounce.
        if (e.type === 'shelterStage') this.bounce = { id: e.id, t: 0 };
      }),
      // Pointer presses drive the browser; VR uses selectstart (below).
      this.queries.ghostPressed.subscribe('qualify', () => !this.immersive() && this.placeGhost()),
      this.queries.partPressed.subscribe('qualify', (e) => this.pressPart(e)),
      // Pressing (clicking, ray-pinching) a glowing mark fills it from your bag.
      this.queries.spotPressed.subscribe('qualify', (e) => {
        const g = getGame(this.world);
        if (g.held && g.wantsItem(g.held, g.player.x, g.player.z, 6)) return; // a held part is placed by letting go, not by this press
        g.fillFromBag(e.getValue(SnapSpot, 'structureId') ?? 0, e.getValue(SnapSpot, 'index') ?? 0);
      }),
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
    if (game.held) this.setGhost(this.ghostFor(game.held));
  }

  /** The blueprint a held item would start, unless an unfinished structure nearby wants it instead. */
  private ghostFor(item: ItemId | null): BlueprintDef | null {
    if (!item) return null;
    const game = getGame(this.world);
    if (game.wantsItem(item, game.player.x, game.player.z)) return null;
    // A new outline replaces an unfinished one of the same kind (Game.placeBlueprint), so it may show anywhere.
    // One rule (Game.wantedStructure): inside a tutorial lesson only the lesson's structure, else the objective's.
    // Only the structure the lesson / objective is building may start an outline: a stone in hand offers a
    // fire pit during the workbench, and nothing at all while the objective builds nothing.
    const want = game.wantedStructure();
    if (want === null) return null;
    const def = blueprintsForKeyItem(item, want)[0] ?? null;
    return want && def && def.kind !== want ? null : def;
  }

  /** Slab: push down to test it (Shift / both hands: lift it back off). Support: take it back. */
  private pressPart(e: Entity): void {
    const game = getGame(this.world);
    // Setting a part down (InteractionSystem) also presses whatever is under the pointer: ignore that.
    if (game.held && game.wantsItem(game.held, game.player.x, game.player.z)) return;
    // ...and the press that just seated a part lands on that part: give it a moment before it can be taken back.
    if (game.time - game.lastSeatAt < 0.8) return;
    const id = e.getValue(StructurePart, 'structureId') ?? 0;
    const index = e.getValue(StructurePart, 'index') ?? 0;
    // A finished workbench is a crafting station: pressing it opens its recipes
    // (lifting the slab off is an explicit button there, so nothing is dismantled by accident).
    const bench = game.structures.find((t) => t.id === id);
    if (bench?.kind === 'workbench' && bench.complete) {
      getUi(this.world).openBench?.(id);
      return;
    }
    if (index >= 0) {
      game.takeBack(id, index);
      return;
    }
    const s = game.structures.find((t) => t.id === id);
    const lift = s?.complete || (this.immersive() ? hands[0].grip && hands[1].grip : mouse.bothHands || mouse.shift);
    if (lift) game.takeBack(id, -1);
    else game.pushTest(id);
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
    if (!this.ghostKind) return;
    // Pointing at no ground (a flat hand, looking ahead): the plan still goes down on the best ground in front of you.
    if (!this.steadyAim(this.stable)) {
      this.placeInFront();
      return;
    }
    // placeBlueprint explains (toast) when the ground is unsuitable. Parts are
    // set down by hand (InteractionSystem), not filled by pointing.
    this.moveGhostTo(this.stable.x, this.stable.z);
    this.placeGhost();
  }

  /** Pinching with a key part and no aim on the ground: put the plan on the nearest good ground in front of you. */
  private placeInFront(): void {
    const game = getGame(this.world);
    if (!this.ghostKind) return;
    this.camera.getWorldPosition(this.head);
    this.camera.getWorldDirection(this.dir);
    const spot = findBookSpot(this.ghostKind, this.head.x, this.head.z, this.dir.x, this.dir.z, game.structures);
    if (!spot) {
      game.toast('No good ground right in front of you: step to open, dry ground and try again.', 'bad');
      return;
    }
    game.placeBlueprint(this.ghostKind, spot.x, spot.z, spot.rotY);
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

  private renderStructure(s: PlacedStructure): void {
    const old = this.views.get(s.id);
    if (old) {
      for (const e of old.spots) e.dispose();
      old.root.dispose();
      this.views.delete(s.id);
    }
    // Taken apart completely: nothing left to draw.
    if (!getGame(this.world).structures.includes(s)) return;
    const def = BLUEPRINTS[s.kind];
    // Finished parts can be picked back up too (not a fire pit: it holds the fire).
    const pickable = !(s.complete && s.kind === 'firePit');
    const root = new Group();
    root.name = `Structure_${s.kind}_${s.id}`;
    root.position.set(s.x, 0, s.z);
    root.rotation.y = s.rotY;
    const c = Math.cos(s.rotY);
    const n = Math.sin(s.rotY);
    /** World point -> this structure's local frame (inverse of spotWorldPosition). */
    const local = (p: { x: number; z: number }) => ({ x: (p.x - s.x) * c - (p.z - s.z) * n, z: (p.x - s.x) * n + (p.z - s.z) * c });
    const view: StructureView = { root: this.world.createTransformEntity(root), spots: [] };
    if (s.kind === 'leanTo' || s.kind === 'drainage') {
      this.renderShelter(s, view, root);
      this.views.set(s.id, view);
      return;
    }
    const key = itemMesh(s.key);
    if ((def.keyLast && !s.keyPlaced) || s.keyOpen) {
      // Not on yet: a faint ghost shows where the slab will rest.
      key.traverse((o) => {
        if ((o as Mesh).isMesh) (o as Mesh).material = ghostOk;
      });
      key.position.set(def.key.x, def.key.y, def.key.z);
      root.add(key);
    } else if (s.keyPlaced) {
      // Set down: its own entity so you can push on it or lift it back off.
      const l = s.keyPos ? local(s.keyPos) : def.key;
      key.position.set(l.x, def.key.y, l.z);
      root.add(key);
      root.updateMatrixWorld(true);
      const part = this.world.createTransformEntity(this.partProxy(key, s.rotY));
      part.addComponent(StructurePart, { structureId: s.id, index: -1 });
      part.addComponent(RayInteractable);
      view.spots.push(part);
    } else {
      const l = s.keyPos ? local(s.keyPos) : def.key;
      key.position.set(l.x, def.key.y, l.z);
      root.add(key);
    }
    if (s.keyOpen) {
      // The key part is a slot too: a ring on its mark, like the other spots.
      const ring = new Mesh(new TorusGeometry(0.08, 0.015, 6, 20), spotMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(def.key.x, 0.05, def.key.z);
      root.add(ring);
    }
    if (s.kind === 'firePit' && s.complete) {
      // A lived-in fire pit: soot-blackened earth fading out into the ground, a grey ash bed, a ring of baked stones, charred logs
      // leaning into a teepee and a few glowing embers (all static meshes, a dozen draw calls at most, only for a finished pit).
      const scorch = new Mesh(new CircleGeometry(0.95, 36), scorchMat);
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.y = 0.013;
      root.add(scorch);
      const ash = new Mesh(new CircleGeometry(0.3, 24), ashMat);
      ash.rotation.x = -Math.PI / 2;
      ash.position.y = 0.016;
      root.add(ash);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + 0.3;
        const st = itemMesh('dryStone');
        const sc = 1.0 + 0.35 * ((k * 5) % 3) / 2;
        st.scale.set(sc * 1.15, sc, sc);
        st.rotation.y = k * 2.3;
        st.position.set(Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46);
        root.add(st);
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.6;
        const log = new Mesh(charGeo, charMat);
        log.position.set(Math.cos(a) * 0.1, 0.2, Math.sin(a) * 0.1);
        log.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
        root.add(log);
        const tip = new Mesh(emberGeo, emberMat);
        tip.position.set(Math.cos(a) * 0.015, 0.45, Math.sin(a) * 0.015);
        root.add(tip);
      }
      for (let k = 0; k < 2; k++) {
        const log = new Mesh(charGeo, charMat);
        log.scale.set(1, 0.8, 1);
        log.position.set(0, 0.06 + k * 0.05, 0);
        log.rotation.set(Math.PI / 2, 0, k * 1.2 + 0.4);
        root.add(log);
      }
      for (let k = 0; k < 9; k++) {
        const a = k * 2.4;
        const em = new Mesh(emberGeo, emberMat);
        em.scale.setScalar(0.5 + (k % 3) * 0.3);
        em.position.set(Math.cos(a) * (0.05 + 0.04 * (k % 4)), 0.03, Math.sin(a) * (0.05 + 0.04 * (k % 4)));
        root.add(em);
      }
    }
    def.spots.forEach((spotDef, i) => {
      const filled = s.spots[i];
      if (filled) {
        const m = itemMesh(filled);
        // Drawn where it actually landed when set by hand.
        const at = s.spotPos?.[i] ? local(s.spotPos[i]!) : spotDef;
        m.position.set(at.x, s.kind === 'workbench' || s.kind === 'firePit' ? 0 : spotDef.y, at.z);
        if (s.kind === 'workbench') m.scale.set(1.6, 3.2, 1.6); // stacked stone legs
        root.add(m);
        if (pickable && !s.keyPlaced) {
          root.updateMatrixWorld(true);
          const part = this.world.createTransformEntity(this.partProxy(m, s.rotY));
          part.addComponent(StructurePart, { structureId: s.id, index: i });
          part.addComponent(RayInteractable);
          view.spots.push(part);
        }
        return;
      }
      const ring = new Mesh(new TorusGeometry(0.1, 0.02, 6, 20), spotMat);
      const glow = new Mesh(spotGlowGeo, spotGlowMat);
      ring.add(glow);
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

  /** The Chapter 2 shelter and its channel: what is built so far, a ghost of what can go on next, marks for open spots. */
  private renderShelter(s: PlacedStructure, view: StructureView, root: Group): void {
    const def = BLUEPRINTS[s.kind];
    root.add(buildShelter(s));
    // A faint ghost of the parts that can go on right now (open, unlocked, set down not tied).
    // Roof layers: ghost only the layer that goes on next (bark, then leaves, then grass), never all three at once.
    const ORDER = ['roofBark', 'roofLeaf', 'roofGrass'];
    let nextLayer = 9;
    def.spots.forEach((sp, i) => {
      const k = ORDER.indexOf(sp.role ?? '');
      if (k >= 0 && s.spots[i] === null && !isSpotLocked(s, i)) nextLayer = Math.min(nextLayer, k);
    });
    const open = s.spots.map((v, i) => {
      if (v !== null || def.spots[i].gesture || isSpotLocked(s, i)) return v;
      const k = ORDER.indexOf(def.spots[i].role ?? '');
      if (k >= 0 && k !== nextLayer) return v;
      return def.spots[i].accepts[0] as ItemId;
    });
    if (s.kind === 'leanTo' && (open.some((v, i) => v !== s.spots[i]) || s.keyOpen)) {
      const ghost = buildShelter({ ...s, spots: open as PlacedStructure['spots'], keyOpen: !s.keyOpen, work: undefined });
      ghost.name = 'ShelterGhost';
      ghost.traverse((o) => {
        if ((o as Mesh).isMesh) (o as Mesh).material = ghostSoft;
      });
      root.add(ghost);
    }
    // Marks: the key slot of a book plan, every open unlocked spot, and lashing joints (cord, by hand).
    const ringAt = (x: number, y: number, z: number, index: number, lash: boolean) => {
      const ring = new Mesh(new TorusGeometry(lash ? 0.12 : 0.1, 0.02, 6, 20), lash ? lashMat : spotMat);
      const glow = new Mesh(spotGlowGeo, spotGlowMat);
      ring.add(glow);
      ring.rotation.x = -Math.PI / 2;
      const p = spotWorldPosition(s, index);
      ring.position.set(p.x, Math.max(0.05, p.y), p.z);
      ring.name = `SnapSpot_${s.id}_${index}`;
      const e = this.world.createTransformEntity(ring);
      e.addComponent(SnapSpot, { structureId: s.id, index });
      e.addComponent(RayInteractable);
      view.spots.push(e);
      void x;
      void y;
      void z;
    };
    def.spots.forEach((sp, i) => {
      if (s.spots[i] !== null || isSpotLocked(s, i)) return;
      ringAt(sp.x, sp.y, sp.z, i, sp.gesture === 'lash');
    });
  }

  /** An invisible press target over a part (the part itself stays in the structure's group). */
  private partProxy(part: Object3D, rotY: number): Mesh {
    const proxy = new Mesh(partGeo, partMat);
    part.getWorldPosition(proxy.position);
    proxy.position.y += 0.08;
    proxy.rotation.y = rotY;
    return proxy;
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
    // The frame settles after a finished stage.
    if (this.bounce) {
      this.bounce.t += delta;
      const v = this.views.get(this.bounce.id);
      const k = this.bounce.t / 0.7;
      if (!v || k >= 1) {
        if (v?.root.object3D) v.root.object3D.scale.set(1, 1, 1);
        this.bounce = null;
      } else if (v.root.object3D) {
        const y = 1 + Math.sin(k * Math.PI) * Math.exp(-k * 2) * 0.06;
        v.root.object3D.scale.set(1, y, 1);
      }
    }
    this.pulse += delta;
    const s = 1 + Math.sin(this.pulse * 4) * 0.2;
    for (const e of this.queries.spots.entities) e.object3D?.scale.setScalar(s);
  }
}
