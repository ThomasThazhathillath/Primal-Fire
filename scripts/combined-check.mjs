// ACTION=title | begin | discard | scroll | bench | pause  (headless IWER checks of the combined UI branch)
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async (a) => {
    const p = window.__primal, g = p.game;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const panelText = (name, id) => { let t = null; p.world.scene.traverse((o) => { if (o.name === name) t = o; }); try { return t?.getElementById?.(id)?.text?.value ?? t?.getElementById?.(id)?.properties?.value?.text ?? null; } catch { return 'err'; } };
    if (a === 'title') {
      const t = window.__title;
      return { hasTitle: !!t, open: t?.open?.() };
    }
    if (a === 'begin') { window.__title?.tap('begin-button') || p.begin(); await wait(800); return { titleOpen: window.__title?.open?.() }; }
    if (a === 'discard') {
      g.addItem('dryStone', 3); p.satchel(); await wait(1200);
      const T = window.__touch.bag; const ids = T.targets().map((t) => t.id);
      const di = ids.find((i) => i.startsWith('del-'));
      T.tap(di); await wait(300); const mid = g.count('dryStone');
      T.tap(di); await wait(300);
      return { ids: ids.slice(0, 5), askedKept: mid, after: g.count('dryStone') };
    }
    if (a === 'scroll') {
      const { ITEMS } = await import('/src/game/items.ts');
      for (const id of Object.keys(ITEMS).slice(0, 16)) { g.addItem(id, 1); }
      p.satchel(); await wait(1200);
      const sat = Object.values(p.world).flatMap((v) => (v && typeof v === 'object' ? [v] : [])).length && null;
      let sys = null;
      for (const sm of [p.world.systemManager, p.world]) { const list = sm?.systems ?? sm?._systems; if (list) for (const x of list) if (x && 'swipe' in x && 'discardAsk' in x) sys = x; }
      if (!sys) return { error: 'satchel system not found' };
      const n = g.satchelContents().length, p0 = sys.page;
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 })); await wait(300);
      const p1 = sys.page;
      window.__touch.bag.tap('bag-more'); await wait(300);
      return { n, p0, afterWheel: p1, afterMore: sys.page };
    }
    if (a === 'bench') {
      g.allowsBuild = () => true; g.addItem('dryStone', 3); g.addItem('slab');
      p.satchel(); await wait(200); p.satchel();
      const r = g.armFromBook('workbench'); await wait(500);
      const armed = g.armedPlan;
      const ok = p.place(0, -2); await wait(300);
      return { r, armed, placed: ok, structures: g.structures.map((s) => s.kind), armedAfter: g.armedPlan };
    }
    if (a === 'pause') {
      const P = window.__pause; const s0 = P.state(); P.open(); await wait(500); const s1 = P.state();
      P.tap('pause-resume') || P.close(); await wait(400);
      return { s0, s1, s2: P.state() };
    }
  }, process.env.ACTION);
}
