. "$(dirname "$0")/c.sh"
echo "(() => { window.__tutorial.begin(1); window.__primal.stow(); return 1; })()" > artifacts/gaze/expr.js; st >/dev/null
echo "(() => { const g = window.__gaze.state(); return { held: g.held, target: g.target && g.target.key, actions: g.actions, verb: g.lastVerb, log: window.__primal.log().split('\n').slice(-4) }; })()" > artifacts/gaze/expr.js
c xr look-at --input-json '{"device":"headset","target":{"x":0.75,"y":0.06,"z":-1.2}}' >/dev/null; sleep 0.8
echo "--gaze on grass"; st
c xr run-sequence --input-json '{"device":"hand-right","steps":[{"position":{"x":-0.35,"y":0.12,"z":-1.45},"pinch":{"value":1,"at":"arrival"}}]}' --timeout 45000 | grep -E '"ok"|warning' | head -3
sleep 0.5; echo "--near pinch at stone-1 (expect direct grab of stone, no gaze action)"; st
c xr set-select-value --input-json '{"device":"hand-right","value":0}' >/dev/null
