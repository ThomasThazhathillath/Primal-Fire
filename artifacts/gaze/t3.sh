. "$(dirname "$0")/c.sh"
G="(() => ({ g: window.__gaze.state(), t: window.__tutorial.state().ticks }))()"
echo "$G" > artifacts/gaze/expr.js
c xr enter --input-json '{}' >/dev/null; c xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
c xr look-at --input-json '{"device":"headset","target":{"x":-0.35,"y":0.06,"z":-1.45}}' >/dev/null; sleep 1
echo "--aim stone"; st
c browser screenshot --input-json '{}' --output-file artifacts/gaze/02-look-lesson-stone.png >/dev/null
c xr set-select-value --input-json '{"device":"hand-right","value":1,"duration":0.1}' >/dev/null; sleep 0.6
echo "--pinch held"; st
c xr animate-to --input-json '{"device":"hand-right","position":{"x":0.3,"y":1.2,"z":-0.4},"duration":0.5}' >/dev/null; sleep 0.8
echo "--moved"; st
c xr set-select-value --input-json '{"device":"hand-right","value":0,"duration":0.1}' >/dev/null; sleep 0.8
echo "--released"; st
c xr look-at --input-json '{"device":"headset","target":{"x":0,"y":0.1,"z":-2.22}}' >/dev/null; sleep 1
echo "--aim mark"; st
c browser screenshot --input-json '{}' --output-file artifacts/gaze/03-look-lesson-mark.png >/dev/null

c xr select --input-json '{"device":"hand-left"}' >/dev/null; sleep 0.8
echo "--pinch mark (left hand)"; st
