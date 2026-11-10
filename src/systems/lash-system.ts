// Lashing the shelter frame by hand (rules in game/lashing.ts). Near a glowing lashing joint with
// cord in the bag or in hand:
//   - roll both wrists in opposite directions (the Twist machine), or
//   - circle one hand around the joint, or
//   - scroll the mouse wheel while the joint is in front of you (desktop).
// The wraps grow on the joint as you work (BuildSystem redraws on the 'lash' event); each joint
// gives a click of haptics and a tightening creak; the last twist ties it off.

import { createSystem, Vector3, VisibilityState } from '@iwsdk/core';
import { LASH, LashGesture } from '../game/lashing.js';
import { hands, mouse, pulse } from './hand-input-system.js';
import { getGame } from './shared.js';

const SCAN_EVERY = 0.2;

export class LashSystem extends createSystem({}) {
  private gesture = [new LashGesture(), new LashGesture()];
  private both = new LashGesture();
  private timer = 0;
  private target: { id: number; index: number; x: number; y: number; z: number } | null = null;
  private fxAcc = 0;
  private head = new Vector3();
  private dir = new Vector3();

  private immersive(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  update(delta: number): void {
    const game = getGame(this.world);
    if (!game.leanTo() || delta <= 0) {
      this.target = null;
      return;
    }
    const vr = this.immersive();
    // Rescan which joint is workable a few times a second (not every frame).
    if ((this.timer -= delta) <= 0) {
      this.timer = SCAN_EVERY;
      this.target = null;
      if (vr) {
        for (let h = 0; h < 2 && !this.target; h++) {
          const hand = hands[h];
          if (!hand.tracked) continue;
          const t = game.lashTarget(hand.pos.x, hand.pos.z, hand.pos.y, LASH.reach);
          if (t) this.target = { id: t.structure.id, index: t.index, x: t.x, y: t.y, z: t.z };
        }
      } else {
        // Desktop: the joint nearest the middle of the view, within reach.
        this.camera.getWorldPosition(this.head);
        this.camera.getWorldDirection(this.dir);
        const t = game.lashTarget(this.head.x + this.dir.x * 1.3, this.head.z + this.dir.z * 1.3, this.head.y + this.dir.y * 1.3, 1.3);
        if (t) this.target = { id: t.structure.id, index: t.index, x: t.x, y: t.y, z: t.z };
      }
    }
    const t = this.target;
    if (!t) {
      this.gesture[0].reset();
      this.gesture[1].reset();
      this.both.reset();
      return;
    }
    let amount = 0;
    if (vr) {
      const l = hands[0];
      const r = hands[1];
      const near = (h: typeof l) => h.tracked && Math.hypot(h.pos.x - t.x, h.pos.z - t.z, h.pos.y - t.y) <= LASH.reach;
      // Two hands, wrists rolling against each other, taut across the joint.
      if (near(l) && near(r)) {
        const sep = Math.hypot(l.pos.x - r.pos.x, l.pos.y - r.pos.y, l.pos.z - r.pos.z);
        amount += this.both.twoHand(sep, l.roll, r.roll);
      } else this.both.reset();
      // One hand circling the joint.
      for (let h = 0; h < 2; h++) {
        const hand = hands[h];
        if (near(hand) && !(near(l) && near(r) && Math.abs(l.roll) + Math.abs(r.roll) > 0.02)) amount += this.gesture[h].circle(hand.pos.x - t.x, hand.pos.z - t.z);
        else this.gesture[h].reset();
      }
    } else if (mouse.wheel) {
      amount += this.gesture[0].wheel(mouse.wheel);
    }
    if (amount <= 0) return;
    const before = game.structures.find((s) => s.id === t.id)?.work?.[t.index] ?? 0;
    const p = game.lashJoint(t.id, t.index, amount);
    // A creak and a buzz as it tightens; a firmer one when it is tied off.
    this.fxAcc += amount;
    if (this.fxAcc > 0.05) {
      this.fxAcc = 0;
      game.fx('twist', 0.5);
      if (vr) {
        const s = this.renderer.xr.getSession();
        pulse(s, 0, 0.3, 30);
        pulse(s, 1, 0.3, 30);
      }
    }
    if (p >= 1 || (before < 1 && p === 0)) {
      this.target = null;
      this.timer = 0;
    }
  }
}
