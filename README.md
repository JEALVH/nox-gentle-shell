# Nox Gentle Shell visual layer

A small Pi package that adds finalized-session telemetry through namespaced status and widget surfaces. It uses public Pi APIs only, leaves Pi's shared header, working presentation, and built-in footer untouched, and never changes your selected theme or terminal title.

## Quick path

1. Install the package in the Pi package scope you choose.
2. Activate it through Pi's `packages` configuration.
3. Select the packaged `nox-gentle-shell` theme yourself if you want the matching palette.
4. Run `/nox-gentle-shell` to discover the current state and valid commands, then use `compact` (the default) or `detailed`.

## Installation

Install from npm in the scope appropriate to your Pi setup:

```sh
npm install gentle-shell-visual-layer
```

Then add the package through Pi configuration, for example:

```json
{
  "packages": ["npm:gentle-shell-visual-layer"]
}
```

Use your normal Pi configuration location and package-management policy. The package supports the Pi peer baseline `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` `^0.85.1`.

## Activation and configuration

The extension is activated by Pi from the package manifest. It ships a collision-safe theme named `nox-gentle-shell`, but **does not select or change your theme**: select `nox-gentle-shell` through your own Pi settings or theme command when you want it. This preserves the prior user choice because the public API has no safe prior-theme restore operation.

The extension does not mutate Pi settings, install anything globally, or set the terminal title.

## Commands

| Command | Effect |
| --- | --- |
| `/nox-gentle-shell` | Reports current mode, telemetry, and active-tool state with concise valid usage. |
| `/nox-gentle-shell compact` | Shows compact namespaced telemetry status. |
| `/nox-gentle-shell detailed` | Requests an optional Gentle Shell rail contribution in TUI mode, otherwise adds the detailed namespaced telemetry widget. |
| `/nox-gentle-shell off` | Clears the extension-owned namespaced status and widget. |
| `/nox-gentle-shell status` | Reports mode, telemetry availability, and active tool count. |

### Shortcuts and collisions

- `Ctrl+Alt+T` cycles `compact → detailed → off`.

Shortcuts are a convenience, not a guarantee. User keybindings or a later-loaded extension can supersede them. The slash commands above are the reliable collision fallback.

## Telemetry semantics and limitations

Telemetry combines current context usage from Pi with **finalized** usage stored in public session entries. It reports available context tokens/window/percentage, finalized input/output/cache usage and cost, message and assistant-turn counts, and currently active tool names/counts.

It is not a continuously streaming exact token or cost total. Missing host data, including the period immediately after compaction, is rendered as `—` or omitted. It deliberately does not inspect process, CPU, RAM, battery, or operating-system metrics.

### Context safety warning

While a Pi UI exists, Nox emits one extension-owned warning when valid context usage reaches `80%` or higher. The event-driven warning is active in compact, detailed, and off modes; it adds no timer or polling. It does not repeat while usage remains at or above the threshold and rearms only after valid usage falls strictly below `75%`. Missing or unavailable context, including the post-compaction gap, never alerts or rearms; a later valid below-75% reading may rearm it. There is no critical threshold and Nox does not recolor context metrics.

```text
Context usage reached {percent}%. Start a new session soon to avoid automatic compaction.
```

### Symbol legend

| Symbol | Meaning |
| --- | --- |
| `◆` | Model identity |
| `◉` | Context percentage |
| `↑` | Finalized input tokens |
| `↓` | Finalized output tokens |
| `◇` | Finalized cache tokens |
| `$` | Finalized cost |
| `⚙` | Active tools |

Extension-owned notifications use `ℹ`, `⚠`, `✖`, and `✔` where appropriate.

## Reproducible terminal examples

These examples are text fixtures rather than screenshot assets, so they stay reviewable and reproduce in any terminal.

Compact mode:

```text
◉ 42% · ↑ 18.2k · ↓ 3.1k · ◇ 9.4k · $ 0.08 · ⚙ 1
```

Detailed mode:

```text
┌─ Nox 🌑 ──────────────────────────────────────────┐
│ ◆ claude/sonnet                                  │
│ ◉ 53.8k / 128k (42%)                             │
│ ↑ 18.2k · ↓ 3.1k · ◇ 9.4k                        │
│ $ $0.08                                          │
│ ✉ 9 · ◌ 7 · ⚙ bash                               │
└──────────────────────────────────────────────────┘
```

Detailed mode clears Nox's compact status, leaving this single titled and one-cell-padded telemetry card with the static `Nox 🌑` title. When Pi supplies a theme, the card reads the active public theme at render time: frame segments use `border`, the title uses `accent`, telemetry glyphs use `muted`, separators use `dim`, and values use `text`. The text fixture above intentionally omits ANSI styling; Nox never hardcodes palette values and pure callers may continue rendering plain strings. Gentle Pi's host prompt owns the sole `🌑`, `☾`, `◯`, `☽`, `🌑` lunar animation for the agent-wide working lifecycle. Narrow TUI widgets render every card line against the terminal width, including long Unicode model labels. In detailed TUI mode, Nox emits the public `gentle-pi.fullscreen-contribution/v1` request with the namespaced `nox-gentle-shell.fullscreen-telemetry` rail key and `widget` fallback. A synchronous accepted lease suppresses Nox's duplicate widget; an absent, inactive, invalid, unsupported, or failing host keeps that widget fallback. Nox disposes an accepted lease when leaving detailed mode or shutting down. RPC has no terminal width, so it receives the compatible public string-array widget at a deterministic fallback width using the current public context theme.

## Mode matrix

| Surface | TUI | RPC | Print | JSON |
| --- | --- | --- | --- | --- |
| Namespaced status | Yes | Fire-and-forget compatible | No | No |
| Detailed telemetry | Optional public rail contribution, then width-aware widget fallback | String-array widget fallback | No | No |
| Extension notifications | Explicit actions and context-safety warning | Fire-and-forget compatible | No | No |

Only extension-owned notifications are branded. Built-in or core alerts cannot be globally restyled, intercepted, or recolored by this package. The package also does not replace Pi's full footer.

## Cleanup and off behavior

`off` and `session_shutdown` clear only the namespaced status and widget. They do not alter your theme, terminal title, header, working message, working indicator, or any other core UI surface. A replacement session starts with fresh compact state, telemetry, model identity, and tool activity.
