// Run a snippet inside the running game and print its result (developer checks).
//   CODE='return __primal.game.structures.length' npx @iwsdk/cli browser run scripts/eval.mjs
//   CODE_FILE=path/to/snippet.js npx @iwsdk/cli browser run scripts/eval.mjs
// The snippet is the body of an async function with `p` (= window.__primal) and `g` (= the Game) in scope.
// Page errors raised while it runs are returned under `errors`.
import { readFileSync } from 'node:fs';

export default async function run({ page }) {
  const code = process.env.CODE ?? (process.env.CODE_FILE ? readFileSync(process.env.CODE_FILE, 'utf8') : 'return null');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  let app = null;
  for (let i = 0; i < 60 && !app; i++) {
    for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
    if (!app) await page.waitForTimeout(500);
  }
  if (!app) throw new Error('window.__primal not found - is the app loaded?');
  const result = await app.evaluate(async (src) => {
    const p = window.__primal;
    const fn = new Function('p', 'g', `return (async () => { ${src} })();`);
    return await fn(p, p.game);
  }, code);
  await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 300));
  return { result, errors };
}
