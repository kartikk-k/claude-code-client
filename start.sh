#!/usr/bin/env bash
#
# Claude Client launcher.
# Starts the Bun+Hono data server and the Next.js client together.
#
#   ./start.sh              # server on :4317, client on :3000
#   PORT=4400 ./start.sh    # override server port
#
# The server reads your local ~/.claude data and shells out to the `claude`
# CLI to drive sessions. Nothing is sent anywhere except your own machine.

set -euo pipefail
cd "$(dirname "$0")"

SERVER_PORT="${PORT:-4317}"
CLIENT_PORT="${CLIENT_PORT:-3000}"

# Ensure deps
command -v bun >/dev/null 2>&1 || { echo "bun is required (https://bun.sh)"; exit 1; }
command -v claude >/dev/null 2>&1 || echo "warning: 'claude' CLI not found on PATH — sending messages will fail until it is."

echo "▸ installing deps (bun)…"
( cd server && bun install >/dev/null 2>&1 || true )
bun install >/dev/null 2>&1 || true

# Start the data server (background)
echo "▸ starting data server on :$SERVER_PORT"
( cd server && PORT="$SERVER_PORT" bun run start ) &
SERVER_PID=$!

# Clean up the server when the client exits
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

# Start the Next.js client (foreground)
echo "▸ starting client on :$CLIENT_PORT"
NEXT_PUBLIC_SERVER_URL="http://localhost:$SERVER_PORT" bun run next dev -p "$CLIENT_PORT"
