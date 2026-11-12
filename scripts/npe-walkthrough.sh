#!/bin/zsh
# Fresh-save walkthrough for the new player experience (docs/NPE_PLAN.md, milestone F).
#
# Runs in the managed IWER browser of THIS checkout's dev server (npx @iwsdk/cli dev up). It wipes only that
# browser's PRIMAL storage, starts a brand-new game (tutorial, Guided), and plays the first five stages with
# emulated XR hands where the CLI can drive real input (hand-ray aim + pinch for the first pickups, pinch on a
# button) and with the debug hooks for the rest (teleport, satchel, gathering, building, crafting). It records
# when each stage completes, measured in the page, and prints them as JSON.
#
# These are scripted timings: they show the flow works end to end and how many steps each stage takes. They are
# not a measure of how long a first-time human needs; that needs a real player on a real Quest.
set -e
cd "$(dirname "$0")/.."
cli() { npx @iwsdk/cli "$@" 2>&1; }
ev() { STAGE=eval CODE="$1" npx @iwsdk/cli browser run scripts/tutorial-check.mjs 2>&1 | grep '"result"' | head -1 | sed 's/^ *"result": //'; }
pause() { sleep "$1"; }

echo "== fresh save"
# reset() blocks the page's own save-on-exit first, so the wiped game is not written back while it reloads.
ev "(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('primal')) localStorage.removeItem(k); setTimeout(() => window.__primal.reset(), 50); return 'wiped'; })()" >/dev/null || true
pause 11
cli xr enter --input-json '{}' >/dev/null
cli xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
pause 2

echo "== play"
ev "(() => {
  const g = window.__primal.game, t = window.__tutorial;
  const w = window.__wt = { t0: performance.now(), marks: {}, reveal: [] };
  const mark = (k) => { if (!(k in w.marks)) w.marks[k] = +((performance.now() - w.t0) / 1000).toFixed(1); };
  g.on((e) => {
    if (e.type === 'gather') mark('firstPickup');
    if (e.type === 'held' && e.item) mark('firstHeld');
    // Each quest update: once the short celebration is over, the card must already say what to do now.
    if (e.type === 'objective') setTimeout(() => { const v = g.objectives.view(); if (v && !v.celebrating) w.reveal.push(!!(v.instruction && (v.nextAction || v.where || v.progress))); }, 50);
  });
  w.timer = setInterval(() => {
    const s = t.state();
    for (const id of s.done) mark('done:' + id);
    if (window.__iconbar?.panel?.visible) mark('menuShown');
    if (window.__cards?.objective?.visible) mark('objectiveShown');
  }, 100);
  window.__title.tap('begin-button');
  return 'started';
})()"
pause 3

echo "== stage 1: look around, teleport, turn"
ev "(async () => { const p = window.__primal, ui = p.world.globals.ui, wait = (ms) => new Promise(r => setTimeout(r, ms)); ui.snapTurn(45); await wait(900); p.goTo(1.6, 0.2); await wait(900); ui.snapTurn(-45); await wait(900); p.goTo(0, 0); await wait(600); return window.__tutorial.state().id; })()"
pause 1

echo "== stage 2: first pickup with the emulated right hand (ray aim + pinch)"
cli xr look-at --input-json '{"device":"hand-right","target":{"x":-0.7,"y":0.1,"z":-1.2}}' >/dev/null
pause 1
cli xr run-sequence --input-json '{"device":"hand-right","steps":[{"label":"pinch","pinch":{"value":1},"duration":0.35},{"label":"open","pinch":{"value":0},"duration":0.3}]}' --timeout 60000 >/dev/null
pause 1
cli xr look-at --input-json '{"device":"hand-right","target":{"x":0.35,"y":0.1,"z":-1.45}}' >/dev/null
pause 1
cli xr run-sequence --input-json '{"device":"hand-right","steps":[{"label":"pinch","pinch":{"value":1},"duration":0.35},{"label":"open","pinch":{"value":0},"duration":0.3}]}' --timeout 60000 >/dev/null
pause 1
ev "window.__tutorial.state().id"

echo "== stage 3: the pouch (take out, put back)"
ev "(async () => { const p = window.__primal; p.take('dryStone'); await new Promise(r => setTimeout(r, 1500)); p.stow(); await new Promise(r => setTimeout(r, 1200)); return window.__tutorial.state().id; })()"

echo "== stage 4: gather, then the workbench and cord"
ev "(async () => {
  const p = window.__primal, g = p.game, wait = (ms) => new Promise(r => setTimeout(r, ms));
  for (const look of ['grass', 'twigPile', 'fibrePlant', 'stone']) { const s = p.spots().find(x => x.id.startsWith('tutorial-') && x.id.includes(look) && x.charges > 0); if (s) p.gather(s.id); await wait(900); }
  await wait(800);
  const slab = p.spots().find(x => x.id.startsWith('tutorial-slab') && x.charges > 0); if (slab) p.gather(slab.id);
  await wait(800);
  if (g.held !== 'slab') g.takeOut('slab');
  const r = g.placeBlueprint('workbench', -1.2, -2.2);
  const s = r.structure; await wait(800);
  if (s) { g.addItem('dryStone', 3); for (let i = 0; i < s.spots.length; i++) { g.fillFromBag(s.id, i); await wait(500); } g.placeKey(s.id, s.x, s.z, 2); }
  await wait(1200);
  p.goTo(-1.2, -1.3); await wait(1000);
  g.addItem('fibers', 3); g.craft('cord'); await wait(1200);
  g.craft('bowDrill'); await wait(1500);
  return window.__tutorial.state().id;
})()"

echo "== stage 5: the notebook"
ev "(async () => { window.__primal.notebook(); await new Promise(r => setTimeout(r, 2500)); window.__iconbar.menu.back(); await new Promise(r => setTimeout(r, 1500)); return window.__tutorial.state().id; })()"
pause 1

echo "== results"
ev "(() => { const w = window.__wt; clearInterval(w.timer); return JSON.stringify({ marks: w.marks, nextActionShownOnEveryUpdate: w.reveal.every(Boolean), updates: w.reveal.length, lesson: window.__tutorial.state().id }); })()"
