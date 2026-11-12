// Contextual highlighting (docs/TUTORIAL_USABILITY_SPEC.md, part B.4): a few soft
// rings and ONE small label, never labels on everything.
//   - the object you point at or near: a ring and a label (name, what you can do, in/out of reach)
//   - holding something: open marks that take it glow green, marks that do not are dim red
//   - hovering a mark: it brightens and the label names the material it needs and says whether yours fits
//   - hint level 2 / 4: pulsing nearby resources / the one exact target with a bobbing arrow
// Every candidate goes through the same budget (game/assist.ts pickHighlights): at most
// ASSIST.highlightBudget at once, and each ring is released as soon as its reason is gone.
// The list is rebuilt five times a second and pooled meshes are reused, so nothing allocates per frame.
// A placement confirmation pop (an expanding ring) plays where a part was seated.

import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  createSystem,
  DoubleSide,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';
import { Gatherable, SnapSpot, StructurePart, WorldDropItem } from '../components/game-components.js';
import { ASSIST, diffHighlights, type Highlight, type HighlightKind, highlightPriority, openMarks, type Mark, pickHighlights } from '../game/assist.js';
import { BLUEPRINTS, spotWorldPosition } from '../game/blueprint.js';
import type { GameEvent } from '../game/game.js';
import { itemName } from '../game/items.js';
import { groundHeight } from '../game/world-layout.js';
import { REACH, reachCfg, ResourceSystem } from './resource-system.js';
import { assistFx, getGame, hintFx, rayPick } from './shared.js';

const RING_POOL = ASSIST.highlightBudget;
const SHOW_RANGE = 9;
const POPS = 3;

const ringGeo = new RingGeometry(0.16, 0.2, 28);
const mat = (color: number, opacity: number) => new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, side: DoubleSide, blending: AdditiveBlending });
const MATS: Record<HighlightKind, MeshBasicMaterial> = {
  target: mat(0xfff0c0, 0.85),
  fits: mat(0x4dff7a, 0.9),
  blocked: mat(0xff4a2e, 0.28),
  hint: mat(0x7fe8ff, 0.8),
  exact: mat(0xffe14d, 0.95),
};
const popMat = mat(0x9dffb0, 0.9);
const arrowMat = new MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95, depthTest: false });

