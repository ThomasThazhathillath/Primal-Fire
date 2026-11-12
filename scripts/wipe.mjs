export default async function run({ page }) {
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) { await f.evaluate(() => { window.__primal.reset(); }); }
  return 'wiped';
}
