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
| `/nox-gentle-shell detailed` | Adds the detailed namespaced telemetry widget. |
| `/nox-gentle-shell off` | Clears the extension-owned namespaced status and widget. |
| `/nox-gentle-shell status` | Reports mode, telemetry availability, and active tool count. |

### Shortcuts and collisions

- `Ctrl+Alt+T` cycles `compact → detailed → off`.

Shortcuts are a convenience, not a guarantee. User keybindings or a later-loaded extension can supersede them. The slash commands above are the reliable collision fallback.

## Telemetry semantics and limitations

Telemetry combines current context usage from Pi with **finalized** usage stored in public session entries. It reports available context tokens/window/percentage, finalized input/output/cache usage and cost, message and assistant-turn counts, and currently active tool names/counts.

It is not a continuously streaming exact token or cost total. Missing host data, including the period immediately after compaction, is rendered as `—` or omitted. It deliberately does not inspect process, CPU, RAM, battery, or operating-system metrics.

### Symbol legend

| Symbol | Meaning |
| --- | --- |
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
model claude/sonnet
context 53.8k / 128k (42%)
usage (finalized) in 18.2k · out 3.1k · cache 9.4k
cost (finalized) $0.08
activity messages 9 · assistant turns 7 · tools bash
```

Narrow TUI widgets render each line against the terminal width, including long Unicode model labels. RPC has no terminal width, so it receives the compatible public string-array widget at a deterministic fallback width.

## Mode matrix

| Surface | TUI | RPC | Print | JSON |
| --- | --- | --- | --- | --- |
| Namespaced status | Yes | Fire-and-forget compatible | No | No |
| Detailed widget | Width-aware component | String-array fallback | No | No |
| Extension notifications | Explicit actions only | Fire-and-forget compatible | No | No |

Only extension-owned notifications are branded. Built-in or core alerts cannot be globally restyled, intercepted, or recolored by this package. The package also does not replace Pi's full footer.

## Cleanup and off behavior

`off` and `session_shutdown` clear only the namespaced status and widget. They do not alter your theme, terminal title, header, working message, working indicator, or any other core UI surface. A replacement session starts with fresh compact state, telemetry, model identity, and tool activity.
