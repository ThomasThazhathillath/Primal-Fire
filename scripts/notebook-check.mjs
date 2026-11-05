// MODE=notebook: add an observation and open the notebook, then report; MODE=book opens the build book.
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async (mode) => {
    const p = window.__primal, ui = p.world.globals.ui;
    if (mode === 'book') ui.toggleBook?.();
    else { p.game.notebook.length = 0; p.game.observe('g_dead'); ui.openNotebook(); }
    await new Promise((r) => setTimeout(r, 900));
    return { cardVisible: window.__objcard.panel.visible, nb: ui.notebookOpen?.() };
  }, process.env.MODE ?? 'notebook');
}
