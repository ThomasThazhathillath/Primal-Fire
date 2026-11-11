// The Science Roadmap wall in the ruins (landmarks.scene-asset.ts, sockets `RoadmapNode_<id>`): a
// socket lights up amber when the quest that owns it is done. Nodes already lit when the game
// loads light silently; a node earned while you play flares (swells and settles) so a discovery
// is a moment. Chapter 2 adds the "structure" (frame) and "hydro" (drainage) nodes.

import { createSystem, type Mesh, MeshBasicMaterial } from '@iwsdk/core';
import { LIVING_QUESTS } from '../game/living-quests.js';
import { QUESTS } from '../game/quests.js';
import { getGame } from './shared.js';

const LIT = 0xffb547;
const FLARE = 1.6;

export class RoadmapSystem extends createSystem({}) {
  private lit = new Set<string>();
  private first = true;
  private timer = 0;
  private flares: Array<{ mesh: Mesh; t: number }> = [];

  update(delta: number): void {
    if (this.flares.length) {
      for (let i = this.flares.length - 1; i >= 0; i--) {
        const f = this.flares[i];
        f.t += delta;
        const k = f.t / FLARE;
        if (k >= 1) {
          f.mesh.scale.setScalar(1);
          this.flares.splice(i, 1);
        } else f.mesh.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.9);
      }
    }
    if ((this.timer -= delta) > 0) return;
    this.timer = 1;
    const game = getGame(this.world);
    // Chain quests light their node by position in the chain; field tasks by being done.
    const ids: Array<string | null> = [];
    for (let i = 0; i < QUESTS.length && i < game.questIndex; i++) ids.push(QUESTS[i].roadmapNode);
    for (const q of LIVING_QUESTS) if (game.living.has(q.id)) ids.push(q.roadmapNode);
    for (const id of ids) {
      if (!id || this.lit.has(id)) continue;
      const node = this.world.scene.getObjectByName(`RoadmapNode_${id}`) as Mesh | undefined;
      if (!node) continue; // the ruins are not built yet (far away): try again later
      const mat = (node.material as MeshBasicMaterial).clone();
      mat.color.setHex(LIT);
      node.material = mat;
      this.lit.add(id);
      if (!this.first) this.flares.push({ mesh: node, t: 0 });
    }
    this.first = false;
  }
}
