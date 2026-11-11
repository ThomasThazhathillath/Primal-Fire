// Jump to 22:00 and report the firefly state; screenshot separately.
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async (mode) => {
    const p = window.__primal, g = p.game;
    if (mode === 'begin') { p.begin(); return 'ok'; }
    g.env.skipTo(g.time, 22);
    g.env.rain = 0;
    await new Promise((r) => setTimeout(r, 2500));
    const f = p.world.scene.getObjectByName('Fireflies');
    return { hour: +g.env.hour.toFixed(2), night: g.env.night, rain: g.env.rain, fireflies: f ? { visible: f.visible, opacity: f.material.opacity } : null };
  }, process.env.MODE ?? 'night');
}
