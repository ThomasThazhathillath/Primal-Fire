// Open a finished workbench, list (thumbs on), then start Cord: the craft view must show no recipe pictures and no More button.
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async (a) => {
    const p = window.__primal, g = p.game; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const { BenchSystem } = await import('/src/systems/bench-system.ts');
    const sys = p.world.getSystem(BenchSystem);
    const thumbs = () => sys.panel.children.filter((c) => c.isMesh && c.geometry?.type === 'PlaneGeometry' && c.visible).length;
    const more = () => sys.panel.getElementById('bench-more')?.properties?.peek?.()?.display ?? sys.panel.getElementById('bench-more')?.display?.peek?.();
    if (a === 'list') {
      window.__title?.play?.() || p.begin(); await wait(800);
      g.allowsBuild = () => true; g.addItem('dryStone', 3); g.addItem('slab'); g.addItem('fibers', 6);
      g.armFromBook('workbench'); p.place(0, -1.6); await wait(300);
      const s = g.structures[g.structures.length - 1]; s.complete = true;
      p.face(s.x, s.z, -0.35); await wait(300);
      sys.show(s.id); await wait(1500);
      return { open: sys.open, thumbsInList: thumbs(), bench: !!g.bench };
    }
    if (a === 'craft') {
      g.startBench('cord', sys.benchId); await wait(1200);
      return { crafting: g.bench?.recipe.id, thumbsWhileCrafting: thumbs(), moreDisplay: more() };
    }
    if (a === 'cancel') {
      g.cancelBench(); await wait(1200);
      return { crafting: !!g.bench, thumbsBackInList: thumbs(), moreDisplay: more() };
    }
  }, process.env.ACTION);
}
