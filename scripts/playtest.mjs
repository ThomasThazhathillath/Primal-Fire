// End-to-end play-test of the M1 slice, run against the live dev session:
//   npx @iwsdk/cli dev up --allow-browser-automation
//   npx @iwsdk/cli browser run scripts/playtest.mjs --timeout 180000
// Drives the game through window.__primal (see src/debug-hooks.ts) plus one
// real canvas click, and prints PASS/FAIL per check. Set PRIMAL_SHOTS to a
// directory to also save screenshots of the key states.

const SHOTS = process.env.PRIMAL_SHOTS;

export default async function run({ page }) {
  let app = page.mainFrame();
  // The app runs inside the managed workspace's iframe, which a reload replaces.
  const findApp = async () => {
    for (let i = 0; i < 120; i++) {
      for (const f of page.frames()) {
        if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) return f;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('app frame with window.__primal not found');
  };
  const frameBox = async () => {
    const el = await app.frameElement().catch(() => null);
    return el ? el.boundingBox() : { x: 0, y: 0 };
  };
  const results = [];
  const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  const P = (fn, arg) => app.evaluate(fn, arg);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };

  // Fresh start.
  app = await findApp();
  await P(() => localStorage.clear());
  await page.reload();
  app = await findApp();
  await wait(2500);
  await shot('01-title');
  await P(() => window.__primal.begin());
  await wait(500);
  check('wakes in the Scavenger quest', (await P(() => window.__primal.game.quest?.title)) === 'Scavenger');

  // Real input: click a resource on the canvas (RayInteractable path).
  const target = await P(() => {
    const p = window.__primal;
    const spot = p.spots('dryStone').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    p.goTo(spot.x + 1.2, spot.z + 1.2);
    p.face(spot.x, spot.z);
    return spot;
  });
  await wait(400);
  const screen = await P((spot) => {
    const { world } = window.__primal;
    world.camera.updateMatrixWorld(true);
    const v = world.camera.position.clone().set(spot.x, 0.08, spot.z).project(world.camera);
    const r = world.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, target);
  const canvasBox = await frameBox();
  await page.mouse.click(canvasBox.x + screen.x, canvasBox.y + screen.y);
  await wait(600);
  check('a real click gathers a stone', (await P(() => window.__primal.game.count('dryStone'))) === 1);
  await shot('02-gathered-by-click');

  // Gather helper: walk next to each spot, then pinch it.
  const gather = (item, n) =>
    P(
      ([item, n]) => {
        const p = window.__primal;
        let got = 0;
        for (const s of p.spots(item).sort((a, b) => b.charges - a.charges)) {
          while (got < n && s.charges > 0) {
            p.goTo(s.x + 1, s.z + 1);
            p.game.setPlayerPosition(s.x + 1, s.z + 1);
            if (!p.gather(s.id)) break;
            s.charges--;
            got++;
          }
          if (got >= n) break;
        }
        return got;
      },
      [item, n],
    );

  // Out-of-reach guard.
  const far = await P(() => {
    const p = window.__primal;
    const s = p.spots('logs')[0];
    p.goTo(0, 0);
    return p.gather(s.id);
  });
  await wait(300);
  check('cannot gather out of reach', far === false);

  // Scavenger materials.
  const got = [
    await gather('dryGrass', 2),
    await gather('twigs', 3),
    await gather('logs', 2),
    await gather('slab', 1),
    await gather('dryStone', 5),
    await gather('wetStone', 2),
  ];
  check('gathers Scavenger materials', got.join() === '2,3,2,1,5,2', got.join());
  check('first dead wood records an observation', await P(() => window.__primal.game.notebook.includes('g_dead')));

  // Workbench blueprint near camp: a bad spot first (stream bank), then a good one.
  await P(() => {
    window.__primal.goTo(0, 1);
    window.__primal.face(-2, 3);
  });
  await P(() => window.__primal.take('slab'));
  const onBank = await P(() => window.__primal.place(4.3, 0));
  check('blueprint refused on the stream bank', onBank === false && (await P(() => window.__primal.game.held)) === 'slab');
  // Point the mouse at the ground in front so the ghost follows the real pointer.
  const fb = await frameBox();
  const vp = await P(() => ({ w: innerWidth, h: innerHeight }));
  await page.mouse.move(fb.x + vp.w * 0.45, fb.y + vp.h * 0.78);
  await wait(500);
  const ghost = await P(() => {
    const g = window.__primal.world.scene.getObjectByName('BlueprintGhost');
    return { visible: g.visible, x: g.position.x, z: g.position.z };
  });
  check('ghost workbench follows the pointer to the ground', ghost.visible, `${ghost.x.toFixed(1)},${ghost.z.toFixed(1)}`);
  await shot('03-workbench-ghost');
  const placed = await P(() => window.__primal.place(-2, 3));
  check('workbench outline placed on open ground', placed === true);
  const bench = await P(() => window.__primal.build('workbench')[0]);
  for (let i = 0; i < 3; i++) await P(([id, i]) => window.__primal.fill(id, i), [bench.id, i]);
  check('three stone legs finish the workbench', await P(() => window.__primal.game.hasStructure('workbench')));
  check('"Three legs never wobble" recorded', await P(() => window.__primal.game.notebook.includes('b_tripod')));

  // Friction tool parts, cord and bow drill at the bench.
  const parts = [await gather('spindle', 1), await gather('board', 1), await gather('greenBranch', 1), await gather('fibers', 3)];
  check('gathers bow drill parts', parts.join() === '1,1,1,3', parts.join());
  const crafted = await P(() => {
    const p = window.__primal;
    p.goTo(-1, 3);
    p.game.setPlayerPosition(-1, 3);
    return [p.craft('cord'), p.craft('bowDrill')];
  });
  check('crafts cord and bow drill at the workbench', crafted.join() === 'true,true');
  check('Scavenger complete -> First Fire', (await P(() => window.__primal.game.quest?.title)) === 'First Fire');

  // Fire pit: start with a wet stone (allowed - it will matter once fire burns).
  await P(() => {
    const p = window.__primal;
    p.goTo(0, 0.5);
    p.face(-1.5, -2.5);
    p.take('wetStone');
    p.place(-1.5, -2.5);
  });
  const pit = await P(() => window.__primal.build('firePit')[0]);
  check('fire pit outline placed', !!pit && pit.key === 'wetStone');
  await wait(300);
  await shot('04-firepit-snap-spots');
  for (let i = 0; i < 3; i++) await P(([id, i]) => window.__primal.fill(id, i), [pit.id, i]);
  check('fire pit finished', await P(() => window.__primal.game.hasStructure('firePit')));
  check('First Fire step 1 (a safe place) done', (await P(() => window.__primal.game.currentStep()?.index)) === 1);

  // Hints escalate to a direction + beacon.
  const hints = await P(() => {
    const p = window.__primal;
    p.hint();
    p.hint();
    p.hint();
    return p.world.scene.getObjectByName('HintBeacon').visible;
  });
  check('third hint lights a beacon', hints === true);

  // Satchel and notebook panels open.
  await P(() => window.__primal.satchel());
  await wait(500);
  check('satchel panel opens', await P(() => window.__primal.world.scene.getObjectByName('SatchelPanel').visible));
  await shot('05-satchel');
  await P(() => window.__primal.satchel());
  await P(() => window.__primal.notebook());
  await wait(400);
  await shot('06-notebook');

  // Save + reload restores progress.
  await P(() => window.__primal.world.getSystem && window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  app = await findApp();
  await wait(1500);
  const restored = await P(() => ({ q: window.__primal.game.quest?.title, s: window.__primal.game.structures.length }));
  check('progress survives a reload', restored.q === 'First Fire' && restored.s === 2, JSON.stringify(restored));

  const errors = [];
  const state = await P(() => ({ xp: window.__primal.game.xp, level: window.__primal.game.level, notebook: window.__primal.game.notebook.length }));
  await P(() => localStorage.clear());
  return { results, state, errors, logTail: (await P(() => window.__primal.log())).split('\n').slice(-6) };
}
