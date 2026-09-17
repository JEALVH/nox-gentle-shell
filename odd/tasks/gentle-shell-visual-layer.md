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
◉ 42% · ↑ 18.2k · ↓ 3.1k · $ 0.08 · ⚙ 1
```

Provisional replaceable symbol mapping: `◉` context, `↑` input, `↓` output, `◇` cache, `$` cost, and `⚙` tools. These belong to presentation configuration, not telemetry aggregation logic.

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
- The packaged `themes/nox.json` owns the accepted Nox palette locally and has no runtime dependency on gentle-pi.
- Telemetry symbols are `◉` context, `↑` input, `↓` output, `◇` cache, `$` cost, and `⚙` tools.
- The working indicator uses the lunar cycle `🌑`, `☾`, `◯`, `☽`, `🌑` (new, waxing, full, waning, new).
- Alert symbols are `ℹ` info, `⚠` warning, `✖` error, and `✔` success; idle/success status may use `✓`.
- Approved symbols remain replaceable presentation configuration. Width-sensitive rendering must use terminal-visible width rather than JavaScript string length.

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

Verification evidence: writer build/tests/theme replacement checks passed; independent verification passed build, 12/12 tests, and theme replacement checks; parent spot-check passed 12/12; primary LSP diagnostics were clean. The known private theme-schema path remains assigned to GS-3.

Commit evidence: `588701d` (`feat(shell): scaffold Nox visual layer`) on `feature/nox-visual-layer`. Native review was unavailable for this root commit because no prior base ref exists (`empty_candidate_base_ref_required`); no lineage was created. The independent-verifier fallback completed successfully.

### GS-3 — Public-contract hardening

- [x] Replace the theme test's private `dist/.../theme-schema.json` dependency with a project-owned validation of the documented theme contract.
- [x] Test manifest theme discovery and public loader diagnostics without private imports.
- [x] Define stable `nox-gentle-shell` namespaced identifiers for status, widget, commands, and shortcuts.
- [x] Document supported Pi baseline and peer-dependency policy without claiming unrestricted compatibility.

TDD evidence: RED failed on the existing private Pi path, missing constants module, and wildcard peer ranges. GREEN passed 15/15. TRIANGULATE added collision, namespace-boundary, and distinct-shortcut cases; REFACTOR passed 16/16.

Verification evidence: writer build/tests/public-boundary/offline-lock/diff checks passed. Independent verification initially found incomplete hex/namespace/optional-token checks; corrections enforced six-digit hex, own-property variable references, optional-token separation, and lookalike rejection. Re-verification passed all commands and 16/16 tests. Parent spot-check passed 16/16; primary LSP and pi-lens diagnostics were clean.

Commit evidence: `43105b1` (`refactor(shell): harden public contracts`) on `feature/nox-public-contracts`.

Native review evidence: medium-tier reliability review `review-72139ff5abb63136` approved and acknowledged; authority burned at revision `sha256:202161663f1cf4a470a3259053c1cdf533e562f41f217172684d8e5ea52f8593`. One informational warning (`R3-incomplete-public-boundary-guard`) remains separate later work and did not open correction.

### GS-4 — Telemetry domain and presentation

- [x] Add pure telemetry types and aggregation from public session entries.
- [x] Aggregate finalized input/output/cache/total tokens and cost without mutating session data.
- [x] Model unavailable and post-compaction context usage explicitly.
- [x] Track turns and concurrent active tools through deterministic state transitions.
- [x] Add compact status and detailed widget renderers with width-safe degradation.
- [x] Test assistant, tool-result, compaction, branch-summary, missing-usage, resumed-session, and concurrent-tool cases.

TDD evidence: RED failed on the missing telemetry module. GREEN passed 22/22. TRIANGULATE added post-compaction null context, resumed/non-assistant usage, concurrent/unknown tools, Unicode widths, independent empty snapshots, missing cost, and ordered segment removal. REFACTOR extracted independent usage creation and passed 26/26.

Verification evidence: writer build/tests/public-boundary/diff checks passed. Independent verification found shared mutable empty usage; regression tests and a per-call usage factory fixed it. Re-verification passed build, 26/26 tests, public-boundary grep, and diff check. Parent spot-check passed 26/26; primary LSP and pi-lens diagnostics were clean.

Commit evidence: `d75a644` (`feat(shell): add session telemetry views`) on `feature/nox-telemetry`.

Native review evidence: medium-tier reliability review `review-15632aea1c39c4c2` approved and acknowledged; authority burned at revision `sha256:428a521a5ce1d84093455284d14e7ef8f0f035cf4c44a79b9fc0cc7750e39477` with no findings.

### GS-5 — Public lifecycle integration and controls

- [x] Integrate the branded startup banner/header through `setHeader` in TUI mode.
- [x] Publish compact telemetry through namespaced `setStatus` without replacing the footer.
- [x] Publish detailed telemetry through a namespaced `setWidget` only in detailed mode.
- [x] Refresh telemetry after relevant session, message, model, compaction, turn, and tool events.
- [x] Apply and restore the lunar working indicator/message through public APIs.
- [x] Register `/nox-gentle-shell` modes and header controls.
- [x] Register low-conflict TUI shortcuts with slash-command fallbacks.
- [x] Guard behavior by `ctx.hasUI` and `ctx.mode` according to the mode matrix.
- [x] Clear or restore every extension-owned UI surface on `off` and `session_shutdown`.
- [x] Add lifecycle tests with mocked public contexts; no live TUI required.

TDD evidence: RED failed on the missing runtime controller. GREEN implemented minimal session start, modes, refresh, and cleanup. TRIANGULATE covered RPC/no-UI behavior, invalid/missing/extra command arguments, shortcut cycles, concurrent tools, repeated cleanup, and equal visible-width lunar frames. REFACTOR passed 35/35 tests.

Verification evidence: writer build/tests/public-boundary/diff checks passed. Independent verification found no runtime defects and identified low direct-coverage gaps; added tests now cover print-mode commands, every owned cleanup surface, state/context/tool reset, and repeated shutdown. Re-verification passed build, 35/35 tests, public-boundary grep, and diff check. Parent spot-check passed 35/35; primary LSP and pi-lens diagnostics were clean. Live TUI/RPC manual integration remains for GS-6.

Commit evidence: pending explicit authorization for the GS-5 work-unit commit.

### GS-6 — Packaging, documentation, and compatibility verification

- [ ] Add README installation, activation, configuration, telemetry semantics, commands, shortcuts, and screenshots/examples.
- [ ] Document TUI/RPC/print/JSON behavior and known shortcut collision limits.
- [ ] Document that built-in/core alerts cannot be globally restyled; only extension-owned notifications are branded.
- [ ] Add an explicit npm publication allowlist so tests, ODD artifacts, and local tooling are excluded.
- [ ] Verify the packed file list and package installation path.
- [ ] Run a manual compatibility matrix for TUI, RPC, print, and JSON modes where feasible.
- [ ] Strengthen the public-boundary guard so non-root/private Pi subpath imports cannot bypass the contract test (`R3-incomplete-public-boundary-guard`).
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
- Delivery strategy: `feature-branch-chain`, explicitly selected after the initial work unit reached 726 authored changed lines excluding the lockfile and ODD document.
- Slice 1: `feature/nox-visual-layer`, commit `588701d`, contains GS-1 and GS-2.
- Future commits, pushes, and PR actions continue to require explicit user authorization under repository safety policy.

## Current progress

- Completed, committed, and reviewed: GS-1 through GS-4.
- Completed implementation/verification: GS-5 lifecycle integration and controls on `feature/nox-lifecycle`.
- Pending work-unit boundary: GS-5 commit authorization.
- Planned for the next session: GS-6 packaging, documentation, compatibility matrix, and final verification.
- Next step: close the GS-5 commit boundary, save session state, and resume GS-6 in a fresh session.