export class HighlightSystem extends createSystem({
  hoverGather: { required: [Gatherable, Hovered] },
  hoverSpot: { required: [SnapSpot, Hovered] },
  hoverDrop: { required: [WorldDropItem, Hovered] },
  hoverPart: { required: [StructurePart, Hovered] },
}) {
  private rings: Mesh[] = [];
  private slot = new Map<string, number>();
  private slotKind: HighlightKind[] = [];
  private shown = new Set<string>();
  private want: Highlight[] = [];
  private picked: Highlight[] = [];
  private removed: string[] = [];
  private added: string[] = [];
  private marks: Mark[] = [];
  private marksDirty = true;
  private timer = 0;
  private t = 0;
  private head = new Vector3();
  private tmp = new Vector3();
  private arrow!: Mesh;
  private pool!: Mesh;
  /** Where the adaptive placement indicator points (the nearest mark the held part fits), when you keep missing. */
  private assistAt: { x: number; y: number; z: number } | null = null;
  private poolMat!: MeshBasicMaterial;
  private label!: Sprite;
  private labelCtx!: CanvasRenderingContext2D;
  private labelTex!: CanvasTexture;
  private labelText = '';
  private labelGood = true;
  private pops: Mesh[] = [];
  private popAge = new Float32Array(POPS).fill(-1);
  private nextPop = 0;
  private tx = 0;
  private ty = 0;
  private tz = 0;
  private hasTarget = false;

  init(): void {
    for (let i = 0; i < RING_POOL; i++) {
      const r = new Mesh(ringGeo, MATS.target);
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      r.renderOrder = 20;
      r.frustumCulled = false;
      this.world.createTransformEntity(r);
      this.rings.push(r);
      this.slotKind.push('target');
    }
    for (let i = 0; i < POPS; i++) {
      const p = new Mesh(ringGeo, popMat);
      p.rotation.x = -Math.PI / 2;
      p.visible = false;
      p.renderOrder = 21;
      p.frustumCulled = false;
      this.world.createTransformEntity(p);
      this.pops.push(p);
    }
    // The ground glow under the sky pillar: one soft radial pool.
    const gc = document.createElement('canvas');
    gc.width = gc.height = 128;
    const gx = gc.getContext('2d')!;
    const grad = gx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    gx.fillStyle = grad;
    gx.fillRect(0, 0, 128, 128);
    this.poolMat = new MeshBasicMaterial({ map: new CanvasTexture(gc), color: 0x9dffd0, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, blending: AdditiveBlending });
    this.pool = new Mesh(new CircleGeometry(0.9, 24), this.poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.visible = false;
    this.pool.renderOrder = 19;
    this.pool.frustumCulled = false;
    this.world.createTransformEntity(this.pool);
    this.arrow = new Mesh(new ConeGeometry(0.1, 0.28, 8), arrowMat);
    this.arrow.rotation.x = Math.PI; // points down at the target
    this.arrow.visible = false;
    this.arrow.renderOrder = 22;
    this.arrow.frustumCulled = false;
    this.world.createTransformEntity(this.arrow);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    this.labelCtx = canvas.getContext('2d')!;
    this.labelTex = new CanvasTexture(canvas);
    this.label = new Sprite(new SpriteMaterial({ map: this.labelTex, transparent: true, depthTest: false, depthWrite: false }));
    this.label.scale.set(0.62, 0.116, 1);
    this.label.visible = false;
    this.label.renderOrder = 30;
    this.world.createTransformEntity(this.label);

    const game = getGame(this.world);
    this.cleanupFuncs.push(
      game.on((e: GameEvent) => {
        if (e.type === 'structure' || e.type === 'held') this.marksDirty = true;
        if (e.type === 'placed') this.pop(e.x, e.y, e.z);
      }),
    );
  }

  private pop(x: number, y: number, z: number): void {
    const i = this.nextPop;
    this.nextPop = (i + 1) % POPS;
    this.pops[i].position.set(x, Math.max(y, groundHeight(x, z)) + 0.05, z);
    this.popAge[i] = 0;
    this.pops[i].visible = true;
  }

  /** The one thing you point at or are near, as a highlight and label, if any. */
  private hovered(): Highlight | null {
    const game = getGame(this.world);
    const pick = (set: Iterable<unknown>): unknown => {
      for (const e of set) return e;
      return null;
    };
    let eGather = pick(this.queries.hoverGather.entities) as { object3D?: { getWorldPosition(v: Vector3): Vector3 }; getValue(c: unknown, f: string): unknown } | null;
    // VR (NPE A): the hand ray's stable, pinch-locked target is the one that will be taken, not whichever
    // invisible hit sphere the swinging ray touches first.
    if (rayPick.key) eGather = (this.world.getSystem(ResourceSystem)?.entityFor(rayPick.key) as typeof eGather) ?? eGather;
    const eSpot = pick(this.queries.hoverSpot.entities) as typeof eGather;
    const eDrop = pick(this.queries.hoverDrop.entities) as typeof eGather;
    const ePart = pick(this.queries.hoverPart.entities) as typeof eGather;
    this.hasTarget = false;
    if (eSpot?.object3D) {
      const s = game.structures.find((t) => t.id === eSpot.getValue(SnapSpot, 'structureId'));
      const idx = (eSpot.getValue(SnapSpot, 'index') as number) ?? 0;
      if (!s) return null;
      const def = BLUEPRINTS[s.kind].spots[idx];
      const p = spotWorldPosition(s, idx);
      const fits = !!game.held && def.accepts.includes(game.held);
      this.setLabel(`${def.label}: needs ${def.accepts.map((i) => itemName(i).toLowerCase()).join(' or ')}${game.held ? (fits ? ' - yours fits, let go here' : ' - yours does not fit') : ''}`, !game.held || fits);
      this.tx = p.x;
      this.ty = p.y;
      this.tz = p.z;
      this.hasTarget = true;
      return { id: `mark_${s.id}_${idx}`, kind: 'target', x: p.x, y: p.y, z: p.z, priority: highlightPriority('target', 0) };
    }
    if (eGather?.object3D) {
      const resources = this.world.getSystem(ResourceSystem);
      const spot = resources?.spot((eGather.getValue(Gatherable, 'spotId') as string) ?? '');
      if (!spot || !resources) return null;
      const known = game.gatheredCount(spot.itemId) > 0;
      const near = resources.distanceTo(spot) <= REACH * reachCfg.scale;
      const block = game.gatherBlock(spot.itemId);
      // Name, and whether it can be taken now (the pickup indicator).
      const verb = !near ? ': too far, step closer' : block === 'pockets' ? ': pockets full' : block === 'hands' ? ': hands full' : ': pinch to take';
      this.setLabel(`${known ? itemName(spot.itemId) : spot.label}${verb}`, near && !block);
      this.tx = spot.x;
      this.ty = groundHeight(spot.x, spot.z);
      this.tz = spot.z;
      this.hasTarget = true;
      return { id: `res_${spot.id}`, kind: 'target', x: this.tx, y: this.ty, z: this.tz, priority: highlightPriority('target', 0) };
    }
    if (eDrop?.object3D) {
      const d = game.drops.find((x) => x.id === eDrop.getValue(WorldDropItem, 'dropId'));
      if (!d) return null;
      const near = Math.hypot(d.x - game.player.x, d.z - game.player.z) <= 4.5;
      this.setLabel(`${itemName(d.item)}${near ? ': pinch to pick up' : ': too far, get closer'}`, near);
      this.tx = d.x;
      this.ty = groundHeight(d.x, d.z);
      this.tz = d.z;
      this.hasTarget = true;
      return { id: `drop_${d.id}`, kind: 'target', x: d.x, y: this.ty, z: d.z, priority: highlightPriority('target', 0) };
    }
    if (ePart?.object3D) {
      ePart.object3D.getWorldPosition(this.tmp);
      this.setLabel('Part of your build', true);
      this.tx = this.tmp.x;
      this.ty = this.tmp.y;
      this.tz = this.tmp.z;
      this.hasTarget = true;
      return { id: `part_${Math.round(this.tmp.x * 10)}_${Math.round(this.tmp.z * 10)}`, kind: 'target', x: this.tx, y: this.ty, z: this.tz, priority: highlightPriority('target', 0) };
    }
    return null;
  }

  private setLabel(text: string, good: boolean): void {
    if (text === this.labelText && good === this.labelGood) return;
    this.labelText = text;
    this.labelGood = good;
    const c = this.labelCtx;
    c.clearRect(0, 0, 512, 96);
    c.fillStyle = 'rgba(20,18,14,0.72)';
    c.beginPath();
    c.roundRect(4, 8, 504, 80, 16);
    c.fill();
    c.fillStyle = good ? '#ffffff' : '#ffb59a';
    c.font = 'bold 30px sans-serif';
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    // Two short lines at most.
    const words = text.split(' ');
    let l1 = '';
    let l2 = '';
    for (const w of words) (c.measureText(`${l1} ${w}`).width < 470 && !l2 ? (l1 += (l1 ? ' ' : '') + w) : (l2 += (l2 ? ' ' : '') + w));
    if (l2) {
      c.fillText(l1, 256, 33);
      c.fillText(l2.length > 38 ? `${l2.slice(0, 36)}...` : l2, 256, 66);
    } else c.fillText(l1, 256, 48);
    this.labelTex.needsUpdate = true;
  }

  /** Rebuild what should be highlighted (five times a second): the budget picks the few that matter. */
  private rebuild(): void {
    const game = getGame(this.world);
    this.camera.getWorldPosition(this.head);
    this.want.length = 0;
    const h = this.hovered();
    if (h) this.want.push(h);
    if (game.held && this.marks.length) {
      for (const m of this.marks) {
        const d = Math.hypot(m.x - this.head.x, m.z - this.head.z);
        if (d > SHOW_RANGE) continue;
        // Two-hand key slots (the slab on its supports) glow once they are open, like any other mark.
        const fits = m.accepts.includes(game.held);
        const kind: HighlightKind = fits ? 'fits' : 'blocked';
        this.want.push({ id: `mark_${m.structure.id}_${m.index}`, kind, x: m.x, y: m.y, z: m.z, priority: highlightPriority(kind, d) });
      }
    }
    // You keep missing a placement: the mark the held part fits gets a pulsing outline (and, if it goes on, an arrow).
    this.assistAt = null;
    const ind = game.assist.indicator();
    if (game.held && ind >= 1 && this.marks.length) {
      let best: Mark | null = null;
      let bd = 6;
      for (const m of this.marks) {
        if (!m.accepts.includes(game.held)) continue;
        const d = Math.hypot(m.x - this.head.x, m.z - this.head.z);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (best) {
        this.assistAt = { x: best.x, y: best.y, z: best.z };
        this.want.push({ id: `assist_${best.structure.id}_${best.index}`, kind: 'exact', x: best.x, y: best.y, z: best.z, priority: highlightPriority('exact', bd) });
      }
    }
    for (const p of hintFx.pulse) this.want.push({ id: p.id, kind: 'hint', x: p.x, y: p.y, z: p.z, priority: highlightPriority('hint', Math.hypot(p.x - this.head.x, p.z - this.head.z)) });
    // Progressive assistance (NPE C): the one thing the player seems stuck on pulses softly.
    const ap = assistFx.pulse;
    if (ap) this.want.push({ id: `assist_${ap.id}`, kind: 'hint', x: ap.x, y: ap.y, z: ap.z, priority: highlightPriority('hint', 0) });
    if (hintFx.exact) this.want.push({ id: hintFx.exact.id, kind: 'exact', x: hintFx.exact.x, y: hintFx.exact.y, z: hintFx.exact.z, priority: highlightPriority('exact', 0) });
    pickHighlights(this.want, ASSIST.highlightBudget, this.picked);
    const d = diffHighlights(this.shown, this.picked, this.removed, this.added);
    for (const id of d.removed) {
      const i = this.slot.get(id);
      if (i !== undefined) this.rings[i].visible = false;
      this.slot.delete(id);
      this.shown.delete(id);
    }
    const used = new Set(this.slot.values());
    for (const id of d.added) {
      let i = 0;
      while (used.has(i) && i < RING_POOL - 1) i++;
      used.add(i);
      this.slot.set(id, i);
      this.shown.add(id);
    }
    // Place and colour every kept highlight (the kind may have changed: blocked -> fits when you pick up a different part).
    for (const hl of this.picked) {
      const i = this.slot.get(hl.id);
      if (i === undefined) continue;
      const r = this.rings[i];
      r.position.set(hl.x, Math.max(hl.y, groundHeight(hl.x, hl.z)) + 0.04, hl.z);
      if (this.slotKind[i] !== hl.kind) {
        this.slotKind[i] = hl.kind;
        r.material = MATS[hl.kind];
      }
      r.visible = true;
    }
    // Arrow over the one exact target.
    this.arrow.visible = !!hintFx.exact || (!!this.assistAt && game.assist.indicator() >= 2);
    // The label follows the hovered target only.
    this.label.visible = !!h && this.hasTarget;
  }

  update(delta: number): void {
    this.t += delta;
    if (this.marksDirty) {
      this.marksDirty = false;
      openMarks(getGame(this.world).structures, this.marks);
    }
    if ((this.timer -= delta) <= 0) {
      this.timer = 0.2;
      this.rebuild();
    }
    // Soft pulse; blocked marks stay quiet, hints and the exact target breathe a little more.
    const s = 1 + Math.sin(this.t * 5) * 0.18;
    MATS.fits.opacity = 0.6 + Math.sin(this.t * 5) * 0.3;
    MATS.hint.opacity = 0.45 + Math.sin(this.t * 4) * 0.35;
    MATS.exact.opacity = 0.7 + Math.sin(this.t * 7) * 0.25;
    for (let i = 0; i < RING_POOL; i++) if (this.rings[i].visible) this.rings[i].scale.setScalar(this.slotKind[i] === 'blocked' ? 0.8 : s * (this.slotKind[i] === 'target' ? 1.25 : 1));
    // The ground pool pulses under the pillar and goes with it.
    const gl = hintFx.glow;
    this.pool.visible = !!gl;
    if (gl) {
      this.pool.position.set(gl.x, Math.max(gl.y, groundHeight(gl.x, gl.z)) + 0.03, gl.z);
      this.pool.scale.setScalar(1 + Math.sin(this.t * 3) * 0.12);
      this.poolMat.opacity = 0.45 + Math.sin(this.t * 3) * 0.2;
    }
    const arrowAt = hintFx.exact ?? this.assistAt;
    if (this.arrow.visible && arrowAt) {
      this.arrow.position.set(arrowAt.x, Math.max(arrowAt.y, groundHeight(arrowAt.x, arrowAt.z)) + 0.75 + Math.sin(this.t * 4) * 0.1, arrowAt.z);
    }
    if (this.label.visible) this.label.position.set(this.tx, this.ty + 0.55, this.tz);
    for (let i = 0; i < POPS; i++) {
      if (this.popAge[i] < 0) continue;
      this.popAge[i] += delta;
      const k = this.popAge[i] / 0.45;
      if (k >= 1) {
        this.popAge[i] = -1;
        this.pops[i].visible = false;
        continue;
      }
      this.pops[i].scale.setScalar(0.6 + k * 2.6);
      popMat.opacity = 0.9 * (1 - k);
    }
  }
}

