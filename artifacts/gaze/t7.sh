. "$(dirname "$0")/c.sh"
echo "(() => { window.__primal.stow(); return 1 })()" > artifacts/gaze/expr.js; st >/dev/null
echo "(() => { const g = window.__gaze.state(); return { src: g.source, held: g.held, target: g.target && g.target.key, rayOwns: g.rayOwns, actions: g.actions, verb: g.lastVerb, picks: g.stats.picks, log: window.__primal.log().split('\n').slice(-2) }; })()" > artifacts/gaze/expr.js
c xr look-at --input-json '{"device":"headset","target":{"x":0,"y":1.2,"z":-3}}' >/dev/null
c xr look-at --input-json '{"device":"gaze","target":{"x":-2.2,"y":0.06,"z":-2.6}}' >/dev/null; sleep 1
echo "--eyes on stone-1"; st
c ecs find --input-json '{"withComponents":["Hovered"]}' | grep -E '"name"' | head
c browser screenshot --input-json '{}' --output-file artifacts/gaze/04-glasses-eye-gaze.png >/dev/null
c xr select --input-json '{"device":"hand-left"}' >/dev/null; sleep 0.8
echo "--left pinch"; st
