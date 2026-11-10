import { readFileSync } from 'node:fs';
export default async function run({ frame, page }) {
  const code = readFileSync(new URL('./expr.js', import.meta.url), 'utf8');
  const f = frame ?? page;
  return await f.evaluate(code);
}
