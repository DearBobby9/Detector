#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_ID="com.electron.detector"
APP_PATH="$ROOT/dist/mac-arm64/detector.app"
LOG_DIR="$ROOT/logs"
STDOUT_LOG="$LOG_DIR/app.stdout.log"
STDERR_LOG="$LOG_DIR/app.stderr.log"

TAIL_LOGS="false"
if [[ "${1:-}" == "--tail" ]]; then
  TAIL_LOGS="true"
fi

echo "[rebuild] repo: $ROOT"

# Best-effort quit of the packaged app (won't touch dev Electron).
if osascript -e "application id \"$BUNDLE_ID\" is running" >/dev/null 2>&1; then
  echo "[rebuild] quitting: $BUNDLE_ID"
  osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true

  # Wait (up to ~6s) for a clean quit.
  for _ in {1..30}; do
    if ! osascript -e "application id \"$BUNDLE_ID\" is running" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done

  # If it still didn't quit, force-kill the packaged binary.
  if osascript -e "application id \"$BUNDLE_ID\" is running" >/dev/null 2>&1; then
    echo "[rebuild] force-killing hung app"
    pkill -f "$ROOT/dist/mac-arm64/detector.app/Contents/MacOS/detector" >/dev/null 2>&1 || true
    pkill -x "detector" >/dev/null 2>&1 || true
  fi
fi

cd "$ROOT"

echo "[rebuild] build"
npm run build

echo "[rebuild] package (mac --dir)"
npx electron-builder --mac --dir \
  -c.electronDist="$ROOT/node_modules/electron/dist" \
  -c.electronVersion="$(node -p "require('electron/package.json').version")"

if [[ ! -d "$APP_PATH" ]]; then
  echo "[rebuild] error: app not found at $APP_PATH" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

STAMP="$(date "+%Y%m%d-%H%M%S")"
if [[ -f "$STDOUT_LOG" ]]; then
  mv "$STDOUT_LOG" "$STDOUT_LOG.$STAMP" || true
fi
if [[ -f "$STDERR_LOG" ]]; then
  mv "$STDERR_LOG" "$STDERR_LOG.$STAMP" || true
fi

echo "[rebuild] launch"
open -n "$APP_PATH" \
  --stdout "$STDOUT_LOG" \
  --stderr "$STDERR_LOG"

echo "[rebuild] app: $APP_PATH"
echo "[rebuild] stdout: $STDOUT_LOG"
echo "[rebuild] stderr: $STDERR_LOG"

if [[ "$TAIL_LOGS" == "true" ]]; then
  echo "[rebuild] tailing stderr (Ctrl+C to stop)"
  tail -f "$STDERR_LOG"
fi
