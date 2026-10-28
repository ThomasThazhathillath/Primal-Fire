// window.__primal: drive the game from the console or the IWSDK CLI
// (`npx @iwsdk/cli browser run`/devtools) without real input. Keep these: the
// event log and hooks are how play-test bugs get reported.

import type { World } from '@iwsdk/core';
import type { StructureKind } from './game/blueprint.js';
import type { Recipe } from './game/game.js';
import type { ItemId } from './game/items.js';
import { RESOURCES } from './game/world-layout.js';
import { Gatherable } from './components/game-components.js';
import { BuildSystem } from './systems/build-system.js';
import { DesktopControlsSystem } from './systems/desktop-controls-system.js';
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
