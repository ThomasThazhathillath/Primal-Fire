// Live check of Lesson 05's timed experiments in the running game (they take real minutes, so this runs in phases
// against one game; every outcome comes from the running simulation):
//   PHASE=setup  npx @iwsdk/cli browser run scripts/lesson5-timed.mjs   start nutrition, drying, overharvest, sky
//   PHASE=meals  ... (after ~20 s)   the berries have been digested; eat nuts and fish
//   PHASE=watch  ... (after ~4 min)  results so far; press "Watch the sky" on the cloud experiment card
//   PHASE=sky    ... (after ~50 s)   look up at the building clouds; then PHASE=report
//   PHASE=sun    ...                 face the sun, rest until afternoon by a real click, face it again
//   PHASE=report ...                 every Lesson 05 experiment's phase, trials and supported prediction
export default async function run({ page }) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let app = null;
  for (let i = 0; i < 120 && !app; i++) {
    for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
    if (!app) await wait(500);
  }
  if (!app) throw new Error('app not found');
  const P = (fn, arg) => app.evaluate(fn, arg);
  const click = async (panelName, el) => {
    const at = await P(
      ({ panelName, el }) => {
        const p = window.__primal;
        const e = p.world.scene.getObjectByName(panelName)?.getElementById?.(el);
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
    const fe = await app.frameElement().catch(() => null);
    const box = (fe && (await fe.boundingBox())) ?? { x: 0, y: 0 };
    await page.mouse.click(box.x + at.x, box.y + at.y);
    await wait(700);
    return true;
  };
  /** Walk to a patch and judge it on the card by a real click (0 safe, 1 not safe, 2 not sure). */
  const judge = async (id, option) => {
    await P((id) => {
      const p = window.__primal;
      const q = window.__choice.patches().find((x) => x.id === id);
      p.goTo(q.x + 0.6, q.z + 0.6);
      p.game.setPlayerPosition(q.x + 0.6, q.z + 0.6);
      p.face(q.x, q.z);
    }, id);
    await wait(800);
    await page.keyboard.press('KeyU');
    await wait(700);
    await click('ChoiceCard', `ch-opt-${option}`);
    const note = await P(() => window.__choice.state().prompt?.note ?? null);
    await click('ChoiceCard', 'ch-action');
    return note;
  };
  const eat = async (item) => {
    await P((item) => {
      const g = window.__primal.game;
      g.stow();
      g.addItem(item);
      g.takeOut(item);
    }, item);
    await wait(500);
    await page.keyboard.press('KeyU');
    await wait(700);
  };
  const report = () =>
    P(() => {
      const g = window.__primal.game;
      const out = {};
      for (const id of ['plantId', 'nutrition', 'dryingTest', 'overharvest', 'skyTest', 'sunPath']) {
        const s = g.experiments.state(id);
        out[id] = { phase: s.phase, trials: Object.fromEntries(s.trials), supported: s.supported, right: g.experiments.predictedRight(id) };
      }
      return { t: Math.round(g.time), hour: +g.env.hour.toFixed(2), cloud: +g.env.cloud.toFixed(2), rain: +g.env.rain.toFixed(2), exp: out, notebook: g.notebook.filter((n) => /^(fd_|nv_|x_sky|n_)/.test(n)) };
    });

  const phase = process.env.PHASE ?? 'report';
  if (phase === 'setup') {
    await P(() => {
      localStorage.clear();
      localStorage.setItem('primal-first-fire.mode.v1', 'survival');
      window.__primal.reset();
    }).catch(() => {});
    await wait(2000);
    app = null;
    for (let i = 0; i < 120 && !app; i++) {
      for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
      if (!app) await wait(500);
    }
    await wait(2500);
    await P(() => window.__primal.begin());
    await wait(800);
    const at = await P(() => {
      const g = window.__primal.game;
      const done = [];
      for (let guard = 0; guard < 80 && g.lessons.lesson && g.lessons.lesson.id !== 'food'; guard++) {
        done.push(g.focus().id);
        g.lessons.load({ completed: [...done], resume: null, bases: {}, learned: g.learnedControls(), hints: {}, closed: false });
      }
      g.lessons.load({ completed: [...done, 'spear', 'fish', 'cook', 'plantId'], resume: 'food', bases: {}, learned: g.learnedControls(), hints: {}, closed: false });
      // Earlier lessons' experiments are done; open four Lesson 05 experiments at once so they run side by side.
      const states = {};
      for (const d of g.experiments['defs']) if (d.lesson !== 'food' || d.id === 'plantId') states[d.id] = { phase: 'done', prediction: null, trials: {}, supported: null, answers: [] };
      for (const id of ['nutrition', 'dryingTest', 'overharvest', 'skyTest']) states[id] = { phase: 'predict', prediction: null, trials: {}, supported: null, answers: [] };
      g.experiments.restore({ v: 1, states });
      g.env.skipTo(g.time, 8.5);
      g.env.forceWeather = 'clear';
      return `${g.lessons.lesson?.id}/${g.focus()?.id}`;
    });
    await wait(1500);
    // The nutrition card is up: predict by a real click; the others by the tracker (their cards queue behind it).
    await click('ExperimentCard', 'exp-opt-1');
    await P(() => {
      const g = window.__primal.game;
      g.experiments.predict('dryingTest', 'dry');
      g.experiments.predict('overharvest', 'less');
      g.experiments.predict('skyTest', 'clouds');
      g.addItem('fish');
      g.addItem('driedFish');
    });
    await click('ExperimentCard', 'exp-close');
    const foods = await P(() => window.__choice.patches().filter((q) => q.truth === 'food' && q.kind === 'berry').map((q) => q.id));
    const a = await judge(foods[0], 0); // one handful: picked with care
    const b = await judge(foods[1], 0);
    await page.keyboard.press('KeyU'); // pick again at the second patch...
    await wait(600);
    await page.keyboard.press('KeyU'); // ...until it is bare
    await wait(600);
    const stocks = await P((ids) => ids.map((id) => window.__primal.game.food.stock[id]), foods.slice(0, 2));
    // The sky: look straight up at the clear morning sky.
    await P(() => {
      const p = window.__primal;
      p.goTo(2, 9);
      p.face(2, 8, 1.15);
    });
    await wait(2500);
    await eat('berries');
    await P(() => (window.__primal.game.env.forceWeather = null));
    return { at, judged: [a, b], stocks, report: await report() };
  }
  if (phase === 'meals') {
    await eat('nuts');
    await eat('cookedFish');
    return report();
  }
  if (phase === 'watch') {
    await P(() => window.__primal.game.env.skipTo(window.__primal.game.time, 9)); // sky readings need daylight
    await wait(500);
    await P(() => window.__experiment.open('skyTest'));
    await wait(800);
    const label = await P(() => window.__primal.game.experiments.def('skyTest').testAction.label(window.__primal.game));
    await click('ExperimentCard', 'exp-action'); // "Watch the sky"
    return { label, brew: await P(() => window.__primal.game.env.brew), report: await report() };
  }
  if (phase === 'sky') {
    await P(() => {
      const p = window.__primal;
      p.goTo(2, 9);
      p.face(2, 8, 1.15);
    });
    await wait(2500);
    return report();
  }
  if (phase === 'sun') {
    await P(() => {
      const g = window.__primal.game;
      g.env.forceWeather = 'clear';
      g.env.skipTo(g.time, 8.5);
      const s = g.experiments.state('sunPath');
      s.phase = 'predict';
      g.experiments.predict('sunPath', 'eastWest');
    });
    await wait(800);
    const faceSun = () =>
      P(() => {
        const p = window.__primal;
        const d = p.game.env.sunDir;
        p.face(p.game.player.x + d[0] * 10, p.game.player.z + d[2] * 10, 0.2);
      });
    await faceSun();
    await wait(2000);
    await P(() => window.__experiment.open('sunPath'));
    await wait(800);
    await click('ExperimentCard', 'exp-action'); // "Rest until afternoon"
    await wait(1000);
    await faceSun();
    await wait(2000);
    await P(() => (window.__primal.game.env.forceWeather = null));
    return report();
  }
  return report();
}
