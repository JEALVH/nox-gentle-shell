# Fullscreen Contribution Contract v1

## Objective

Deliver an end-to-end, versioned fullscreen contribution contract: Gentle Shell hosts bounded fullscreen contributions through Pi's public event bus, and Nox consumes the v1 rail surface without importing private host internals.

## Problem and rationale

Gentle Shell currently owns fullscreen header and sidebar composition through private layout and TUI modules. Nox intentionally relinquished singleton header and working-presentation ownership, so it cannot place detailed telemetry in the fullscreen rail through a supported API.

A public event-bus handshake preserves package independence. The host remains responsible for layout, sizing, theme, ordering, clipping, breakpoints, resize, and lifecycle cleanup; consumers exchange only structural declarations and rendered text lines.

## Scope

- Add a session-scoped v1 contribution registry to `/home/jesus/code/gentle-pi-worktrees/fullscreen-contribution-registry`.
- Support bounded `rail` and `header` declarations with globally namespaced keys.
- Provide explicit `update`, `invalidate`, and idempotent `dispose` lease operations.
- Integrate host-owned contribution slots into Gentle Shell fullscreen rendering without exposing layout roots, layout-node symbols, TUI objects, or private fields.
- Add documented widget-or-hidden fallback semantics outside fullscreen.
- Adapt Nox in `/home/jesus/Freelance/nox-gentle-shell-worktrees/fullscreen-contribution-v1` to request a rail lease for detailed telemetry while preserving compact status and safe fallback behavior.
- Add unit, integration, package-boundary, and live compatibility evidence.

## Non-goals

- No direct dependency or deep import between Nox and `gentle-pi`.
- No consumer control over absolute placement, dimensions, host breakpoints, raw theme objects, or layout nodes.
- No replacement of Nox compact status behavior.
- No coupling to Gentle Shell's private footer-row reclamation implementation.
- No commit, push, pull request, or release without explicit user authorization.

## Constraints

- Public Pi extension APIs only; transport is `pi.events`.
- Technical artifacts remain in English.
- The host source is authoritative where historical task notes conflict with current implementation.
- Work occurs only in the two clean sibling worktrees named above; the dirty/ahead host checkout is not modified.
- One writer at a time; bounded multi-file implementation is delegated.
- Each work unit keeps behavior, tests, and relevant docs together.
- Strict TDD is enabled by explicit user choice for both repositories: observe RED, then GREEN, triangulate where useful, and REFACTOR while preserving GREEN.
- Known runners:
  - Host focused: `node --experimental-strip-types --test tests/<file>.test.ts`
  - Host full: `pnpm test`; types: `pnpm run typecheck`
  - Nox full: `npm test`; build: `npm run build`; package boundary: `npm pack --dry-run --json`

## Contract shape

- Request event: versioned Gentle Shell fullscreen-contribution request over `pi.events`.
- Declaration: namespaced `key`, `surface: "rail" | "header"`, bounded string-line renderer, and widget-or-hidden fallback policy.
- Lease: session-scoped `update(nextDeclaration)`, `invalidate()`, and idempotent `dispose()`.
- Host guarantees: declaration validation, duplicate-key handling, deterministic host-owned ordering, exception isolation, clipping, header one-row limit, rail scrolling, resize invalidation, breakpoint ownership, and session cleanup.
- Nox behavior: request a rail contribution only for detailed mode; retain namespaced compact status; preserve current detailed widget/RPC fallback when the host is absent, rejects the request, or does not support v1; remain inert in print/JSON modes.

## Delivery and review workload

- Route: delegated direct implementation because every implementation work unit spans multiple non-trivial files.
- Forecast: approximately 1,100–1,500 authored changed lines across both repositories, including tests and docs.
- Delivery strategy: `ask-on-risk`.
- Chain strategy: `stacked-to-main`, selected by the user for the host's two implementation units. FSC-2 and FSC-3 local commits were explicitly authorized; push and PR remain unauthorized.
- Planned reviewable units:
  1. Host registry model and contract tests (~300–400 lines).
  2. Host fullscreen adapter, integration tests, and documentation (~350–450 lines).
  3. Nox v1 consumer, fallback transition, tests, and README (~300–400 lines).
  4. Cross-package fixtures and live compatibility evidence (~150–250 lines; fold evidence into the relevant repository unit where cohesive).

## Tasks

### FSC-1 — Establish safe worktrees and durable plan

