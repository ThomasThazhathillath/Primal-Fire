// LOOK -> PINCH -> INTERACT (docs/GAZE_PINCH_90FPS_SPEC.md). Each frame:
//   1. the gaze ray: WebXR eye gaze (an input source with targetRayMode "gaze") when the runtime gives one,
//      else the head, else (desktop) the mouse ray;
//   2. the target: a short candidate list (rebuilt 10x a second within reach) scored against the ray by
//      GazeTargeter (cone, reach, priority, hysteresis), with a cheap 2D occlusion test on the collision grid;
//   3. feedback: one ring sized to the target, eased in and out, and a small label after a short dwell;
//   4. a pinch from either hand acts on the target, but only when nothing above it owns that pinch:
//      the hand holding something > a UI tap > a near direct grab (PinchGrabSystem) > a pointer ray that is
//      hovering a game object (IWSDK's own Pressed path) > gaze. One pinch, one handler.
// What the pinch does comes from game/gaze.ts gazeAction and reuses the game's own APIs, so object-specific
// rules (pouch, two-hand slab, fire intents) stay where they are. Nothing is allocated per frame.

import {
  CanvasTexture,
  createSystem,
  DoubleSide,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { Gatherable, SnapSpot, StructurePart, WorldDropItem } from '../components/game-components.js';
import { needText, openMarks, type Mark } from '../game/assist.js';
import { collisionWorld } from '../game/collision.js';
import { GAZE, gazeAction, type GazeCandidate, type GazeKind, GazePinchGate, gazeStats, GazeTargeter, segmentBlocked } from '../game/gaze.js';
import { fitsPouch, type ItemId, itemName } from '../game/items.js';
import { groundHeight, RESOURCES } from '../game/world-layout.js';
import { hands, mouse } from './hand-input-system.js';
import { DRAG_LOOK, ResourceSystem } from './resource-system.js';
import { type GazeUiOwner, gazeUi, getGame, getUi, handBusy, handClaims } from './shared.js';

const MAX_CANDS = 96;
/** Gaze can open the bench panel from this far (m); the panel itself closes beyond 3.5 m. */
const BENCH_GAZE_REACH = 3;
/** Candidates are gathered within this distance (m) of the head. */
const GATHER_RANGE = 8;
/** Static solids that block the eye (fallen logs and structures are low enough to look over). */
const OCCLUDERS = new Set(['tree', 'boulder', 'splitRock', 'ruinsWall', 'mast', 'shatteredTree']);
const RADIUS: Record<GazeKind, number> = { resource: 0.14, drop: 0.14, mark: 0.12, bench: 0.6, firePit: 0.5, ui: 0.05 };

export type GazeSource = 'eye' | 'head' | 'mouse' | 'none';

const ringGeo = new RingGeometry(0.85, 1, 40);
const COLORS = { take: 0xfff3d0, fits: 0x5dff86, wrong: 0xff6a4a };

export class GazeTargetSystem extends createSystem({
  hoverGather: { required: [Gatherable, Hovered] },
  hoverSpot: { required: [SnapSpot, Hovered] },
  hoverDrop: { required: [WorldDropItem, Hovered] },
  hoverPart: { required: [StructurePart, Hovered] },
}) {
  private cands: GazeCandidate[] = [];
  private n = 0;
  /** Spot id per resource candidate slot. */
  private spotIds: string[] = [];
  /** Owner and element id per UI candidate slot (panels, icon bar, objective card). */
  private uiOwner: Array<GazeUiOwner | null> = [];
  private uiId: number[] = [];
  /** The UI element currently lit by gaze. */
  private hoverOwner: GazeUiOwner | null = null;
  private hoverId = -1;
  private hoverKey = '';
  private addUi = (prefix: string, key: string, x: number, y: number, z: number, r: number, owner: GazeUiOwner, id: number): void => {
    const slot = this.n;
    const c = this.push('ui', this.key(prefix, key), x, y, z, slot, true);
    if (!c) return;
    c.r = r;
    this.uiOwner[slot] = owner;
    this.uiId[slot] = id;
  };
  private marks: Mark[] = [];
  private keys = new Map<string, string>();
  private targeter = new GazeTargeter();
  private gates = [new GazePinchGate(), new GazePinchGate()];
  private rebuildIn = 0;
  private origin = new Vector3();
  private dir = new Vector3();
  private q = new Quaternion();
  private tmp = new Vector3();
  private source: GazeSource = 'none';
  private vrNow = false;
  private target: GazeCandidate | null = null;
  /** Hand whose gaze pinch took something, until it is let go. */
  private pickedHand = -1;
  /** Hand whose gaze pinch is still closed (target locked meanwhile). */
  private lockHand = -1;
  // feedback
  private ring!: Mesh;
  private ringMat!: MeshBasicMaterial;
  private fade = 0;
  private label!: Sprite;
  private labelCtx!: CanvasRenderingContext2D;
  private labelTex!: CanvasTexture;
  private labelText = '';
  private labelColor = '';
  private shownKey: string | null = null;
  /** Ray hover owns targeting this frame (a hand/controller/mouse ray is on a game object). */
  private rayOwns = false;
  private actions = 0;
  private lastVerb = 'none';
  private solidAt = (x: number, z: number): boolean => {
    const near = collisionWorld().blockersNear(x, z, 0.02);
    for (let i = 0; i < near.length; i++) if (OCCLUDERS.has(near[i].tag)) return true;
    return false;
  };
  private occluded = (c: GazeCandidate): boolean => c.kind !== 'ui' && segmentBlocked(this.origin.x, this.origin.z, c.x, c.z, this.solidAt);

  init(): void {
    for (let i = 0; i < MAX_CANDS; i++) {
      this.cands.push({ kind: 'resource', key: '', x: 0, y: 0, z: 0, r: 0.1, ref: 0, enabled: true });
      this.spotIds.push('');
      this.uiOwner.push(null);
      this.uiId.push(-1);
    }
    this.ringMat = new MeshBasicMaterial({ color: COLORS.take, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: DoubleSide });
    this.ring = new Mesh(ringGeo, this.ringMat);
    this.ring.name = 'GazeRing';
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 24;
    this.ring.frustumCulled = false;
    this.world.createTransformEntity(this.ring);

    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 72;
    this.labelCtx = canvas.getContext('2d')!;
    this.labelTex = new CanvasTexture(canvas);
    this.label = new Sprite(new SpriteMaterial({ map: this.labelTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    this.label.name = 'GazeLabel';
    this.label.scale.set(0.42, 0.079, 1);
    this.label.visible = false;
    this.label.renderOrder = 31;
    this.world.createTransformEntity(this.label);

    const game = getGame(this.world);
    this.cleanupFuncs.push(
      game.on((e) => {
        if (e.type === 'structure' || e.type === 'held' || e.type === 'drops') this.rebuildIn = 0;
        // A gaze-picked thing was let go (the hand may be refilled from the bag in the same frame).
        if (e.type === 'held' && e.item === null && this.pickedHand >= 0) {
          gazeStats.releases++;
          this.pickedHand = -1;
        }
      }),
    );
    // Debug / test hook (also read by the perf overlay).
    (window as unknown as { __gaze?: unknown }).__gaze = {
      list: () => this.cands.slice(0, this.n).map((c) => ({ kind: c.kind, key: c.key, x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), enabled: c.enabled })),
      state: () => ({
        source: this.source,
        held: game.held,
        target: this.target ? { kind: this.target.kind, key: this.target.key, x: this.target.x, y: this.target.y, z: this.target.z } : null,
        candidates: this.n,
        switches: this.targeter.switches,
        rayOwns: this.rayOwns,
        actions: this.actions,
        lastVerb: this.lastVerb,
        label: this.label.visible ? this.labelText : '',
        stats: { picks: gazeStats.picks, releases: gazeStats.releases, placed: gazeStats.placed },
      }),
    };
  }

  /** Which gaze ray this frame; false when there is none. */
  private readRay(vr: boolean): boolean {
    if (vr) {
      const session = this.renderer.xr.getSession();
      const frame = this.renderer.xr.getFrame?.() as XRFrame | undefined;
      const ref = this.renderer.xr.getReferenceSpace();
      if (session && frame && ref) {
        for (const src of session.inputSources) {
          if (src.targetRayMode !== ('gaze' as XRTargetRayMode)) continue;
          const pose = frame.getPose(src.targetRaySpace, ref);
          if (!pose) break;
          const p = pose.transform.position;
          const o = pose.transform.orientation;
          this.origin.set(p.x, p.y, p.z);
          this.player.localToWorld(this.origin);
          this.player.getWorldQuaternion(this.q);
          this.dir.set(0, 0, -1).applyQuaternion(this.tmpQ.set(o.x, o.y, o.z, o.w)).applyQuaternion(this.q);
          this.source = 'eye';
          return true;
        }
      }
      this.camera.getWorldPosition(this.origin);
      this.camera.getWorldDirection(this.dir);
      this.source = 'head';
      return true;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0) {
      this.source = 'none';
      return false;
    }
    this.camera.getWorldPosition(this.origin);
    this.dir
      .set(((mouse.x - rect.left) / rect.width) * 2 - 1, -((mouse.y - rect.top) / rect.height) * 2 + 1, 0.5)
      .unproject(this.camera)
      .sub(this.origin)
      .normalize();
    this.source = 'mouse';
    return true;
  }

  private tmpQ = new Quaternion();

  private key(prefix: string, id: string | number): string {
    const raw = `${prefix}${id}`;
    let k = this.keys.get(raw);
    if (!k) this.keys.set(raw, (k = raw));
    return k;
  }

  private push(kind: GazeKind, key: string, x: number, y: number, z: number, ref: number, enabled: boolean): GazeCandidate | null {
    if (this.n >= MAX_CANDS) return null;
    const c = this.cands[this.n++];
    c.kind = kind;
    c.key = key;
    c.x = x;
    c.y = y;
    c.z = z;
    c.r = RADIUS[kind];
    c.ref = ref;
    c.enabled = enabled;
    return c;
  }

  /** The short list of eligible things within reach (10 Hz; positions only change when they are moved). */
  private rebuild(): void {
    const game = getGame(this.world);
    const res = this.world.getSystem(ResourceSystem);
    const hx = this.origin.x;
    const hz = this.origin.z;
    const near = (x: number, z: number) => Math.abs(x - hx) < GATHER_RANGE && Math.abs(z - hz) < GATHER_RANGE;
    this.n = 0;
    // Holding something: only what can take it is a target (a hand holds one thing; loose things wait).
    const held = !!game.held;
    if (res && !held) {
      for (const spot of RESOURCES) {
        if (!near(spot.x, spot.z)) continue;
        const e = res.entityFor(spot.id);
        if (!e?.object3D?.visible || (e.getValue(Gatherable, 'charges') ?? 0) <= 0) continue;
        e.object3D.getWorldPosition(this.tmp);
        const slot = this.n;
        if (this.push('resource', this.key('r:', spot.id), this.tmp.x, this.tmp.y + (spot.look === DRAG_LOOK ? 0.15 : 0.06), this.tmp.z, slot, true)) this.spotIds[slot] = spot.id;
      }
    }
    if (!held) for (const d of game.drops) if (near(d.x, d.z)) this.push('drop', this.key('d:', d.id), d.x, groundHeight(d.x, d.z) + 0.08, d.z, d.id, true);
    openMarks(game.structures, this.marks);
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i];
      if (!near(m.x, m.z)) continue;
      // A two-hand key slot is placed by lifting the part on with both hands, not by gaze.
      if (m.index < 0 && !m.structure.keyOpen) continue;
      const fits = game.held ? m.accepts.includes(game.held) : m.accepts.some((id) => game.count(id) > 0);
      this.push('mark', this.key(`m:${m.structure.id}:`, m.index), m.x, m.y + 0.04, m.z, i, fits);
    }
    for (const s of game.structures) {
      if (!s.complete || !near(s.x, s.z)) continue;
      if (s.kind === 'workbench' && !held) this.push('bench', this.key('b:', s.id), s.x, groundHeight(s.x, s.z) + 0.75, s.z, s.id, !game.held);
      else if (s.kind === 'firePit' && game.held) {
        const useful = !!game.intentAt(game.held, s.x, s.z);
        if (useful) this.push('firePit', this.key('f:', s.id), s.x, groundHeight(s.x, s.z) + 0.15, s.z, s.id, true);
      }
    }
    // In VR every shown UI element is a target too: icon bar, panels, the objective card.
    if (this.vrNow) for (let i = 0; i < gazeUi.length; i++) gazeUi[i].collectGaze(this.addUi);
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.1);
    const game = getGame(this.world);
    const vr = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    this.vrNow = vr;
    const have = this.readRay(vr);
    // An eye-gaze input source (metaVRGlasses) is itself a pointer ray in IWSDK and hovers whatever you look at: that
    // hover is this system's own target, not another handler's, so it must not hand the pinch to the ray (which
    // would gather into the bag). Head gaze has no such ray; eye gaze now behaves the same.
    this.rayOwns =
      this.source !== 'eye' &&
      (this.queries.hoverGather.entities.size > 0 ||
      this.queries.hoverSpot.entities.size > 0 ||
      this.queries.hoverDrop.entities.size > 0 ||
        this.queries.hoverPart.entities.size > 0);
    if ((this.rebuildIn -= dt) <= 0 && have) {
      this.rebuildIn = 0.1;
      this.rebuild();
    }
    this.targeter.locked = this.lockHand >= 0;
    const i = have ? this.targeter.update(this.cands, this.n, this.origin.x, this.origin.y, this.origin.z, this.dir.x, this.dir.y, this.dir.z, dt, this.occluded) : -1;
    this.target = i >= 0 ? this.cands[i] : null;
    this.updateUiHover();

    if (vr) {
      for (let h = 0 as 0 | 1; h < 2; h = (h + 1) as 0 | 1) {
        const hand = hands[h];
        const edge = this.gates[h].update(hand.grip, hand.tracked || hand.tipTracked, dt);
        if (edge === 'release' && this.lockHand === h) this.lockHand = -1;
        if (edge !== 'start') continue;
        this.onPinch(h);
      }
    } else if (mouse.released && Math.hypot(mouse.dragX, mouse.dragY) < 6 && mouse.heldFor < 0.45) {
      // Desktop: a click with no ray target under the pointer acts on the gaze (cone-assisted) target.
      if (!game.held) this.onPinch(1);
    }
    this.updateFx(dt);
  }

  private onPinch(h: 0 | 1): void {
    const game = getGame(this.world);
    const t = this.target;
    const now = performance.now() / 1000;
    const busy = handBusy(this.world, h);
    // A near grab already took this pinch (PinchGrabSystem runs first and stamps grabAt).
    const direct = now - handClaims.grabAt < 0.05;
    const owned = busy.held || busy.ui || direct || this.rayOwns;
    let fits = false;
    let bagFits = false;
    if (t?.kind === 'mark') {
      const m = this.marks[t.ref];
      fits = !!m && !!game.held && m.accepts.includes(game.held);
      bagFits = !!m && m.accepts.some((id) => game.count(id) > 0);
    } else if (t?.kind === 'firePit') fits = !!game.held;
    const verb = gazeAction({ kind: t?.kind ?? null, held: !!game.held, fits, bagFits, owned });
    this.lastVerb = verb;
    if (verb === 'none' || !t) return;
    this.gates[h].consume();
    this.lockHand = h;
    // Every handler later in the frame (ray press, aim assist) sees this pinch as taken.
    handClaims.grabAt = now;
    this.actions++;
    game.log.add(`gaze ${verb} ${t.key} (hand ${h}, ${this.source})`);
    switch (verb) {
      case 'take': {
        const e = this.world.getSystem(ResourceSystem)?.entityFor(this.spotIds[t.ref]);
        const res = this.world.getSystem(ResourceSystem);
        if (!e || !res) return;
        handClaims.holdHand = h;
        const spot = res.spot(this.spotIds[t.ref]);
        if (!res.tryGather(e)) return;
        // Small things go to the pouch on pickup: bring it straight back into this hand (as a direct grab does).
        if (!game.held && spot && fitsPouch(spot.itemId)) game.takeOut(spot.itemId);
        this.picked(h);
        return;
      }
      case 'pickUp':
        handClaims.holdHand = h;
        if (game.pickUpDrop(t.ref)) this.picked(h);
        return;
      case 'fillFromBag': {
        const m = this.marks[t.ref];
        if (m && game.fillFromBag(m.structure.id, m.index)) gazeStats.placed++;
        return;
      }
      case 'seatHeld': {
        const m = this.marks[t.ref];
        if (!m || !game.held) return;
        const ok = m.index >= 0 ? game.fillSpot(m.structure.id, m.index, game.held, { x: m.x, z: m.z }) : game.placeKey(m.structure.id, m.x, m.z, 1);
        if (ok) {
          gazeStats.placed++;
          this.pickedHand = -1;
        }
        return;
      }
      case 'wrongPart': {
        const m = this.marks[t.ref];
        if (m) game.toast(`This mark needs ${needText(m)}.`, 'bad');
        return;
      }
      case 'openBench': {
        // The bench panel closes itself when you are further than the bench's leave distance, so opening it from
        // across the clearing would flash and vanish: ask for a step closer instead.
        if (Math.hypot(game.player.x - t.x, game.player.z - t.z) > BENCH_GAZE_REACH) {
          game.toast('Step closer to the workbench to use it.', 'note');
          return;
        }
        getUi(this.world).openBench?.(t.ref);
        return;
      }
      case 'pressUi': {
        const owner = this.uiOwner[t.ref];
        if (!owner) return;
        // A UI press is a tap: this pinch is neither a grab nor a teleport aim, and no other handler may take it.
        handClaims.uiTapAt[h] = now;
        handClaims.uiNear[h] = true;
        handClaims.uiNearAt[h] = now;
        owner.gazeActivate(this.uiId[t.ref]);
        this.rebuildIn = 0;
        return;
      }
      case 'useAtFire':
        game.runIntent(game.held, t.x, t.z, 'release');
        return;
    }
  }

  /** Light the UI element the gaze is on (and clear the one it left). */
  private updateUiHover(): void {
    const t = this.target;
    const ui = t && t.kind === 'ui' && !this.rayOwns ? t : null;
    if (ui && ui.key === this.hoverKey) return;
    if (this.hoverOwner) this.hoverOwner.gazeHover(this.hoverId, false);
    this.hoverOwner = null;
    this.hoverKey = '';
    if (!ui) return;
    const owner = this.uiOwner[ui.ref];
    if (!owner) return;
    this.hoverOwner = owner;
    this.hoverId = this.uiId[ui.ref];
    this.hoverKey = ui.key;
    owner.gazeHover(this.hoverId, true);
  }

  private picked(h: 0 | 1): void {
    const game = getGame(this.world);
    handClaims.grabbing[h] = !!game.held;
    if (game.held) this.pickedHand = h;
    gazeStats.picks++;
  }

  // ---------------------------------------------------------------- feedback

  private updateFx(dt: number): void {
    const game = getGame(this.world);
    const t = this.target;
    // A ray already shows its own hover (HighlightSystem): never two highlights for one thing.
    const show = !!t && !this.rayOwns && t.kind !== 'ui';
    this.fade += ((show ? 1 : 0) - this.fade) * Math.min(1, dt * (show ? 18 : 10));
    const visible = this.fade > 0.02;
    this.ring.visible = visible;
    if (!visible) {
      this.label.visible = false;
      this.shownKey = null;
      return;
    }
    if (t) {
      const y = t.kind === 'bench' ? groundHeight(t.x, t.z) : t.kind === 'mark' ? t.y - 0.03 : Math.max(groundHeight(t.x, t.z), t.y - 0.06);
      this.ring.position.set(t.x, y + 0.02, t.z);
      this.ring.scale.setScalar(t.r * (1 + 0.04 * Math.sin(performance.now() / 160)));
      if (t.key !== this.shownKey) {
        this.shownKey = t.key;
        this.ringMat.color.setHex(t.enabled ? (t.kind === 'mark' && game.held ? COLORS.fits : COLORS.take) : COLORS.wrong);
        this.setLabel(this.labelFor(t), t.enabled ? '#ffffff' : '#ffb59a');
      }
      this.label.position.set(t.x, y + Math.max(0.3, t.r + 0.25), t.z);
    }
    this.ringMat.opacity = 0.85 * this.fade;
    const lab = !!t && this.targeter.dwell >= GAZE.labelDwell;
    const lm = this.label.material as SpriteMaterial;
    lm.opacity += ((lab ? this.fade : 0) - lm.opacity) * Math.min(1, dt * 12);
    this.label.visible = lm.opacity > 0.02;
  }

  private labelFor(t: GazeCandidate): string {
    const game = getGame(this.world);
    switch (t.kind) {
      case 'resource': {
        const spot = this.world.getSystem(ResourceSystem)?.spot(this.spotIds[t.ref]);
        if (!spot) return '';
        return game.gatheredCount(spot.itemId) > 0 ? itemName(spot.itemId) : spot.label;
      }
      case 'drop': {
        const d = game.drops.find((x) => x.id === t.ref);
        return d ? itemName(d.item as ItemId) : '';
      }
      case 'mark': {
        const m = this.marks[t.ref];
        if (!m) return '';
        const need = `Needs ${needText(m)}`;
        if (!game.held) return need;
        return t.enabled ? `${need} - yours fits` : `${need} - not yours`;
      }
      case 'bench':
        return 'Workbench';
      case 'firePit':
        return 'Fire pit';
      case 'ui':
        return '';
    }
  }

  private setLabel(text: string, color: string): void {
    if (text === this.labelText && color === this.labelColor) return;
    this.labelText = text;
    this.labelColor = color;
    const c = this.labelCtx;
    c.clearRect(0, 0, 384, 72);
    if (!text) {
      this.labelTex.needsUpdate = true;
      return;
    }
    c.font = 'bold 28px sans-serif';
    const w = Math.min(376, c.measureText(text).width + 36);
    c.fillStyle = 'rgba(20,18,14,0.7)';
    c.beginPath();
    c.roundRect(192 - w / 2, 10, w, 52, 26);
    c.fill();
    c.fillStyle = color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 192, 37, 360);
    this.labelTex.needsUpdate = true;
  }
}
