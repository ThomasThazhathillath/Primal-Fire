import { AssetType, defineAssets } from '@iwsdk/core';
import {
  createForestGround,
  createForestTrees,
  createStream,
  createUndergrowth,
} from './scene-assets/forest.scene-asset.js';
import {
  createRuins,
  createShatteredTree,
  createSplitRock,
} from './scene-assets/landmarks.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

export default defineAssets({
  'forest-ground': createForestGround(),
  stream: createStream(),
  'forest-trees': createForestTrees(),
  undergrowth: createUndergrowth(),
  'shattered-tree': createShatteredTree(),
  ruins: createRuins(),
  'split-rock': createSplitRock(),
  'welcome-panel': uikitml('welcome.uikitml', 'Welcome Panel'),
  'hud-panel': uikitml('hud.uikitml', 'Quest HUD'),
  'satchel-panel': uikitml('satchel.uikitml', 'Satchel'),
  'card-panel': uikitml('card.uikitml', 'Notebook Card'),
  'tip-panel': uikitml('tip.uikitml', 'Tooltip'),
});
