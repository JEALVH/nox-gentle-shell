# Nox Fullscreen Coexistence

## Objective

Make `nox-gentle-shell` coexist safely with the current Gentle Shell renderer by using only composable, namespaced Pi UI surfaces, while preserving a clear future path for supported fullscreen rail/header contributions.

## Decision

The user selected the safe default: Nox will relinquish Pi's singleton header and working-presentation APIs immediately. It will retain only its namespaced status and detailed widget.

A dedicated fullscreen rail/header integration is deferred until Gentle Shell exposes a documented, versioned contribution contract. Nox will not deep-import `gentle-pi/lib/*`, use private layout-node symbols, or patch the fullscreen tree.

## Constraints

- Public Pi 0.85.1 APIs only.
- No private Pi `dist/` imports and no gentle-pi runtime imports.
- Strict TDD remains enabled from the prior feature decision.
- Test runner: `npm test` (`tsx --test test/*.test.ts`).
- Technical artifacts remain in English.
- No commits, pushes, or pull requests without explicit user authorization.

## Delivery

- Route: delegated direct implementation because the coherent fix touches multiple non-trivial files.
- Forecast: approximately 120–220 authored changed lines, excluding this task document.
- Strategy: single feature branch `feature/nox-fullscreen-coexistence`.
- Allowed implementation boundary: Nox runtime, command/shortcut wiring, tests, and README only.

## Tasks

### NFC-1 — Relinquish singleton UI ownership

- [x] Add RED tests proving start, refresh, off, and shutdown never call `setHeader`, `setWorkingMessage`, or `setWorkingIndicator`.
- [x] Remove Nox writes and cleanup calls for singleton header and working-presentation APIs.
- [x] Remove or revise header commands and shortcuts so the public interface does not advertise behavior Nox no longer owns.
- [x] Preserve compact status, detailed widget, RPC behavior, and inert print/JSON behavior.
- [x] Update README behavior and command documentation.
- [x] Run focused tests, full tests, build, diff checks, and public-boundary checks.

Route: delegated to `gentle-ai-worker` under the multi-file writer trigger.

TDD evidence: RED produced 12 focused failures while the runtime still called singleton surfaces and exposed header controls. GREEN passed the focused suite 23/23 after the minimal runtime/command/shortcut changes. REFACTOR centralized singleton-surface assertions and remained 23/23.

Writer verification: `npm test` passed 48/48; `npm run build`, `npm pack --dry-run --json`, and `git diff --check` passed. The dry-run package retained the exact eight intended files.

### NFC-2 — Verify coexistence boundary

- [x] Independently verify that Nox clears only its namespaced status/widget keys.
- [x] Verify no runtime reference remains to singleton header/working setters.
- [x] Confirm the package still contains no gentle-pi dependency or private layout integration.
- [x] Record the future fullscreen contribution-contract recommendation and remaining live-host validation gap.

Route: delegated verification after the writer returns because native risk assessment was unavailable and therefore treated as high risk.

Independent verification: all six delegated commands and targeted current-byte readback passed with no blocking findings. Singleton setter names remain only in test doubles that prove their absence from production calls. Live-host regular/fullscreen coexistence remains unverified in this environment.

## Future fullscreen contract

The preferred future upstream design is a versioned Gentle Shell contribution registry with:

- globally unique namespaced contribution keys;
- bounded `rail` and `header` surfaces;
- host-owned width, theme, ordering, clipping, resize, and fullscreen breakpoint behavior;
- explicit `update`, `invalidate`, and `dispose` lifecycle operations;
- a public widget-or-hidden fallback outside fullscreen;
- no exposure of layout roots, layout-node symbols, or private TUI fields.

Until that contract exists, Nox will use Pi's keyed `setStatus` and `setWidget` surfaces only.

## Evidence

- Changed production/docs/tests: 173 authored diff lines (46 additions, 127 deletions), within the 120–220 forecast.
- Focused tests: 23/23 passed independently.
- Full tests: 48/48 passed independently.
- TypeScript build: passed independently.
- Package dry run: passed independently with exactly eight intended files.
- `git diff --check`: passed independently.
- Primary LSP diagnostics: clean for all changed TypeScript files.
- pi-lens session diagnostics: no issues across dispatched changed files.
- Live-host coexistence: structurally passed in a 160x50 tmux TUI after removing the inherited `GENTLE_PI_AGENTS_CHILD=1` verifier gate. RPC proved both Nox and Gentle Shell commands registered; the Gentle header, Status/Changes rail, editor, Nox status response, detailed widget, and compact cleanup remained present as expected. No theme-collision or singleton-ownership warning appeared. The TODO card was absent because the fresh session had no tasks; empty TODO state intentionally renders no card. Pixel/color-perfect appearance remains a human visual check.
- Native review: medium-tier reliability review `review-c6bd695cb7011966` approved with no blocking findings and was acknowledged at target `sha256:8993c8b9358454d6ef9c31c48854dde1da4ce5af9647fe071f3e73deb1be6a04`.
- Commit evidence: Conventional Commit subject `fix(shell): relinquish singleton UI ownership`; final hash is recorded after commit creation.
