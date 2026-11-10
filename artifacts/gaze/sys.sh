. "$(dirname "$0")/c.sh"
c browser run artifacts/gaze/systime.mjs --timeout 30000 | python3 -c "import json,sys; r=json.load(sys.stdin)['data']['result']; print(r['n'], r['frames']); [print(x) for x in r['top']]"
