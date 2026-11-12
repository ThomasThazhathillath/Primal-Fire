// Gathering: every resource spot from the world layout becomes an entity you
// can point at and pinch (hand), trigger (controller) or click (browser).
// The item flies to your hip satchel.

import {
  createSystem,
  type Entity,
  CircleGeometry,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  VisibilityState,
  type Object3D,
  Pressed,
  RayInteractable,
  Vector3,
} from '@iwsdk/core';
import { fitsPouch, ITEM_PHYSICS, itemName, type ItemId } from '../game/items.js';
import { pickByRay, PinchLock, type RayCandidate } from '../game/gaze.js';
import { SWING_TOOLS } from '../game/interact.js';
import { groundHeight, RESOURCES, type ResourceSpot } from '../game/world-layout.js';
import { afterGather, afterRegrow, loadedCharges } from '../game/resource-state.js';
import { Gatherable } from '../components/game-components.js';
import { itemMesh, resourceMesh } from '../scene-assets/item-meshes.js';
import { hands } from './hand-input-system.js';
import { getGame, glowMaterial, glowMaterialHot, handClaims, haptic, hipPosition, pickupFrom, rayPick } from './shared.js';

/** Max distance (m) from your head to something you can gather. */
export const REACH = 6;
/** Resource look that is dragged rather than lifted. */
export const DRAG_LOOK = 'fallenLog';
/** Radius (m) of the invisible hit sphere around each resource: sticks and pebbles are far too thin to click. */
const HIT_RADIUS = 0.55;
const hitGeo = new SphereGeometry(HIT_RADIUS, 8, 6);
const hitMat = new MeshBasicMaterial({ visible: false });
const glowGeo = new CircleGeometry(0.22, 20);
const FLIGHT_TIME = 0.4;
/** Hand aim assist: a pinch picks the resource nearest the ray within this cone (radians, about 12 degrees). */
const AIM_CONE = 0.21;
/** Frames of ray history kept per hand: a pinch is judged by where you pointed ~150 ms before it (the ray swings as fingers close). */
const AIM_HISTORY = 12;
const AIM_LOOKBACK = 9;
/** Spots within this distance (m) are ray-pick candidates (rebuilt four times a second). */
const PICK_RANGE = REACH + 3;
const MAX_NEAR = 160;
/** Reach multiplier from the settings (seated assist); 1 = the normal 6 m. */
export const reachCfg = { scale: 1 };
/** Spots farther than this (m) are hidden: they sit in full fog and cost draw calls. */
const CULL_DISTANCE = 15;
/** The pickup glow only matters up close (it is one draw call per spot): beyond this (m) it is hidden. */
const GLOW_DISTANCE = 5;

interface Flight {
  obj: Object3D;
  from: Vector3;
  t: number;
}

