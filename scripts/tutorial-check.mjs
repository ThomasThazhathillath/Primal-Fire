// Tutorial checks in the managed browser. STAGE=enter: switch this page into the tutorial (own save key) and reload.
// STAGE=state (default): report the tutorial tracker state. STAGE=eval: run CODE in the app frame (returns its value).
export default async function run({ page }) {
  const stage = process.env.STAGE ?? 'state';
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  if (!app) return { error: 'app frame not found' };
  if (stage === 'enter' || stage === 'leave') {
    await app.evaluate((s) => {
      localStorage.setItem('primal-first-fire.mode.v1', s === 'enter' ? 'tutorial' : 'survival');
      location.reload();
    }, stage);
    return { reloading: true };
  }
  return await app.evaluate(async (code) => {
    const t = window.__tutorial, g = window.__primal.game;
    if (code) return await (0, eval)(code);
    return { tut: t?.state(), held: g.held, satchel: Object.fromEntries(g.satchel), player: g.player,
      survivalSave: (localStorage.getItem('primal-first-fire.save.v1') ?? '').length,
      tutorialSave: (localStorage.getItem('primal-first-fire.tutorial-game.v1') ?? '').length };
  }, process.env.CODE ?? '');
}
