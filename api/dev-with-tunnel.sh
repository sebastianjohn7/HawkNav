#!/usr/bin/env bash
set -euo pipefail

# Starts Cloudflare quick tunnel → writes EXPO_PUBLIC_API_URL into mobile/.env → runs Bun.
# Expo: npx expo start (reads EXPO_PUBLIC_* from mobile/.env).
# Start this first, then Expo. Ctrl+C restores EXPO_PUBLIC_API_URL to localhost and stops the tunnel.

API_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$API_DIR/.." && pwd)"
MOBILE_ENV="$ROOT/mobile/.env"
BUN_PORT=8787
LOCAL_API_URL="http://localhost:${BUN_PORT}"
LOG_FILE=$(mktemp)
TUNNEL_PID=""

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Error: cloudflared not found on PATH. Install it, then retry."
  exit 1
fi

if [ ! -f "$MOBILE_ENV" ]; then
  if [ -f "$ROOT/mobile/.env.example" ]; then
    cp "$ROOT/mobile/.env.example" "$MOBILE_ENV"
    echo "Created mobile/.env from .env.example — fill SUPABASE_* if needed."
  else
    echo "Error: missing $MOBILE_ENV"
    exit 1
  fi
fi

set_api_url() {
  local url="$1"
  if grep -q '^EXPO_PUBLIC_API_URL=' "$MOBILE_ENV"; then
    # macOS sed: rewrite EXPO_PUBLIC_API_URL in place
    sed -i.bak "s|^EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=${url}|" "$MOBILE_ENV"
    rm -f "${MOBILE_ENV}.bak"
  elif grep -q '^API_URL=' "$MOBILE_ENV"; then
    # legacy Flutter-style key — migrate in place
    sed -i.bak "s|^API_URL=.*|EXPO_PUBLIC_API_URL=${url}|" "$MOBILE_ENV"
    rm -f "${MOBILE_ENV}.bak"
  else
    printf '\nEXPO_PUBLIC_API_URL=%s\n' "$url" >> "$MOBILE_ENV"
  fi
}

cleanup() {
  echo ""
  echo "Shutting down Cloudflare tunnel${TUNNEL_PID:+ (PID: $TUNNEL_PID)}..."
  if [ -n "$TUNNEL_PID" ]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
  set_api_url "$LOCAL_API_URL"
  echo "Restored mobile/.env EXPO_PUBLIC_API_URL to $LOCAL_API_URL"
  rm -f "$LOG_FILE"
}
trap cleanup INT TERM EXIT

echo "Starting Cloudflare quick tunnel for port $BUN_PORT..."
cloudflared tunnel --url "http://127.0.0.1:$BUN_PORT" > "$LOG_FILE" 2>&1 &
TUNNEL_PID=$!

echo "Waiting for tunnel URL..."
TUNNEL_URL=""
for _ in $(seq 1 30); do
  TUNNEL_URL=$(grep -oE "https://[a-zA-Z0-9.-]+\.trycloudflare\.com" "$LOG_FILE" | head -n 1 || true)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "Error: Timed out waiting for Cloudflare URL. Tunnel logs:"
  cat "$LOG_FILE"
  exit 1
fi

set_api_url "$TUNNEL_URL"

echo "=================================================="
echo "Tunnel Active: $TUNNEL_URL"
echo "Wrote EXPO_PUBLIC_API_URL into mobile/.env"
echo "Next (other terminal): cd mobile && npx expo start"
echo "=================================================="

cd "$API_DIR"
bun run --hot src/index.ts
