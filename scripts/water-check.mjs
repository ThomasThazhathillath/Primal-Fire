// Live check of Lesson 03 in the running game (desktop): experiment cards by real mouse clicks on their
// buttons, water actions by the real U key (and R to put the pot away). Waiting-only timers (drying, settling)
// are fast-forwarded by setting the timer close to its end; every outcome still comes from the game's rules.
// A browser run is limited to 110 s, so it runs in four phases on the same game, in order:
//   PHASE=start | clay | pot | filter | treatment
//   PHASE=clay npx @iwsdk/cli browser run scripts/water-check.mjs --timeout 110000   (SHOTS=<dir> saves screenshots)
const SHOTS = process.env.SHOTS;
const PHASE = process.env.PHASE ?? 'start';

export default async function run(ctx) {
  const results = [];
  try {
    return await play(ctx, results);
  } catch (err) {
    return { results, error: String(err?.stack ?? err).split('\n').slice(0, 4).join(' | ') };
  }
}

async function play({ page }, results) {
  const findApp = async () => {
    for (let i = 0; i < 120; i++) {
      for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) return f;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('app frame not found');
  };
  let app = await findApp();
  const P = (fn, arg) => app.evaluate(fn, arg);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  const waitFor = async (fn, ms = 20000, arg) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      await P(() => window.__keepFire?.()).catch(() => {});
      if (await P(fn, arg).catch(() => false)) return true;
      await wait(250);
    }
    return false;
  };
  const shot = async (name) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };
  const frameBox = async () => (await (await app.frameElement().catch(() => null))?.boundingBox?.()) ?? { x: 0, y: 0 };
  /** Real mouse click on a UIKit element of a panel (once the panel has finished popping in). */
  const click = async (panelName, el) => {
    await waitFor((name) => {
      const panel = window.__primal.world.scene.getObjectByName(name);
      if (!panel) return true;
      const s = panel.scale.x;
      const settled = window.__clickScale === s;
      window.__clickScale = s;
      return settled;
    }, 3000, panelName);
    await wait(250);
    const at = await P(
      ({ panelName, el }) => {
        const p = window.__primal;
        const panel = p.world.scene.getObjectByName(panelName);
        const e = panel?.getElementById?.(el);
        if (!e) return null;
        const v = p.world.camera.position.clone();
        e.getWorldPosition(v);
        p.world.camera.updateMatrixWorld(true);
        v.project(p.world.camera);
        const r = p.world.renderer.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      { panelName, el },
    );
    if (!at) return false;
    const box = await frameBox();
    await page.mouse.click(box.x + at.x, box.y + at.y);
    await wait(400);
    return true;
  };
  const key = async (code) => {
    await app.focus('canvas').catch(() => {});
    await page.keyboard.down(code);
    await wait(120);
    await page.keyboard.up(code);
    await wait(300);
  };
  const exp = () => P(() => ({ ...window.__experiment.state(), card: window.__experiment.panel.visible }));
  const phase = (id) => P((id) => window.__primal.game.experiments.phase(id), id);
  const goTo = async (x, z) => {
    await P(({ x, z }) => window.__primal.goTo(x, z), { x, z });
    await wait(600);
  };
  const water = () => P(() => window.__primal.game.water.potWater);
  /** Wait (up to 4 s) for the pot to hold `w`: a key press acts on the next frames. */
  const potIs = (w) => waitFor((w) => window.__primal.game.water.potWater === w, 4000, w);
  /** Click the card's option `i` once the card shows `id` in `ph`. */
  const answerCard = async (id, ph, i, label) => {
    const up = await waitFor(({ id, ph }) => window.__experiment.state().opened === id && window.__primal.game.experiments.phase(id) === ph, 15000, { id, ph });
    check(`${label}: card shows ${id} (${ph})`, up, JSON.stringify(await exp()));
    await click('ExperimentCard', `exp-opt-${i}`);
  };
  const action = async () => click('ExperimentCard', 'exp-action');

  let camp = await P(() => window.__waterCheck ?? null);
  if (PHASE === 'start') {
  // ---- Fresh survival game; Level 3 chosen from the title's level list by real clicks.
  await P(() => {
    localStorage.clear();
    localStorage.setItem('primal-first-fire.mode.v1', 'survival');
    window.__primal.reset();
  }).catch(() => {});
  await wait(1500);
  app = await findApp();
  await waitFor(() => window.__title?.open?.() === true, 30000);
  await wait(1000);
  if (!(await click('Welcome Panel', 'begin-button'))) await P(() => window.__title.tap('begin-button'));
  check('Play opens the level list', await waitFor(() => window.__title.levels(), 5000));
  await wait(800);
  const clicked = await click('Welcome Panel', 'lvl-water');
  check('Level 3 is on the list (real click)', clicked);
  check('Level 3 (Water) starts from the list', await waitFor(() => window.__primal.game.lessons.lesson?.id === 'water' && !window.__title.open(), 8000));
  // The fire is lit by the fire's own rules (lay, bow-drill ember, fanning) and kept fed while the checks wait.
  await P(async () => {
    const { LAY_NEEDS, PRESSURE } = await import('/src/game/fire.ts');
    window.__fireRules = { LAY_NEEDS, PRESSURE };
    window.__keepFire = () => {
      const g = window.__primal.game;
      if (g.fire.stage !== 'burning') return;
      const flame = g.fire.flame;
      if (g.fire.hearth.count() >= 3 && flame >= 0.45) return;
      const fuel = flame < 0.45 ? 'twigs' : 'logs';
      const hand = g.held;
      g.stow();
      g.addItem(fuel);
      g.takeOut(fuel);
      g.fire.addFuel();
      if (hand) g.takeOut(hand);
    };
  });
  camp = await P(() => {
    const g = window.__primal.game;
    const stream = (x, z) => g.water.atStream({ x, z });
    const out = {};
    // Spots near the stream bend for the filter, a little further back for the camp.
    const tryPlace = (kind, held, cands) => {
      for (const [x, z] of cands) {
        if (held) {
          g.addItem(held);
          g.takeOut(held);
        }
        const r = kind === 'workbench' ? g.placeFromBook('workbench', x, z) : g.placeBlueprint(kind, x, z, 0);
        if (r.ok) return r.structure;
        g.stow();
      }
      return null;
    };
    const grid = [];
    for (let x = -10; x <= 10; x += 1.5) for (let z = -10; z <= 10; z += 1.5) grid.push([x, z]);
    grid.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    const bench = tryPlace('workbench', null, grid);
    g.addItem('dryStone', 3);
    bench.spots.forEach((_, i) => g.fillSpot(bench.id, i));
    g.addItem('slab');
    g.takeOut('slab');
    g.placeKey(bench.id, bench.x, bench.z, 2);
    const pit = tryPlace('firePit', 'dryStone', grid.filter(([x, z]) => Math.hypot(x - bench.x, z - bench.z) < 6));
    g.addItem('dryStone', 3);
    for (let i = 0; i < 3; i++) g.fillSpot(pit.id, i);
    g.stow();
    const { LAY_NEEDS, PRESSURE } = window.__fireRules;
    g.addItem('dryGrass', LAY_NEEDS.tinder);
    g.addItem('twigs', LAY_NEEDS.twigs);
    g.addItem('logs', LAY_NEEDS.logs);
    for (let i = 0; i < 20 && !g.fire.layBuilt; i++) g.fire.addFuel();
    g.addItem('bowDrill');
    g.takeOut('bowDrill');
    for (let i = 0; i < 400 && !g.fire.carrying; i++) {
      g.fire.saw(1.5 * 0.05, 0.05, PRESSURE.firm, 1);
      g.fire.tick(0.05);
    }
    g.stow();
    g.fire.transferEmber();
    for (let i = 0; i < 40 && g.fire.stage !== 'burning'; i++) g.fire.fan(0.8, 0.25);
    out.fire = g.fire.stage;
    // A roofed lean-to: every part, lashing done by the lash gesture's own call.
    for (const [id, n] of [['pole', 3], ['greenBranch', 5], ['cord', 3], ['twigs', 4], ['bark', 3], ['leafLitter', 3], ['dryGrass', 3]]) g.addItem(id, n);
    const lean = tryPlace('leanTo', 'pole', grid.filter(([x, z]) => Math.hypot(x - pit.x, z - pit.z) > 3 && Math.hypot(x - pit.x, z - pit.z) < 9));
    for (let pass = 0; pass < 12; pass++) {
      lean.spots.forEach((v, i) => {
        if (v !== null) return;
        if (!g.fillSpot(lean.id, i)) for (let k = 0; k < 40 && g.lashJoint(lean.id, i, 0.05) < 1; k++);
      });
      // Lesson 01: the ribs wait for one push of the bare frame.
      g.pushFrame(lean.id);
    }
    g.stow();
    out.bench = { id: bench.id, x: bench.x, z: bench.z, ok: bench.complete };
    out.pit = { x: pit.x, z: pit.z, ok: pit.complete };
    out.lean = { x: lean.x, z: lean.z, roofed: !!g.water.roofEdge() };
    // A stream bank point and a filter site beside it.
    let bank = null;
    for (const [x, z] of grid) if (!bank && stream(x, z)) bank = { x, z };
    out.bank = bank;
    window.__waterCheck = out;
    return out;
  });
  check('camp ready: bench, a fire lit by the fire rules, roofed lean-to', camp.bench.ok && camp.pit.ok && camp.fire === 'burning' && camp.lean.roofed, JSON.stringify(camp));
  }
  const atFire = () => goTo(camp.pit.x + 1, camp.pit.z);
  const atBench = () => goTo(camp.bench.x, camp.bench.z + 1);
  const atBank = () => goTo(camp.bank.x, camp.bank.z);
  if (PHASE === 'clay') {
  check('lesson 03 starts at the clay-temper test', (await P(() => window.__primal.game.focus()?.id)) === 'clayTemper');

  // ---- clayTemper + potFiring: predictions by real clicks.
  await answerCard('clayTemper', 'predict', 0, 'predict sand');
  check('clay prediction recorded', (await P(() => window.__primal.game.experiments.state('clayTemper').prediction)) === 'sand');
  const keepLabel = await P(() => window.__experiment.panel.getElementById('exp-action-label')?.properties?.value?.text ?? window.__experiment.panel.getElementById('exp-action-label')?.properties?.text ?? null).catch(() => null);
  await action(); // Keep testing: closes the card; the firing test waited behind it
  check('the clay card closes with its testing button', (await exp()).opened !== 'clayTemper' && keepLabel === 'Keep testing', String(keepLabel));
  await answerCard('potFiring', 'predict', 0, 'predict dry (opens once the clay card is closed)');
  check('firing prediction recorded', (await P(() => window.__primal.game.experiments.state('potFiring').prediction)) === 'dry');
  await action();
  await atBench();
  await P(() => {
    const g = window.__primal.game;
    g.addItem('clay', 4);
    g.addItem('sand', 2);
    const b = g.structures.find((s) => s.kind === 'workbench');
    g.startBench('clayTest', b.id);
    for (let i = 0; g.bench && i < 10000; i++) g.benchWork(g.bench.step.motion, 0.05);
  });
  check('bench made three test cups', (await P(() => window.__primal.game.water.clay.pieces.length)) === 3);
  await atFire();
  await P(() => window.__primal.game.stow());
  const prompt = await P(() => window.__primal.game.water.available()?.id);
  check('empty hand at the fire offers the test cup', prompt === 'fireTest', prompt);
  await key('KeyU');
  check('U puts a damp cup in the fire', await waitFor(() => window.__primal.game.experiments.state('potFiring').trials.get('damp') === 'burst', 8000));
  // Fast-forward the drying wait (the drying rule still decides).
  await P(() => window.__primal.game.water.clay.pieces.forEach((p) => p.state === 'damp' && (p.dry = Math.max(p.dry, p.kind === 'temper' ? 28 : 4))));
  check('clay-only cup cracked, sand cup dried whole', await waitFor(() => window.__primal.game.experiments.phase('clayTemper') === 'result', 15000));
  await waitFor(() => window.__experiment.state().opened === 'clayTemper', 5000);
  await shot('w1-clay-result');
  await action(); // Continue
  await answerCard('clayTemper', 'check', 0, 'clay check');
  check('clay check answered right', (await phase('clayTemper')) === 'done');
  await action(); // Done
  await atFire();
  await key('KeyU');
  check('dry cup fired to ceramic', await waitFor(() => window.__primal.game.experiments.phase('potFiring') === 'result', 15000));
  await action();
  await answerCard('potFiring', 'check', 0, 'firing check');
  await action();
  check('on to the pot step', await waitFor(() => window.__primal.game.focus()?.id === 'pot', 6000));
  }
  if (PHASE === 'pot') {

  // ---- The pot (existing rules; drying fast-forwarded).
  await atBench();
  await P(() => {
    const g = window.__primal.game;
    const b = g.structures.find((s) => s.kind === 'workbench');
    g.startBench('pot', b.id);
    for (let i = 0; g.bench && i < 10000; i++) g.benchWork(g.bench.step.motion, 0.05);
    g.water.potDry = 44;
  });
  await waitFor(() => window.__primal.game.flag('potDry'), 8000);
  await atFire();
  await P(() => window.__primal.game.takeOut('pot'));
  await key('KeyU');
  check('pot fired in the fire', await waitFor(() => window.__primal.game.flag('potFired'), 30000));

  // ---- waterSource: stream, then rain off the roof (Wait for rain is the card's button).
  await answerCard('waterSource', 'predict', 0, 'predict rain');
  const label = await P(() => window.__experiment.panel.getElementById('exp-action-label')?.properties?.text ?? null).catch(() => null);
  await action(); // Wait for rain
  const raining = await waitFor(() => window.__primal.game.env.rain > 0.3, 15000);
  check('card button "Wait for rain" brings rain', raining, String(label));
  await atBank();
  await key('KeyU');
  check('U fills the pot at the stream', await potIs('raw'));
  const edge = await P(() => window.__primal.game.water.roofEdge());
  await goTo(edge.x, edge.z);
  await key('KeyU'); // tip the stream water out
  check('U tips the stream water out (browser)', await potIs('empty'));
  await key('KeyU');
  check('U catches the roof runoff', await potIs('rain'));
  check('waterSource concluded', await waitFor(() => window.__primal.game.experiments.phase('waterSource') === 'result', 6000));
  await action();
  await answerCard('waterSource', 'check', 0, 'rain check');
  await action();
  await key('KeyU'); // pour the rain out
  check('on to the filter step', await waitFor(() => window.__primal.game.focus()?.id === 'filterOrder', 6000));
  }
  let f = await P(() => window.__waterFilter ?? null);
  const pourAt = async () => {
    await atBank();
    await key('KeyU');
    await waitFor(() => ['raw', 'settled'].includes(window.__primal.game.water.potWater), 4000);
    await goTo(f.x, f.z);
    await key('KeyU');
  };
  if (PHASE === 'filter') {

  // ---- filterOrder: build the filter by the stream, wrong order first, then swap.
  await answerCard('filterOrder', 'predict', 0, 'predict coarse first');
  await action();
  f = await P((bank) => {
    const g = window.__primal.game;
    for (const [id, n] of [['forkedStick', 3], ['cane', 1], ['cloth', 1], ['charcoal', 1], ['sand', 1], ['gravel', 1]]) g.addItem(id, n);
    let s = null;
    for (let r = 1.2; r < 5 && !s; r += 0.4)
      for (let a = 0; a < 6.28 && !s; a += 0.5) {
        g.takeOut('forkedStick');
        const res = g.placeBlueprint('filter', bank.x + Math.cos(a) * r, bank.z + Math.sin(a) * r, 0);
        if (res.ok) s = res.structure;
        else g.stow();
      }
    for (let i = 0; i < 3; i++) g.fillSpot(s.id, i);
    // Layers go in bottom first: cloth, charcoal, gravel, then sand on top.
    for (const id of ['cloth', 'charcoal', 'gravel', 'sand']) {
      const t = g.placementTarget(id, s.x, s.z);
      g.fillSpot(s.id, t.index, id);
    }
    g.takeOut('pot');
    window.__waterFilter = { id: s.id, x: s.x, z: s.z, complete: s.complete };
    return window.__waterFilter;
  }, camp.bank);
  check('filter built with sand on top', f.complete, JSON.stringify(f));
  await pourAt();
  check('sand on top clogs', await waitFor(() => window.__primal.game.water.lastFilter?.flow === 'clogged', 4000));
  await P((id) => {
    const g = window.__primal.game;
    const s = g.structures.find((t) => t.id === id);
    const spots = [3, 4, 5, 6];
    g.takeBack(id, spots[3]);
    g.stow();
    g.takeBack(id, spots[2]);
    g.stow();
    g.fillSpot(id, spots[2], 'sand');
    g.fillSpot(id, spots[3], 'gravel');
    g.takeOut('pot');
    return s.complete;
  }, f.id);
  await pourAt();
  check('gravel above sand runs clear', await potIs('filtered'));
  check('filterOrder concluded', await waitFor(() => window.__primal.game.experiments.phase('filterOrder') === 'result', 6000));
  await waitFor(() => window.__experiment.state().opened === 'filterOrder', 5000);
  await shot('w2-filter-result');
  await action();
  await answerCard('filterOrder', 'check', 0, 'filter check');
  await action();
  await atBank();
  await key('KeyU'); // tip the filtered water out at the stream
  check('on to the treatment step', await waitFor(() => window.__primal.game.focus()?.id === 'treatment', 6000));
  }
  if (PHASE === 'treatment') {

  // ---- treatment: settle (R puts the pot away), boil unfiltered, filter, boil.
  await answerCard('treatment', 'predict', 0, 'predict each');
  await action();
  await atBank();
  await key('KeyU');
  await key('KeyR');
  check('R puts the pot away', (await P(() => window.__primal.game.held)) === null);
  await P(() => (window.__primal.game.water.settle = 13));
  check('left still, the mud settles', await waitFor(() => window.__primal.game.water.potWater === 'settled', 8000));
  await P(() => window.__primal.game.takeOut('pot'));
  await atFire();
  await key('KeyU');
  check('boiled unfiltered: germs killed, mud in', await waitFor(() => window.__primal.game.water.potWater === 'boiledRaw', 30000));
  await pourAt();
  check('filtered', await potIs('filtered'));
  await atFire();
  await key('KeyU');
  check('filtered then boiled: safe', await waitFor(() => window.__primal.game.water.potWater === 'safe', 30000));
  check('treatment concluded', await waitFor(() => window.__primal.game.experiments.phase('treatment') === 'result', 6000));
  await waitFor(() => window.__experiment.state().opened === 'treatment', 5000);
  await shot('w3-treatment-result');
  await action();
  await answerCard('treatment', 'check', 0, 'treatment check');
  await action();

  // ---- waterSupply: the closing check opens by itself.
  const up = await waitFor(() => window.__experiment.state().opened === 'waterSupply' && window.__primal.game.experiments.phase('waterSupply') === 'check', 10000);
  check('closing check opens straight to its question', up, JSON.stringify(await exp()));
  await shot('w4-check');
  await click('ExperimentCard', 'exp-opt-1');
  const wrong = await P(() => window.__experiment.state().feedback);
  check('a wrong answer explains itself', /Not quite/.test(wrong ?? ''), wrong);
  await click('ExperimentCard', 'exp-opt-0');
  check('right answer completes Lesson 03', await waitFor(() => window.__primal.game.lessons.lessonDone.has('water'), 8000));
  }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  const notebook = await P(() => window.__primal.game.notebook.filter((e) => /^(w_|p_)/.test(e)));
  return { results, notebook };
}
