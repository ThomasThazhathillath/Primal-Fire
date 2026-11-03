// window.__primal: drive the game from the console or the IWSDK CLI
// (`npx @iwsdk/cli browser run`/devtools) without real input. Keep these: the
// event log and hooks are how play-test bugs get reported.

import { createSystem, type World } from '@iwsdk/core';
import type { StructureKind } from './game/blueprint.js';
import type { Recipe } from './game/game.js';
import type { ItemId } from './game/items.js';
import { RESOURCES } from './game/world-layout.js';
import { Gatherable } from './components/game-components.js';
import { BuildSystem } from './systems/build-system.js';
import { DesktopControlsSystem } from './systems/desktop-controls-system.js';
import { InteractionSystem } from './systems/interaction-system.js';
import { hands, mouse } from './systems/hand-input-system.js';
import { IntroSystem } from './systems/intro-system.js';
import { ResourceSystem } from './systems/resource-system.js';
import { SatchelSystem } from './systems/satchel-system.js';
import { getGame, getUi } from './systems/shared.js';
import { clearSave } from './systems/world-system.js';

export function installDebugHooks(world: World): void {
  const game = getGame(world);
  const sys = <T>(c: new (...args: never[]) => T) => world.getSystem(c as never) as T;
  (window as unknown as { __primal: unknown }).__primal = {
    world,
    game,
    begin: () => sys(IntroSystem).begin(),
    goTo: (x: number, z: number) => sys(DesktopControlsSystem).goTo(x, z),
    face: (x: number, z: number) => sys(DesktopControlsSystem).face(x, z),
    /** Gather from a resource spot by id, as if you pinched it. */
    gather: (spotId: string) => {
      const e = sys(ResourceSystem).entityFor(spotId);
      return e ? sys(ResourceSystem).tryGather(e) : false;
    },
    /** Resource spots (optionally only those offering `item`) with charges left. */
    spots: (item?: ItemId) =>
      RESOURCES.filter((s) => !item || s.itemId === item).map((s) => ({
        ...s,
        charges: sys(ResourceSystem).entityFor(s.id)?.getValue(Gatherable, 'charges'),
      })),
    /** Live interaction state (mode, bend stress, ...) for tests. */
    interaction: () => sys(InteractionSystem),
    input: { hands, mouse },
    take: (item: ItemId) => game.takeOut(item),
    stow: () => game.stow(),
    /** Point the blueprint ghost at (x, z) and pinch it. */
    place: (x: number, z: number) => {
      const b = sys(BuildSystem);
      b.moveGhostTo(x, z);
      return b.placeGhost();
    },
    fill: (structureId: number, index: number) => game.fillSpot(structureId, index),
    build: (kind: StructureKind) => game.structures.filter((s) => s.kind === kind),
    craft: (id: Recipe['id']) => game.craft(id),
    upgradePack: (id: string) => game.upgradePack(id),
    hint: () => getUi(world).showHint?.(),
    satchel: () => sys(SatchelSystem).toggle(),
    notebook: () => getUi(world).openNotebook?.(),
    log: () => game.log.toString(),
    state: () => game.snapshot(),
    reset: () => {
      clearSave();
      location.reload();
    },
  };
}

/**
 * Dev only: stream the play-test log, errors and a heartbeat (fps, where you
 * are, what you hold, input mode) to the dev server's playtest.log, so a
 * headset session can be followed from the Mac.
 */
export function streamPlaytestLog(world: World): void {
  if (!import.meta.env.DEV) return;
  const game = getGame(world);
  const queue: string[] = [];
  const push = (s: string) => {
    queue.push(s);
    if (queue.length > 200) queue.shift();
  };
  game.log.onLine((l) => push(`${l.level === 'bad' ? 'BAD ' : l.level === 'ok' ? 'OK  ' : '    '}${l.text}`));
  window.addEventListener('error', (e) => push(`ERROR ${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => push(`ERROR (promise) ${String(e.reason)}`));
  // Count real frames with a tiny system (renderer.info counts every render pass, several per frame).
  let frames = 0;
  let worst = 0;
  world.registerSystem(
    class FrameCounter extends createSystem({}) {
      update(delta: number): void {
        frames++;
        if (delta > worst) worst = delta;
      }
    },
  );
  let lastT = performance.now();
  setInterval(() => {
    const now = performance.now();
    const fps = (frames * 1000) / (now - lastT);
    const slowest = worst * 1000;
    frames = 0;
    worst = 0;
    lastT = now;
    const vr = world.visibilityState.peek();
    const input = world.input.xr.isPrimary('hand', 'right') ? 'hands' : world.input.xr.isPrimary('controller', 'right') ? 'controllers' : 'none';
    const p = world.player.position;
    push(`beat fps=${fps.toFixed(0)} slowestFrame=${slowest.toFixed(0)}ms mode=${vr} input=${input} at=${p.x.toFixed(1)},${p.z.toFixed(1)} held=${game.held ?? '-'} drawCalls=${world.renderer.info.render.calls}`);
  }, 5000);
  // Remote reload (dev only): reload once whenever the dev server's reload stamp moves past our load time.
  const loadedAt = Date.now();
  setInterval(() => {
    fetch('/__primal-cmd')
      .then((r) => r.json())
      .then((c: { reloadAt: number; resetAt?: number }) => {
        if ((c.resetAt ?? 0) > loadedAt) {
          clearSave();
          location.reload();
        } else if (c.reloadAt > loadedAt) {
          (world.globals as { ui?: { saveNow?: () => void } }).ui?.saveNow?.();
          location.reload();
        }
      })
      .catch(() => {});
  }, 3000);
  setInterval(() => {
    if (!queue.length) return;
    const body = queue.splice(0).join('\n');
    fetch('/__primal-log', { method: 'POST', body, keepalive: true }).catch(() => {});
  }, 1000);
}
