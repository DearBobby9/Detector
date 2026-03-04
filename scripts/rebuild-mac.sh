#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_ID="com.electron.detector"
BUILD_APP_PATH="$ROOT/dist/mac-arm64/detector.app"
SYSTEM_INSTALL_APP_PATH="/Applications/Detector.app"
USER_INSTALL_APP_PATH="$HOME/Applications/Detector.app"
INSTALLED_APP_PATH=""
LOG_DIR="$ROOT/logs"
STDOUT_LOG="$LOG_DIR/app.stdout.log"
STDERR_LOG="$LOG_DIR/app.stderr.log"
ICON_SOURCE_PNG="$ROOT/Asset/Icon.png"
BUILD_RES_DIR="$ROOT/build"
ICONSET_DIR="$BUILD_RES_DIR/icon.iconset"
APP_ICON_ICNS="$BUILD_RES_DIR/icon.icns"
TRAY_ICON_PNG="$BUILD_RES_DIR/iconTemplate.png"

TAIL_LOGS="false"
if [[ "${1:-}" == "--tail" ]]; then
  TAIL_LOGS="true"
fi

echo "[rebuild] repo: $ROOT"

prepare_icons() {
  if [[ ! -f "$ICON_SOURCE_PNG" ]]; then
    echo "[rebuild] error: icon source not found: $ICON_SOURCE_PNG" >&2
    exit 1
  fi

  if ! command -v sips >/dev/null 2>&1; then
    echo "[rebuild] error: sips not available" >&2
    exit 1
  fi
  if ! command -v iconutil >/dev/null 2>&1; then
    echo "[rebuild] error: iconutil not available" >&2
    exit 1
  fi

  mkdir -p "$BUILD_RES_DIR"
  rm -rf "$ICONSET_DIR"
  mkdir -p "$ICONSET_DIR"

  echo "[rebuild] prepare icons from: $ICON_SOURCE_PNG"

  sips -z 16 16 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
  sips -z 32 32 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
  sips -z 32 32 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
  sips -z 64 64 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
  sips -z 128 128 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
  sips -z 256 256 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
  sips -z 256 256 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
  sips -z 512 512 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
  sips -z 512 512 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
  sips -z 1024 1024 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null

  iconutil -c icns "$ICONSET_DIR" -o "$APP_ICON_ICNS"
  sips -z 64 64 "$ICON_SOURCE_PNG" --out "$TRAY_ICON_PNG" >/dev/null

  echo "[rebuild] app icon: $APP_ICON_ICNS"
  echo "[rebuild] tray icon: $TRAY_ICON_PNG"
}

prepare_icons

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
    pkill -f "/Applications/Detector.app/Contents/MacOS/detector" >/dev/null 2>&1 || true
    pkill -f "$HOME/Applications/Detector.app/Contents/MacOS/detector" >/dev/null 2>&1 || true
    pkill -x "detector" >/dev/null 2>&1 || true
  fi
fi

cd "$ROOT"

echo "[rebuild] build"
npm run build

echo "[rebuild] package (mac --dir)"
npx electron-builder --mac --dir \
  -c.mac.icon="$APP_ICON_ICNS" \
  -c.electronDist="$ROOT/node_modules/electron/dist" \
  -c.electronVersion="$(node -p "require('electron/package.json').version")"

if [[ ! -d "$BUILD_APP_PATH" ]]; then
  echo "[rebuild] error: app not found at $BUILD_APP_PATH" >&2
  exit 1
fi

echo "[rebuild] install app"
if rm -rf "$SYSTEM_INSTALL_APP_PATH" >/dev/null 2>&1 && cp -R "$BUILD_APP_PATH" "$SYSTEM_INSTALL_APP_PATH" >/dev/null 2>&1; then
  INSTALLED_APP_PATH="$SYSTEM_INSTALL_APP_PATH"
  echo "[rebuild] installed: $INSTALLED_APP_PATH"
else
  mkdir -p "$HOME/Applications"
  rm -rf "$USER_INSTALL_APP_PATH"
  cp -R "$BUILD_APP_PATH" "$USER_INSTALL_APP_PATH"
  INSTALLED_APP_PATH="$USER_INSTALL_APP_PATH"
  echo "[rebuild] installed: $INSTALLED_APP_PATH (fallback)"
fi

# Ensure tray icon is available to main process in packaged runtime.
if [[ -f "$TRAY_ICON_PNG" ]]; then
  cp "$TRAY_ICON_PNG" "$INSTALLED_APP_PATH/Contents/Resources/iconTemplate.png"
fi

# Keep only the installed app copy to avoid duplicate Finder results.
if [[ -d "$BUILD_APP_PATH" && "$BUILD_APP_PATH" != "$INSTALLED_APP_PATH" ]]; then
  rm -rf "$BUILD_APP_PATH"
  echo "[rebuild] cleaned build app copy: $BUILD_APP_PATH"
fi

# Ad-hoc codesign with entitlements so macOS can persist Screen Recording permission.
ENTITLEMENTS="$ROOT/entitlements.mac.plist"
if [[ -f "$ENTITLEMENTS" ]]; then
  echo "[rebuild] codesign (ad-hoc) with entitlements"
  codesign --force --deep --sign - --entitlements "$ENTITLEMENTS" "$INSTALLED_APP_PATH"
else
  echo "[rebuild] warning: entitlements.mac.plist not found, skipping codesign"
fi

# Best-effort clear quarantine/provenance attributes on local build install.
xattr -dr com.apple.quarantine "$INSTALLED_APP_PATH" >/dev/null 2>&1 || true
xattr -dr com.apple.provenance "$INSTALLED_APP_PATH" >/dev/null 2>&1 || true

mkdir -p "$LOG_DIR"

STAMP="$(date "+%Y%m%d-%H%M%S")"
if [[ -f "$STDOUT_LOG" ]]; then
  mv "$STDOUT_LOG" "$STDOUT_LOG.$STAMP" || true
fi
if [[ -f "$STDERR_LOG" ]]; then
  mv "$STDERR_LOG" "$STDERR_LOG.$STAMP" || true
fi

echo "[rebuild] launch"
open -n "$INSTALLED_APP_PATH" \
  --stdout "$STDOUT_LOG" \
  --stderr "$STDERR_LOG"

echo "[rebuild] app: $INSTALLED_APP_PATH"
echo "[rebuild] stdout: $STDOUT_LOG"
echo "[rebuild] stderr: $STDERR_LOG"

if [[ "$TAIL_LOGS" == "true" ]]; then
  echo "[rebuild] tailing stderr (Ctrl+C to stop)"
  tail -f "$STDERR_LOG"
fi
