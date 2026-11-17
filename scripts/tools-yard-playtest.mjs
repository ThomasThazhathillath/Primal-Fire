// Lesson 04 (Tools) play-test with REAL mouse input on the canvas (desktop), against the live dev session.
// A managed-browser script may run 110 s, so the play-test runs in phases (each sets up its own scenario):
//   PHASE=knap  npx @iwsdk/cli browser run scripts/tools-yard-playtest.mjs   (fresh game, strike angle, card UI)
//   PHASE=cord  ...   PHASE=frame ...   PHASE=lever ...   (lever, boulder challenge, flint seam)
// Scenario setup (jumping the lesson tracker to a step, putting items in the bag, standing somewhere) goes
// through window.__primal; every mechanic under test is driven by the mouse: knapping flicks, clicking the
// experiment card, lifting the test stone, building and pushing the frame, laying and pushing the lever,
// breaking flint from the seam. Prints PASS/FAIL per check. PRIMAL_SHOTS=<dir> also saves screenshots.
import { readFileSync } from 'node:fs';

const SHOTS = process.env.PRIMAL_SHOTS;
/** Step ids per lesson, read from the lesson files so the script follows the curriculum. */
const LESSON_STEPS = ['shelter', 'fire', 'water', 'tools'].map((id) => {
  const src = readFileSync(`src/game/curriculum/lessons/${id}/lesson.ts`, 'utf8');
  return { id, steps: [...src.match(/steps: \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) };
});

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
    throw new Error('app frame with window.__primal not found');
  };
  let app = await findApp();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  const P = (fn, arg) => app.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const check = (name, ok, detail) => results.push({ check: name, ok: !!ok, ...(detail !== undefined ? { detail } : {}) });
  const shot = async (name) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };
  const frameOffset = async () => {
    const el = await app.frameElement().catch(() => null);
    return (el && (await el.boundingBox())) || { x: 0, y: 0 };
  };
  /** Page coordinates of a world point (or of a point in camera space when `cam` is set). */
  const screenOf = async (pt, cam = false) => {
    const s = await P(
      ({ pt, cam }) => {
        const { world } = window.__primal;
        world.camera.updateMatrixWorld(true);
        const v = world.camera.position.clone().set(pt.x, pt.y, pt.z);
        if (cam) world.camera.localToWorld(v);
        v.project(world.camera);
        const r = world.renderer.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, z: v.z };
      },
      { pt, cam },
    );
    const o = await frameOffset();
    return { x: s.x + o.x, y: s.y + o.y, z: s.z };
  };
  const worldOf = (name, local) =>
    P(
      ({ name, local }) => {
        const o = window.__primal.world.scene.getObjectByName(name);
        const v = o.position.clone().set(local?.x ?? 0, local?.y ?? 0, local?.z ?? 0);
        o.localToWorld(v);
        return { x: v.x, y: v.y, z: v.z };
      },
      { name, local },
    );
  const click = async (pt) => {
    const s = await screenOf(pt);
    await page.mouse.move(s.x, s.y);
    await wait(250);
    await page.mouse.down();
    await wait(120);
    await page.mouse.up();
    await wait(500);
  };
  /** Press on `pt`, move by (dx, dy) px in small timed steps, release. */
  const drag = async (pt, dx, dy, steps = 14) => {
    const s = await screenOf(pt);
    await page.mouse.move(s.x, s.y);
    await wait(250);
    await page.mouse.down();
    await wait(100);
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(s.x + (dx * i) / steps, s.y + (dy * i) / steps);
      await wait(35);
    }
    await wait(200);
    await page.mouse.up();
    await wait(500);
  };
  const clickEl = async (panel, el) => {
    const at = await P(
      ({ panel, el }) => {
        const p = window.__primal;
        const e = p.world.scene.getObjectByName(panel)?.getElementById?.(el);
        if (!e) return null;
        const v = p.world.camera.position.clone();
        e.getWorldPosition(v);
        v.project(p.world.camera);
        const r = p.world.renderer.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      { panel, el },
    );
    if (!at) return false;
    const o = await frameOffset();
    await page.mouse.click(at.x + o.x, at.y + o.y);
    await wait(500);
    return true;
  };
  const g = (fn, arg) => P(fn, arg);
  const jump = (step) =>
    g(
      ({ step, lessons }) => {
        const game = window.__primal.game;
        const li = lessons.findIndex((l) => l.steps.includes(step));
        const completed = [...lessons.slice(0, li).flatMap((l) => l.steps), ...lessons[li].steps.slice(0, lessons[li].steps.indexOf(step))];
        game.lessons.load({ completed, resume: lessons[li].id, bases: {}, learned: game.learnedControls(), hints: {}, closed: false });
      },
      { step, lessons: LESSON_STEPS },
    );
  const stand = (x, z, fx, fz, pitch) => g(({ x, z, fx, fz, pitch }) => {
    window.__primal.goTo(x, z);
    window.__primal.face(fx, fz, pitch);
  }, { x, z, fx, fz, pitch });
  const holdItem = (id, n = 1) => g(({ id, n }) => {
    const game = window.__primal.game;
    game.stow();
    game.addItem(id, n);
    return game.takeOut(id);
  }, { id, n });
  const phase = (id) => g((id) => window.__primal.game.experiments.phase(id), id);
  const trials = (id) => g((id) => Object.fromEntries(window.__primal.game.experiments.state(id).trials), id);
  /** Predict, then close the card (scenario setup for the experiments whose card UI is not under test). */
  const predict = (id, choice) => g(({ id, choice }) => {
    const game = window.__primal.game;
    const ok = game.experiments.predict(id, choice);
    window.__experiment.action(); // testing phase: "Keep testing" closes the card
    return ok;
  }, { id, choice });
  const finish = (id) => g((id) => {
    const game = window.__primal.game;
    game.experiments.acknowledge(id);
    const right = game.experiments.def(id).check.options.find((o) => o.correct).id;
    game.experiments.answer(id, right);
    window.__experiment.action();
  }, id);

  const phases = (process.env.PHASE ?? 'knap,cord,frame,lever').split(',');
  if (phases.includes('knap')) await knapPhase();
  if (phases.includes('cord')) await cordPhase();
  if (phases.includes('frame')) await framePhase();
  if (phases.includes('lever')) await leverPhase();
  check('no page errors', errors.length === 0, errors.slice(0, 3));
  const passed = results.filter((r) => r.ok).length;
  return { phases, passed, failed: results.length - passed, results };

  async function knapPhase() {
  // ---------------------------------------------------------------- fresh survival game
  await P(() => {
    localStorage.clear();
    localStorage.setItem('primal-first-fire.mode.v1', 'survival');
    window.__primal.reset();
  }).catch(() => {});
  await wait(1500);
  app = await findApp();
  await wait(3000);
  await P(() => window.__primal.begin());
  await wait(800);

  // ---------------------------------------------------------------- strike angle: real flicks on the core
  await jump('stoneTools');
  await wait(1200);
  check('strike-angle experiment opens with the knapping step', (await phase('strikeAngle')) === 'predict');
  // Predict through the real card: the first option is "an angled blow".
  const cardUp = await g(() => window.__experiment.state().opened);
  check('the experiment card came up by itself', cardUp === 'strikeAngle', cardUp);
  await clickEl('ExperimentCard', 'exp-opt-0');
  check('clicking the card predicts', (await phase('strikeAngle')) === 'testing');
  await clickEl('ExperimentCard', 'exp-action'); // Keep testing: closes
  await g(() => {
    const game = window.__primal.game;
    game.satchel.clear();
    game.addItem('dryStone');
  });
  await holdItem('flint');
  await wait(600);
  const core = { x: -0.03, y: -0.12, z: -0.4 };
  const flick = async (dxPer, dyPer, steps = 9) => {
    const c = await screenOf(core, true);
    const sx = c.x - dxPer * steps;
    const sy = c.y - dyPer * steps;
    await page.mouse.move(sx, sy);
    await wait(250);
    await page.mouse.down();
    await wait(150);
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(sx + dxPer * i, sy + dyPer * i);
      await wait(30);
    }
    await page.mouse.up();
    await wait(700);
  };
  await flick(12, 12); // diagonal: angled
  const t1 = await trials('strikeAngle');
  check('a diagonal flick onto the edge is an angled trial and flakes', t1.angled === 'flake', t1);
  await flick(0, 14); // straight down: square
  const t2 = await trials('strikeAngle');
  check('a straight-down flick is a square trial and crushes', t2.square === 'crushed', t2);
  check('the experiment concluded: angled blows flake', (await phase('strikeAngle')) === 'result');
  check('a crushed edge is in the notebook (t_crumble)', await g(() => window.__primal.game.notebook.includes('t_crumble')));
  await shot('01-strike-angle-result');
  // Result card -> check question, answered through the card.
  await clickEl('ExperimentCard', 'exp-action');
  check('Continue opens the check question', (await phase('strikeAngle')) === 'check');
  await clickEl('ExperimentCard', 'exp-opt-0');
  check('the right answer finishes the experiment', (await phase('strikeAngle')) === 'done');
  await clickEl('ExperimentCard', 'exp-action');
  }

  async function cordPhase() {
  // ---------------------------------------------------------------- the tensile test at the Tool Yard
  await jump('cordTest');
  await wait(1200);
  await predict('cordStrength', 'twisted');
  const stone = await worldOf('YardTestStone');
  await stand(stone.x, stone.z - 1.5, stone.x, stone.z, -0.55);
  await holdItem('fibers');
  await wait(500);
  await drag(stone, 0, -70);
  check('lifting the stone with loose fibres snaps them', (await trials('cordStrength')).loose === 'snaps', await trials('cordStrength'));
  check('the snapped fibres are used up', (await g(() => window.__primal.game.held)) === null);
  await holdItem('cord');
  await wait(500);
  await drag(await worldOf('YardTestStone'), 0, -70);
  check('lifting it with twisted cord holds', (await trials('cordStrength')).twisted === 'holds', await trials('cordStrength'));
  check('cord-strength experiment concluded: twisted', (await g(() => window.__primal.game.experiments.state('cordStrength').supported)) === 'twisted');
  await shot('02-cord-holds');
  await finish('cordStrength');
  }

  async function framePhase() {
  // ---------------------------------------------------------------- frame: build, push, brace, push
  await jump('frameTest');
  await wait(1200);
  await predict('frameBracing', 'braced');
  const frame = await worldOf('YardFrame');
  await stand(frame.x, frame.z - 1.8, frame.x, frame.z, -0.3);
  await g(() => {
    const game = window.__primal.game;
    game.stow();
    game.addItem('spindle', 4);
  });
  const frameMid = { x: frame.x, y: frame.y + 0.5, z: frame.z };
  for (let i = 0; i < 3; i++) await click(frameMid);
  const f1 = await g(() => ({ ...window.__primal.game.yard.frame }));
  check('three clicks with sticks set two posts and a bar', f1.posts === 2 && f1.bar && !f1.brace, f1);
  await drag(frameMid, 60, 0);
  check('pushing the square frame sideways folds it', (await trials('frameBracing')).none === 'folds', await trials('frameBracing'));
  await click(frameMid); // stand it up
  await holdItem('spindle');
  await click(frameMid); // the brace
  check('a click with a stick in hand lashes the brace', await g(() => window.__primal.game.yard.frame.brace));
  await drag(frameMid, 60, 0);
  check('the braced frame holds', (await trials('frameBracing')).diagonal === 'holds', await trials('frameBracing'));
  await shot('03-frame-braced');
  await finish('frameBracing');
  }

  async function leverPhase() {
  // ---------------------------------------------------------------- the lever and the boulder
  await jump('leverTest');
  await wait(1200);
  await predict('leverPivot', 'near');
  const boulder = await worldOf('YardBoulder');
  await stand(boulder.x + 2.6, boulder.z + 1.3, boulder.x + 0.6, boulder.z, -0.45);
  await g(() => window.__primal.game.stow());
  await click(boulder);
  check('the boulder will not move by hand', (await g(() => window.__primal.game.yard.pole)) === 'none');
  await holdItem('pole');
  await click(await worldOf('YardBoulder'));
  check('clicking the boulder with a pole lays the lever', (await g(() => window.__primal.game.yard.pole)) === 'set');
  const poleEnd = () => worldOf('YardPole', { x: 1.8 });
  await click(await worldOf('YardMark_pivotFar'));
  check('clicking a mark moves the pivot stone', (await g(() => window.__primal.game.yard.pivot)) === 'far');
  await drag(await poleEnd(), 0, 110);
  check('pivot close to your hands: pushing the end down moves nothing', (await trials('leverPivot')).far === 'stuck', await trials('leverPivot'));
  check('...and the boulder has not rolled', (await g(() => window.__primal.game.yard.rolls)) === 0);
  await click(await worldOf('YardMark_pivotNear'));
  await drag(await poleEnd(), 0, 45);
  check('pivot close to the boulder: it lifts', (await trials('leverPivot')).near === 'moves', await trials('leverPivot'));
  check('lever experiment concluded: near', (await g(() => window.__primal.game.experiments.state('leverPivot').supported)) === 'near');
  await finish('leverPivot');
  await wait(1200);
  check('on to the engineering challenge', (await g(() => window.__primal.game.focus()?.id)) === 'boulder');
  await drag(await poleEnd(), 0, 140);
  check('a full push rolls the boulder', (await g(() => window.__primal.game.yard.rolls)) === 1);
  await click(await worldOf('YardBoulder'));
  check('clicking the boulder sets the pole again', (await g(() => window.__primal.game.yard.pole)) === 'set');
  await drag(await poleEnd(), 0, 140);
  check('a second roll clears the flint seam', await g(() => window.__primal.game.yard.seamOpen()));
  await wait(1200);
  check('the challenge step completes', (await g(() => window.__primal.game.focus()?.id)) === 'toolCheck', await g(() => window.__primal.game.focus()?.id));
  await shot('04-boulder-rolled');

  // ---------------------------------------------------------------- the seam needs a hammer
  const seam = await worldOf('YardSeam');
  await stand(seam.x + 1.6, seam.z + 0.8, seam.x, seam.z, -0.6);
  await g(() => window.__primal.game.stow());
  await click(seam);
  check('no hammer: the nodules stay put', !(await g(() => window.__primal.game.yard.jobs.has('hammer'))));
  await g(() => window.__primal.game.addItem('hammer'));
  const flintBefore = await g(() => window.__primal.game.count('flint'));
  await click(seam);
  check('with a hammer in the bag, a click breaks out flint', (await g(() => window.__primal.game.count('flint'))) > flintBefore);
  check('the hammer job counts for the tool test', await g(() => window.__primal.game.yard.jobs.has('hammer')));
  }
}
