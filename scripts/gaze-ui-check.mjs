// MODE=begin | list (ui candidates + state)
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate((mode) => {
    const p = window.__primal;
    if (mode === 'begin') { p.begin(); return 'ok'; }
    const g = window.__gaze;
    return { ui: g.list().filter((c) => c.key.startsWith('ui:')).slice(0, 12), state: g.state() };
  }, process.env.MODE ?? 'list');
}
