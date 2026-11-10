. "$(dirname "$0")/c.sh"
echo "(() => { localStorage.setItem('primal-first-fire.mode.v1','tutorial'); localStorage.removeItem('primal-first-fire.tutorial-game.v1'); localStorage.removeItem('primal-first-fire.tutorial.v1'); return 1; })()" > artifacts/gaze/expr.js; st
c browser reload --input-json '{}' >/dev/null; sleep 8
echo "(() => { window.__tutorial.begin(1); return window.__tutorial.state(); })()" > artifacts/gaze/expr.js; st
sleep 1
echo "(() => ({ t: window.__tutorial.state(), list: window.__gaze.list().filter(c => c.kind!=='resource' || c.key.includes('tut') || Math.hypot(c.x,c.z)<3.5) }))()" > artifacts/gaze/expr.js; st
