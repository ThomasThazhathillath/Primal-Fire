// The workbench crafting station (rules in src/game/bench.ts). Clicking or
// pinching a finished workbench opens a recipe panel above it. Choosing a
// recipe lays its parts on the slab, shows a ghost of the result and an
// animated hand cue, and then reads your hand motion for each step:
//   desktop: hold the mouse button and stroke sideways (scrape; fast and long =
//            saw), circle around where you pressed (wrap), drag down (press),
//            flick down and release (strike), scroll the wheel (twist);
//   VR:      the same motions with your hands over the bench.
// Only the motion the step asks for counts; nothing completes on a click or a
// timer. Walking away stops the craft and gives the parts back.

import {
  BoxGeometry,
  createSystem,
  type Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  RayInteractable,
  type UIKit,
  type UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { BENCH_RECIPES, partsStatus, type BenchMotion } from '../game/bench.js';
import { BLUEPRINTS } from '../game/blueprint.js';
import type { GameEvent } from '../game/game.js';
import { itemName, type ItemId } from '../game/items.js';
import { stepStarted, WorkRate } from '../game/stepfx.js';
import { BenchFx } from './bench-fx.js';
import { itemMesh } from '../scene-assets/item-meshes.js';
import { hands, mouse, pulse } from './hand-input-system.js';
import { PanelTouch } from './panel-touch.js';
import { getGame, getUi, handPose, hidePanel, menu, PANEL_DISTANCE, PANEL_DOWN, placeInFront, uiText } from './shared.js';

const ROWS = 10;
const TRACK_PX = 260;
/** Walk further than this (m) from the bench and the craft stops. */
const LEAVE_DISTANCE = 3.5;
/** Desktop motion scales. */
const PX_STROKE = 0.003; // metres of stroke per pixel
const PX_PRESS = 0.002;
const WHEEL_TWIST = 0.01;
const SAW_PX_S = 700; // sideways strokes faster than this are sawing
const STRIKE_PX_S = 900; // a downward flick faster than this is a strike

/** What to do with your hands, per motion (desktop / VR). */
const CUE: Record<BenchMotion, [string, string]> = {
  scrape: ['Hold the button and stroke left-right in short strokes', 'Scrape back and forth over the bench'],
  saw: ['Hold the button and sweep left-right, long and fast', 'Saw back and forth: long, fast strokes'],
  press: ['Hold the button and drag down slowly', 'Push down on the part'],
  strike: ['Flick down fast and let go, again and again', 'Strike down sharply, again and again'],
  wrap: ['Hold the button and circle around where you pressed', 'Circle one hand around the other, round and round'],
  twist: ['Scroll the mouse wheel to twist', 'Roll your wrists in opposite directions'],
};

const ghostMat = new MeshBasicMaterial({ color: 0x9fe0a8, transparent: true, opacity: 0.4, depthWrite: false });
const cueMat = new MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.55, depthWrite: false });

function cueHand(): Group {
  const g = new Group();
  const palm = new Mesh(new BoxGeometry(0.08, 0.022, 0.09), cueMat);
  const fingers = new Mesh(new BoxGeometry(0.075, 0.018, 0.06), cueMat);
  fingers.position.z = -0.07;
  const thumb = new Mesh(new BoxGeometry(0.022, 0.018, 0.05), cueMat);
  thumb.position.set(0.05, 0, -0.02);
  thumb.rotation.y = -0.5;
  g.add(palm, fingers, thumb);
  return g;
}

/** Panel scale in VR while choosing a recipe (close to you); crafting keeps the old size above the bench. */
const VR_SCALE = 0.042;

export class BenchSystem extends createSystem({}) {
  private panel!: UIKitMLAsset;
  private panelEntity!: Entity;
  private touch!: PanelTouch;
  private vrNow = false;
  private open = false;
  private benchId = -1;
  private top = new Vector3();
  private layout = new Group();
  private result: Object3D | null = null;
  /** What the current craft will make (so it can go to your hand when done). */
  private making: ItemId | null = null;
  private cue = [cueHand(), cueHand()];
  private fx!: BenchFx;
  private work = new WorkRate();
  private lastProg = 0;
  private lastStep = -1;
  private t = 0;
  // desktop motion tracking
  private lastX = 0;
  private lastY = 0;
  private pressX = 0;
  private pressY = 0;
  private lastAng = 0;
  private lastR = 0;
  private peakVy = 0;
  // VR motion tracking
  private prevVy = 0;
  private prevAng = 0;
  private hadAng = false;
  private fxAcc = 0;
  private head = new Vector3();
  private rel = new Vector3();

