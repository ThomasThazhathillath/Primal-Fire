. "$(dirname "$0")/c.sh"
OUT=${1:-artifacts/gaze/perf-baseline.jsonl}; : > $OUT
samp() { echo "$2" > artifacts/gaze/expr.js; r=$(c browser run artifacts/gaze/sample.mjs --timeout 30000 | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['data']['result']))"); echo "{\"scenario\":\"$1\",\"r\":$r}" | tee -a $OUT; }
G='window.__primal.world.globals.game'
echo "(() => { localStorage.setItem('primal-first-fire.mode.v1','survival'); return 1 })()" > artifacts/gaze/expr.js; st >/dev/null
c browser reload --input-json '{}' >/dev/null; sleep 10
c xr enter --input-json '{}' >/dev/null; sleep 2; c xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
c xr set-transform --input-json '{"device":"headset","position":{"x":0,"y":1.6,"z":0}}' >/dev/null
c xr look-at --input-json '{"device":"headset","target":{"x":0,"y":1.4,"z":-5}}' >/dev/null
samp "1 initial forest (day, spawn, looking ahead)" "1"
c xr look-at --input-json '{"device":"headset","target":{"x":-10,"y":1.2,"z":-8}}' >/dev/null
samp "2 dense forest view" "1"
c xr look-at --input-json '{"device":"headset","target":{"x":-2.2,"y":0.06,"z":-2.6}}' >/dev/null
samp "3 resource gathering view + gaze target" "1"
samp "4 multiple objects (8 drops) + held log" "(() => { const g=$G; for (let i=0;i<8;i++) g.dropItem('dryStone', -1.5+i*0.35, -2); g.addItem('logs',1); g.takeOut('logs'); return 1 })()"
samp "5 construction (fire pit outline, holding a stone, marks lit)" "(() => { const g=$G; g.stow(); g.addItem('dryStone',4); g.lessonStructure=undefined; g.placeBlueprint('firePit', 0, -2.4, 0, true); g.takeOut('dryStone'); return 1 })()"
c xr look-at --input-json '{"device":"headset","target":{"x":0,"y":0.2,"z":-2.4}}' >/dev/null
samp "6 night (hour 22)" "(() => { const g=$G; g.env.hour = 22; return g.env.hour })()"
c xr look-at --input-json '{"device":"headset","target":{"x":0,"y":1.4,"z":-5}}' >/dev/null
samp "7 night, full view" "(() => { const g=$G; g.env.hour = 22; return 1 })()"
