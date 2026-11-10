import fs from 'node:fs';
export default async function run({ frame }) {
  const code = fs.readFileSync('.scratch/code.txt', 'utf8');
  return await frame.evaluate(async (c) => { const f = new (Object.getPrototypeOf(async function () {}).constructor)('p', 'g', c); return await f(window.__primal, window.__primal.game); }, code);
}
