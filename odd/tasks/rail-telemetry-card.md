# Rail Telemetry Card

## Objective

Remove duplicated Nox telemetry from the fullscreen rail and present detailed mode inside one width-safe bordered card.

## Problem

In detailed mode, Nox publishes the same telemetry through Pi's compact integration status and the fullscreen rail detail surface. The compact status is rendered against a fixed width that is wider than the actual Status card, so its final segments are clipped.

## Decision

The user selected one surface per mode:

- `compact` renders only the compact integration status;
- `detailed` keeps the Nox integration readiness entry but removes the compact telemetry status and renders telemetry in one bordered card below the host Status card;
- `off` renders neither Nox telemetry surface;
- the detailed card uses Nox's icon vocabulary instead of repeated text labels wherever the meaning remains unambiguous;
- the card title keeps a static `Nox 🌑` brand mark;
- the approved lunar cycle `🌑`, `☾`, `◯`, `☽`, `🌑` moves to Gentle Pi's host-owned custom-editor prompt and animates across the whole agent run without using Pi's singleton working indicator.

## Constraints

- Extend the local Gentle Pi fullscreen contribution contract compatibly so the host supplies actual rail width; do not publish Gentle Pi upstream.
- Preserve backward compatibility: Nox must still render safely when an older host invokes the callback without a width.
- Every rendered line must stay within the width supplied by the host.
- Preserve finalized-telemetry semantics and existing mode commands.
- Strict TDD inherited from the active project decision.
- Test runner: `npm test` (`tsx --test test/*.test.ts`).
- Technical artifacts remain in English.
- No commits, pushes, or pull requests without explicit user authorization.

## Delivery

- Route: delegated direct implementation because production behavior and non-trivial tests change across Nox and the local Gentle Pi host.
- Trigger: multi-file writer rule plus sequential cross-repository writes.
- Forecast: approximately 260–380 authored changed lines across both repositories, excluding this task document.
- Strategy: one Nox work unit plus one local-only Gentle Pi host commit. Neither commit is created until explicit user authorization is provided.
- Update workflow: the existing `gentle-dev-update` script needs no code change; once committed, it preserves and rebases the local Gentle Pi contract patch, stopping safely on conflicts.

## Tasks

### RTC-1 — Implement one width-safe surface per mode

- [x] Add RED tests for detailed-mode status suppression and bordered-card width safety.
- [x] Suppress compact telemetry status while detailed mode is active.
- [x] Render detailed telemetry as a single bordered card using the host-provided width.
- [x] Replace detailed text labels with Nox telemetry icons while preserving accessible, unambiguous values.
- [x] Animate the approved lunar cycle in the card title only while tools are active, with cleanup on idle, mode change, and shutdown.
- [x] Preserve compact and off behavior without calling `setWorkingIndicator`.
- [x] Run focused tests, the full test suite, build, and diff checks.
- [x] Resolve the fullscreen rail-width contract gap through the compatible local host extension.

Route: delegated to `gentle-ai-worker` under the multi-file writer trigger. The initial fixed-width blocker was corrected through RTC-1A and independently verified across both repositories.

### RTC-1A — Supply actual rail width from the local host

- [x] Map the current Gentle Pi contribution registry, rail layout, and tests without modifying unrelated host behavior.
- [x] Add a backward-compatible width-aware render callback to the local Gentle Pi contract.
- [x] Pass the actual host rail width when rendering contributions.
- [x] Update Nox to consume the supplied width and retain a safe older-host fallback.
- [x] Add RED/GREEN coverage in both repositories.
- [x] Keep the local Gentle Pi updater workflow unchanged and leave both repositories uncommitted pending explicit authorization.

Route: sequential delegated writers, Gentle Pi host first and Nox consumer second; no parallel writes across repositories.

### RTC-3 — Centralize lunar animation in the host prompt

