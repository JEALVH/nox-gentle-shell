# Gentle Shell Visual Layer

## Objective

Build a standalone Pi package that gives gentle-shell a polished visual identity and useful session telemetry without patching, copying, or importing gentle-pi internals.

## Problem

The current package has a valid theme and responsive render helpers, but its runtime extension is still a placeholder. It does not yet connect visual state to Pi lifecycle events, show resource usage, expose user controls, restore UI state, or define a safe publication boundary.

## Why

A visual layer is valuable only if it remains stable across Pi/gentle-pi updates. The package therefore needs to own its presentation while treating Pi only as the documented host API. It should surface actionable usage information without taking over core UI surfaces or depending on private distribution files.

## Product proposal

### Default experience

When loaded in TUI mode, the package will provide:

- the packaged `nox` theme, using the existing Nox palette as its local design baseline and selected by the user through Pi settings rather than forced by the extension;
- a branded, width-safe startup banner and header implemented by this package through public `setHeader`;
- compact resource telemetry in Pi's existing footer through a namespaced `setStatus` entry;
- a branded working indicator and message through public working-state APIs;
- extension-owned informational notifications for explicit user actions only.

The default telemetry mode is `compact`. A `detailed` mode adds a package-owned widget without replacing Pi's footer. An `off` mode removes all extension-owned runtime UI while leaving the user's selected theme unchanged.

### Startup banner

- The package will own a Nox-branded startup banner rather than reuse Pi or gentle-pi artwork.
- The banner will be rendered through public `setHeader` and remain independent from gentle-pi implementation files.
- Wide terminals receive the full banner; narrow terminals receive a compact wordmark; extremely narrow terminals receive a single safe text line.
- The banner may include the Nox wordmark, a short tagline, package version, and approved user-selected symbols.
- Banner artwork and symbols remain replaceable presentation data so layout and lifecycle behavior can be implemented and tested before final glyph selection.
- `/nox-gentle-shell header show|hide` and `Ctrl+Alt+H` control banner visibility, and `off` or shutdown restores Pi's built-in header.

### Resource telemetry

The MVP will show only data available through documented Pi APIs:

- current context tokens, context window, and context percentage from `ctx.getContextUsage()`;
- finalized input, output, cache-read, cache-write, total-token, and cost values derived from public session entries;
- turn/message counts derived from public events and entries;
- active tool name/count from tool execution lifecycle events;
- idle or working state;
- current model identity when space permits.

Compact example:

```text
ctx 42% · in 18.2k · out 3.1k · $0.08 · tools 1
```

Detailed mode may show:

```text
model     claude-sonnet
context   53.8k / 128k (42%)
usage     in 18.2k · out 3.1k · cache 9.4k
cost      $0.08
activity  turn 7 · tool bash
```

Values must degrade to `—` or be omitted when Pi reports them as unavailable, including immediately after compaction. Finalized usage is not presented as a continuously streaming exact total.

### Commands and shortcuts

Use one namespaced command surface to avoid command sprawl:

- `/nox-gentle-shell compact` — show header, compact status, and branded working state;
- `/nox-gentle-shell detailed` — add the detailed telemetry widget;
- `/nox-gentle-shell off` — clear extension-owned header, status, widget, and working customization;
- `/nox-gentle-shell header show|hide` — control the branded header independently;
- `/nox-gentle-shell status` — report the current visual mode and telemetry availability.

Recommended TUI shortcuts:

- `Ctrl+Alt+T` — cycle `compact → detailed → off`;
- `Ctrl+Alt+H` — toggle the branded header.

Slash commands remain the reliable fallback because public APIs do not guarantee conflict resolution for extension shortcuts. Documentation must state that user keybindings or later-loaded extensions may supersede these shortcuts.

### Palette and iconography

- The canonical color baseline is the existing `nox` palette. Its values will be copied into this standalone package and maintained locally; `/home/jesus/code/gentle-pi/themes/nox.json` is design reference only and never a runtime dependency.
- The current `themes/gentle-shell.json` colors are provisional and must be reconciled with the Nox palette before runtime integration.
- Branded symbols and glyphs remain user-directed. When a concrete icon is needed for the header, telemetry, working state, or alerts, pause at that design point and ask the user to provide or select it.
- Until a symbol is approved, tests and implementation use semantic text or replaceable placeholders rather than making an irreversible visual choice.

