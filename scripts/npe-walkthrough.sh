#!/bin/zsh
# Fresh-save walkthrough of the first steps (docs/NPE_PLAN.md).
#
# Runs in the managed IWER browser of THIS checkout's dev server (npx @iwsdk/cli dev up). It wipes only that
# browser's PRIMAL storage, starts a brand-new game (the tutorial, Guided mode) and plays the seven steps with
# the emulated right hand doing the real thing wherever the CLI can: aim the hand ray at the step's target (the
# same point the game's arrow marks) and pinch; pinch the menu buttons where they hang. Only the walk into the
# ring uses a debug hook (teleport). It records when each step completes, measured in the page, and prints JSON.
#
# Scripted timings show the flow works end to end and how many actions each step takes. They are not a measure
# of how long a first-time human needs; that needs a real player on a real Quest.
# (no set -e: a failed CLI call is reported by the step check that follows)
cd "$(dirname "$0")/.."
cli() { npx @iwsdk/cli "$@" 2>&1; }
ev() { STAGE=eval CODE="$1" npx @iwsdk/cli browser run scripts/tutorial-check.mjs 2>&1 | grep '"result"' | head -1 | sed -e 's/^ *"result": //' -e 's/,$//'; }
pinch() { cli xr run-sequence --input-json '{"device":"hand-right","steps":[{"label":"pinch","pinch":{"value":1},"duration":0.35},{"label":"open","pinch":{"value":0},"duration":0.35}]}' --timeout 60000 >/dev/null; }
# Aim the right hand's RAY at the current step's target (the game's own arrow position) and pinch. IWER's look-at
# turns the hand, but the pointer ray leaves it at an angle, so the aim point is corrected until the ray's hit
# point is on the target (a real player simply sees the ray and moves it).
look() { cli xr look-at --input-json "{\"device\":\"hand-right\",\"target\":{\"x\":$1,\"y\":$2,\"z\":$3}}" >/dev/null; sleep 0.35; }
aim_target() {
  cli xr run-sequence --input-json '{"device":"hand-right","steps":[{"label":"rest","position":{"x":0.2,"y":1.1,"z":-0.35},"anchor":"index-tip","duration":0.25}]}' --timeout 60000 >/dev/null
  local t=$(ev "(() => { const e = window.__assist.fx.exact; return e ? [e.x, e.y + 0.08, e.z].map(v => +v.toFixed(3)).join(' ') : ''; })()" | tr -d '"')
  [ -z "$t" ] && { echo "  (no target)"; return; }
  local T=(${=t}); local A=(${=t})
  for i in 1 2 3 4; do
    look $A[1] $A[2] $A[3]
    local n=$(ev "(() => { const a = window.__pick.sys.aim[1]; const k = (a.i - 1 + 12) % 12; const o = a.o[k], d = a.d[k]; const ty = $T[2]; const s = (ty - o.y) / (d.y || -1e-6); const hx = o.x + d.x * s, hz = o.z + d.z * s; return [($A[1]) + ($T[1] - hx), ($A[3]) + ($T[3] - hz), Math.hypot($T[1] - hx, $T[3] - hz)].map(v => +v.toFixed(3)).join(' '); })()" | tr -d '"')
    local N=(${=n})
    A[1]=$N[1]; A[3]=$N[2]
    (( $(echo "$N[3] < 0.06" | bc -l) )) && break
  done
  pinch
  sleep 0.6
}
# Put the right index fingertip on a button of a panel and pinch it (pinch-press). The finger comes in from the
# front (12 cm out, then onto the button), as a real hand does: sliding along the surface would swipe-scroll a row.
press() {
  local c=$(ev "(() => { const t = window.__touch['$1'].targets().find(x => x.id === '$2'); if (!t) return ''; const pl = window.__primal.world.player; const at = (k) => { const v = pl.worldToLocal(pl.position.clone().set(t.c[0] + t.n[0] * k, t.c[1] + t.n[1] * k, t.c[2] + t.n[2] * k)); return [v.x, v.y, v.z].map(n => +n.toFixed(3)).join(' '); }; return at(0.12) + ' ' + at(0.015); })()" | tr -d '"')
  [ -z "$c" ] && { echo "  (no button $1/$2)"; return; }
  local P=(${=c})
  cli xr run-sequence --input-json "{\"device\":\"hand-right\",\"steps\":[{\"label\":\"out\",\"position\":{\"x\":$P[1],\"y\":$P[2],\"z\":$P[3]},\"anchor\":\"index-tip\",\"duration\":0.4},{\"label\":\"to\",\"position\":{\"x\":$P[4],\"y\":$P[5],\"z\":$P[6]},\"anchor\":\"index-tip\",\"duration\":0.4},{\"label\":\"settle\",\"duration\":0.3},{\"label\":\"pinch\",\"pinch\":{\"value\":1},\"duration\":0.3},{\"label\":\"open\",\"pinch\":{\"value\":0},\"duration\":0.3},{\"label\":\"away\",\"position\":{\"x\":$P[1],\"y\":$P[2],\"z\":$P[3]},\"anchor\":\"index-tip\",\"duration\":0.3}]}" --timeout 60000 >/dev/null
  sleep 0.8
}
step() { ev "window.__tutorial.state().id"; }

