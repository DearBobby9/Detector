# AGENTS.md

## 1) Project Mission (Detector)

Detector is a macOS desktop assistant for screen understanding and follow-up chat.

Core value of this project:
- Turn screen context (apps/tabs/screenshots) into actionable chat.
- Keep chat routing flexible with long-term dual mode:
  - `API` provider mode (custom API key/base/model).
  - `Codex CLI` provider mode (local CLI-driven chat).
- Prioritize fast UI iteration with visual preview before packaging.

## 2) Current Product Direction

- `API + Codex CLI` dual mode should coexist long-term.
- Chat experience is the top-priority surface.
- UI quality bar:
  - cleaner hierarchy,
  - subtle selected/hover states,
  - no awkward clipping,
  - intentional spacing and alignment.

## 3) Non-Negotiable Workflow

### 3.1 For FRONTEND changes (required gate)

Use this sequence every time:

1. Implement the UI change.
2. Start preview runtime (`npm run dev`).
3. Generate frontend preview screenshots with **headless browser automation**.
4. Present screenshot(s) to user for confirmation.
5. Wait for explicit user approval.
6. After approval, run `npm run rebuild:mac`.
7. Report rebuild result.

Hard rule:
- Do **not** run `npm run rebuild:mac` before user confirms frontend preview result.

### 3.2 For NON-FRONTEND changes

Default sequence:
1. Implement change.
2. Run relevant checks/build.
3. Run `npm run rebuild:mac` unless user explicitly says skip.
4. Report results.

## 4) Headless Preview Standard (Frontend)

### 4.1 Browser mode

- Default must be headless.
- Do not use headed browser unless user explicitly requests visible browser debugging.

### 4.2 Capture flow discipline (avoid loops)

- Use a fixed, single-pass capture flow:
  - open page,
  - perform required interaction(s),
  - capture screenshot(s),
  - stop preview process.
- Avoid unbounded polling/retry loops.
- If capture fails, retry with a bounded attempt count and report why.

### 4.3 Preview output

- Save screenshots under:
  - `tmp/agent-browser/ui-options/`
- Use descriptive names, e.g.:
  - `feature-name-v1.png`
  - `feature-name-v2.png`
- Always show user the screenshot path and rendered image in response.

## 5) Build & Packaging Commands

- Dev preview:
  - `npm run dev`
- Production build:
  - `npm run build`
- macOS rebuild/package/install/launch:
  - `npm run rebuild:mac`

## 6) UX-Specific Guardrails for This Project

- Chat list:
  - unselected item: no heavy border/fill.
  - selected item: subtle elevated shadow container.
- Main chat area:
  - maximize usable vertical space (reduce unnecessary top blank area).
- Sidebar bottom popup:
  - visually compact,
  - aligned with chat list width rhythm,
  - no clipping against panel edges,
  - balanced corner radius and restrained shadow.

## 7) Communication Protocol with User

- For frontend tasks, always provide:
  - what changed,
  - screenshot preview(s),
  - a direct confirmation question.
- Only after user says approved (e.g. “可以/OK/就这个”) proceed to rebuild.
- If user asks to stop loops or speed up:
  - simplify to one deterministic screenshot pass.

