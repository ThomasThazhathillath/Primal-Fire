// Direct grabbing with a pinch (hands-only spec, phase 2): pinch the thumb and
// index tips together on or near a loose thing and it comes into that hand;
// open the pinch and CarrySystem lets it go (placing it if the release is
// gentle and near the ground). The ray pickup still works for far things.
//
// Priority each pinch: an object already held > a UI tap > this grab >
// movement. A pinch that grabs never starts a teleport (HandLocomotionSystem
// reads handClaims.grabbing), and a fingertip on a UI icon never grabs.

import { createSystem, Vector3 } from '@iwsdk/core';
import { Gatherable } from '../components/game-components.js';
import { type Candidate, resolveTarget } from '../game/assist.js';
import { type GrabCandidate, PINCH_CONFIG } from '../game/pinch.js';
import { fitsPouch } from '../game/items.js';
import { groundHeight, RESOURCES } from '../game/world-layout.js';
import { hands } from './hand-input-system.js';
import { DRAG_LOOK, ResourceSystem } from './resource-system.js';
import { mayStart } from '../game/priority.js';
import { getGame, handBusy, handClaims } from './shared.js';

/** A pinch this close (m) to a thing is touching exactly that thing. */
const TOUCH_DIST = 0.05;

interface Target extends GrabCandidate {
  spotId?: string;
  dropId?: number;
}

export class PinchGrabSystem extends createSystem({}) {
  private tmp = new Vector3();

  update(): void {
    const game = getGame(this.world);
    const now = performance.now() / 1000;
    for (let h = 0; h < 2; h++) {
      const hand = hands[h];
      if (!hand.tipTracked) continue;
      // Pinch opened: this hand no longer claims anything (CarrySystem handles the release).
      if (hand.gripUp || !hand.grip) {
        if (handClaims.grabbing[h] && !game.held) handClaims.grabbing[h] = false;
      }
      if (!hand.gripDown) continue;
      if (game.held) continue; // 1. what you hold comes first
      if (!mayStart('grab', handBusy(this.world, h as 0 | 1))) continue; // 2. a UI tap on this hand
      const target = this.find(hand.pinchPos);
      if (!target) continue;
      handClaims.holdHand = h as 0 | 1;
      handClaims.grabAt = now;
      if (!this.take(target)) continue;
      // Small things go to the pouch on pickup: bring it straight back into this hand.
      if (!game.held) {
        const id = target.id as Parameters<typeof game.takeOut>[0];
        if (fitsPouch(id)) game.takeOut(id);
      }
      handClaims.grabbing[h] = !!game.held;
    }
  }

  /** Loose things within reach of the pinch point: gatherable spots and dropped items. */
  private find(p: Vector3): Target | null {
    const game = getGame(this.world);
    const res = this.world.getSystem(ResourceSystem);
    const list: Target[] = [];
    if (res) {
      for (const spot of RESOURCES) {
        if (spot.look === DRAG_LOOK) continue;
        const e = res.entityFor(spot.id);
        if (!e || !e.object3D?.visible || (e.getValue(Gatherable, 'charges') ?? 0) <= 0) continue;
        e.object3D.getWorldPosition(this.tmp);
        list.push({ id: spot.itemId, spotId: spot.id, x: this.tmp.x, y: this.tmp.y + 0.1, z: this.tmp.z });
      }
    }
    for (const d of game.drops) list.push({ id: d.item, dropId: d.id, x: d.x, y: groundHeight(d.x, d.z) + 0.1, z: d.z });
    // One place decides: what the fingertips touch, else the nearest valid thing, else whatever the
    // objective needs when it is about as near, else any other valid one (game/assist.ts).
    const need = game.objectives.current?.find?.(game) ?? [];
    const cands: Candidate[] = list.map((c, i) => {
      const dist = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z);
      return { id: String(i), dist, aimed: dist <= TOUCH_DIST, valid: dist <= PINCH_CONFIG.grabRadius, matchesHeld: need.includes(c.id as never) };
    });
    const t = resolveTarget(cands);
    return t ? list[Number(t.id)] : null;
  }

  private take(t: Target): boolean {
    const game = getGame(this.world);
    if (t.dropId !== undefined) return game.pickUpDrop(t.dropId);
    const res = this.world.getSystem(ResourceSystem);
    const e = t.spotId ? res?.entityFor(t.spotId) : undefined;
    return !!e && !!res?.tryGather(e);
  }
}
