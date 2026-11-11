// Build-time only. Turns the Poly Haven HDRI "kloofendal_48d_partly_cloudy_puresky" (CC0, 2K, https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky)
// into public/sky/clouds.webp: a 2048 x 1024 equirectangular RGBA image whose alpha is "how much cloud" (cloud is neutral and bright,
// clear sky is blue) and whose colour is the cloud's own shading, tone-mapped and normalised, so the game can tint it by time of day.
//   node scripts/sky/bake.mjs <file.hdr>
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const buf = readFileSync(process.argv[2]);
// --- Radiance RGBE reader (flat and RLE scanlines)
let pos = 0;
const line = () => { let s = ''; while (buf[pos] !== 0x0a) s += String.fromCharCode(buf[pos++]); pos++; return s; };
while (line().length > 0);
const dims = line().split(' ');
const H = Number(dims[1]);
const W = Number(dims[3]);
const rgbe = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) {
  if (buf[pos] === 2 && buf[pos + 1] === 2 && ((buf[pos + 2] << 8) | buf[pos + 3]) === W) {
    pos += 4;
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < W) {
        let n = buf[pos++];
        if (n > 128) { n -= 128; const v = buf[pos++]; while (n--) rgbe[(y * W + x++) * 4 + c] = v; }
        else while (n--) rgbe[(y * W + x++) * 4 + c] = buf[pos++];
      }
    }
  } else {
    for (let x = 0; x < W; x++) { for (let c = 0; c < 4; c++) rgbe[(y * W + x) * 4 + c] = buf[pos++]; }
  }
}
const out = Buffer.alloc(W * H * 4);
let maxL = 0;
const lin = new Float32Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  const e = rgbe[i * 4 + 3];
  const f = e === 0 ? 0 : Math.pow(2, e - 136);
  for (let c = 0; c < 3; c++) lin[i * 3 + c] = rgbe[i * 4 + c] * f;
}
// Reference clear-sky blueness per row (median of min/max) to separate cloud from sky.
for (let y = 0; y < H; y++) {
  const v = (y + 0.5) / H; // 0 top (zenith) .. 1 bottom (nadir)
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const r = lin[i * 3], g = lin[i * 3 + 1], b = lin[i * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    // Neutral (low saturation) and bright = cloud. Sky is saturated blue.
    const sat = mx > 0 ? 1 - mn / mx : 0;
    let a = Math.min(1, Math.max(0, (0.5 - sat) / 0.3));
    // The sun and the horizon haze are neutral too: keep only the upper sky, fading out toward the horizon.
    const elev = 1 - v * 2; // +1 zenith, 0 horizon, -1 nadir
    a *= Math.min(1, Math.max(0, (elev - 0.04) / 0.2));
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    maxL = Math.max(maxL, l);
    out[i * 4 + 3] = Math.round(a * 255);
    lin[i * 3] = l; // reuse as luminance
  }
}
// Cloud colour: luminance tone-mapped so thick clouds are bright and shaded cores grey-blue.
for (let i = 0; i < W * H; i++) {
  const l = lin[i * 3];
  const t = Math.min(1, l / (l + 0.9) * 1.9);
  const c = Math.round(Math.pow(t, 0.8) * 255);
  out[i * 4] = Math.min(255, Math.round(c * 0.97));
  out[i * 4 + 1] = Math.min(255, Math.round(c * 0.99));
  out[i * 4 + 2] = c;
}
const info = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 80, alphaQuality: 85 }).toFile(new URL('../../public/sky/clouds.webp', import.meta.url).pathname);
console.log('size', W, H, 'peak luminance', maxL.toFixed(1), 'file', info.size);
