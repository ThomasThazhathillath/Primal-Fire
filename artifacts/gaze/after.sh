. "$(dirname "$0")/c.sh"
c browser reload --input-json '{}' >/dev/null; sleep 10
echo "(() => ({ chunked: window.__perf.chunked() }))()" > artifacts/gaze/expr.js; st
