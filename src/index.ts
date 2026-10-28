import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { installDebugHooks } from './debug-hooks.js';
import { BuildSystem } from './systems/build-system.js';
import { DesktopControlsSystem } from './systems/desktop-controls-system.js';
import { HudSystem } from './systems/hud-system.js';
import { IntroSystem } from './systems/intro-system.js';
import { ResourceSystem } from './systems/resource-system.js';
import { SatchelSystem } from './systems/satchel-system.js';
import { loadGame, WorldSystem } from './systems/world-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  const game = loadGame();
  (world.globals as Record<string, unknown>).game = game;
  world
    .registerSystem(WorldSystem)
    .registerSystem(DesktopControlsSystem)
    .registerSystem(ResourceSystem)
    .registerSystem(BuildSystem)
    .registerSystem(SatchelSystem)
    .registerSystem(HudSystem)
    .registerSystem(IntroSystem);
  installDebugHooks(world);
});
