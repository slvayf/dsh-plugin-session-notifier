# Session Notifier

[中文](README.md) | English

[![npm](https://img.shields.io/npm/v/dsh-plugin-session-notifier)](https://www.npmjs.com/package/dsh-plugin-session-notifier)
[![license](https://img.shields.io/github/license/slvayf/dsh-plugin-session-notifier)](LICENSE)

A DeepSeek Harness bundle. It raises a desktop notification and a short chime when a session finishes,
fails, or stops to wait for your answer (a question or a tool approval). Nothing is missed while you
are in another window, watching a video, or playing a game.

A bell entry in the left sidebar opens the settings page, and every switch applies immediately.
The interface follows DSH's Chinese/English setting.

## Behaviour

| Situation | What happens |
| --- | --- |
| The agent finishes a turn | A rising two-note chime and a desktop notification |
| The agent stops to wait for you | Three alternating urgent notes and a persistent notification, always immediate |
| The session fails | A low two-note chime and an error notification |
| The session you are looking at ends | Reminded after about 1 second, effectively immediate |
| Any other session ends | Waits out the 10/20/30 second merge window to avoid a burst |
| It continues within 10 seconds | Merged into one reminder |
| You do not come back | Repeats every 30 seconds, at most 3 times, and stops as soon as the page is focused |
| Subagent sessions | Silent, so one task's internal fan-out never rings |

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| Enable reminders | On | Master switch. Turning it off keeps your other choices |
| Desktop notification | On | Visible while the browser is in the background. Clicking it opens the session |
| Chime | On | Synthesized with Web Audio, so no audio file ships |
| Also remind me while waiting for an answer | On | A more urgent chime when the agent asks something or waits for a tool approval |
| Also remind me about failures | On | A lower tone, distinct from a normal finish |
| Remind me even while the page is in the foreground | On | Turn it off to stay quiet unless the window is unfocused or the tab is hidden |
| Merge bursts | 10 seconds | 10, 20, or 30 seconds. The session you are looking at is not delayed |
| Repeat reminders | On, every 30 seconds, at most 3 times | Interval and count are adjustable |

"Recent reminders" lives in page memory only and is cleared by a refresh or by closing the page.
The panel says so as well.

## Install

**1. By package name (recommended).** Ask the agent to call:

```
plugin_manager({ action: "install_bundle", target: "dsh-plugin-session-notifier" })
```

Omitting the version installs the latest one. You can also type `dsh-plugin-session-notifier` into **Plugins → Add plugin** yourself. Pick the
China mainland registry mirror if you are there, it is much faster.

**2. Local development:** `plugin_manager({ action: "install_bundle", target: "/absolute/path/dsh-plugin-session-notifier" })`.

After installation the left sidebar shows the bell entry, and the `main` panel key is `session-notifier`.
Compatible DSH versions are declared by `engines.dsh` in `package.json`, currently `>=0.2.1-rc.3`.

Upgrading means uninstalling the old version and installing the new one. The plugin manager does not
upgrade in place.

## Limits

- Reminders come from the page. The DSH tab must stay open (minimized or in the background is fine),
  and closing it stops every reminder.
- Desktop notifications need a one-time browser permission. If you deny it, allow it again in the site settings.
- The chime obeys the autoplay policy, so the page needs one interaction before audio unlocks.
- Every notification uses a unique `tag`. Chromium replaces a notification with the same tag silently,
  which hides every reminder after the first.
- "Test the reminder" reports the outcome (shown, unconfirmed by the system, rejected, browser error,
  not allowed), which separates a plugin problem from a system one. A "sound only" mark in the log means
  that notification was never created.
- "Waiting for you" depends on the `uiSession` service. Without it only finish and error reminders work,
  and nothing throws.
- The short window for the session you are looking at depends on the `mainView` retain counter from
  `sessions.retainInfo`. When that source is missing the configured window is used instead, so the
  reminder is never wrong, only later.

## Harness interfaces

- `ctx.remote.$on('api-session/status')`, the agent running state, forwarded by the Host.
- `ctx.remote.$on('api-session/added' | 'error' | 'removed')`, catalog rows, errors, and removals.
- `uiSession.sessionStatus`, the composed "waiting for you" fact published by the approval and question plugins.
- `sessions.list` and `sessions.retainInfo`, the catalog snapshot and which session the main view holds.
- Slots `sidebar.panellist` (the sidebar entry) and `main` (its panel).

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.js` | Host half. Empty on purpose, it only declares the bundle |
| `client.js` | Browser half: the reminder engine and the settings panel |
| `cordis.patch.yml` | Inserts the plugin row |
| `locale/*.json` | Title and description the plugin manager displays |
| `test/*.mjs` | Engine scenarios plus static style and copy checks |
| `.github/workflows/` | `ci` runs the checks, `publish` uploads to npm |

## Development

```bash
npm run verify     # engine scenarios, style check, copy check
```

- `test/verify-engine.mjs` runs the reminder scenarios with a virtual clock and DOM stubs.
- `test/check-styles.mjs` proves every class is defined and used, every `h()` first argument is valid,
  and every non-zero corner declares `corner-shape:round` (the theme sets a global squircle).
- `test/check-copy.mjs` proves the Chinese and English keys match, every key is reachable, no copy
  contains a semicolon, and the `locale/*.json` metadata is complete.
- Controls copy the shipped primitives (a 36×20 switch, 36px pill controls with a 12px radius), styling
  uses only `--dsw-alias-*` theme tokens, and nothing except `react` is loaded from Harness packages.

## Releasing

See [PUBLISHING.md](PUBLISHING.md).

## License

[MIT](LICENSE)
