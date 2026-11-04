// Opens the hint panel from the objective card and reports which of card/hint is visible (MODE=close closes it).
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async (mode) => {
    const p = window.__primal;
    const ui = p.world.globals.ui;
    if (mode === 'begin') p.begin();
    else if (mode === 'close') ui.openHint(p.game.objectives.view().id);
    else ui.openHint(p.game.objectives.view().id);
    await new Promise((r) => setTimeout(r, 800));
    return { cardVisible: window.__objcard.panel.visible, hintOpen: ui.hintOpen?.(), hint: window.__hint?.state?.() };
  }, process.env.MODE ?? 'open');
}
