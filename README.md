# Detector

`Detector` is a macOS desktop screen understanding assistant built with Electron + React + TypeScript.
Press a global shortcut (`Cmd+Shift+.`) to capture all displays, send screenshots to an OpenAI-compatible API, and show either:

- an email reply draft, or
- a page summary.

## Tech Stack

- Electron (main + preload)
- React + Vite (renderer)
- TypeScript
- Tailwind CSS

## Project Structure

```text
src/
  main/        # Electron main process
  preload/     # Context bridge APIs
  renderer/    # React UI
  shared/      # Shared types and IPC channels
```

## Prerequisites

- macOS
- Node.js 20+ (recommended)
- npm

## Environment Variables

Create a `.env` file in project root:

```env
API_BASE_URL=http://127.0.0.1:8317/v1
API_KEY=your-api-key
API_MODEL=gpt-4o
# optional (default 30000)
# API_TIMEOUT_MS=30000
```

Important:

- `API_BASE_URL` should include `/v1` if your gateway exposes OpenAI-compatible routes under `/v1/chat/completions`.

## Development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Package macOS App (without downloading Electron again)

```bash
npx electron-builder --mac --dir \
  -c.electronDist=/Users/bobbyjia/Desktop/Personal_project/Detector/node_modules/electron/dist \
  -c.electronVersion=34.5.8
```

Output app:

`dist/mac-arm64/detector.app`

## Permissions (macOS)

The app needs Screen Recording permission for screenshot capture.

- Development mode: grant permission to `Electron`
- Packaged mode: grant permission to `detector.app`

If permission gets stuck:

```bash
tccutil reset ScreenCapture com.electron.detector
```

Then relaunch app and trigger hotkey again.

## Logs

### Development logs

`npm run dev` terminal output is your runtime log.

### Packaged app logs

Launch packaged app with stdout/stderr redirected:

```bash
mkdir -p /Users/bobbyjia/Desktop/Personal_project/Detector/logs

open -n "/Users/bobbyjia/Desktop/Personal_project/Detector/dist/mac-arm64/detector.app" \
  --stdout "/Users/bobbyjia/Desktop/Personal_project/Detector/logs/app.stdout.log" \
  --stderr "/Users/bobbyjia/Desktop/Personal_project/Detector/logs/app.stderr.log"
```

Watch logs:

```bash
tail -f /Users/bobbyjia/Desktop/Personal_project/Detector/logs/app.stderr.log
```

Note:

- `open -W` will block until app exits, so it may look like the command is "stuck".

## Global Shortcut

- Trigger capture: `Cmd+Shift+.`

## Troubleshooting

- `API error: 404`: usually `API_BASE_URL` path mismatch. Check whether `/v1` is required.
- `Screen Recording permission is denied`: enable permission in System Settings, then relaunch app.
- No popup on full-screen app: ensure you are testing the latest packaged build.

