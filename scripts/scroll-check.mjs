// ACTION=begin | bag (fill the bag, open it, report panel centre) | state
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async (a) => {
    const p = window.__primal, g = p.game;
    if (a === 'begin') { p.begin(); return 'ok'; }
    if (a === 'bag') {
      for (const id of ['dryStone', 'twigs', 'fibers', 'dryGrass', 'flake', 'slab', 'berries', 'nuts', 'tuber', 'seeds', 'cord', 'knife', 'bark', 'dryBranch', 'cane']) { try { g.addItem(id, 2); } catch (e) {} }
      p.satchel();
      await new Promise((r) => setTimeout(r, 1200));
    }
    const t = window.__touch?.bag?.targets?.() ?? [];
    return { n: g.satchelContents().length, first: t[0] ?? null, last: t[t.length - 1] ?? null, ids: t.map((x) => x.id).slice(0, 12) };
  }, process.env.ACTION ?? 'state');
}