- [x] Replace Gentle Pi's idle flower with `🌑` and its working flower frames with the normalized lunar cycle.
- [x] Preserve Gentle Pi animation policy, queued-state semantics, cleanup, and width safety across mixed one/two-cell glyphs.
- [x] Change the Nox card title to static `Nox 🌑` and remove its timer/frame lifecycle.
- [x] Preserve the card's `⚙` tool-specific activity signal and all compact/detailed/off behavior.
- [x] Update strict-TDD coverage and docs in both repositories.
- [x] Remove the three prompt-specific stale `petal` comments identified by independent verification; preserve unrelated Gentle flower branding.
- [x] Leave both repositories uncommitted pending explicit authorization; do not modify `gentle-dev-update`.

Route: sequential delegated writers, Gentle Pi prompt first and Nox cleanup second; no parallel cross-repository writes.

### RTC-4 — Align the telemetry card with the active theme

- [x] Match Gentle card geometry with a titled top rule and one-cell content padding while preserving the host width budget.
- [x] Use public semantic theme roles: `border` for the frame, `accent` for `Nox 🌑`, `muted` for metric glyphs, `dim` for separators, and `text` for values.
- [x] Pass the live public Pi theme through accepted rail, widget fallback, and RPC rendering without hardcoded color values.
- [x] Preserve ANSI-aware width safety, narrow-width fallbacks, theme-change invalidation behavior, and unstyled pure-render compatibility.
- [x] Add strict RED/GREEN coverage for semantic roles, exact visible widths, fallback surfaces, and documentation.

Route: delegated Nox writer after RTC-3 terminology cleanup; no parallel writes.

### RTC-2 — Verify the visual contract

- [x] Confirm detailed mode has one telemetry surface and no duplicated compact status.
- [x] Confirm every detailed-card line respects narrow and normal host widths.
- [x] Record automated checks and the remaining live-host visual validation gap.
- [ ] Confirm the final themed card, host-owned lunar prompt, and resize behavior in a reloaded real Pi fullscreen session. Skipped when the user elected to close the change after automated verification.
- [x] Confirm lunar repaint with a 20-second active Bash tool; the title cycled through lunar frames and returned to idle afterward.
- [x] Replace the remaining `model` text label with the approved `◆` icon-led row.

Route: verification follows the RDD-aware assessment after the writer returns.

## Acceptance Criteria

- Detailed mode does not publish compact telemetry through `setStatus`.
- Detailed telemetry is enclosed in one visually coherent card.
- Card borders and content never exceed the width passed to `render()`.
- Detailed rows use the established Nox telemetry symbols instead of redundant labels such as `context`, `usage`, `cost`, and `tools`.
- The Nox card always shows static `Nox 🌑` and owns no animation timer.
- The Gentle Pi prompt owns the only lunar animation and preserves its agent-wide working lifecycle and animation policy.
- Nox and Gentle Pi never call Pi's singleton `setWorkingIndicator` for this feature.
- Compact mode still publishes its compact integration status.
- Off mode clears both namespaced surfaces.
- Focused tests, full tests, build, and `git diff --check` pass.

## Progress