export class ResourceSystem extends createSystem({
  spots: { required: [Gatherable] },
  pressed: { required: [Gatherable, Pressed] },
  hovered: { required: [Gatherable, Hovered] },
}) {
  private bySpot = new Map<string, ResourceSpot>();
  private entityBySpot = new Map<string, Entity>();
  private fx!: Group;
  private flights: Flight[] = [];
  private head = new Vector3();
  private hip = new Vector3();
  private regrowTimer = 0;
  private parked = new Map<Object3D, Object3D[]>();
  private glowOf = new Map<Entity, Object3D | null>();
  private crosshair: HTMLDivElement | null = null;
  private litObj: Object3D | null = null;
  private pulse = 0;
  /** Per hand: ring buffer of recent ray origins and directions (preallocated). */
  private aim = [0, 1].map(() => ({
    o: Array.from({ length: AIM_HISTORY }, () => new Vector3()),
    d: Array.from({ length: AIM_HISTORY }, () => new Vector3()),
    i: 0,
    n: 0,
  }));
  /** A pinch waiting one frame to see whether the ray press already gathered something. */
  private pendingPinch = -1;
  /** Ray-pick candidates near the player (NPE A): one slot per spot within PICK_RANGE. */
  private nearCands: RayCandidate[] = [];
  private nearSpot: string[] = [];
  private nearN = 0;
  private nearIn = 0;
  private fbDirty = true;
  /** Per hand: the pinch-time target lock, and the spot under the ray this frame. */
  private locks = [new PinchLock(), new PinchLock()];
  private rayKey: Array<string | null> = [null, null];
  /** Gathers redirected from the pressed spot to the locked one (debug). */
  redirects = 0;
  /** When the last pickup succeeded (ms): a second press from the same pinch is ignored. */
  private lastGatherOk = -1e9;
  private lastGather = 0;
  private tmpO = new Vector3();
  private tmpD = new Vector3();
  private tmpP = new Vector3();

  init(): void {
    for (let i = 0; i < MAX_NEAR; i++) {
      this.nearCands.push({ key: '', x: 0, y: 0, z: 0, r: 0.15, inReach: true });
      this.nearSpot.push('');
    }
    // Debug / tests: what the hand ray means and the pinch locks (NPE A).
    (window as unknown as { __pick?: unknown }).__pick = { ray: rayPick, locks: this.locks, keys: this.rayKey, sys: this };
    const fxRoot = this.world.createTransformEntity(new Group());
    this.fx = fxRoot.object3D as Group;
    for (const spot of RESOURCES) {
      const obj = resourceMesh(spot.look);
      obj.position.set(spot.x, groundHeight(spot.x, spot.z), spot.z);
      obj.rotation.y = spot.rotY;
      obj.name = `Resource_${spot.id}`;
      const hit = new Mesh(hitGeo, hitMat);
      hit.name = 'HitProxy';
      hit.position.y = HIT_RADIUS * 0.8;
      obj.add(hit);
      const glow = new Mesh(glowGeo, glowMaterial);
      glow.name = 'Glow';
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.025;
      obj.add(glow);
      const e = this.world.createTransformEntity(obj);
      // A saved, part-used or stripped spot comes back exactly as it was left (no refill, no duplicate).
      const saved = getGame(this.world).spotState.get(spot.id);
      const charges = loadedCharges(saved, spot);
      e.addComponent(Gatherable, { spotId: spot.id, charges, regrowAt: saved?.r ?? 0 });
      if (charges > 0) e.addComponent(RayInteractable);
      else obj.visible = false;
      this.bySpot.set(spot.id, spot);
      this.entityBySpot.set(spot.id, e);
    }
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (e) => {
        // With an axe or hammer in hand you swing at things (InteractionSystem) instead of picking them.
        // A direct pinch grab just took something: this press is the same pinch.
        if (performance.now() / 1000 - handClaims.grabAt < 0.3) return;
        const held = getGame(this.world).held;
        if (held && SWING_TOOLS.includes(held)) return;
        // Fallen logs are too heavy to pick up: InteractionSystem drags them (a plain click still breaks off a piece).
        if (this.bySpot.get(e.getValue(Gatherable, 'spotId') ?? '')?.look === DRAG_LOOK) return;
        // One pinch, one pickup: the aim assist may already have resolved this pinch a frame earlier.
        const vr = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
        if (vr && performance.now() - this.lastGatherOk < 350) return;
        this.tryGather(this.lockedFor(e));
      }),
    );
    // Desktop crosshair: white = nothing, green = collectable, orange = too far.
    const ch = document.createElement('div');
    ch.style.cssText = 'position:fixed;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid #fff;border-radius:50%;pointer-events:none;z-index:5;opacity:.8;box-shadow:0 0 3px #000;transition:border-color .1s,transform .1s';
    document.body.appendChild(ch);
    this.crosshair = ch;
    const onMove = (ev: PointerEvent) => {
      ch.style.left = `${ev.clientX}px`;
      ch.style.top = `${ev.clientY}px`;
    };
    window.addEventListener('pointermove', onMove);
    this.cleanupFuncs.push(() => {
      ch.remove();
      window.removeEventListener('pointermove', onMove);
    });
  }

  /**
   * Far spots drop their meshes out of the scene graph (the root stays: IWSDK owns entity roots and
   * re-adds them): IWSDK walks the whole graph several times a frame (UI, transforms) and the spots'
   * meshes are three quarters of all objects.
   */
  private setNear(o: Object3D, near: boolean): void {
    o.visible = near;
    const parked = this.parked.get(o);
    if (near) {
      if (parked) {
        for (const c of parked) o.add(c);
        this.parked.delete(o);
      }
    } else if (!parked && o.children.length) {
      this.parked.set(o, o.children.slice());
      o.clear();
    }
  }

  spot(id: string): ResourceSpot | undefined {
    return this.bySpot.get(id);
  }

  entityFor(spotId: string): Entity | undefined {
    return this.entityBySpot.get(spotId);
  }

  /** Nearest spot with charges left that offers one of `items`. */
  locate(items: ItemId[], from: { x: number; z: number }): { x: number; z: number } | null {
    let best: { x: number; z: number; d: number } | null = null;
    for (const e of this.queries.spots.entities) {
      if ((e.getValue(Gatherable, 'charges') ?? 0) <= 0) continue;
      const spot = this.bySpot.get(e.getValue(Gatherable, 'spotId') ?? '');
      if (!spot || !items.includes(spot.itemId)) continue;
      const d = Math.hypot(spot.x - from.x, spot.z - from.z);
      if (!best || d < best.d) best = { x: spot.x, z: spot.z, d };
    }
    return best;
  }

  /** Every spot with charges left that offers one of `items` (allocates: call a few times a second at most). */
  liveSpots(items: readonly ItemId[]): Array<{ id: string; x: number; z: number; item: ItemId }> {
    const out: Array<{ id: string; x: number; z: number; item: ItemId }> = [];
    for (const e of this.queries.spots.entities) {
      if ((e.getValue(Gatherable, 'charges') ?? 0) <= 0) continue;
      const spot = this.bySpot.get(e.getValue(Gatherable, 'spotId') ?? '');
      if (spot && items.includes(spot.itemId)) out.push({ id: spot.id, x: spot.x, z: spot.z, item: spot.itemId });
    }
    return out;
  }

  /** Distance from the head to a spot, on the ground plane. */
  distanceTo(spot: ResourceSpot): number {
    this.camera.getWorldPosition(this.head);
    return Math.hypot(spot.x - this.head.x, spot.z - this.head.z);
  }

  tryGather(e: Entity): boolean {
    this.lastGather = performance.now();
    const game = getGame(this.world);
    const spot = this.bySpot.get(e.getValue(Gatherable, 'spotId') ?? '');
    const charges = e.getValue(Gatherable, 'charges') ?? 0;
    if (!spot || charges <= 0) return false;
    if (this.distanceTo(spot) > REACH * reachCfg.scale) {
      game.toast('Too far away to reach - step closer (tap thumb on index to teleport).', 'bad');
      game.log.add(`gather ${spot.id}: out of reach`, 'bad');
      return false;
    }
    // Where it was: a carried pickup animates from here to your hand (CarrySystem).
    e.object3D!.getWorldPosition(pickupFrom.pos);
    pickupFrom.pos.y += 0.1;
    pickupFrom.time = performance.now() / 1000;
    pickupFrom.valid = true;
    if (!game.gather(spot.itemId, spot.id)) {
      pickupFrom.valid = false;
      return false;
    }
    this.lastGatherOk = performance.now();
    // Feedback (NPE A): a short note where it lay, saying where it went, and a tick on a controller.
    rayPick.note = fitsPouch(spot.itemId) ? `+1 ${itemName(spot.itemId)}, in your pouch` : `${itemName(spot.itemId)} in your hands`;
    rayPick.noteFor = 1.2;
    rayPick.nx = pickupFrom.pos.x;
    rayPick.ny = pickupFrom.pos.y;
    rayPick.nz = pickupFrom.pos.z;
    haptic(this.world, handClaims.holdHand);
    this.fbDirty = true;
    // Small things fly to the hip pouch; big things go to your hands (no flight).
    if (fitsPouch(spot.itemId)) {
      pickupFrom.valid = false;
      this.launchFlight(spot.itemId, e.object3D!);
    }
    // Your hand touching it: a soft material sound where it lay.
    const touched = ITEM_PHYSICS[spot.itemId].material;
    game.contact(touched, touched === 'leaf' || touched === 'fibre' ? 'leaf' : 'soil', pickupFrom.pos.x, pickupFrom.pos.y, pickupFrom.pos.z, 0.4);
    const left = charges - 1;
    e.setValue(Gatherable, 'charges', left);
    if (left <= 0) {
      e.object3D!.visible = false;
      e.removeComponent(RayInteractable);
    }
    // One charge grows back at a time, every `regrow` seconds, until the spot is full again (0 = never).
    const next = afterGather(game.spotState.get(spot.id), spot, game.time);
    e.setValue(Gatherable, 'regrowAt', next.r);
    game.spotState.set(spot.id, next);
    return true;
  }

  private launchFlight(item: ItemId, from: Object3D): void {
    const obj = itemMesh(item);
    from.getWorldPosition(obj.position);
    obj.position.y += 0.15;
    this.fx.add(obj);
    this.flights.push({ obj, from: obj.position.clone(), t: 0 });
  }

  private setGlow(obj: Object3D | null, mat: typeof glowMaterial): void {
    const glow = obj?.getObjectByName('Glow') as Mesh | undefined;
    if (glow) glow.material = mat;
  }

  /** Highlights the hovered resource (a gentle scale-up) and colours the crosshair by reach. */
  private updateHover(): void {
    let target: Object3D | null = null;
    let near = false;
    for (const e of this.queries.hovered.entities) {
      if ((e.getValue(Gatherable, 'charges') ?? 0) <= 0) continue;
      target = e.object3D ?? null;
      const spot = this.bySpot.get(e.getValue(Gatherable, 'spotId') ?? '');
      near = !!spot && this.distanceTo(spot) <= REACH;
      break;
    }
    if (target !== this.litObj) {
      this.litObj?.scale.setScalar(1);
      this.setGlow(this.litObj, glowMaterial);
      this.setGlow(target, glowMaterialHot);
      this.litObj = target;
    }
    target?.scale.setScalar(near ? 1.12 : 1.04);
    if (this.crosshair) {
      const desktop = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
      this.crosshair.style.display = desktop ? 'block' : 'none';
      this.crosshair.style.borderColor = target ? (near ? '#6fe07a' : '#ff9a3c') : '#fff';
      this.crosshair.style.transform = target ? 'scale(1.5)' : 'scale(1)';
    }
  }

  /**
   * The spot a ray press should act on (NPE A): the pinching hand's locked target when it has one (the last
   * stable target before the fingers closed), else the pressed spot itself. Never random, never a neighbour the
   * ray swung onto while the pinch closed.
   */
  private lockedFor(pressed: Entity): Entity {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return pressed;
    const pid = pressed.getValue(Gatherable, 'spotId') ?? '';
    let h = -1;
    for (let i = 0; i < 2; i++) if (hands[i].gripDown || (hands[i].grip && this.locks[i].locked !== null)) h = h < 0 || hands[i].gripDown ? i : h;
    if (h < 0) return pressed;
    const lock = this.locks[h];
    const key = lock.locked ?? lock.begin(this.rayKey[h] ?? pid);
    if (!key || key === pid) return pressed;
    const e = this.entityBySpot.get(key);
    if (!e || (e.getValue(Gatherable, 'charges') ?? 0) <= 0) return pressed;
    this.redirects++;
    getGame(this.world).log.add(`gather lock: ${pid} -> ${key}`);
    return e;
  }

  /** Ray-pick candidates: every live spot within PICK_RANGE (four times a second, not every frame). */
  private rebuildNear(): void {
    this.camera.getWorldPosition(this.head);
    let n = 0;
    for (const [id, e] of this.entityBySpot) {
      if (n >= MAX_NEAR) break;
      if ((e.getValue(Gatherable, 'charges') ?? 0) <= 0) continue;
      const spot = this.bySpot.get(id);
      if (!spot || spot.look === DRAG_LOOK) continue;
      const d = Math.hypot(spot.x - this.head.x, spot.z - this.head.z);
      if (d > PICK_RANGE) continue;
      const c = this.nearCands[n];
      c.key = id;
      c.x = spot.x;
      c.y = groundHeight(spot.x, spot.z) + 0.08;
      c.z = spot.z;
      c.r = fitsPouch(spot.itemId) ? 0.16 : 0.3;
      c.inReach = d <= REACH * reachCfg.scale;
      this.nearSpot[n] = id;
      n++;
    }
    this.nearN = n;
    this.fbDirty = true;
  }

  /** VR hands: per-hand ray pick and pinch lock, ray history, and a pinch that missed resolved to the locked target. */
  private updateAimAssist(dt: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      rayPick.key = '';
      return;
    }
    if ((this.nearIn -= dt) <= 0) {
      this.nearIn = 0.25;
      this.rebuildNear();
    }
    if (this.pendingPinch >= 0) {
      const hand = this.pendingPinch;
      this.pendingPinch = -1;
      // The ray's own press already gathered (or something else took the pinch): nothing to assist.
      const nowS = performance.now() / 1000;
      // A pinch at a panel (a button press, a scroll) is never a pickup.
      const atUi = handClaims.uiNear[hand] || nowS - handClaims.uiTapAt[hand] < 0.3;
      if (!atUi && performance.now() - this.lastGather > 150 && !getGame(this.world).held && nowS - handClaims.grabAt > 0.3) {
        const locked = this.locks[hand].locked;
        const le = locked ? this.entityBySpot.get(locked) : undefined;
        const lspot = locked ? this.bySpot.get(locked) : undefined;
        // Out of reach: the label already says "step closer"; a failed reach is not repeated as a toast.
        if (le && lspot && (le.getValue(Gatherable, 'charges') ?? 0) > 0) {
          if (this.distanceTo(lspot) <= REACH * reachCfg.scale) this.tryGather(le);
        }
        else {
          const a = this.aim[hand];
          if (a.n > 0) {
            const k = (a.i - Math.min(AIM_LOOKBACK, a.n) + AIM_HISTORY) % AIM_HISTORY;
            const best = this.nearestOnRay(a.o[k], a.d[k]);
            if (best) this.tryGather(best);
          }
        }
      }
    }
    let fbHand = -1;
    for (let h = 0; h < 2; h++) {
      const space = this.player.raySpaces[h === 0 ? 'left' : 'right'];
      const hf = hands[h];
      const lock = this.locks[h];
      if (!space || !hf.tracked) {
        this.rayKey[h] = null;
        lock.track(null, dt);
        lock.end();
        continue;
      }
      const a = this.aim[h];
      space.getWorldPosition(a.o[a.i]);
      space.getWorldDirection(a.d[a.i]).negate(); // XR ray spaces point down -Z
      const o = a.o[a.i];
      const d = a.d[a.i];
      a.i = (a.i + 1) % AIM_HISTORY;
      a.n = Math.min(AIM_HISTORY, a.n + 1);
      const i = pickByRay(this.nearCands, this.nearN, o.x, o.y, o.z, d.x, d.y, d.z);
      const key = i >= 0 ? this.nearSpot[i] : null;
      this.rayKey[h] = key;
      // While the fingers are closed the ray swings: the lock decides, the tracker waits.
      if (!hf.grip) lock.track(key, dt);
      if (hf.gripDown) {
        if (lock.locked === null) lock.begin(key);
        this.pendingPinch = h;
      } else if (!hf.grip) lock.end();
      const shown = lock.locked ?? lock.stable;
      if (shown && (fbHand < 0 || h === 1)) fbHand = h;
    }
    this.updateRayFeedback(fbHand);
  }

  /** The ring and label for what the hand ray means (drawn by GazeTargetSystem). */
  private updateRayFeedback(h: number): void {
    const lock = h >= 0 ? this.locks[h] : null;
    const key = lock ? (lock.locked ?? lock.stable) : null;
    if (!key) {
      rayPick.key = '';
      return;
    }
    if (key === rayPick.key && !this.fbDirty) return;
    this.fbDirty = false;
    const spot = this.bySpot.get(key);
    if (!spot) {
      rayPick.key = '';
      return;
    }
    const game = getGame(this.world);
    rayPick.key = key;
    rayPick.x = spot.x;
    rayPick.y = groundHeight(spot.x, spot.z) + 0.08;
    rayPick.z = spot.z;
    rayPick.r = fitsPouch(spot.itemId) ? 0.16 : 0.3;
    const name = game.gatheredCount(spot.itemId) > 0 ? itemName(spot.itemId) : spot.label;
    const far = this.distanceTo(spot) > REACH * reachCfg.scale;
    const block = game.gatherBlock(spot.itemId);
    rayPick.ok = !far && !block;
    rayPick.label = far ? `${name} - step closer` : block === 'pockets' ? `${name} - pockets full` : block === 'hands' ? `${name} - hands full` : `${name} - pinch to pick up`;
  }

  /** The gatherable spot closest in angle to the ray, within AIM_CONE and REACH. */
  private nearestOnRay(o: Vector3, d: Vector3): Entity | null {
    let best: Entity | null = null;
    let bestA = AIM_CONE;
    for (const [id, e] of this.entityBySpot) {
      if ((e.getValue(Gatherable, 'charges') ?? 0) <= 0 || !e.object3D?.visible) continue;
      const spot = this.bySpot.get(id);
      if (!spot || spot.look === DRAG_LOOK || this.distanceTo(spot) > REACH) continue;
      e.object3D.getWorldPosition(this.tmpP);
      this.tmpD.subVectors(this.tmpP, o);
      const len = this.tmpD.length();
      if (len < 0.05) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, this.tmpD.dot(d) / len)));
      if (ang < bestA) {
        bestA = ang;
        best = e;
      }
    }
    return best;
  }

  update(delta: number): void {
    this.updateAimAssist(delta);
    if (rayPick.noteFor > 0) rayPick.noteFor -= delta;
    this.pulse += delta;
    glowMaterial.opacity = 0.14 + 0.1 * Math.sin(this.pulse * 3);
    glowMaterialHot.opacity = 0.45 + 0.15 * Math.sin(this.pulse * 6);
    this.updateHover();
    if (this.flights.length) {
      hipPosition(this.camera, this.hip);
      for (let i = this.flights.length - 1; i >= 0; i--) {
        const f = this.flights[i];
        f.t += delta / FLIGHT_TIME;
        const t = Math.min(1, f.t);
        f.obj.position.lerpVectors(f.from, this.hip, t * t);
        f.obj.position.y += Math.sin(t * Math.PI) * 0.25;
        f.obj.scale.setScalar(1 - t * 0.7);
        if (t >= 1) {
          f.obj.removeFromParent();
          this.flights.splice(i, 1);
        }
      }
    }
    this.regrowTimer += delta;
    if (this.regrowTimer < 1) return;
    this.regrowTimer = 0;
    const now = getGame(this.world).time;
    this.camera.getWorldPosition(this.head);
    for (const e of this.queries.spots.entities) {
      const at = e.getValue(Gatherable, 'regrowAt') ?? 0;
      if ((e.getValue(Gatherable, 'charges') ?? 0) > 0) {
        const o = e.object3D!;
        const d = Math.hypot(o.position.x - this.head.x, o.position.z - this.head.z);
        const near = d < CULL_DISTANCE;
        this.setNear(o, near);
        if (near) {
          const glow = this.glowOf.get(e) ?? this.glowOf.set(e, o.getObjectByName('Glow') ?? null).get(e);
          if (glow) glow.visible = d < GLOW_DISTANCE;
        }
      }
      if (at <= 0 || now < at) continue;
      const spot = this.bySpot.get(e.getValue(Gatherable, 'spotId') ?? '');
      if (!spot) continue;
      const game = getGame(this.world);
      const prev = game.spotState.get(spot.id) ?? { c: e.getValue(Gatherable, 'charges') ?? 0, r: at };
      const res = afterRegrow(prev, spot, now);
      if (res === 'wait') continue;
      if (res === null) {
        e.setValue(Gatherable, 'charges', spot.charges);
        e.setValue(Gatherable, 'regrowAt', 0);
        game.spotState.delete(spot.id);
      } else {
        e.setValue(Gatherable, 'charges', res.c);
        e.setValue(Gatherable, 'regrowAt', res.r);
        game.spotState.set(spot.id, res);
      }
      this.setNear(e.object3D!, true);
      e.object3D!.visible = true;
      if (!e.hasComponent(RayInteractable)) e.addComponent(RayInteractable);
    }
  }
}