### Mode behavior

- **TUI:** header, status, widget, working indicator/message, shortcuts, and extension notifications.
- **RPC:** only documented compatible fire-and-forget status/widget/notification behavior; no assumption that header or working-indicator calls render.
- **Print/JSON:** no visual rendering or terminal-only operations.
- **Shutdown/off:** explicitly clear namespaced status/widget, restore the built-in header, and restore default working indicator/message/visibility.

### Compatibility decisions

- Use only public exports from `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`.
- Keep presentation and telemetry aggregation pure and independently testable.
- Use `setStatus`, not `setFooter`, for the MVP because `setFooter` replaces Pi's entire footer.
- Never auto-select the theme because there is no public getter for safely restoring the prior theme.
- Never change the terminal title in the MVP because there is no documented restore-original-title API.
- Never import installed `dist/` files, private schemas, or gentle-pi runtime code.
- Explicitly clean up every extension-owned UI surface; do not assume host cleanup semantics.
- Namespace command names, status/widget keys, and internal state with `nox-gentle-shell`.

## Out of scope

- system or process CPU, RAM, battery, and process-tree telemetry;
- OS polling or Node process inspection for machine metrics;
- exact continuously streaming token or cost totals;
- replacement of Pi's full footer;
- global restyling or interception of Pi/core alerts;
- automatic theme switching or restoration;
- monkey patches, overlays, built-in tool overrides, or private `dist/` imports;
- copying or depending on `/home/jesus/code/gentle-pi` implementation files.

## Task plan

### GS-1 — Package scaffold and public resource loading

- [x] Create the npm/TypeScript package scaffold.
- [x] Declare the extension factory and theme directory through the `pi` manifest.
- [x] Verify package resources with `DefaultResourceLoader` and no extension/theme diagnostics.

Evidence: `npm run build` passed; package loading tests passed.

### GS-2 — Theme and pure responsive presentation

- [x] Reconcile the packaged theme name and colors with the existing `nox` palette while keeping the theme schema-aligned and standalone.
- [x] Add width-safe pure header, status, and extension-alert renderers.
- [x] Extend the header renderer into full, compact, and minimal Nox banner variants without finalizing user-owned symbols prematurely.
- [x] Cover negative, zero, narrow, ASCII, CJK, emoji/ZWJ, combining, and ANSI width cases.

Reopened rationale: the user selected the existing `nox` theme as the canonical palette after the initial `gentle-shell` theme was completed. The renderers and width evidence remained valid while the theme identity/palette and banner variants were completed.

TDD evidence: RED failed on missing `renderNoxBanner`, absent `themes/nox.json`, and the old `gentle-shell` identity. GREEN passed 11/11. TRIANGULATE added semantic boundary and extremely narrow cases and passed 12/12. REFACTOR extracted shared banner formatting and remained 12/12.

Verification evidence: writer build/tests/theme replacement checks passed; independent verification passed build, 12/12 tests, and theme replacement checks; parent spot-check passed 12/12; primary LSP diagnostics were clean. The known private theme-schema path remains assigned to GS-3. No commit exists because commit authorization has not been given.

### GS-3 — Public-contract hardening

- [ ] Replace the theme test's private `dist/.../theme-schema.json` dependency with a project-owned validation of the documented theme contract.
- [ ] Test manifest theme discovery and public loader diagnostics without private imports.
- [ ] Define stable `nox-gentle-shell` namespaced identifiers for status, widget, commands, and shortcuts.
- [ ] Document supported Pi baseline and peer-dependency policy without claiming unrestricted compatibility.

Checks:

- `npm run build`
- `npm run test`
- repository search finds no runtime or test imports from Pi `dist/` paths or gentle-pi sources

### GS-4 — Telemetry domain and presentation

