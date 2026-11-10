. "$(dirname "$0")/c.sh"
c browser run artifacts/gaze/eval.mjs | python3 -c "
import json,sys; r=json.load(sys.stdin)['data']['result']
print({k:r[k] for k in r if k!='groups'})
print('group | meshes | tris | instanced | castShadow | materials')
for g in r['groups']: print(g)"
