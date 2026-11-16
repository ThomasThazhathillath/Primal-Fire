// In XR: reopen the bench (list), start Cord, report pictures and More.
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async () => {
    const p = window.__primal, g = p.game; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const { BenchSystem } = await import('/src/systems/bench-system.ts');
    const sys = p.world.getSystem(BenchSystem);
    const thumbs = () => sys.panel.children.filter((c) => c.isMesh && c.geometry?.type === 'PlaneGeometry' && c.visible).length;
    if (g.bench) g.cancelBench();
    sys.show(sys.benchId); await wait(1500);
    const list = thumbs();
    g.startBench('cord', sys.benchId); await wait(1500);
    return { vr: sys.vrNow, open: sys.open, thumbsInList: list, thumbsWhileCrafting: thumbs(), crafting: g.bench?.recipe.id };
  });
}
