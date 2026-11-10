// Chapter 1 story play-through in the managed browser (docs/STORY_CHAPTER1_PLAN.md).
// STAGE=reset: fresh survival save, reload. STAGE=play (default): wake, walk to the clues, gather, the stream,
// build the workbench and fire pit, make fire with the real bow-drill/ember/fan calls, camp, look at the mast;
// screenshots go to docs/shots-story/. STAGE=reload: the story state after a reload (nothing should replay).
import { mkdirSync } from 'node:fs';

export default async function run({ page, workspaceRoot }) {
  const stage = process.env.STAGE ?? 'play';
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  if (!app) return { error: 'app frame not found' };
  if (stage === 'reset') {
    await app.evaluate(() => {
      localStorage.setItem('primal-first-fire.mode.v1', 'survival');
      localStorage.setItem('primal-first-fire.choice.v1', 'survival');
      window.__primal.reset();
    });
    return { reloading: true };
  }
  const ev = (fn, arg) => app.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const dir = `${workspaceRoot}/docs/shots-story`;
  mkdirSync(dir, { recursive: true });
  const shot = async (name) => page.screenshot({ type: "jpeg", quality: 70, path: `${dir}/${name}.jpg` });
  const hud = () => ev(() => window.__primal.world.getSystem && document.title); // keep frame alive
  const seen = () => ev(() => [...window.__primal.game.story.seen]);
  if (stage === 'reload') return { seen: await seen(), camp: await ev(() => window.__primal.game.story.camp), notes: await ev(() => Object.fromEntries(window.__primal.game.story.notes)) };

  const out = { steps: [] };
  const step = async (name) => out.steps.push({ name, seen: await seen(), toastLog: await ev(() => window.__primal.game.log.toString().split('\n').filter((l) => /story|toast/.test(l)).slice(-4)) });

  await ev(() => window.__primal.begin());
  await wait(900);
  await shot('01-awakening-fade');
  await wait(3500);
  await shot('02-first-thought');
  await step('awake');

  // Act 1: clues (walk up to them).
  await ev(() => { window.__primal.goTo(-2.4, -0.4); window.__primal.face(-4.2, -1.2); });
  await wait(1500);
  await shot('03-old-fire-remains');
  await ev(() => window.__primal.goTo(-4.0, -0.6));
  await wait(800);
  await ev(() => window.__primal.goTo(-1.4, -3.6));
  await wait(800);
  await step('clues');

  // Act 2: gather from real resource spots; the stream.
  const got = await ev(async () => {
    const p = window.__primal, res = {};
    for (const item of ['dryStone', 'dryGrass', 'twigs', 'fibers', 'branch', 'logs']) {
      const s = p.spots(item).filter((x) => (x.charges ?? 1) > 0).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
      if (!s) continue;
      p.goTo(s.x + 0.6, s.z + 0.6);
      await new Promise((r) => setTimeout(r, 400));
      res[item] = p.gather(s.id);
    }
    return res;
  });
  out.gathered = got;
  await step('gathered');
  await ev(async () => {
    const p = window.__primal;
    p.goTo(2, -10); // towards the stream
    for (let i = 0; i < 20 && !p.game.story.seen.has('stream'); i++) {
      p.goTo(2 + i * 0.6, -10 - i * 0.5);
      await new Promise((r) => setTimeout(r, 300));
    }
  });
  await step('stream');

  // Act 3: the workbench through the blueprint API, at a camp site near the start.
  out.bench = await ev(async () => {
    const p = window.__primal, g = p.game;
    p.goTo(-1, 1);
    g.addItem('slab'); g.addItem('dryStone', 3);
    await new Promise((r) => setTimeout(r, 400));
    g.takeOut('slab');
    const placed = g.placeBlueprint('workbench', -2, 3).structure;
    const s = p.build('workbench')[0];
    if (!s) return { placed, err: 'no workbench' };
    s.spots.forEach((_, i) => p.fill(s.id, i));
    const ok = g.placeKey(s.id, s.x, s.z, 2);
    return { placed: !!placed, ok, complete: s.complete };
  });
  await wait(4000);
  await shot('04-workbench-done');
  await step('workbench');

  // Act 4: fire pit + lay + bow drill + ember + fan (the game's fire calls).
  out.fire = await ev(async () => {
    const p = window.__primal, g = p.game;
    g.addItem('dryStone', 4);
    g.takeOut('dryStone');
    const s = g.placeBlueprint('firePit', 0, 4.6).structure;
    if (!s) return { err: 'fire pit refused', log: g.log.toString().split('\n').slice(-4) };
    s.spots.forEach((_, i) => p.fill(s.id, i));
    g.addItem('dryGrass', 2); g.addItem('twigs', 3); g.addItem('logs', 2);
    p.goTo(0, 3.4);
    for (let i = 0; i < 6; i++) g.fire.addFuel();
    g.addItem('bowDrill');
    g.takeOut('bowDrill');
    await new Promise((r) => setTimeout(r, 1200));
    for (let i = 0; i < 400 && !g.fire.carrying; i++) g.fire.stroke();
    const ember = g.fire.carrying;
    await new Promise((r) => setTimeout(r, 2500));
    g.fire.transferEmber();
    for (let i = 0; i < 60 && g.fire.stage !== 'burning'; i++) g.fire.fan(1, 0.1);
    return { complete: s.complete, ember, stage: g.fire.stage, lit: g.flag('fireLit') };
  });
  await ev(() => window.__primal.face(0, 4.6));
  await wait(1500);
  await shot('05-first-fire-small');
  await wait(9000);
  await shot('06-first-fire-grown');
  await step('fire');

  // Act 5: camp, then look towards the mast yourself.
  await wait(6000);
  await ev(() => { window.__primal.goTo(-0.5, 0.2); window.__primal.face(-1, 3.8); });
  await wait(1500);
  await shot('07-camp');
  await ev(() => window.__primal.face(-25.6, -22.8));
  await wait(9000);
  await shot('08-ruins-teaser');
  await step('teaser');
  out.camp = await ev(() => window.__primal.game.story.camp);
  out.notes = await ev(() => Object.fromEntries(window.__primal.game.story.notes));
  out.errors = await ev(() => window.__primal.game.log.toString().split('\n').filter((l) => /ERROR/.test(l)));
  await hud();
  return out;
}
