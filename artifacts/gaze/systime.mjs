export default async function run({ frame, page }) {
  const f = frame ?? page;
  return await f.evaluate(async () => {
    const w = window.__primal.world;
    const systems = w.getSystems ? w.getSystems() : (w.systemManager?.systems ?? w.systems ?? []);
    const list = Array.isArray(systems) ? systems : Array.from(systems.values ? systems.values() : []);
    const acc = new Map();
    const orig = [];
    for (const s of list) {
      const name = s.constructor?.name ?? '?';
      const u = s.update;
      if (typeof u !== 'function') continue;
      orig.push([s, u]);
      s.update = function (...a) { const t = performance.now(); const r = u.apply(this, a); acc.set(name, (acc.get(name) ?? 0) + performance.now() - t); return r; };
    }
    let frames = 0; const cnt = () => { frames++; }; w.scene.onBeforeRender = cnt;
    await new Promise((r) => setTimeout(r, 4000));
    for (const [s, u] of orig) s.update = u;
    return { n: list.length, frames, top: [...acc.entries()].map(([k, v]) => [k, +(v / Math.max(1, frames)).toFixed(3)]).sort((a, b) => b[1] - a[1]).slice(0, 18) };
  });
}
