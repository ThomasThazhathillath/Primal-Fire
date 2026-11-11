import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { setEasyCarry } from './game/items.js';

// Play-testing: no pocket limit, no weight, everything goes in the bag. Set to false to test the real carry rules.
setEasyCarry(true);
import { installDebugHooks, streamPlaytestLog } from './debug-hooks.js';
import { AudioSystem } from './systems/audio-system.js';
import { CraftGestureSystem } from './systems/craft-gesture-system.js';
import { BenchSystem } from './systems/bench-system.js';
import { BuildBookSystem } from './systems/build-book-system.js';
import { HighlightSystem } from './systems/highlight-system.js';
import { LashSystem } from './systems/lash-system.js';
import { RoadmapSystem } from './systems/roadmap-system.js';
import { ShelterSystem } from './systems/shelter-system.js';
import { HintFxSystem } from './systems/hint-fx-system.js';
import { ObjectiveCardSystem } from './systems/objective-card-system.js';
import { ContactFxSystem } from './systems/contact-fx-system.js';
import { CarrySystem } from './systems/carry-system.js';
import { BowSystem } from './systems/bow-system.js';
import { BuildSystem } from './systems/build-system.js';
import { PlayerCollisionSystem } from './systems/player-collision-system.js';
import { DesktopControlsSystem } from './systems/desktop-controls-system.js';
import { WorldEnvironmentSystem } from './systems/environment-system.js';
import { NatureSystem } from './systems/nature-system.js';
import { WildlifeSystem } from './systems/wildlife-system.js';
import { LivingDetailSystem } from './systems/living-detail-system.js';
import { ResourceDebugSystem } from './systems/resource-debug-system.js';
import { AmbienceSystem } from './systems/ambience-system.js';
import { DropSystem } from './systems/drop-system.js';
import { FireSystem } from './systems/fire-system.js';
import { HandLocomotionSystem } from './systems/hand-locomotion-system.js';
import { HandInputSystem } from './systems/hand-input-system.js';
import { InteractionSystem } from './systems/interaction-system.js';
import { HandsSystem } from './systems/hands-system.js';
import { FarmSystem } from './systems/farm-system.js';
import { FishingSystem } from './systems/fishing-system.js';
import { GuideSystem } from './systems/guide-system.js';
import { LevelSystem } from './systems/level-system.js';
import { WaterSystem } from './systems/water-system.js';
import { HudSystem } from './systems/hud-system.js';
import { IconBarSystem } from './systems/icon-bar-system.js';
import { PinchGrabSystem } from './systems/pinch-grab-system.js';
import { GazeTargetSystem } from './systems/gaze-target-system.js';
import { HintPanelSystem } from './systems/hint-panel-system.js';
import { PerfProbeSystem, PerfSystem } from './systems/perf-system.js';
import { IntroSystem } from './systems/intro-system.js';
import { ResourceSystem } from './systems/resource-system.js';
import { SatchelSystem } from './systems/satchel-system.js';
import { loadGame, setSaveKey, WorldSystem } from './systems/world-system.js';
import { TutorialSystem } from './systems/tutorial-system.js';
import { StorySystem } from './systems/story-system.js';
import { currentMode, TUTORIAL_SAVE_KEY } from './game/tutorial-mode.js';
import { tutorialSpots } from './game/tutorial-layout.js';
import { RESOURCES } from './game/world-layout.js';

// THE FIRST STEPS: the tutorial runs its own Game under its own save key, so the survival save is never read or written.
const mode = currentMode();
if (mode === 'tutorial') {
  setSaveKey(TUTORIAL_SAVE_KEY);
  RESOURCES.push(...tutorialSpots());
}

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  const game = loadGame();
  (world.globals as Record<string, unknown>).game = game;
  world
    // Frame timing probe for the dev perf overlay: first system of every frame.
    .registerSystem(PerfProbeSystem, { priority: -100 })
    .registerSystem(WorldSystem)
    .registerSystem(WorldEnvironmentSystem)
    .registerSystem(NatureSystem)
    .registerSystem(WildlifeSystem)
    .registerSystem(LivingDetailSystem)
    .registerSystem(ResourceDebugSystem)
    // Hand state and the direct pinch grab run before IWSDK's input system (-5), so a grab claims its pinch before any ray press does.
    .registerSystem(HandInputSystem, { priority: -6 })
    .registerSystem(PinchGrabSystem, { priority: -5.5 })
    // Gaze + pinch: after the near grab (direct hands win), before IWSDK's input system so it owns its pinch first.
    .registerSystem(GazeTargetSystem, { priority: -5.2 })
    .registerSystem(HandLocomotionSystem)
    .registerSystem(DesktopControlsSystem)
    .registerSystem(PlayerCollisionSystem)
    .registerSystem(ResourceSystem)
    .registerSystem(BuildSystem)
    .registerSystem(SatchelSystem)
    .registerSystem(FireSystem)
    .registerSystem(CraftGestureSystem)
    .registerSystem(InteractionSystem)
    .registerSystem(BenchSystem)
    .registerSystem(BuildBookSystem)
    .registerSystem(ObjectiveCardSystem)
    .registerSystem(HighlightSystem)
    .registerSystem(LashSystem)
    .registerSystem(ShelterSystem)
    .registerSystem(RoadmapSystem)
    .registerSystem(HintFxSystem)
    .registerSystem(BowSystem)
    .registerSystem(DropSystem)
    .registerSystem(CarrySystem)
    .registerSystem(ContactFxSystem)
    .registerSystem(HandsSystem)
    .registerSystem(HudSystem)
    .registerSystem(IconBarSystem)
    .registerSystem(GuideSystem)
    .registerSystem(LevelSystem)
    .registerSystem(WaterSystem)
    .registerSystem(FishingSystem)
    .registerSystem(FarmSystem)
    .registerSystem(IntroSystem)
    .registerSystem(AudioSystem)
    .registerSystem(AmbienceSystem)
    .registerSystem(PerfSystem)
    .registerSystem(HintPanelSystem)
    .registerSystem(TutorialSystem, { configData: { tutorial: mode === 'tutorial' } })
    .registerSystem(StorySystem, { configData: { tutorial: mode === 'tutorial' } });
  installDebugHooks(world);
  streamPlaytestLog(world);
});
