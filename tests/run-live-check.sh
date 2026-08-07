#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
server_log="$(mktemp)"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
  rm -f "$server_log"
}
trap cleanup EXIT

cd "$project_root/server"
DATABASE_URL=pg-mem://iron-crown \
JWT_SECRET=integration-test-secret-that-is-long-enough-123 \
CLIENT_ORIGIN=http://localhost:5173 \
PORT=3311 \
npm start >"$server_log" 2>&1 &
server_pid=$!

for _ in {1..40}; do
  if curl --silent --fail http://127.0.0.1:3311/health >/dev/null; then break; fi
  sleep 0.1
done

curl --silent --fail http://127.0.0.1:3311/health >/dev/null || { cat "$server_log"; exit 1; }
cd "$project_root"
TEST_API_URL=http://127.0.0.1:3311 node tests/live-api-check.mjs
