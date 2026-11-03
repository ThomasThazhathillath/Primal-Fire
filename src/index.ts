import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { installDebugHooks } from './debug-hooks.js';
import { AudioSystem } from './systems/audio-system.js';
import { CraftGestureSystem } from './systems/craft-gesture-system.js';
import { BenchSystem } from './systems/bench-system.js';
import { BowSystem } from './systems/bow-system.js';
import { BuildSystem } from './systems/build-system.js';
import { DesktopControlsSystem } from './systems/desktop-controls-system.js';
import { DropSystem } from './systems/drop-system.js';
import { FireSystem } from './systems/fire-system.js';
import { HandInputSystem } from './systems/hand-input-system.js';
import { InteractionSystem } from './systems/interaction-system.js';
import { HandsSystem } from './systems/hands-system.js';
import { FarmSystem } from './systems/farm-system.js';
import { FishingSystem } from './systems/fishing-system.js';
import { GuideSystem } from './systems/guide-system.js';
import { LevelSystem } from './systems/level-system.js';
import { WaterSystem } from './systems/water-system.js';
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
    .registerSystem(HandInputSystem)
    .registerSystem(DesktopControlsSystem)
    .registerSystem(ResourceSystem)
    .registerSystem(BuildSystem)
    .registerSystem(SatchelSystem)
    .registerSystem(FireSystem)
    .registerSystem(CraftGestureSystem)
    .registerSystem(InteractionSystem)
    .registerSystem(BenchSystem)
    .registerSystem(BowSystem)
    .registerSystem(DropSystem)
    .registerSystem(HandsSystem)
    .registerSystem(HudSystem)
    .registerSystem(GuideSystem)
    .registerSystem(LevelSystem)
    .registerSystem(WaterSystem)
    .registerSystem(FishingSystem)
    .registerSystem(FarmSystem)
    .registerSystem(IntroSystem)
    .registerSystem(AudioSystem);
  installDebugHooks(world);
});