- [ ] Add pure telemetry types and aggregation from public session entries.
- [ ] Aggregate finalized input/output/cache/total tokens and cost without mutating session data.
- [ ] Model unavailable and post-compaction context usage explicitly.
- [ ] Track turns and concurrent active tools through deterministic state transitions.
- [ ] Add compact status and detailed widget renderers with width-safe degradation.
- [ ] Test assistant, tool-result, compaction, branch-summary, missing-usage, resumed-session, and concurrent-tool cases.

Checks:

- focused telemetry tests
- `npm run build`
- `npm run test`

### GS-5 — Public lifecycle integration and controls

- [ ] Integrate the branded startup banner/header through `setHeader` in TUI mode.
- [ ] Publish compact telemetry through namespaced `setStatus` without replacing the footer.
- [ ] Publish detailed telemetry through a namespaced `setWidget` only in detailed mode.
- [ ] Refresh telemetry after relevant session, message, model, compaction, turn, and tool events.
- [ ] Apply and restore the working indicator/message through public APIs.
- [ ] Register `/nox-gentle-shell` modes and header controls.
- [ ] Register low-conflict TUI shortcuts with slash-command fallbacks.
- [ ] Guard behavior by `ctx.hasUI` and `ctx.mode` according to the mode matrix.
- [ ] Clear or restore every extension-owned UI surface on `off` and `session_shutdown`.
- [ ] Add lifecycle tests with mocked public contexts; no live TUI required.

Checks:

- focused lifecycle/command tests
- `npm run build`
- `npm run test`

### GS-6 — Packaging, documentation, and compatibility verification

- [ ] Add README installation, activation, configuration, telemetry semantics, commands, shortcuts, and screenshots/examples.
- [ ] Document TUI/RPC/print/JSON behavior and known shortcut collision limits.
- [ ] Document that built-in/core alerts cannot be globally restyled; only extension-owned notifications are branded.
- [ ] Add an explicit npm publication allowlist so tests, ODD artifacts, and local tooling are excluded.
- [ ] Verify the packed file list and package installation path.
- [ ] Run a manual compatibility matrix for TUI, RPC, print, and JSON modes where feasible.
- [ ] Record any skipped environment-dependent checks honestly.

Checks:

- `npm run build`
- `npm run test`
- `npm pack --dry-run`
- primary LSP diagnostics
- pi-lens diagnostics

## Acceptance criteria

- The package loads through Pi's documented package manifest with no extension or theme diagnostics.
- Runtime and tests import only public package exports; no Pi `dist/` path or gentle-pi source is referenced.
- Full, compact, and minimal banner variants plus status/widget rendering remain within supplied terminal widths.
- Compact telemetry reports available context, finalized usage/cost, and active-tool state without claiming unavailable values.
- The native footer remains installed; telemetry uses a namespaced status entry.
- The detailed widget is opt-in and removable.
- Commands provide a reliable fallback for every shortcut-controlled feature.
- Visual state reacts to documented lifecycle events and concurrent tool activity.
- TUI, RPC, print, and JSON behavior matches the documented mode matrix.
- `off` and shutdown restore built-in header/working behavior and clear extension-owned status/widget state.
- The extension never auto-selects a theme or changes the terminal title.
- Documentation explains telemetry limitations, shortcut collision behavior, and extension-owned-only alerts.
- The npm tarball contains only runtime assets, required metadata, and user documentation.

## Verification and delivery

- Test runner: `npm test` (`tsx --test test/*.test.ts`).
- Build runner: `npm run build` (`tsc`).
- Effective TDD mode: strict TDD, explicitly selected by the user on 2026-09-17.
- For GS-3 through GS-5, record observed RED, minimal GREEN, TRIANGULATE where another case is needed, and REFACTOR evidence using `npm test`; never infer RED from a test written after implementation.
- Forecast: approximately 550–750 authored changed lines across GS-3 through GS-6.
- Delivery strategy: `ask-on-risk`; if the implementation exceeds roughly 400 authored changed lines before a delivery boundary, choose a chain strategy before the next commit.
- No commits or remote currently exist. Commit, push, and PR actions require explicit user authorization under repository safety policy.

## Current progress

- Completed: GS-1 and GS-2.
- Planned: GS-3 through GS-6.
- Next step: implement GS-3 public-contract hardening under strict TDD.
