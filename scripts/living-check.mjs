// MODE=night: night time + a stocked woodstack and rack in front of you, for screenshots.
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  return await app.evaluate(async (mode) => {
    const p = window.__primal, g = p.game;
    if (mode === 'begin') { p.begin(); return 'ok'; }
    const fx = -Math.sin(g.facingYaw), fz = -Math.cos(g.facingYaw);
    const mk = (kind, d, store, side = 0) => g.structures.push({ id: 900 + g.structures.length, kind, x: g.player.x + fx * d - fz * side, z: g.player.z + fz * d + fx * side, rotY: 0, key: 'logs', spots: [], complete: true, store });
    mk('woodStack', 2.2, { logs: 5, twigs: 3 }, 0.8);
    mk('dryingRack', 2.4, { fish: 2, berries: 2 }, -0.8);
    if (mode === 'night') g.env.skipTo(g.time, 23);
    if (mode === 'day') g.env.hourOffset = 12 - ((g.time / g.env.dayLength) * 24) % 24;
    await new Promise((r) => setTimeout(r, 1500));
    return { hour: g.env.hour, night: g.env.night };
  }, process.env.MODE ?? 'night');
}
