// ACTION=open|next|state: drive the VR menu row (hook taps) and report the visible icons and page.
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async (a) => {
    const m = window.__menu;
    if (a === 'begin') { window.__primal.begin(); return 'ok'; }
    if (a === 'open') m.tap('menu');
    if (a === 'next') m.tap('next');
    if (a === 'prev') m.tap('prev');
    await new Promise((r) => setTimeout(r, 700));
    return { visible: m.visible?.() ?? null };
  }, process.env.ACTION ?? 'state');
}
