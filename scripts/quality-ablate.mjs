// Which scene parts cost the most (SwiftShader, relative): render with each category hidden, tier from QUALITY env.
import { chromium } from 'playwright';
const port = process.env.PORT ?? '8097';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors', '--disable-gpu-vsync'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
await page.goto(`https://localhost:${port}/?quality=${process.env.QUALITY ?? 'high'}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__primal?.game, null, { timeout: 90000 });
await page.evaluate(() => window.__primal.begin());
await page.waitForTimeout(8000);
const res = await page.evaluate(async () => {
  const p = window.__primal, r = p.world.renderer, gl = r.getContext(), scene = p.world.scene, cam = p.world.camera;
  const px = new Uint8Array(4);
  const time = (n = 15) => { const ts = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); r.render(scene, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); } ts.sort((a, b) => a - b); return +ts[Math.floor(n / 2)].toFixed(0); };
  const named = (re) => { const l = []; scene.traverse((o) => { if (re.test(o.name || '') ) l.push(o); }); return l; };
  await new Promise((s) => setTimeout(s, 1500));
  const out = { all: time() };
  const hide = (list) => { const prev = list.map((o) => o.visible); list.forEach((o) => (o.visible = false)); return () => list.forEach((o, i) => (o.visible = prev[i])); };
  const sel = (f) => { const l = []; scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isSprite) if (f(o)) l.push(o); }); return l; };
  const groups = {};
  scene.traverse((o) => { if (o.isInstancedMesh) { const k = (o.name || o.parent?.name || '?').replace(/[_ ]?\d+$/, '') + ' | ' + o.material.type + (o.material.alphaTest ? ' alphaTest' : ''); (groups[k] ||= []).push(o); } });
  for (const [k, l] of Object.entries(groups)) { const back = hide(l); const tris = l.reduce((a, m) => a + (m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3) * m.count, 0); out[k + ' x' + l.length + ' tris~' + Math.round(tris)] = time(); back(); }
  out.all2 = time();
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
