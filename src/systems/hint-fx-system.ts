// Draws the world effects of the current objective's hint level (rules in game/hintfx.ts):
// level 2 pulses suitable resources nearby, level 3 raises the sky pillar over the chosen target,
// level 4 marks the exact target with a ring and arrow. Effects clear when the objective changes
// or completes, when the hint is dismissed, or when you reach the target. Four checks a second.

import { createSystem } from '@iwsdk/core';
import { arrived, glowFor, nextTargetFor, planHint } from '../game/hintfx.js';
import { groundHeight } from '../game/world-layout.js';
import { ResourceSystem } from './resource-system.js';
import { assistFx, getGame, getUi, hintFx, reveal } from './shared.js';
import { guidanceCfg } from './settings-system.js';

export class HintFxSystem extends createSystem({}) {
  private timer = 0;
  private beaconId = '';
  private lastObjective = '';

  private clear(): void {
    hintFx.pulse.length = 0;
    hintFx.exact = null;
    hintFx.glow = null;
    if (this.beaconId) {
      getUi(this.world).setBeacon?.(null);
      this.beaconId = '';
    }
  }

  update(delta: number): void {
    if ((this.timer -= delta) > 0) return;
    this.timer = 0.25;
    const game = getGame(this.world);
    const res = this.world.getSystem(ResourceSystem);
    const o = game.objectives.current;
    const level = game.objectives.hintFxLevel();
    // Always show where the next thing is (NPE simplicity round): one arrow and ring on the goal's exact next
    // target while the goal card is up (the tutorial sets its own while it runs).
    if (reveal.objective) {
      const items = o?.find?.(game) ?? [];
      const t = guidanceCfg.nextTarget && o ? nextTargetFor(game, res && items.length ? res.liveSpots(items) : []) : null;
      assistFx.exact = t ? { id: `next_${t.id}`, x: t.x, y: groundHeight(t.x, t.z), z: t.z } : null;
    }
    if (!o || level === 0) {
      if (hintFx.pulse.length || hintFx.exact || this.beaconId) this.clear();
      return;
    }
    // Spots still offering what the objective needs.
    const needed = o.find?.(game) ?? [];
    const spots = res && needed.length ? res.liveSpots(needed) : [];
    const plan = planHint(game, spots);
    if (this.lastObjective !== o.id) {
      this.lastObjective = o.id;
      this.clear();
    }
    if (arrived(plan, game.player.x, game.player.z)) {
      // You found it: the pillar and arrow have done their job.
      game.objectives.dismissHintFx();
      this.clear();
      return;
    }
    // Level 2 and 3: nearby suitable resources pulse.
    hintFx.pulse.length = 0;
    if (plan.effects.pulse) for (const n of plan.nearby) hintFx.pulse.push({ id: n.id, x: n.x, y: groundHeight(n.x, n.z), z: n.z });
    // Level 4: the exact target.
    hintFx.exact = plan.effects.exact && plan.target ? { id: plan.target.id, x: plan.target.x, y: plan.target.y || groundHeight(plan.target.x, plan.target.z), z: plan.target.z } : null;
    // Level 3 and 4: the sky pillar, attached to the actual target.
    if (plan.effects.beacon && plan.target) {
      if (this.beaconId !== plan.target.id) {
        this.beaconId = plan.target.id;
        getUi(this.world).setBeacon?.({ x: plan.target.x, z: plan.target.z });
      }
      // A glowing pool on the ground at the exact target, cleared with the pillar.
      const gl = glowFor(plan)!;
      hintFx.glow = { x: gl.x, y: gl.y || groundHeight(gl.x, gl.z), z: gl.z };
    } else if (this.beaconId) {
      getUi(this.world).setBeacon?.(null);
      this.beaconId = '';
      hintFx.glow = null;
    }
  }
}
