// Live check of Lesson 05 (Food, Navigation & Long-Term Survival) on the desktop, against the running game:
//   npx @iwsdk/cli browser run scripts/lesson5-check.mjs --timeout 300000
// Puts the game at Lesson 05 and plays the new parts with real input: U to look closely at a wild plant, real
// mouse clicks on the judge card, the experiment card and the closing check, the camera turned to the sky and the
// sun (the same camera FieldSystem reads), and the compass covered on the long trek. Prints PASS/FAIL per check.
// Set PRIMAL_SHOTS to a directory to save screenshots of the cards.

const SHOTS = process.env.PRIMAL_SHOTS;

export default async function run(ctx) {
  const results = [];
  try {
    return await play(ctx, results);
  } catch (err) {
    return { results, error: String(err?.stack ?? err).split('\n').slice(0, 3).join(' | ') };
  }
}

async function play({ page }, results) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const findApp = async () => {
    for (let i = 0; i < 240; i++) {
      for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) return f;
      await wait(500);
    }
    throw new Error('app frame with window.__primal not found');
  };
  let app = await findApp();
  const P = (fn, arg) => app.evaluate(fn, arg);
  const check = (name, ok, detail) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ''}`);
  const shot = async (name) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };
  const frameBox = async () => (await app.frameElement().catch(() => null))?.boundingBox?.() ?? { x: 0, y: 0 };
  /** A real mouse click on a UIKit element of a panel (as scripts/click-element.mjs). */
  const click = async (panelName, el) => {
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
    const box = (await frameBox()) ?? { x: 0, y: 0 };
    await page.mouse.click((box.x ?? 0) + at.x, (box.y ?? 0) + at.y);
    await wait(700);
    return true;
  };
  const key = async (code) => {
    await page.keyboard.press(code);
    await wait(500);
  };

  // ---- a fresh survival game, moved on to Lesson 05 (everything before it counts as done)
  await P(() => {
    localStorage.clear();
    localStorage.setItem('primal-first-fire.mode.v1', 'survival');
    window.__primal.reset();
  }).catch(() => {});
  await wait(2000);
  app = await findApp();
  await wait(3000);
  await P(() => window.__primal.begin());
  await wait(800);
  const jumped = await P(() => {
    const g = window.__primal.game;
    // Finish Lessons 01-04 and Lesson 05's first three steps through the tracker's load hook.
    const before = ['spear', 'fish', 'cook'];
    const done = [];
    for (let guard = 0; guard < 80 && g.lessons.lesson && g.lessons.lesson.id !== 'food'; guard++) {
      done.push(g.focus().id);
      g.lessons.load({ completed: [...done], resume: null, bases: {}, learned: g.learnedControls(), hints: {}, closed: false });
    }
    g.lessons.load({ completed: [...done, ...before], resume: 'food', bases: {}, learned: g.learnedControls(), hints: {}, closed: false });
    // Earlier lessons' experiments count as done (a player who got here ran them).
    const states = {};
    for (const d of g.experiments['defs']) if (d.lesson !== 'food') states[d.id] = { phase: 'done', prediction: null, trials: {}, supported: null, answers: [] };
    g.experiments.restore({ v: 1, states });
    g.env.skipTo(g.time, 8);
    return `${g.lessons.lesson?.id}/${g.focus()?.id}`;
  });
  await wait(2000);
  const camp = await P(() => ({ kinds: window.__primal.game.structures.map((s) => s.kind), fire: window.__primal.game.fire.stage, pressure: window.__primal.game.body.pressure }));
  check('a fresh Level 5 start gets a working camp', ['workbench', 'firePit', 'dryingRack', 'bedding'].every((k) => camp.kinds.includes(k)) && camp.fire === 'burning', camp);
  check('Lesson 05 at "Judge a wild plant"', jumped === 'food/plantId', jumped);
  const expOpen = await P(() => window.__experiment?.state());
  check('the plant experiment card opens by itself (predict)', expOpen?.opened === 'plantId' && expOpen?.phase === 'predict', expOpen);
  await shot('l5-01-plant-experiment');
  await click('ExperimentCard', 'exp-opt-1'); // "Only if every feature matches"
  check('a real click on a prediction starts testing', (await P(() => window.__primal.game.experiments.phase('plantId'))) === 'testing');
  await click('ExperimentCard', 'exp-close');

  // ---- judge a food plant: walk up, press U, read the card, click "Safe to eat"
  const goPatch = (truth) =>
    P((truth) => {
      const p = window.__primal;
      const g = p.game;
      const list = window.__choice?.patches?.() ?? [];
      const q = list.find((x) => x.truth === truth && !g.food.judged.has(x.id) && g.food.stock[x.id] > 0);
      if (!q) return null;
      p.goTo(q.x + 0.6, q.z + 0.6);
      g.setPlayerPosition(q.x + 0.6, q.z + 0.6);
      p.face(q.x, q.z);
      return q;
    }, truth);
  let patch = await goPatch('food');
  await wait(800);
  check('walked to a food plant', !!patch, patch?.id);
  await key('KeyU');
  let ch = await P(() => window.__choice?.state());
  check('U looks closely: the judge card opens with this plant and the field guide', ch?.open && ch?.prompt?.key === `judge:${patch?.id}` && ch.prompt.cols?.length === 2, ch?.prompt?.title);
  await shot('l5-02-judge-card');
  const berries0 = await P(() => window.__primal.game.count('berries') + window.__primal.game.count('nuts') + window.__primal.game.count('tuber'));
  await click('ChoiceCard', 'ch-opt-0');
  ch = await P(() => window.__choice?.state());
  const berries1 = await P(() => window.__primal.game.count('berries') + window.__primal.game.count('nuts') + window.__primal.game.count('tuber'));
  check('a real click on "Safe to eat" picks the food and says why', berries1 > berries0 && /Good judgement/.test(ch?.prompt?.note ?? ''), ch?.prompt?.note);
  await shot('l5-03-judged');
  await click('ChoiceCard', 'ch-action');
  check('Done closes the card', !(await P(() => window.__choice?.state().open)));

  // ---- a look-alike: "Not safe"
  patch = await goPatch('lookalike');
  await wait(800);
  await key('KeyU');
  await click('ChoiceCard', 'ch-opt-1');
  ch = await P(() => window.__choice?.state());
  check('a look-alike judged "Not safe" is explained', /look-alike/.test(ch?.prompt?.note ?? ''), ch?.prompt?.note);
  await click('ChoiceCard', 'ch-action');
  await wait(1500); // the experiment card waits until the choice card has closed, then shows the result
  const plantExp = await P(() => ({ phase: window.__primal.game.experiments.phase('plantId'), card: window.__experiment?.state() }));
  check('the plant experiment reaches its result from the real plants', plantExp.phase === 'result', plantExp);
  await shot('l5-04-plant-result');
  await click('ExperimentCard', 'exp-action'); // Continue -> check question
  await click('ExperimentCard', 'exp-opt-0');
  check('the check question answered by a real click', (await P(() => window.__primal.game.experiments.phase('plantId'))) === 'done');
  await click('ExperimentCard', 'exp-action');

  // ---- a look-alike judged safe: ill for a while, never worse
  await P(() => window.__primal.game.lessons.update());
  patch = await goPatch('lookalike');
  await wait(800);
  if (patch) {
    await key('KeyU');
    await key('Digit1'); // keyboard: option 1 = Safe to eat
    const sick = await P(() => ({ queasy: window.__primal.game.body.queasy, food: window.__primal.game.body.food, note: window.__choice.state().prompt?.note }));
    check('keyboard 1 judges "Safe"; a look-alike makes you ill (queasy), not worse', sick.queasy > 0 && sick.food > 50, sick);
    await key('Enter');
  }

  // ---- the experiment card's three trial rows (nutrition)
  const nut = await P(() => {
    const g = window.__primal.game;
    g.lessons.update();
    return g.focus()?.id;
  });
  await wait(1200);
  check('next step is the nutrition test', nut === 'nutrition', nut);
  await click('ExperimentCard', 'exp-opt-1');
  const rows = await P(() => {
    const panel = window.__primal.world.scene.getObjectByName('ExperimentCard');
    return [0, 1, 2].map((i) => panel.getElementById(`exp-trial-${i}`)?.properties?.value?.display ?? panel.getElementById(`exp-trial-${i}`) != null);
  }).catch((e) => String(e));
  check('the experiment card has a third trial row', Array.isArray(rows) && rows.length === 3, rows);
  await shot('l5-05-nutrition-testing');
  await click('ExperimentCard', 'exp-close');

  // ---- the sky: look up with the desktop camera (FieldSystem reads it)
  const sky = await P(async () => {
    const p = window.__primal;
    const g = p.game;
    g.lessons.load({ ...g.lessons.snapshot(), completed: [...g.lessons.completed, 'plantId', 'nutrition', 'grow', 'basket', 'dryingTest', 'trail', 'overharvest'], resume: 'food' });
    await new Promise((r) => setTimeout(r, 1500));
    g.experiments.predict('skyTest', 'clouds');
    p.goTo(2, 9);
    p.face(2, 8, 1.15);
    await new Promise((r) => setTimeout(r, 2500));
    return { phase: g.experiments.phase('skyTest'), looked: g.hasEvent('weather.sky.looked'), cloud: g.env.cloud };
  });
  check('looking up with the camera reads the sky', sky.looked, sky);

  // ---- the sun: face it with the desktop camera
  const sun = await P(async () => {
    const p = window.__primal;
    const g = p.game;
    g.lessons.load({ ...g.lessons.snapshot(), completed: [...g.lessons.completed, 'skyTest'], resume: 'food' });
    g.env.forceWeather = 'clear';
    await new Promise((r) => setTimeout(r, 1500));
    g.experiments.predict('sunPath', 'eastWest');
    const d = g.env.sunDir;
    p.face(g.player.x + d[0] * 10, g.player.z + d[2] * 10, 0.2);
    await new Promise((r) => setTimeout(r, 2500));
    return { trials: Object.fromEntries(g.experiments.state('sunPath').trials), hour: g.env.hour, step: g.focus()?.id, phase: g.experiments.phase('sunPath'), cloud: g.env.cloud };
  });
  check('facing the morning sun with the camera reads "east"', sun.trials.morning === 'east', sun);

  // ---- the trek: leaving camp covers the compass (the desktop compass strip disappears)
  const trek = await P(async () => {
    const p = window.__primal;
    const g = p.game;
    g.env.forceWeather = null;
    g.lessons.load({ ...g.lessons.snapshot(), completed: [...g.lessons.completed, 'sunPath'], resume: 'food' });
    await new Promise((r) => setTimeout(r, 1500));
    const brief = window.__choice.state().prompt?.key;
    window.__choice.act();
    // Set out from camp: go there first.
    const home = g.structures.find((s) => s.kind === 'workbench');
    p.goTo(home.x + 1, home.z + 1);
    g.setPlayerPosition(home.x + 1, home.z + 1);
    await new Promise((r) => setTimeout(r, 1000));
    await new Promise((r) => setTimeout(r, 800));
    const strip = () => [...document.querySelectorAll('div')].find((d) => d.style.top === '6px' && d.style.left === '50%');
    const before = strip()?.style.display;
    p.goTo(home.x + 13, home.z);
    g.setPlayerPosition(home.x + 13, home.z);
    await new Promise((r) => setTimeout(r, 1500));
    return { brief, phase: g.field.trek.phase, before, after: strip()?.style.display };
  });
  check('the trek briefing opens, and setting out covers the compass', trek.brief === 'trek' && trek.phase === 'active' && trek.after === 'none' && trek.before !== 'none', trek);
  await shot('l5-06-trek-no-compass');

  // ---- the closing check, by real clicks
  const fin = await P(async () => {
    const g = window.__primal.game;
    g.field.trek.phase = 'done';
    g.checkProgress();
    await new Promise((r) => setTimeout(r, 2000));
    return window.__choice.state().prompt?.key;
  });
  check('the closing check opens by itself', fin === 'check:0', fin);
  await shot('l5-07-check');
  for (let q = 0; q < 4; q++) {
    await click('ChoiceCard', 'ch-opt-0'); // the first option is right in every question
    await click('ChoiceCard', 'ch-action');
  }
  const end = await P(() => ({ done: window.__primal.game.field.checkDone, lesson: window.__primal.game.lessons.lessonDone.has('food') }));
  check('four real clicks answer the check and finish Lesson 05', end.done && end.lesson, end);
  const errors = await P(() => (window.__primal.game.log.toString().match(/error/gi) ?? []).length);
  return { results, errors };
}
