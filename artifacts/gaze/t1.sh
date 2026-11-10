. "$(dirname "$0")/c.sh"
c xr enter --input-json '{}' >/dev/null; c xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
c xr look-at --input-json '{"device":"headset","target":{"x":-2.2,"y":0.06,"z":-2.6}}' >/dev/null; sleep 1
st
c browser screenshot --input-json '{}' --output-file artifacts/gaze/01-head-gaze-stone.png | grep -o '"screenshotPath[^,]*'
c xr select --input-json '{"device":"hand-right"}' >/dev/null; sleep 0.5
st
