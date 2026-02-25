# Detector Agent Log

## Session recap (2026-02-25)

### 1) Chat provider architecture: API + Codex CLI dual mode

- Added dual-mode provider model at type level:
  - `ChatProvider = 'api' | 'codex-cli'`
  - `AppSettings` now includes `chatProvider`, `codexCliPath`, `codexCliModel`, `codexCliTimeoutMs`.
- Settings normalization/defaults now support Codex CLI and env overrides.
- Main chat routing now branches by provider:
  - `api` -> existing HTTP chat completion path.
  - `codex-cli` -> local Codex CLI execution path.
- Health check (`apiTest`) now supports strict Codex CLI ping in codex mode.
- Added prompt assembly for codex mode to preserve:
  - system prompt template,
  - output language override,
  - screen context,
  - transcript order.

### 2) Codex CLI integration implementation

- Added `src/main/chat-codex-cli.ts` to execute local Codex CLI via spawned shell.
- Implemented:
  - configurable CLI path/model/timeout,
  - timeout + SIGTERM/SIGKILL safety,
  - non-zero exit handling with concise stderr/stdout tail,
  - event stream parsing (`--json`) and `agent_message` extraction,
  - MCP list probing and selective disable flags for chat calls.

### 3) Renderer and UI/UX changes requested in this thread

- Chat list selected state changed from heavy dark indicator to subtle elevated shadow card.
- Main chat canvas moved upward and expanded to use more vertical space.
- Settings page content area moved upward (reduced top spacing).
- Left-bottom "More actions" popup redesigned:
  - grouped sections (`Workspace`, `Sidebar`),
  - cleaner icon chips + compact rows,
  - click-open/click-outside/Esc close behavior,
  - route-switch auto-close,
  - narrower width and inset alignment to reduce clipping.
- Latest popup width strategy:
  - use `left-1 right-1 w-auto` so it stays within sidebar and aligns with chat-list card width.

### 4) Preview and build verification

- Multiple front-end previews were generated with agent-browser screenshots under:
  - `tmp/agent-browser/ui-options/`
- Latest popup preview:
  - `tmp/agent-browser/ui-options/more-menu-redesign-v2-d.png`
- Build and packaging checks completed:
  - `npm run build` (pass)
  - `npm run rebuild:mac` (pass, app installed to `/Applications/Detector.app` and launched)

### 5) Process agreements captured

- After each project change, run:
  - `npm run rebuild:mac`
- Screenshot automation should avoid visible browser popups when possible:
  - use headless flow by default.

## Files touched in this cycle (working tree)

- `src/shared/types.ts`
- `src/main/settings.ts`
- `src/main/chat-api.ts`
- `src/main/chat-codex-cli.ts` (new)
- `src/renderer/src/lib/mockElectronApi.ts`
- `src/renderer/src/components/MainAppShell.tsx`
