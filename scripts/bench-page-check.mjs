export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async () => {
    const p = window.__primal, g = p.game; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__title?.tap('begin-button') || p.begin(); await wait(800);
    g.allowsBuild = () => true; g.addItem('dryStone', 3); g.addItem('slab');
    g.armFromBook('workbench'); p.place(0, -2); await wait(300);
    const s = g.structures[0];
    s.complete = true;
    const { BenchSystem } = await import('/src/systems/bench-system.ts');
    const sys = p.world.getSystem(BenchSystem);
    sys.show(s.id); await wait(800);
    const p0 = sys.page; window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 })); await wait(300);
    const p1 = sys.page; window.__touch.bench?.tap('bench-more'); await wait(300);
    return { open: sys.open, p0, p1, p2: sys.page, ids: window.__touch.bench?.targets?.().map((t) => t.id) };
  });
}
