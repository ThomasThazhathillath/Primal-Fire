// Drive to the workbench objective, fire a failure toast, then measure the objective card rows.
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  if (!app) throw new Error('no app');
  const out = await app.evaluate(async () => {
    const p = window.__primal, g = p.game;
    p.begin();
    for (let i = 0; i < 4; i++) g.gather('dryStone');
    g.tick(5);
    for (let i = 0; i < 6; i++) { g.tick(5); }
    const s = g.placeFromBook('workbench', 0, -1).structure;
    g.takeOut('slab');
    g.placeKey(s.id, s.x, s.z, 2);
    g.toast('The slab needs to be positioned above the three supports.', 'bad');
    await new Promise((r) => setTimeout(r, 1500));
    const c = window.__objcard;
    const rows = {};
    for (const id of ['obj-instr', 'obj-subs', 'obj-note', 'obj-bad', 'obj-prow']) {
      const el = c.panel.requireElementById(id);
      rows[id] = [Math.round(el.size?.value?.[0] ?? -1), Math.round(el.size?.value?.[1] ?? -1)];
    }
    return { rows, view: c.state().view && { id: c.state().view.id, subs: c.state().view.substeps, bad: c.state().view.feedback, tip: c.state().view.tip } };
  });
  return out;
}
