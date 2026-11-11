// Build-time only. Packs three Poly Haven ground textures (CC0, 1K) for the zone-blended ground shader:
//   forrest_ground_01  clearing and meadow      forest_leaves_02  under the trees      brown_mud_leaves_01  stream banks
// Each set becomes  <name>_dr.webp  (diffuse RGB + roughness in alpha, 1024 px)  and  <name>_n.webp  (tangent normal, 512 px).
//   node scripts/ground/bake.mjs <folder with <asset>_diff.jpg, _nor.jpg, _rough.jpg>
import { resolve } from 'node:path';
import sharp from 'sharp';

const src = resolve(process.argv[2] ?? '.');
const out = new URL('../../public/ground/', import.meta.url).pathname;
const SETS = { ground: 'forrest_ground_01', leaves: 'forest_leaves_02', mud: 'brown_mud_leaves_01' };
for (const [name, asset] of Object.entries(SETS)) {
  const rough = await sharp(`${src}/${asset}_rough.jpg`).resize(1024, 1024).greyscale().raw().toBuffer();
  const { data, info } = await sharp(`${src}/${asset}_diff.jpg`).resize(1024, 1024).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    rgba[i * 4] = data[i * 3];
    rgba[i * 4 + 1] = data[i * 3 + 1];
    rgba[i * 4 + 2] = data[i * 3 + 2];
    rgba[i * 4 + 3] = rough[i];
  }
  const dr = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).webp({ quality: 82, alphaQuality: 90 }).toFile(`${out}${name}_dr.webp`);
  const n = await sharp(`${src}/${asset}_nor.jpg`).resize(512, 512).webp({ quality: 85 }).toFile(`${out}${name}_n.webp`);
  console.log(name, asset, 'dr', dr.size, 'n', n.size);
}
