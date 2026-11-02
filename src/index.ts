import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { installDebugHooks } from './debug-hooks.js';
import { ActionSystem } from './systems/action-system.js';
import { AudioSystem } from './systems/audio-system.js';
import { BowSystem } from './systems/bow-system.js';
import { BuildSystem } from './systems/build-system.js';
import { DesktopControlsSystem } from './systems/desktop-controls-system.js';
import { DropSystem } from './systems/drop-system.js';
import { FireSystem } from './systems/fire-system.js';
import { HandsSystem } from './systems/hands-system.js';
import { GuideSystem } from './systems/guide-system.js';
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
    .registerSystem(FireSystem)
    .registerSystem(ActionSystem)
    .registerSystem(BowSystem)
    .registerSystem(DropSystem)
    .registerSystem(HandsSystem)
    .registerSystem(HudSystem)
    .registerSystem(GuideSystem)
    .registerSystem(IntroSystem)
    .registerSystem(AudioSystem);
  installDebugHooks(world);
});
