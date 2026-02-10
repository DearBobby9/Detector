# Detector

`Detector` is a macOS desktop screen understanding assistant built with Electron + React + TypeScript.
Detector now runs as a menu bar app:

- click the menu bar icon to open the main window (`Main` + `Settings`)
- configure API credentials from `Settings`
- press global shortcut (`Cmd+Shift+.`) to capture all displays

It sends screenshots to an OpenAI-compatible API and shows either:

- a conservative email reply draft (only when an email UI is clearly detected), and
- a short list of actionable **memory candidates** (todos, reminders, deliveries, reading list, etc.) that you can save.

The main window also provides a simple chat UI:

- left sidebar: capture history
- right: selected capture context + chat messages
- you can ask follow-up questions based on saved context

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
- For packaged apps, settings are saved under `~/Library/Application Support/<app>/settings.json` and take precedence.

## Local Data (History + Memory)

In packaged mode, Detector stores JSON files under:

`~/Library/Application Support/detector/`

Files:

- `history.json` - last 100 captures (raw model JSON + a text summary for chat context)
- `memory.json` - saved memory items you confirmed from the capture panel

## Development

```bash
npm install
npm run dev
```

## Browser UI Preview (no Electron preload)

The renderer supports a browser-only preview mode for fast UI iteration and agent-browser screenshots.

1. Start dev server:

```bash
npm run dev
```

2. Open the app view in a regular browser:

```text
http://localhost:5173/?view=app
```

In browser preview mode (no Electron preload), `window.electronAPI` is automatically mocked:

- `src/renderer/src/main.tsx`
- `src/renderer/src/lib/mockElectronApi.ts`

Build:

```bash
npm run build
```

## Package macOS App (without downloading Electron again)

One-command rebuild + relaunch (recommended):

```bash
npm run rebuild:mac
# Or tail packaged app logs:
# npm run rebuild:mac -- --tail
```

Manual (build + package):

```bash
npm run build

npx electron-builder --mac --dir \
  -c.electronDist="$(pwd)/node_modules/electron/dist" \
  -c.electronVersion="$(node -p "require('electron/package.json').version")"
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
- `tail -f` will also "block" while waiting for new log lines.

## Global Shortcut

- Trigger capture: `Cmd+Shift+.`

## Main Window + Settings

- Open from menu bar icon
- Main window:
  - Left sidebar: Captures list (scroll inside the rounded card; resizable with the middle divider)
  - Top toolbar: Home / Search / New chat / Capture (Cmd+Shift+.)
- Bottom-left `...` menu: hover to reveal actions
- Chat:
  - Screen context section is expanded by default
- Memory:
  - Saved items you confirmed from the capture panel
- Settings:
  - `API Base URL`
  - `API Key`
  - `Model`
  - `Timeout (ms)`
  - `Test API`
  - Save settings to local app data (`~/Library/Application Support/.../settings.json`)

## Troubleshooting

- `API error: 404`: usually `API_BASE_URL` path mismatch. Check whether `/v1` is required.
- `Screen Recording permission is denied`: enable permission in System Settings, then relaunch app.
- No popup on full-screen app: ensure you are testing the latest packaged build.
