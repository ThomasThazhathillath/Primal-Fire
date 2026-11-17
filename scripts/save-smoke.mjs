// Loads a frozen save fixture into the running game and reports what the player would see.
//   FIXTURE=at-ember npx @iwsdk/cli browser run scripts/save-smoke.mjs --timeout 60000
// FIXTURE=fresh (or none) clears the save. Needs `npx @iwsdk/cli dev up --allow-browser-automation`.
import { readFileSync } from 'node:fs';

const SAVE_KEY = 'primal-first-fire.save.v1';
const MODE_KEY = 'primal-first-fire.mode.v1';

async function appFrame(page) {
  for (let i = 0; i < 60; i++) {
    for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) return f;
    await page.waitForTimeout(500);
  }
  throw new Error('window.__primal not found - is the app loaded?');
}

export default async function run({ page }) {
  const name = process.env.FIXTURE ?? 'fresh';
  const save = name === 'fresh' ? null : readFileSync(`tests/fixtures/saves/${name}.json`, 'utf8');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  let app = await appFrame(page);
  await app.evaluate(
    ({ save, SAVE_KEY, MODE_KEY }) => {
      localStorage.clear();
      localStorage.setItem(MODE_KEY, 'survival');
      if (save) localStorage.setItem(SAVE_KEY, save);
      location.reload();
    },
    { save, SAVE_KEY, MODE_KEY },
  );
  await page.waitForTimeout(1500);
  app = await appFrame(page);
  await page.waitForTimeout(1500);
  const state = await app.evaluate(() => {
    const p = window.__primal;
    const g = p.game;
    const card = g.objectives?.view?.() ?? null;
    return {
      quest: g.quest?.title ?? null,
      objective: g.objectives?.current?.id ?? null,
      card: card ? { title: card.title, step: card.step, total: card.total } : null,
      lesson: g.lessons?.current ? { id: g.lessons.current.id, step: g.focus?.()?.id ?? null } : null,
      structures: g.structures.map((s) => `${s.kind}${s.complete ? '' : '*'}`),
      notebook: g.notebook.length,
      flags: [...(g['flags'] ?? [])],
      backup: localStorage.getItem('primal-first-fire.save.v1.bak') !== null,
    };
  });
  return { fixture: name, errors, ...state };
}