- [x] Map the current host and consumer architecture read-only.
- [x] Create clean feature worktrees from the recorded local committed boundaries.
- [x] Leave the original host checkout and its unrelated untracked files untouched.
- [x] Resolve strict TDD mode for this feature: enabled by explicit user choice.
- [x] Select `stacked-to-main` for the host units before the first commit.

Route: parent orchestration; no source implementation.

### FSC-2 — Implement the host registry model

- [x] Add RED contract tests for version/key validation, duplicate keys, deterministic ordering, update, invalidate, dispose, exception isolation, and fallback selection.
- [x] Implement the minimal session-scoped v1 registry and typed event-bus request model.
- [x] TRIANGULATE sparse arrays and caller mutation, then REFACTOR without exposing private TUI or layout types.
- [x] Run focused host tests and typecheck.
- [x] Create the user-authorized FSC-2 work-unit commit and complete its native review.

Route: delegated to `gentle-ai-worker` under the multi-file writer trigger.

### FSC-3 — Integrate host fullscreen surfaces

- [x] Add RED integration tests for one host-owned external rail/header slot, resize, clipping, ordering, and no-contribution parity.
- [x] Wire registry state into Gentle Shell session lifecycle and fullscreen rendering.
- [x] Ensure stale sessions and consumer shutdown ordering cannot retain contributions.
- [x] Document the public v1 contract and fallback semantics.
- [x] Run focused host tests, full host tests, typecheck, LSP, and diff checks after lossless reconstruction.
- [x] Complete independent high-risk verification on the exact reconstructed candidate; verdict is partial only for the intermittent runtime-harness failure.
- [x] Classify the recurring runtime-harness failure as an exact pre-existing FSC-2 base failure under behaviorally equivalent assets.
- [x] Complete and acknowledge native high-tier review for the exact reconstructed final target.
- [x] Create the user-authorized FSC-3 work-unit commit `8c5ac0cdd700b47d4c6c2951f341460656b8274c` (`feat(shell): integrate fullscreen contributions`).

Route: delegated to `gentle-ai-worker` under the multi-file writer trigger.

### FSC-4 — Add the Nox v1 consumer

- [x] Add RED tests for optional registration, accepted rail leases, rejection/missing host, mode transitions, repeated sessions, and shutdown disposal.
- [x] Add the public event-bus adapter and request a rail contribution only in detailed TUI mode.
- [x] Preserve compact status and existing widget/RPC/print/JSON behavior under every fallback path.
- [x] Update README behavior and compatibility documentation.
- [x] Run focused Nox tests, full tests, build, package dry run, LSP, and diff checks.
- [x] Create user-authorized commit `51ceeddeab2ba21ba7db0f764caf7f4c727c8697` (`feat(shell): consume fullscreen contributions`) and complete/acknowledge its native committed-range review.

Route: delegated to `gentle-ai-worker` under the multi-file writer trigger; dependency provisioning and the packaging-test surface expansion were explicitly authorized.

### FSC-5 — Verify end-to-end compatibility

- [x] Confirm existing consumer-shaped host fixtures and host-shaped Nox event-bus mocks cover the cross-package contract without additional source changes.
- [x] Verify no cross-package import, private layout access, or published-package boundary regression exists.
- [x] Run independent committed-range and cross-package checks required by native risk assessment and review routing.
- [x] Perform the live regular/fullscreen, resize, detailed → compact → off, reload, fresh-session/quit, and RPC matrix; retain unit coverage for shutdown lease disposal.
- [x] Record exact verification evidence and remaining environment/transport limitations.
- [x] Commit final verification evidence as `b06e714b1ebaa1705d050d9fcf766764f35fec89`; its low-risk non-executable native review `review-231a43dbf309a85d` was approved and acknowledged.

Route: delegated verification according to native risk assessment and RDD state.

## Acceptance criteria

- Gentle Shell accepts valid v1 fullscreen contributions through `pi.events` and rejects invalid/duplicate/unknown declarations without destabilizing the host.
- Consumers receive a session-scoped lease whose update, invalidation, and disposal semantics are deterministic and idempotent.
- Host layout and theme ownership remain private and authoritative.
- Gentle Shell behaves identically when no external contribution exists.
- Nox detailed telemetry uses the rail when v1 is accepted and safely resumes its existing widget/hidden fallback when it is not.
- Nox compact status remains namespaced and independent.
- Reload, resize, shutdown, and mode changes leave no stale contributions.
- Both repositories pass their focused, full, type/build, and package-boundary checks.
- Live TUI evidence confirms coexistence without singleton-surface ownership or theme-collision warnings.

## Progress

