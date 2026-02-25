# Detector

`Detector` is a macOS desktop screen understanding assistant built with Electron + React + TypeScript.
Detector now runs as a menu bar app:

- click the menu bar icon to open the main window (`Main` + `Settings`)
- configure API credentials from `Settings`
- press global shortcut (`Cmd+Shift+.`) to capture all displays

It sends screenshots to an OpenAI-compatible API and shows either:

- a conservative email reply draft (only when an email UI is clearly detected), and
- a short list of actionable **memory candidates** (todos, reminders, deliveries, reading list, etc.) that you can save.
- real active-window metadata (active app, window title, active URL), and for supported visible browsers on the current desktop, grouped browser sessions with full tab list (title + URL).

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
# optional (default 536870912 = 512MB)
# MAX_STORAGE_BYTES=536870912
```

Important:

- `API_BASE_URL` should include `/v1` if your gateway exposes OpenAI-compatible routes under `/v1/chat/completions`.
- For packaged apps, settings are saved under `~/Library/Application Support/<app>/settings.json` and take precedence.

## Local Data (History + Memory)

In packaged mode, Detector stores JSON files under:

`~/Library/Application Support/detector/`

Files:

- `history.json` - capture records (raw model JSON + text context), auto-pruned by Storage limit policy
- `memory.json` - saved memory items you confirmed from the capture panel
- `captures/` - persisted screenshot assets for each capture (`captures/<recordId>/display-<n>.jpg`)

## Storage Management

`Settings -> Storage` now reads **real local disk usage** from the app data directory and shows:

- total used bytes vs max limit (progress bar)
- category breakdown:
  - capture history (`history.json`)
  - saved memory (`memory.json`)
  - screenshots directory (`captures/`)
- item counts and absolute local paths
- actions per category:
  - `Reveal` (open in Finder)
  - `Copy path`

Storage policy:

- limit applies to all categories
- when over limit, Detector auto-prunes **oldest captures first** (history record + its screenshot files)
- Detector never auto-deletes saved memory items
- manual cleanup can be triggered from the Storage tab

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

What this command now does automatically:

- Quit old Detector process
- Build + package app
- Install to a stable path (prefer `/Applications/Detector.app`, fallback `~/Applications/Detector.app`)
- Clear local quarantine/provenance attributes (best effort)
- Launch installed app and write logs to `logs/`

Open installed app directly (without rebuilding):

```bash
npm run open:mac
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

Browser metadata collection relies on macOS automation permissions. If automation is denied or times out, capture still succeeds with partial metadata.

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
  - Context uses **raw metadata first** (active app/window/url/tabs), then falls back to model output text when needed
  - Browser metadata is sourced from macOS automation in main process (`active-window.ts`) and includes grouped sessions for visible supported browsers (Safari, Chrome, Arc, Brave, Edge) with full tabs
- Memory:
  - Saved items you confirmed from the capture panel
- Settings:
  - 4 sections (Dayflow-aligned IA): `General` / `Providers` / `Storage` / `Other`
  - `General`:
    - Recording status card: `Screen recording permission`, `Automation permission`, `Capture service`, `Run status check`
    - Screen recording quick actions when not granted: `Request access` and `Open System Settings`
  - `Providers` (single-provider mode):
    - Provider overview (endpoint/model/key/health)
    - Connection health check (`Run health check`) with last checked timestamp
    - API test is strict: validates both basic ping (`OK`) and capture JSON-schema response compatibility
    - Edit config: `API Base URL`, `Model`, `Timeout (ms)`, `API Key`
    - Prompt customization: `capturePromptTemplate`, `chatPromptTemplate`, `Reset defaults`
    - Failover shown as `Planned` (no interactive routing controls yet)
  - `Storage`:
    - Disk usage + global storage cap + cleanup + per-category `Reveal` / `Copy path`
  - `Other`:
    - Runtime preferences: `Launch at login`, `Show Dock icon`
    - Privacy/preferences toggles: `Share crash reports` (Planned), `Share anonymous usage` (Planned), `Show timeline icons` (Not enabled)
    - `Output language override`
    - `Export timeline` (Markdown, date range)
    - `Debug reprocess day` (development builds only)
  - Settings persist to local app data (`~/Library/Application Support/.../settings.json`)

## Troubleshooting

- `API error: 404`: usually `API_BASE_URL` path mismatch. Check whether `/v1` is required.
- `Model response was not valid JSON`: usually means the selected model returned plain text (for example model deprecation/error message) instead of Detector's required capture JSON schema.
- `Screen Recording permission is denied`: enable permission in System Settings, then relaunch app.
- No popup on full-screen app: ensure you are testing the latest packaged build.
- If you previously had both `~/Library/Application Support/Detector` and `~/Library/Application Support/detector`, Detector now migrates/syncs settings to avoid split configuration confusion.

## UI Notes (Panel)

The capture panel (top overlay) has two modes:

- Collapsed: slim loading bar (`Analyzing your screen...`)
- Expanded: full result view (email draft + memory candidates)
- Memory candidate cards are clickable; clicking opens a detail modal with full, untruncated content.

## Panel Persistence

- The floating panel no longer auto-hides on app/page switch or focus loss.
- The panel stays on screen until you explicitly close it with:
  - `Esc`
  - the top-right `X` in the panel header
- Hover-out no longer collapses or hides the panel.
- Pressing `Cmd+Shift+.` while the panel is already visible starts a new capture and refreshes the same panel.
- Copy actions keep the panel open (copy no longer dismisses the window).

## UI Notes (Main Window)

- The top area across both sidebar and main content is draggable (`-webkit-app-region: drag`) for easier window movement.