  async init(): Promise<void> {
    const game = getGame(this.world);
    this.layout.name = 'BenchLayout';
    this.world.createTransformEntity(this.layout);
    for (const c of this.cue) {
      c.visible = false;
      this.layout.add(c);
    }
    this.fx = new BenchFx(this.layout);
    getUi(this.world).openBench = (id: number) => this.show(id);
    getUi(this.world).openNearestBench = () => {
      const s = getGame(this.world).nearbyWorkbench();
      if (s) this.show(s.id);
      else getGame(this.world).toast('Stand at a finished workbench to use it.', 'note');
    };
    const prev = getUi(this.world).capturesPointer;
    // While crafting at the bench, mouse drags are hand motions, not looking around.
    getUi(this.world).capturesPointer = () => !!game.bench || (prev?.() ?? false);

    this.panel = await this.world.assets.instantiate<UIKitMLAsset>('bench-panel');
    this.panel.name = 'BenchPanel';
    this.panel.scale.setScalar(0.15);
    this.panelEntity = this.world.createTransformEntity(this.panel);
    this.panelEntity.addComponent(RayInteractable);
    hidePanel(this.panel);
    // In VR the recipe rows and buttons are fingertip targets only.
    this.touch = new PanelTouch(this.world, this.panel, VR_SCALE, 'bench');
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vrNow = v !== VisibilityState.NonImmersive;
        PanelTouch.setRay(this.world, this.panelEntity, this.vrNow);
      }),
    );
    menu.register('bench', () => this.hide());
    const wire = (id: string, fn: () => void) => {
      const el = this.panel.requireElementById(id);
      el.addEventListener('click', fn);
      this.touch.add(id, fn);
      this.cleanupFuncs.push(() => el.removeEventListener('click', fn));
    };
    for (let i = 0; i < ROWS; i++) {
      wire(`rec-${i}`, () => {
        const r = BENCH_RECIPES[i];
        if (!r) return;
        if (game.held) game.stow();
        game.startBench(r.id, this.benchId);
      });
    }
    wire('bench-close', () => menu.back());
    wire('bench-cancel', () => game.cancelBench());
    wire('bench-lift', () => {
      game.cancelBench();
      this.hide();
      game.takeBack(this.benchId, -1);
    });
    this.cleanupFuncs.push(
      game.on((e: GameEvent) => {
        if (e.type === 'bench') this.onBench(e.state);
        if (e.type === 'satchel' && this.open && !game.bench) this.refresh();
      }),
    );
  }

  private immersive(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  /** Opens the recipe panel above workbench `id`. */
  show(id: number): void {
    const game = getGame(this.world);
    const s = game.structures.find((t) => t.id === id);
    if (!s || !this.panel) return;
    if (game.bench && game.bench.structureId !== id) game.cancelBench();
    this.benchId = id;
    this.open = true;
    game.objectives.learn('bench');
    const pos = s.keyPos ?? { x: s.x, z: s.z };
    this.top.set(pos.x, BLUEPRINTS.workbench.key.y + 0.06, pos.z);
    // Above and just behind the bench, facing you, so the slab stays clear to work on.
    this.camera.getWorldPosition(this.head);
    const dx = pos.x - this.head.x;
    const dz = pos.z - this.head.z;
    const d = Math.hypot(dx, dz) || 1;
    this.panel.visible = true;
    menu.open('bench');
    this.touch.setRequirePoint(false);
    this.touch.reset();
    if (this.vrNow && !game.bench) {
      // Choosing a recipe: the panel comes close, in reach of a fingertip.
      this.panel.scale.setScalar(VR_SCALE);
      this.touch.setScale(VR_SCALE);
      placeInFront(this.panel, this.camera, PANEL_DISTANCE, 0, PANEL_DOWN + 0.04);
    } else this.placeAtBench(dx, dz, d, pos);
    this.refresh();
  }

  /** Above and just behind the bench, facing you: where the step cards stay while your hands work. */
  private placeAtBench(dx: number, dz: number, d: number, pos: { x: number; z: number }): void {
    // A flat screen shows it much smaller than a headset does: scale it up in the browser.
    const desktop = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
    this.panel.scale.setScalar(desktop ? 0.2 : 0.15);
    // Readable from where you stand at the bench, low enough to keep in a narrow field of view.
    const back = desktop ? 0.5 : 0.3;
    this.panel.position.set(pos.x + (dx / d) * back, 1.25, pos.z + (dz / d) * back);
    this.panel.rotation.set(0, Math.atan2(-dx, -dz), 0);
  }

  hide(): void {
    this.open = false;
    menu.closed('bench');
    if (this.panel) hidePanel(this.panel);
  }

  private text(id: string, t: string): void {
    this.panel.requireElementById<UIKit.Text>(id).setProperties({ text: uiText(t) });
  }

  private refresh(): void {
    if (!this.panel || !this.open) return;
    const game = getGame(this.world);
    const b = game.bench;
    this.panel.requireElementById('bench-list').setProperties({ display: b ? 'none' : 'flex' });
    this.panel.requireElementById('bench-craft').setProperties({ display: b ? 'flex' : 'none' });
    this.panel.requireElementById('bench-lift').setProperties({ display: b ? 'none' : 'flex' });
    if (!b) {
      for (let i = 0; i < ROWS; i++) {
        const r = BENCH_RECIPES[i];
        this.panel.requireElementById(`rec-${i}`).setProperties({ display: r ? 'flex' : 'none' });
        if (!r) continue;
        const parts = partsStatus(game, r);
        const ready = parts.every((p) => p.have >= p.need);
        this.text(`rec-${i}-name`, `${ready ? '' : '(missing parts) '}${r.name}`);
        this.text(`rec-${i}-parts`, parts.map((p) => `${itemName(p.id)} ${Math.min(p.have, p.need)}/${p.need}`).join('  -  '));
        this.panel.requireElementById(`rec-${i}`).setProperties({ opacity: ready ? 1 : 0.5 });
      }
      return;
    }
    const step = b.step;
    this.text('bench-recipe', b.recipe.name);
    this.text('bench-steps', `Step ${Math.min(b.stepIndex + 1, b.recipe.steps.length)} of ${b.recipe.steps.length}`);
    this.text('bench-step', step?.title ?? 'Done');
    this.text('bench-cue', step ? CUE[step.motion][this.immersive() ? 1 : 0] : '');
    this.text('bench-hint', step?.hint ?? '');
    this.updateBar();
  }

  private updateBar(): void {
    const b = getGame(this.world).bench;
    this.panel.requireElementById('bench-fill').setProperties({ width: Math.round(TRACK_PX * (b ? b.progress : 0)) });
  }

  /** Parts on the slab and a ghost of what they will become. */
  private lay(): void {
    const game = getGame(this.world);
    for (let i = this.layout.children.length - 1; i >= 0; i--) {
      const c = this.layout.children[i];
      if (!this.cue.includes(c as Group) && !this.fx.objects.includes(c)) this.layout.remove(c);
    }
    this.result = null;
    const b = game.bench;
    if (!b) {
      this.fx.setParts([], this.top);
      return;
    }
    const placed: Object3D[] = [];
    const items: ItemId[] = [];
    for (const [id, n] of Object.entries(b.recipe.inputs)) for (let k = 0; k < (n ?? 0); k++) items.push(id as ItemId);
    items.forEach((id, i) => {
      const m = itemMesh(id);
      m.scale.multiplyScalar(0.7);
      m.position.set(this.top.x - 0.22 + (i % 4) * 0.13, this.top.y, this.top.z + 0.12 - Math.floor(i / 4) * 0.12);
      m.rotation.y = i * 0.7;
      m.name = 'BenchPart';
      this.layout.add(m);
      placed.push(m);
    });
    this.fx.setParts(placed, this.top);
    this.work.reset();
    this.lastProg = 0;
    this.lastStep = b.stepIndex;
    const ghost = itemMesh(b.recipe.output);
    ghost.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).material = ghostMat;
    });
    ghost.scale.multiplyScalar(1.3);
    ghost.position.set(this.top.x, this.top.y + 0.28, this.top.z);
    this.layout.add(ghost);
    this.result = ghost;
  }

  private onBench(state: 'start' | 'progress' | 'step' | 'done' | 'cancel'): void {
    const game = getGame(this.world);
    if (state === 'start') this.making = game.bench?.recipe.output ?? null;
    if (state === 'start' || state === 'cancel') this.lay();
    if (state === 'start' && this.open && this.vrNow) {
      // Crafting: the step card goes above the bench and only a deliberate point can press Stop.
      const s = game.structures.find((t) => t.id === this.benchId);
      if (s) {
        const pos = s.keyPos ?? { x: s.x, z: s.z };
        this.camera.getWorldPosition(this.head);
        const dx = pos.x - this.head.x;
        const dz = pos.z - this.head.z;
        this.placeAtBench(dx, dz, Math.hypot(dx, dz) || 1, pos);
        this.touch.setScale(0.15);
        this.touch.setRequirePoint(true);
        this.touch.reset();
      }
    }
    if (state === 'cancel' || state === 'done') this.touch.setRequirePoint(false);
    if (state === 'progress') {
      this.updateBar();
      return;
    }
    if (state === 'step') {
      this.fx.rest();
      this.work.reset();
      this.lastProg = 0;
      game.fx('seat', 0.8);
      if (this.immersive()) pulse(this.renderer.xr.getSession(), 1, 0.6, 60);
    }
    if (state === 'done') {
      this.lay();
      game.fx('snap', 0.5);
      // The finished piece goes into your hand.
      if (this.making) game.takeOut(this.making);
      this.making = null;
    }
    for (const c of this.cue) c.visible = !!game.bench;
    if (!game.bench) handPose.mode = 'free';
    this.refresh();
  }

  // ------------------------------------------------------------- motions

  private desktopMotion(dt: number): void {
    const game = getGame(this.world);
    if (mouse.wheel) game.benchWork('twist', Math.abs(mouse.wheel) * WHEEL_TWIST);
    if (mouse.pressed) {
      this.pressX = this.lastX = mouse.x;
      this.pressY = this.lastY = mouse.y;
      this.lastR = 0;
      this.peakVy = 0;
    }
    const dx = mouse.x - this.lastX;
    const dy = mouse.y - this.lastY;
    this.lastX = mouse.x;
    this.lastY = mouse.y;
    if (mouse.released) {
      if (this.peakVy > STRIKE_PX_S) game.benchWork('strike', 1);
      handPose.mode = 'free';
      return;
    }
    if (!mouse.down) return;
    this.peakVy = Math.max(this.peakVy, mouse.vy);
    handPose.mode = 'place';
    handPose.x = (mouse.x - this.pressX) * 0.0004;
    handPose.y = -(mouse.y - this.pressY) * 0.0004;
    const rx = mouse.x - this.pressX;
    const ry = mouse.y - this.pressY;
    const r = Math.hypot(rx, ry);
    const ang = Math.atan2(ry, rx);
    const linear = Math.hypot(dx, dy);
    if (linear < 0.5) return;
    let dAng = ang - this.lastAng;
    if (dAng > Math.PI) dAng -= Math.PI * 2;
    if (dAng < -Math.PI) dAng += Math.PI * 2;
    const circling = r > 25 && this.lastR > 25 && Math.abs(dAng) * r > linear * 0.7;
    this.lastAng = ang;
    this.lastR = r;
    if (circling) game.benchWork('wrap', Math.abs(dAng));
    else if (Math.abs(dx) > Math.abs(dy) * 1.5) {
      const speed = Math.abs(dx) / Math.max(dt, 1e-3);
      game.benchWork(speed > SAW_PX_S ? 'saw' : 'scrape', Math.abs(dx) * PX_STROKE);
    } else if (dy > 0 && mouse.vy < STRIKE_PX_S) game.benchWork('press', dy * PX_PRESS);
  }

  private vrMotion(dt: number): void {
    const game = getGame(this.world);
    const r = hands[1];
    const l = hands[0];
    if (!r.tracked) return;
    // Only hand motion over the bench counts.
    if (Math.hypot(r.pos.x - this.top.x, r.pos.z - this.top.z) > 0.7 || r.pos.y > this.top.y + 0.6) return;
    const vy = r.vel.y;
    const speedH = Math.hypot(r.vel.x, r.vel.z);
    if (vy < -1.5 && this.prevVy >= -1.5) game.benchWork('strike', 1);
    this.prevVy = vy;
    if (l.tracked) {
      this.rel.subVectors(r.pos, l.pos);
      const near = Math.hypot(this.rel.x, this.rel.z) < 0.35;
      const ang = Math.atan2(this.rel.z, this.rel.x);
      if (near && this.hadAng) {
        let d = ang - this.prevAng;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) / dt > 1.5) {
          game.benchWork('wrap', Math.abs(d));
          this.prevAng = ang;
          return;
        }
      }
      this.prevAng = ang;
      this.hadAng = near;
      if (Math.abs(l.roll) > 0.003 && Math.abs(r.roll) > 0.003 && Math.sign(l.roll) !== Math.sign(r.roll)) {
        game.benchWork('twist', Math.abs(l.roll) + Math.abs(r.roll));
        return;
      }
    }
    if (vy < -0.05 && Math.hypot(speedH, vy) < 0.6 && Math.abs(vy) > speedH) game.benchWork('press', -vy * dt);
    else if (speedH > 0.12 && Math.abs(vy) < speedH) game.benchWork(speedH > 0.8 ? 'saw' : 'scrape', speedH * dt);
  }

  /** The ghost hand shows the motion the current step needs. */
  private animateCue(): void {
    const b = getGame(this.world).bench;
    const step = b?.step;
    // The looping ghost hand is only for before you start: once the parts move with your hands it goes.
    const started = !!b && stepStarted(b.progress, this.work.rate);
    for (const c of this.cue) c.visible = !!step && !started;
    if (!step || started) return;
    const t = this.t;
    const [a, c2] = this.cue;
    a.position.set(this.top.x, this.top.y + 0.1, this.top.z);
    a.rotation.set(0, 0, 0);
    c2.visible = false;
    switch (step.motion) {
      case 'scrape':
        a.position.x += Math.sin(t * 9) * 0.07;
        break;
      case 'saw':
        a.position.x += Math.sin(t * 5) * 0.18;
        break;
      case 'press':
        a.position.y += 0.06 - Math.abs(Math.sin(t * 2.5)) * 0.07;
        break;
      case 'strike':
        a.position.y += 0.14 - Math.abs(Math.sin(t * 5)) * 0.14;
        a.rotation.x = -0.4;
        break;
      case 'wrap':
        a.position.x += Math.cos(t * 4) * 0.08;
        a.position.z += Math.sin(t * 4) * 0.08;
        a.position.y += 0.05;
        break;
      case 'twist':
        c2.visible = true;
        a.position.x += 0.07;
        c2.position.set(this.top.x - 0.07, this.top.y + 0.1, this.top.z);
        a.rotation.z = Math.sin(t * 5) * 1.2;
        c2.rotation.z = -Math.sin(t * 5) * 1.2;
        break;
      default:
        break;
    }
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    this.t += dt;
    const game = getGame(this.world);
    if (this.open && this.vrNow) this.touch.update(dt);
    if (!game.bench) {
      if (this.open && this.panel) {
        // Close when you walk away.
        const s = game.structures.find((t) => t.id === this.benchId);
        if (!s || !s.complete || Math.hypot(game.player.x - this.top.x, game.player.z - this.top.z) > LEAVE_DISTANCE) this.hide();
      }
      return;
    }
    if (Math.hypot(game.player.x - this.top.x, game.player.z - this.top.z) > LEAVE_DISTANCE) {
      game.toast('You walked away from the bench: your parts are back in the satchel.', 'note');
      game.cancelBench();
      this.hide();
      return;
    }
    const before = game.bench.total;
    if (this.immersive()) this.vrMotion(dt);
    else this.desktopMotion(dt);
    // Sound and a little shake on the parts as the work goes on.
    const b = game.bench;
    if (b) {
      this.fxAcc += Math.max(0, b.total - before);
      if (this.fxAcc > 0.02) {
        this.fxAcc = 0;
        const m = b.step?.motion;
        game.fx(m === 'strike' ? 'knap' : m === 'wrap' || m === 'twist' ? 'twist' : m === 'press' ? 'strain' : m === 'saw' ? 'creak' : 'swish', 0.5);
        for (const c of this.layout.children) if (c.name === 'BenchPart') c.rotation.z = (Math.random() - 0.5) * 0.08;
      }
      if (this.result) this.result.rotation.y += dt * (0.5 + b.total * 2);
      // The parts move with the work the hands just did.
      const gained = b.stepIndex === this.lastStep ? Math.max(0, b.progress - this.lastProg) : 0;
      this.lastStep = b.stepIndex;
      this.lastProg = b.progress;
      this.work.update(dt, gained);
      this.fx.update(dt, b.step?.motion ?? null, b.progress, gained, b.step?.work ?? 1);
    }
    this.animateCue();
  }
}

