import { AssetType, defineAssets } from '@iwsdk/core';
import {
  createForestGround,
  createForestTrees,
  createGroundDetail,
  createMountains,
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

const tree = (id: string) => ({ url: publicAssetUrl(`trees/${id}.glb`), type: AssetType.GLTF, name: `Tree ${id}`, priority: 'critical' as const });

export default defineAssets({
  // Baked EZ-Tree variants (scripts/trees/bake.mjs): drawn by TreeSystem, not placed by the scene.
  'tree-oak': tree('oak'),
  'tree-ash': tree('ash'),
  'tree-aspen': tree('aspen'),
  'tree-pine': tree('pine'),
  'tree-snag': tree('snag'),
  'tree-bush1': tree('bush1'),
  'tree-bush2': tree('bush2'),
  'tree-bush3': tree('bush3'),
  'forest-ground': createForestGround(),
  stream: createStream(),
  'forest-trees': createForestTrees(),
  undergrowth: createUndergrowth(),
  mountains: createMountains(),
  'ground-detail': createGroundDetail(),
  'shattered-tree': createShatteredTree(),
  ruins: createRuins(),
  'split-rock': createSplitRock(),
  'welcome-panel': uikitml('welcome.uikitml', 'Welcome Panel'),
  'hud-panel': uikitml('hud.uikitml', 'Quest HUD'),
  'iconbar-panel': uikitml('iconbar.uikitml', 'Icon Bar'),
  'hint-panel': uikitml('hint.uikitml', 'Hint Panel'),
  'satchel-panel': uikitml('satchel.uikitml', 'Satchel'),
  'book-panel': uikitml('buildbook.uikitml', 'Build Book'),
  'objective-panel': uikitml('objective.uikitml', 'Objective Card'),
  'card-panel': uikitml('card.uikitml', 'Notebook Card'),
  'tip-panel': uikitml('tip.uikitml', 'Tooltip'),
  'guide-panel': uikitml('guide.uikitml', 'Guide Card'),
  'level-panel': uikitml('level.uikitml', 'Level Card'),
  'bench-panel': uikitml('bench.uikitml', 'Workbench Recipes'),
  'tutorial-panel': uikitml('tutorial.uikitml', 'Tutorial Tracker'),
});