echo "== fresh save"
# reset() blocks the page's own save-on-exit first, so the wiped game is not written back while it reloads.
ev "(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('primal')) localStorage.removeItem(k); setTimeout(() => window.__primal.reset(), 50); return 'wiped'; })()" >/dev/null || true
sleep 11
cli xr enter --input-json '{}' >/dev/null
cli xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
# IWER keeps device poses across reloads: put both hands back in a relaxed pose in front of the chest.
cli xr run-sequence --input-json '{"device":"hand-right","steps":[{"label":"rest","position":{"x":0.2,"y":1.1,"z":-0.35},"anchor":"index-tip","duration":0.3}]}' --timeout 60000 >/dev/null
cli xr run-sequence --input-json '{"device":"hand-left","steps":[{"label":"rest","position":{"x":-0.2,"y":1.1,"z":-0.35},"anchor":"index-tip","duration":0.3}]}' --timeout 60000 >/dev/null
sleep 2

echo "== play"
ev "(() => {
  const g = window.__primal.game, t = window.__tutorial;
  const w = window.__wt = { t0: performance.now(), marks: {}, targetShown: {} };
  const mark = (k) => { if (!(k in w.marks)) w.marks[k] = +((performance.now() - w.t0) / 1000).toFixed(1); };
  w.timer = setInterval(() => {
    const s = t.state();
    for (const id of s.done) mark('done:' + id);
    if (window.__iconbar?.panel?.visible) mark('menuShown');
    if (s.id && window.__assist.fx.exact) w.targetShown[s.id] = true;
  }, 100);
  window.__title.tap('begin-button');
  return 'started';
})()"
sleep 2

echo "== 1 Pinch the glowing stone"; aim_target; step
echo "== 2 Walk into the glowing ring"; ev "(async () => { window.__primal.goTo(0.2, -2.4); await new Promise(r => setTimeout(r, 1200)); return 1; })()" >/dev/null; step
echo "== 3 Pinch each glowing mark"; aim_target; aim_target; aim_target; step
echo "== 4 Pinch the flat stone"; aim_target; step
echo "== 5 Put it on top"; aim_target; step
echo "== 6 Tap the bag"; press menu slot-14; sleep 1; press menu slot-0; step
ev "(async () => { window.__iconbar.menu.back(); await new Promise(r => setTimeout(r, 800)); return 1; })()" >/dev/null
echo "== 7 Pinch your workbench"; aim_target; step
sleep 1

echo "== results"
ev "(() => { const w = window.__wt; clearInterval(w.timer); const s = window.__tutorial.state(); return JSON.stringify({ marks: w.marks, finished: s.finished, targetShownFor: Object.keys(w.targetShown), log: window.__primal.game.log.lines.slice(-40).map(l => l.text.replace(/^.*· /, '')).filter(t => /pinch|gather|opening step|filled|placed|spot |tap|lock|bench/.test(t)) }); })()"