Architecture mapping, clean worktree setup, strict-TDD selection, and the `stacked-to-main` host strategy are complete. FSC-2 is complete at commit `f8253d90363e2264fb4a1d1cfb3c7dbb5e604913` and its medium-tier native reliability review is approved and acknowledged. FSC-3 is complete at commit `8c5ac0cdd700b47d4c6c2951f341460656b8274c`; its exact five-path +465/-22 candidate was reviewed and committed without drift. Both cohesive host units exceed their individual 300–400-line forecasts; splitting production code from behavior tests would weaken them, so a future `size:exception` recommendation is recorded instead of code-golf or artificial slicing. Running authored-line count: 952 across the two committed host work units. Focused tests, typecheck baseline, primary LSP delta, and diff-check passed on the reconstructed FSC-3 bytes. The full suite passed once and reproduced its prior runtime-harness failure under independent verification; clean-base differential verification then reproduced the exact failure 3/3 under behaviorally equivalent copied assets, proving it pre-existing. Native final-candidate assessment was high risk (`process_boundary`); four-lens review of the exact reconstructed target approved and was acknowledged. The accidental review lineage for the obsolete churned target remains parked and must not be treated as review of this candidate. FSC-4 is complete at commit `51ceeddeab2ba21ba7db0f764caf7f4c727c8697`; its cohesive production, tests, documentation, and ODD evidence total +635/-10 committed lines. The implementation portion was +460/-10 excluding the durable task artifact, slightly above the 300–400 forecast; splitting its adapter from lifecycle/fallback tests would weaken the work unit, so no size-only split or code-golf was used. Native high-tier review approved and was acknowledged. FSC-5 compatibility verification is complete: structural, type, package, tests/build, live TUI, lifecycle, resize, and RPC behavior passed. The isolated harness could not independently prove network inactivity, and RPC transport cannot expose internal rail-event absence; unit/control-flow evidence covers the latter. Final evidence is committed at `b06e714b1ebaa1705d050d9fcf766764f35fec89`; its low-risk native review was approved and acknowledged. Independent documentation verification confirmed exact one-file scope and evidence consistency, then identified the stale pre-commit wording and an overbroad live-shutdown claim corrected by this closeout update. Push and PR creation remain unauthorized.

## Verification evidence

