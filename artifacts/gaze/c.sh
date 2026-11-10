#!/bin/bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null
cd "$(dirname "$0")/../.."
c() { npx @iwsdk/cli "$@"; }
st() { c browser run artifacts/gaze/eval.mjs | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['result'])"; }