- User approved the one-surface-per-mode layout, a bordered icon-led card, and restoring the lunar spinner inside that card rather than through Pi's singleton working indicator.
- Initial implementation passed 37 focused tests, 59 full tests, build, and diff checks.
- Independent verification confirmed mode behavior and timer cleanup but found that accepted rail contributions still render at fixed `RENDER_WIDTH` (120) because the public v1 callback receives no host width. Widget fallback is width-safe; accepted rail fit is not.
- The user approved the recommended cross-repository correction: extend the local Gentle Pi contract compatibly and keep it as a local-only patch managed by the existing updater.
- Gentle Pi host implementation completed without commit: 54 diff lines across five allowed files. Strict RED observed 2 failures; focused GREEN passed 132/132; typecheck reported no regressions; full suite passed 2,883 with 38 skipped and 0 failed; diff check passed.
- The host now forwards 47 columns to fullscreen rail consumers and actual widget width to fallback renderers while preserving zero-argument consumers.
- Nox consumer correction completed without commit: 46 diff lines across three allowed files. RED observed one fixed-width failure; focused GREEN passed 38/38; full suite passed 60/60; build and diff check passed. Valid positive host widths now control the card, while omitted/undefined width retains the 120-column older-host fallback.
- Independent cross-repository verification passed all seven prescribed commands and current-byte structural checks. Gentle Pi focused tests passed 132/132 with no typecheck regressions; Nox focused tests passed 38/38, full tests passed 60/60, and build passed.
- Native Nox reliability review `review-20608d08da030aea` approved the automated candidate with one non-blocking informational finding at `extensions/runtime.ts:48-51`; acknowledgement burned at target `sha256:5ce2df499aa4ad7ac57fdf404194a41b9f3ef8cc06c3eebb2a4f7c86926ba7e9`.
- Initial 10-second live observation missed the active tab and was inconclusive, not a repaint defect.
- A repeated 20-second agent Bash tool visibly animated the lunar title and returned the activity row to `—` on completion, confirming the accepted-lease repaint path works live.
- The live card retained the `model` text label instead of the approved `◆` model row.
- The focused `◆` correction passed 16/16 presentation tests; the user authorized aligning one stale runtime assertion outside the initial worker surface.
- The aligned focused suites passed 31/31, the full suite passed 62/62, build passed, and diff check passed.
- Independent model-icon verification passed 40 focused tests, 62 full tests, build, and diff check.
- Live reload confirmed the width-safe card, no duplicated compact telemetry, `◆` model row, and working lunar card animation.
- The user then selected a revised architecture: keep static `Nox 🌑` branding in the card and move the only active lunar animation to Gentle Pi's custom-editor prompt, replacing its flower frames.
- RTC-3 Gentle Pi host implementation completed without commit: strict RED produced 10 intended failures; focused GREEN/REFACTOR passed 112/112; typecheck had no regressions; full suite passed 2,884 with 38 skipped and 0 failed; diff check and diagnostics passed. Mixed-width frames reserve two visible cells to prevent label jitter.
- RTC-3 Nox cleanup completed without commit: RED proved the animated title and timer still existed; focused GREEN passed 40/40; full suite passed 62/62; build and diff check passed. The card now stays `Nox 🌑`, owns no timer/frame state, and refreshes only on real lifecycle events while preserving the `⚙` activity row.
- Independent RTC-3 verification found no functional defect and all prescribed commands passed; its three prompt-specific stale `petal` comments were then mechanically corrected with diff/readback checks and no executable changes.
- The user authorized one final visual improvement: align the Nox telemetry card geometry and colors with the active semantic theme rather than terminal-default styling or hardcoded Nox hex values.
- RTC-4 implementation completed without commit: RED produced 7 expected styling/geometry failures; focused GREEN passed 45/45; full suite passed 67/67; build and diff check passed. Render-time theme selection is covered for rail, fallback widget, and RPC; widths 0/1/2/8/20/47/80 and Unicode are covered.
- Independent RTC-4 current-byte verification repeated 45/45 focused tests, 67/67 full tests, build, diff check, status/diff inspection, and found no deterministic defect or mutation. Parent primary LSP diagnostics were clean across the four changed source/test TypeScript files.

## Evidence

- Initial screenshot: compact telemetry was duplicated and clipped in detailed mode.
- Intermediate live validation: width-safe card, deduplication, `◆` model row, and the original card-local lunar cycle rendered correctly.
- Gentle Pi final automated verification: 148/148 focused tests passed; typecheck reported no regressions; the full suite passed 2,884 tests with 38 skipped and 0 failed; diff check passed.
- Nox final automated verification: 45/45 focused tests, 67/67 full tests, build, diff check, and primary LSP diagnostics passed.
- Final live reload after moving the lunar cycle to the prompt and applying semantic card theming: skipped by user choice.
- Both repositories remain uncommitted. Commit evidence requires explicit user authorization.

## Next Step

If delivery is desired later, explicitly authorize the separate Nox work-unit commit and local-only Gentle Pi host commit; then reload once to inspect the final themed prompt/card before publication or updater use.
