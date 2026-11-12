// ACTION=bag-discard | arm
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async (a) => {
    const p = window.__primal, g = p.game;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    if (a === 'begin') { p.begin(); return 'ok'; }
    if (a === 'bag-discard') {
      g.addItem('dryStone', 3); p.satchel(); await wait(1200);
      const T = window.__touch.bag;
      const ids = T.targets().map((t) => t.id);
      const di = ids.find((i) => i.startsWith('del-'));
      T.tap(di); await wait(300);
      const asked = g.log.lines.some((l) => /discard ask/.test(l.text));
      const stillThere = g.count('dryStone');
      T.tap(di); await wait(300);
      return { ids: ids.slice(0, 6), asked, stillThere, after: g.count('dryStone'), logged: g.log.lines.some((l) => /discarded dryStone/.test(l.text)) };
    }
    if (a === 'arm') {
      g.allowsBuild = () => true; // skip the tutorial lock for this check
      g.addItem('dryStone', 3); g.addItem('slab');
      const r = g.armFromBook('workbench');
      await wait(800);
      let ghost = null;
      p.world?.scene?.traverse?.((o) => { if (o.name === 'BlueprintGhost') ghost = o; });
      const info = ghost ? { visible: ghost.visible, kids: ghost.children.length } : 'no ghost object';
      const after = g.structures.length; const armedNow = g.armedPlan;
      g.armPlan(null); await wait(300);
      return { r, armed: armedNow, structures: after, info, cleared: g.armedPlan, ghostKidsAfter: ghost?.children.length };
    }
  }, process.env.ACTION);
}
