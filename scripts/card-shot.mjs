// CODE: JS run in the app frame (awaited); OUT: jpg path to save the app frame to (optional).
export default async function run({ page }) {
  let app;
  for (let i = 0; i < 60 && !app; i++) {
    for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
    if (!app) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!app) return { error: 'no app' };
  const res = await app.evaluate(async (code) => { const v = await (0, eval)(code || 'null'); await new Promise(r => setTimeout(r, 1200)); try { return JSON.parse(JSON.stringify(v ?? null)); } catch { return String(v); } }, process.env.CODE ?? '');
  if (process.env.OUT) {
    const el = await app.frameElement().catch(() => null);
    if (el) await el.screenshot({ path: process.env.OUT, type: 'jpeg', quality: 85 });
    else await page.screenshot({ path: process.env.OUT, type: 'jpeg', quality: 85 });
  }
  return res;
}
