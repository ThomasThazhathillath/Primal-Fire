# Third-party assets

Every asset that is not authored in this repository, with its source and licence. CC0 assets from Poly Haven are used at 1K/2K
only and recompressed; nothing is used at 4K.

| Asset | Used for | Source | Licence | Where |
|---|---|---|---|---|
| EZ-Tree (`@dgreenheck/ez-tree` 1.1.0) generator and its leaf textures (downscaled to 512 px) | Trees and shrubs, baked at build time | https://github.com/dgreenheck/ez-tree, https://www.eztree.dev/ | MIT, Copyright (c) 2024 Daniel Greenheck | `scripts/trees/bake.mjs`, `public/trees/*` |

| Rock Moss Set 01, 1K glTF + 1K diffuse, normal and roughness JPEGs (downloaded from https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/rock_moss_set_01/ and .../jpg/1k/rock_moss_set_01/), shrunk to six rocks at 2.2k, 450 and 110 triangles by `scripts/rocks/bake.mjs` | Boulders (`public/rocks/rocks.glb`) and the collectible stones, flint and chalk (`src/scene-assets/rock-stones.data.ts`, vertex colours sampled from the diffuse map) | https://polyhaven.com/a/rock_moss_set_01 | CC0 1.0 (public domain), https://polyhaven.com/license | `public/rocks/`, `src/scene-assets/rock-stones.data.ts` |

Poly Haven assets planned for the rest of this round (not yet downloaded):

| Asset | Stage | Source |
|---|---|---|
| Forest Ground 01 | 3, ground | https://polyhaven.com/a/forest_ground_01 |
| Forest Leaves 02 | 3, ground | https://polyhaven.com/a/forest_leaves_02 |
| Brown Mud Leaves 01 | 3, stream banks | https://polyhaven.com/a/brown_mud_leaves_01 |
| kloofendal_48d_partly_cloudy_puresky (2K) | 4, sky | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky |
