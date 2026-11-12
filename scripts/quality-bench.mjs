// Time renderer.render + gl.finish() per quality tier at the spawn view (relative GPU+submit cost on THIS machine, not a Quest).
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async ([mode, process_ratio]) => {
    const p = window.__primal;
    if (mode === 'begin') { p.begin(); return 'ok'; }
    const r = p.world.renderer, gl = r.getContext(), scene = p.world.scene, cam = p.world.camera;
    const out = {};
    const pr = r.getPixelRatio();
    r.setPixelRatio(Number(process_ratio));
    for (const tier of ['high', 'medium', 'low']) {
      window.__quality.set(tier);
      await new Promise((res) => setTimeout(res, 1500));
      const ts = [];
      for (let i = 0; i < 40; i++) {
        const t0 = performance.now();
        r.render(scene, cam);
        gl.finish();
        ts.push(performance.now() - t0);
        await new Promise((res) => requestAnimationFrame(res));
      }
      ts.sort((a, b) => a - b);
      r.render(scene, cam);
      out[tier] = { medianMs: +ts[20].toFixed(2), p90Ms: +ts[36].toFixed(2), calls: r.info.render.calls, tris: r.info.render.triangles, w: r.domElement.width, h: r.domElement.height };
    }
    r.setPixelRatio(pr);
    window.__quality.set('high');
    return out;
  }, [process.env.MODE ?? 'bench', process.env.RATIO ?? '1']);
}
