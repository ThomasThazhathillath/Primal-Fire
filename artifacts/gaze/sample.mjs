import { readFileSync } from 'node:fs';
// Runs the setup expression, waits, resets stats, waits `secs`, returns the summary.
export default async function run({ frame, page }) {
  const f = frame ?? page;
  const setup = readFileSync(new URL('./expr.js', import.meta.url), 'utf8');
  await f.evaluate(setup);
  await new Promise((r) => setTimeout(r, 1500));
  await f.evaluate('window.__perf.reset()');
  await new Promise((r) => setTimeout(r, 5000));
  return await f.evaluate('window.__perf.sample()');
}
