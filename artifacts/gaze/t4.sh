. "$(dirname "$0")/c.sh"
echo "(() => { const h = window.__primal.input.hands[1]; return { held: window.__gaze.state().held, grip: h.grip, squeeze: h.squeeze, pd: h.pinchDist, tip: h.tipTracked, tracked: h.tracked, log: window.__primal.log().split('\n').slice(-8) }; })()" > artifacts/gaze/expr.js
st
c xr get-hand-state --input-json '{"device":"hand-right"}' | grep -E "pinch|select|poseId" | head
