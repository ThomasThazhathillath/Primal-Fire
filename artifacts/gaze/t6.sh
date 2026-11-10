. "$(dirname "$0")/c.sh"
sleep 12; c runtime wait --timeout 60000 >/dev/null 2>&1
c xr enter --input-json '{}' >/dev/null; sleep 2; c xr status | grep -E "deviceName|sessionActive|gaze"
c xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
echo "(() => { const g = window.__gaze.state(); return { src: g.source, held: g.held, target: g.target && g.target.key, rayOwns: g.rayOwns, actions: g.actions, verb: g.lastVerb, picks: g.stats.picks }; })()" > artifacts/gaze/expr.js
c xr look-at --input-json '{"device":"headset","target":{"x":0,"y":1.2,"z":-3}}' >/dev/null
c xr look-at --input-json '{"device":"gaze","target":{"x":-2.2,"y":0.06,"z":-2.6}}' >/dev/null; sleep 1
echo "--headset ahead, eyes on stone-1"; st
c xr select --input-json '{"device":"hand-left"}' >/dev/null; sleep 0.8
echo "--left pinch"; st
c xr set-connected --input-json '{"device":"gaze","connected":false}' >/dev/null; sleep 1
c xr look-at --input-json '{"device":"headset","target":{"x":2.1,"y":0.06,"z":-3.4}}' >/dev/null; sleep 1
echo "--gaze disconnected, head on stone-2"; st
c xr set-connected --input-json '{"device":"gaze","connected":true}' >/dev/null
