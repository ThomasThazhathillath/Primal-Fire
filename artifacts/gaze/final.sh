. "$(dirname "$0")/c.sh"
c browser reload --input-json '{}' >/dev/null; sleep 10
c xr enter --input-json '{}' >/dev/null; sleep 2; c xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
c xr set-transform --input-json '{"device":"headset","position":{"x":0,"y":1.6,"z":0}}' >/dev/null
c xr look-at --input-json '{"device":"headset","target":{"x":-2.2,"y":0.06,"z":-2.6}}' >/dev/null
echo "(() => { window.__perf.overlay(true); return 1 })()" > artifacts/gaze/expr.js; st >/dev/null; sleep 6
echo "(() => window.__gaze.state())()" > artifacts/gaze/expr.js; st
c browser screenshot --input-json '{}' --output-file artifacts/gaze/05-final-head-gaze-overlay.png >/dev/null
c xr status | grep -E "sessionActive"
