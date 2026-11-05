// "Use" actions for Level 2 water and Level 3 food: fire the pot, fill it at
// the stream, pour it through the filter, boil it, dig/seal/light/open the
// charcoal mound, dig/plant/water/harvest plots, cook and eat fish.
// The rules live in game/water.ts and game/food.ts; this system only picks
// the action that fits where you are and what you hold, and performs it when
// you act:
//   VR:      reach your hand down/out to the spot and hold it there briefly
//            (hold a fish over the flames to cook it)
//   Browser: press U (hold U over the fire to cook)
// It also draws the mound with its smoke and the pot sitting in the fire.

import {
  createSystem,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { FoodAction } from '../game/food.js';
import type { WaterAction } from '../game/water.js';
import { PourState, pourRate } from '../game/gestures.js';
import { groundHeight } from '../game/world-layout.js';
import { getGame, handClaims } from './shared.js';

/** Seconds a hand must stay at the spot to act in VR. */
const DWELL = 0.8;
/** A hand counts as reaching when it is this far (m) below the head... */
const REACH_DROP = 0.45;
/** ...and within this horizontal distance (m) of the spot. */
const REACH_RADIUS = 0.9;
const PUFFS = 6;

const SMOKE_COLORS = { none: 0xffffff, white: 0xf2f2f2, yellow: 0xd8c27a, blue: 0x9fb6d8 } as const;

type Action = { kind: 'water'; a: WaterAction } | { kind: 'food'; a: FoodAction };

export class WaterSystem extends createSystem({}) {
  private keyDown = false;
  private pressed = false;
  private dwell = 0;
  private lastLabel = '';
  private root = new Group();
  private mound!: Mesh;
  private puffs: Mesh[] = [];
  private puffMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
  private pot!: Mesh;
  private steam!: Mesh;
  private head = new Vector3();
  private hand = new Vector3();
  private t = 0;

  init(): void {
    this.root.name = 'WaterFx';
    this.world.createTransformEntity(this.root);
    this.mound = new Mesh(new SphereGeometry(0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new MeshStandardMaterial({ color: 0x5a4330, roughness: 1 }));
    this.mound.scale.y = 0.55;
    this.mound.visible = false;
    this.root.add(this.mound);
    const puffGeo = new SphereGeometry(0.16, 8, 6);
    for (let i = 0; i < PUFFS; i++) {
      const m = new Mesh(puffGeo, this.puffMat);
      m.visible = false;
      this.root.add(m);
      this.puffs.push(m);
    }
    this.pot = new Mesh(new CylinderGeometry(0.11, 0.08, 0.16, 12), new MeshStandardMaterial({ color: 0xa4552f, roughness: 0.9 }));
    this.pot.visible = false;
    this.root.add(this.pot);
    this.steam = new Mesh(new SphereGeometry(0.09, 8, 6), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.steam.visible = false;
    this.root.add(this.steam);

    const down = (e: KeyboardEvent) => {
      if (e.code !== 'KeyU' || e.repeat) return;
      this.keyDown = true;
      this.pressed = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyU') this.keyDown = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    this.cleanupFuncs.push(
      () => window.removeEventListener('keydown', down),
      () => window.removeEventListener('keyup', up),
    );
  }

  private current(): Action | null {
    const g = getGame(this.world);
    const f = g.food.available();
    const w = g.water.available();
    // With logs in the bag, the digging stick digs the charcoal pit, not a planting plot
    // (the plot would otherwise always win, so the charcoal objective could not be done).
    if (f && !(f.id === 'digPlot' && w?.id === 'digMound')) return { kind: 'food', a: f };
    return w ? { kind: 'water', a: w } : null;
  }

  /** In VR: is a hand reaching down/out to `at`? */
  private reaching(at: { x: number; z: number }): boolean {
    this.camera.getWorldPosition(this.head);
    for (const grip of [this.player.gripSpaces.left, this.player.gripSpaces.right]) {
      if (!grip) continue;
      grip.getWorldPosition(this.hand);
      if (this.hand.y < this.head.y - REACH_DROP && Math.hypot(this.hand.x - at.x, this.hand.z - at.z) < REACH_RADIUS) return true;
    }
    return false;
  }

  update(delta: number): void {
    const g = getGame(this.world);
    this.t += delta;
    const vr = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    const act = this.current();

    // Prompt once when the available action changes.
    const label = act ? act.a.label : '';
    if (label !== this.lastLabel) {
      this.lastLabel = label;
      if (label) g.toast(vr ? `Reach out: ${label}` : `U: ${label}`, 'info');
    }

    // VR: tilt the pot to pour; the angle sets the flow and the amount.
    if (vr) this.pour(delta);

    if (act?.kind === 'food' && act.a.id === 'cook') {
      // Cooking is continuous: hold the fish over the flames (or hold U).
      if (vr ? this.reaching(act.a.at) : this.keyDown) g.food.cookOver(delta);
    } else if (act && !(vr && act.kind === 'water' && act.a.id === 'pourFilter')) {
      let fire = false;
      if (vr) {
        this.dwell = this.reaching(act.a.at) ? this.dwell + delta : 0;
        fire = this.dwell >= DWELL;
      } else fire = this.pressed;
      if (fire) {
        this.dwell = -1.5; // a pause before the next reach-action
        if (act.kind === 'food') g.food.perform(act.a);
        else g.water.perform(act.a.id);
        this.lastLabel = '';
      }
    }
    this.pressed = false;
    this.drawFx();
  }

  private pourState = new PourState();
  private splashT = 0;
  private lastWater = '';

  /** Tipping a held pot: it runs while the rim dips; emptied over a filter it fills it, anywhere else it is poured out. */
  private pour(delta: number): void {
    const g = getGame(this.world);
    const w = g.water.potWater;
    if (w !== this.lastWater) {
      this.lastWater = w;
      this.pourState.refill();
    }
    if (g.held !== 'pot' || !g.flag('potFired') || w === 'empty') return;
    const tilt = handClaims.heldTilt;
    const out = this.pourState.step(delta, tilt);
    if (out > 0) {
      // A stream under the rim: splashes on whatever is below, more when it runs harder.
      this.splashT -= delta;
      if (this.splashT <= 0) {
        this.splashT = 0.12;
        const p = handClaims.heldPos;
        g.contact('water', 'soil', p.x, groundHeight(p.x, p.z) + 0.02, p.z, 0.4 + pourRate(tilt) * 3);
      }
    }
    if (!this.pourState.empty) return;
    const filter = g.water.filterNear();
    if (w === 'raw' && filter) g.water.perform('pourFilter');
    else g.water.pourOut();
    this.pourState.refill();
  }

  private drawFx(): void {
    const g = getGame(this.world);
    const m = g.water.mound;
    this.mound.visible = !!m;
    const smoke = g.water.smoke();
    for (let i = 0; i < PUFFS; i++) {
      const p = this.puffs[i];
      p.visible = !!m && smoke !== 'none';
      if (!p.visible || !m) continue;
      const k = (this.t * 0.35 + i / PUFFS) % 1;
      p.position.set(m.x + Math.sin(i * 2.1 + this.t) * 0.15 * k, 0.35 + k * 2.2, m.z + Math.cos(i * 1.7) * 0.15 * k);
      p.scale.setScalar(0.6 + k * 1.6);
    }
    if (m) {
      this.mound.position.set(m.x, 0, m.z);
      this.puffMat.color.setHex(SMOKE_COLORS[smoke]);
      this.puffMat.opacity = smoke === 'blue' ? 0.22 : 0.45;
    }
    const fire = g.water.onFire ? g.structures.find((s) => s.kind === 'firePit' && s.complete) : null;
    this.pot.visible = !!fire;
    this.steam.visible = !!fire && g.flag('potFired') && g.water.boil > 4;
    if (fire) {
      this.pot.position.set(fire.x, 0.2, fire.z);
      const k = (this.t * 0.8) % 1;
      this.steam.position.set(fire.x, 0.35 + k * 0.5, fire.z);
      this.steam.scale.setScalar(0.6 + k);
    }
  }
}