- Read-only architecture map completed across both repositories.
- Host worktree: `/home/jesus/code/gentle-pi-worktrees/fullscreen-contribution-registry`, branch `feature/fullscreen-contribution-v1`, base `f9899156803f`.
- Nox worktree: `/home/jesus/Freelance/nox-gentle-shell-worktrees/fullscreen-contribution-v1`, branch `feature/fullscreen-contribution-v1`, base `fe017b79336c`.
- Both new worktrees were clean immediately after creation.
- FSC-2 strict TDD: initial RED had 5 failures with `fullscreen contribution registry must be exported`; minimum GREEN passed 7/7; snapshot triangulation produced an additional RED then GREEN 8/8; sparse-array verification produced a regression RED then final GREEN 9/9.
- FSC-2 files: `lib/fullscreen-contributions.ts` (224 lines) and `tests/fullscreen-contributions.test.ts` (241 lines), committed together after explicit authorization.
- Worker and independent verifier: focused tests passed 9/9; `pnpm run typecheck` matched the recorded 190-diagnostic baseline with no regressions; `git diff --check` returned no output but does not inspect untracked files; primary LSP reported zero diagnostics.
- Parent structural readback found no scope leak or private TUI/layout/theme export.
- Parent spot-check initially ran from the Nox checkout and failed to locate the host test; diagnosis confirmed no mutation, then the explicit host-worktree rerun passed 9/9.
- Native ambient assessment returned `unassessable` because the native command emitted empty output and did not detect the untracked candidate; its high-risk fallback required writer verification plus an independent verifier, both already completed on the exact current files.
- User authorized the local Conventional Commit only; commit `f8253d90363e2264fb4a1d1cfb3c7dbb5e604913` (`feat(shell): add fullscreen contribution registry`) contains exactly the two FSC-2 files and leaves the host worktree clean.
- The first committed-range review START was rejected before lineage creation because the base SHA was abbreviated. Diagnosis confirmed no mutation; the retry used the full base commit.
- Native medium-tier reliability review `review-787bc8bcbf9ada42` approved and was acknowledged for the exact two-file committed target `sha256:37671e46adea28d03c1ad9e8fec09f242681bfe06bcec0b72269785f7661758d`. Advisory `R3-001` is informational and did not open a correction.
- During FSC-3 the RDD guard requested an explicit timing disposition; the user selected leaving the evolving implementation unreviewed and assessing/reviewing only the exact final candidate.
- FSC-3 `pnpm test` persistently fails outside the authorized surfaces at `tests/runtime-harness.mjs:537`, through `extensions/gentle-ai.ts` and `lib/odd-runtime-delegation-gate.ts`. The user declined scope expansion, so those paths remain untouched and the required-suite failure keeps FSC-3 partial.
- Pi-lens was confirmed to apply its Biome-default formatter to every TypeScript edit because the host worktree has no local formatter config, re-expanding legacy-file churn after reconstruction. The user authorized a temporary uncommitted `.pi-lens.json` containing `{"format":{"enabled":false},"autofix":{"enabled":false}}`; it was deleted before handoff.
- The FSC-3 handoff claimed a focused +294/-22 diff, but parent readback found +2,058/-412 overall and +1,870/-396 in `tests/gentle-shell.test.ts`; that file had 3,303 current lines versus 1,829 at HEAD, and `git diff -w` still showed +1,987/-341. Focused tests independently passed 167/167 and `.pi-lens.json` was absent, but the candidate was not reviewable.
- Read-only diagnosis proved lossless reconstruction is possible: restore exact HEAD test bytes, then reapply only the `visibleWidth` import and the two named FSC-3 tests; the other four diffs are already focused.
- Before the parent's STOP reached the host peer, it accidentally started native high-tier review `review-0db4c4694e6e4460` on churned target `sha256:1f7b8b839b4b2254119afb8734f11f96251de0b4211faee3ff0457d67f3d2500`; no reviewer capture occurred. The user authorized abandonment, but native rejected the supplied reason before confirmed mutation and reconciled STATUS still declares `collect`. The user then authorized reconstruction while leaving this invalid lineage parked and untouched; no reviewer capture or maintenance retry is authorized.
- Reconstruction reached a fresh primary-LSP stop with exact test-name delta and unchanged production/doc hashes. The user authorized only two diagnosed test cleanups in `tests/gentle-shell.test.ts`: inject `theme` through `fakeContext` instead of assigning the readonly property, and correct an existing callback from three arguments to two. The unchanged production TS2556 at `extensions/gentle-shell.ts:109` remains recorded as pre-existing baseline and is not authorized for edit.
- Final reconstruction proof: exactly five authorized paths; docs +23/-0, extension +115/-7, registry +45/-7, sidebar layout +5/-2, test +277/-6; total +465/-22. The test-name delta contains only the two FSC-3 tests, four production/doc hashes stayed unchanged during recovery, `.pi-lens.json` is absent, and parent raw-Git readback matches.
- Reconstructed verification: focused five-suite command passed 167/167; `pnpm run typecheck` passed its 186-diagnostic baseline with no regressions; fresh primary LSP left only the unchanged production TS2556 baseline; `git diff --check` passed; `pnpm test` passed with 2,873 passed / 0 failed / 38 skipped and provider-contract mirror success. The earlier runtime-harness failure did not reproduce and no out-of-scope repair was made.
- Native final-candidate assessment reports high risk because `extensions/gentle-shell.ts` crosses a process boundary. Independent exact-current verification passed focused tests 167/167, typecheck baseline, and diff-check, but `pnpm test` reproduced the unchanged runtime-harness failure after 2,873 passes / 38 skips; verdict is partial solely for that required-command failure.
- Post-verifier raw Git recheck confirmed no deferred formatter mutation: exactly five paths, +465/-22, test +277/-6 and 2,100 lines, clean diff-check, and no `.pi-lens.json`.
- Differential verification reproduced the exact runtime-harness line-537 failure 3/3 on clean FSC-2 base `f8253d90363e2264fb4a1d1cfb3c7dbb5e604913` after replacing a rejected symlink with regular copies of the existing package-local binary assets; the candidate also failed 3/3. Relevant tracked blobs, package metadata, and lockfile match exactly, proving the blocker pre-existing. Candidate patch hash stayed `237529df11d41ec03f5571cc58025648637fcf8eba6e39a30c77db40aa98b63d`.
- The retained diagnostic worktree is `/home/jesus/code/gentle-pi-worktrees/runtime-harness-fsc2-diagnosis`; it has no tracked diff and contains copied ignored `.gentle-ai` assets plus a `node_modules` symlink. No cleanup is authorized yet.
- Ambient INSPECT offered a fresh lineage for reconstructed target `sha256:2c1e1937ed48790e09d84f41a3e75ae5a6736ad466fa557bfdf03547896a49b6`. Native high-tier review `review-59ccfd78232c5e78` ran all four lenses, approved, and was acknowledged. Advisory `R2-001` at `extensions/gentle-shell.ts:984` is informational and did not open a correction.
- Exact pre-commit reconciliation preserved the five-path +465/-22 patch hash `237529df11d41ec03f5571cc58025648637fcf8eba6e39a30c77db40aa98b63d`; user-authorized commit `8c5ac0cdd700b47d4c6c2951f341460656b8274c` contains exactly that candidate and leaves the host worktree clean.
- FSC-4 dependency incident: the isolated feature worktree lacked `node_modules`; user-authorized `npm ci` installed the exact lockfile tree (175 packages, 0 vulnerabilities) without tracked-file mutation, enabling a genuine strict-TDD RED.
- FSC-4 RED failed because `extensions/fullscreen-contribution.js` did not exist; minimal GREEN passed the focused suite 31/31; rejection, absent/late response, malformed lease, update failure, shutdown, RPC, and inert-mode triangulation/refactor passed 32/32.
- Final FSC-4 verification: focused 32/32, full suite 57/57, build passed, package dry run passed with 9 files including `extensions/fullscreen-contribution.ts`, `git diff --check` passed, and primary LSP reported zero errors across the seven changed TypeScript files.
- Parent structural readback confirmed a transport-only local v1 adapter, synchronous lease acceptance, stale/late response isolation, idempotent disposal, detailed-TUI widget suppression only after acceptance, and preserved RPC/print/JSON behavior.
- User-authorized commit `51ceeddeab2ba21ba7db0f764caf7f4c727c8697` contains exactly nine cohesive FSC-4 paths (+635/-10 including the ODD task artifact).
- Native committed-range assessment classified FSC-4 high risk due to the existing packaging subprocess boundary. Independent immutable-range verification passed focused 32/32, full 57/57, build, exact nine-file package dry run, range diff-check, structural boundaries, and clean status.
- Native high-tier four-lens review `review-bef76baad4fd061d` approved target `sha256:4a76f35180820b5d0937a6938a060b2b59ed18a50c39366bac920ec6f8994689` and was acknowledged. `R3-001` and `R4-001` at `extensions/fullscreen-contribution.ts:83-84` are informational only.
- FSC-5 runtime event equality passed two assertions; temporary compile-only compatibility passed all three request/response/lease assignability directions; committed Nox extensions had zero forbidden host/private imports and no `gentle-pi` dependency.
- Host focused suites passed 102/102; Nox focused passed 8/8; Nox full passed 57/57; build and both repository diff checks passed. Nox package dry run contained exactly nine expected files. Host `npm pack --dry-run --json --ignore-scripts` contained 527 entries including both public contract sources and created no archive.
- Live regular 160×50 showed one five-line detailed widget fallback. Fullscreen 160×50 showed one five-line right-rail block with no above-editor duplicate; resizing to 120×40 moved it above the editor; returning to 160×50 restored the rail and removed fallback.
- Compact removed detailed telemetry while preserving compact status; off removed Nox detail/status. Reload and a fresh fullscreen process began with compact status only and no stale detail, then accepted a new right-rail detailed contribution. Live quit/process cleanup plus fresh startup showed no retained visible state; deterministic shutdown lease disposal remains covered by host/Nox unit tests rather than direct live lease-identity introspection.
- RPC registered `nox-gentle-shell`; detailed produced the public five-line string-array widget; off cleared only Nox status/widget keys. Unit/control-flow evidence confirms RPC never requests the TUI rail, though RPC transport itself cannot expose absence of an internal rail event.
- The final live rerun used an authorized mode-0700 auth-only temporary snapshot; original auth hash/metadata remained unchanged, no credential contents were printed or parsed, all temp roots/processes/sockets were removed, and both repositories retained their exact expected state. Offline flags did not independently prove network inactivity; provider quota and an extra built-in `llama` command were observed as environment limitations, with no model completion events.
- User-authorized evidence commit `b06e714b1ebaa1705d050d9fcf766764f35fec89` changed only this task document (+18/-8). Native low-risk non-executable review `review-231a43dbf309a85d` approved and was acknowledged. Independent document verification confirmed exact scope and internal evidence consistency; its two stale/overbroad status findings are corrected in this closeout update.

## Next step

Decide delivery for the two stacked host work units and the Nox consumer; push and PR remain unauthorized. Keep obsolete lineage `review-0db4c4694e6e4460` parked.
