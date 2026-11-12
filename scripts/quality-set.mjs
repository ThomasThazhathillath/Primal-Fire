export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async (t) => { if (t === 'begin') { window.__primal.begin(); return 'ok'; } if (t === 'get') return window.__quality.get(); window.__quality.set(t); await new Promise((r) => setTimeout(r, 2500)); return window.__quality.get(); }, process.env.TIER ?? 'get');
}
