// Relative fragment/vertex cost per quality tier on a SOFTWARE renderer (SwiftShader): its time scales with shader work,
// so differences between tiers are meaningful even though absolute ms are not a Quest's. Needs the dev server (PORT, default 8097).
import { chromium } from 'playwright';
const port = process.env.PORT ?? '8097';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors', '--disable-gpu-vsync'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`https://localhost:${port}/?perf`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__primal?.game, null, { timeout: 90000 });
await page.evaluate(() => window.__primal.begin());
await page.waitForTimeout(8000);
const res = await page.evaluate(async () => {
  const p = window.__primal, r = p.world.renderer, gl = r.getContext(), scene = p.world.scene, cam = p.world.camera;
  const out = {};
  const px = new Uint8Array(4);
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  out.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a';
  const acc = { high: [], medium: [], low: [] };
  for (let round = 0; round < 4; round++) {
    for (const tier of ['high', 'medium', 'low']) {
      window.__quality.set(tier);
      await new Promise((res) => setTimeout(res, 1200));
      r.render(scene, cam);
      for (let i = 0; i < 7; i++) {
        const t0 = performance.now();
        r.render(scene, cam);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        acc[tier].push(performance.now() - t0);
      }
      out[tier + '_calls'] = r.info.render.calls;
      out[tier + '_tris'] = r.info.render.triangles;
    }
  }
  for (const k of Object.keys(acc)) { acc[k].sort((a, b) => a - b); out[k + '_medianMs'] = +acc[k][14].toFixed(0); out[k + '_minMs'] = +acc[k][0].toFixed(0); }
  return out;
});
console.log(JSON.stringify(res));
await browser.close();
