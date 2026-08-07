# Antigravity CLI Multi-Account Switcher

[![npm version](https://img.shields.io/npm/v/antigravity-cli-multi-accounts?label=npm)](https://www.npmjs.com/package/antigravity-cli-multi-accounts)
[![npm downloads](https://img.shields.io/npm/dm/antigravity-cli-multi-accounts)](https://www.npmjs.com/package/antigravity-cli-multi-accounts)

This project installs a local workaround for switching Google [Antigravity CLI](https://antigravity.google/) (`agy`) accounts by keeping account snapshots in `~/.AntigravityCLIMultiAccounts.json` and writing only the active account's oauth token back into `agy`'s live credential file when switching.

Supported user-facing commands:

- `ag-switch`
- `ag-switch <index>`
- `ag-switch --rename <index> [name]`
- `ag-switch --remove <index>`
- `ag-switch usage`
- `ag-switch --show-usage` / `ag-switch --hide-usage`
- `ag-sync-oauth`
- `ags` (short alias for `ag-switch`)
- `agso` (short alias for `ag-sync-oauth`)

Supported environments:

- Windows (PowerShell/CMD/Git Bash)
- Ubuntu WSL
- Native macOS/Linux with Node.js

Prerequisites:

- Node.js 18+
- Antigravity CLI (`agy`) already installed and logged in at least once

Install:

**Recommended (via npm):**

```bash
npx antigravity-cli-multi-accounts install
```

**Manual (from source):**

```bash
git clone https://github.com/thecats1105/AntigravityCLIMultiAccounts.git
cd AntigravityCLIMultiAccounts
./install.cmd   # Windows
./install.sh    # macOS / Linux / WSL
```

What install does:

- only runs if `~/.gemini/antigravity-cli` is detected (i.e. `agy` has been used at least once)
- copies the Node CLI into `~/.gemini/multi-account-switch/bin`
- installs `ag-switch`, `ag-sync-oauth`, `ags`, and `agso` wrapper commands
- keeps stored account snapshots in `~/.AntigravityCLIMultiAccounts.json`
- merges a `SessionStart` hook into `~/.gemini/config/hooks.json` (other hook groups are left untouched)
- creates backups under `~/.gemini/multi-account-switch/backups`

Uninstall:

**Recommended (via npm):**

```bash
npx antigravity-cli-multi-accounts uninstall
```

**Manual (from source):**

```powershell
./uninstall.cmd   # Windows
```

```bash
./uninstall.sh    # macOS / Linux / WSL
```

Usage:

```bash
ag-switch
ag-switch 1
ag-switch --rename 1 Personal
ag-switch --rename 1
ag-switch usage
ag-sync-oauth
ags
agso
```

`ag-switch --rename <index> <name>` sets a custom label for a stored account (handy when several
accounts share the same display name). The alias survives syncs. Omit `<name>` to clear it and fall
back to the account's email local part.

Example shell output:

```text
$ ag-switch
--- Usage ---
Gemini:
  5h remaining/reset: 98.7% / 8/8/2026, 4:30:42 AM
  7d remaining/reset: 99.5% / 8/14/2026, 3:43:50 PM
Other(Claude/GPT):
  5h remaining/reset: 100.0% / 8/8/2026, 5:10:19 AM
  7d remaining/reset: 100.0% / 8/15/2026, 12:10:19 AM

Available Antigravity accounts:
  [0] alex.work <alex.work@example.invalid> | Gemini 5H:82% (~4h 29min) / Other 5H:40% (~4h 29min) | Gemini 7D:60% (6D 15h) / Other 7D:10% (2D 4h) | used:6m ago
* [1] alex.personal <alex.personal@example.invalid> | Gemini 5H:99% (~4h 12min) / Other 5H:100% (~5h 0min) | Gemini 7D:99% (6D 15h) / Other 7D:100% (7D 0h) | used:just now

Run ag-switch <index> to make one of these stored entries the active Antigravity account.
Run ag-switch --remove <index> to remove a stored account.
```

```text
$ ag-switch 0
Switched active account to [0] alex.work <alex.work@example.invalid>.

Note: Restart Antigravity CLI (agy) to apply the account change.

Stored account list:
* [0] alex.work <alex.work@example.invalid> | used:just now
  [1] alex.personal <alex.personal@example.invalid> | used:6m ago
```

Output columns:

- `5H`/`7D`: remaining quota and reset estimate for the 5-hour and weekly windows, shown as `Gemini
... / Other ...` since Gemini and Claude/GPT calls draw from separate quotas
- `used`: when the account was last selected, or when the `SessionStart` hook last refreshed it
- Top `--- Usage ---` block: the current account's exact usage, fetched live when available
- `ag-switch --hide-usage` turns all of this off (persisted); `ag-switch --show-usage` turns it back on

Platform notes:

- Windows installs `ag-switch.cmd` and `ag-sync-oauth.cmd` into `~/bin`, plus Git Bash-friendly
  `ag-switch` and `ag-sync-oauth` wrappers in the same directory.
- Short aliases `ags` and `agso` are installed alongside the full command names.
- Native macOS/Linux installs commands into `~/.local/bin`.
- WSL also uses the Unix shell wrappers.
- If a shell says `command not found` right after install, restart the shell or run `hash -r` once.

Behavior notes:

- Stored account snapshots are keyed by the Google account's stable `sub` id (fetched from Google's
  userinfo endpoint) rather than email, since `~/.gemini/google_accounts.json` and
  `~/.gemini/google_account_id` were tested and don't reliably track the active login.
- Switching only writes one live file: `~/.gemini/antigravity-cli/antigravity-oauth-token`. It never
  touches settings, conversation history, caches, or brain files.
- It creates backups before writing the live file or the store file (latest 3 kept per file).
- The `SessionStart` hook refreshes the "last used" timestamp and prints a reminder at the start of
  each `agy` session.
- Token refresh before restoring a stale account, or before resolving the live account's identity, is
  best-effort - a failed refresh does not abort the switch, it proceeds with the existing token and
  warns (see Warnings). If the _live_ token is expired and can't be refreshed, commands fail with a
  clear message telling you to run `agy` once (which refreshes its own live token via a working path)
  and try again.
- Usage display calls `cloudcode-pa.googleapis.com`'s quota-summary endpoint, the same private API
  `agy` itself uses. It's always best-effort and never blocks `list`/`switch`/`sync`.

Warnings:

- This is a local workaround, not an official Google/Antigravity tool.
- Proactive OAuth token refresh uses OAuth client ids recovered from the `agy` binary, and is
  confirmed **not to work**: Google rejects both candidates with "client_secret is missing", and no
  secret is embedded in the binary as a plain string. agy clearly refreshes its own live token some
  other way. Every command still proceeds/degrades gracefully on a refresh failure - a stored account
  switch restores the token as-is, and an expired _live_ session tells you to run `agy` once instead
  of crashing with a raw 401.
- Usage display uses an undocumented, reverse-engineered endpoint found via `strings` on the `agy`
  binary. The response shape was confirmed against a real account, but Google could change it at any
  time; if that happens the usage columns just stop appearing rather than erroring.
- No slash-command (`/ag-switch`) support - `agy`'s slash commands route through its `skills/` system
  rather than a flat command directory.
- Windows/macOS are untested for the live-file swap. On Linux/WSL, `agy` falls back to file-based
  token storage when the OS keyring is unavailable; on macOS/Windows the keyring may succeed instead,
  which could make the live file this tool watches stale or unused.

Credits:

This project's architecture (account snapshot store, atomic file writes with backups,
single-active-account swap model, hook-based session reminders) is ported from
[Leuconoe/ClaudeCodeMultiAccounts](https://github.com/Leuconoe/ClaudeCodeMultiAccounts), the original
Claude Code multi-account switcher. All credit for that design goes to its author.

## Star History

<a href="https://www.star-history.com/?repos=thecats1105%2FAntigravityCLIMultiAccounts&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=thecats1105/AntigravityCLIMultiAccounts&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=thecats1105/AntigravityCLIMultiAccounts&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=thecats1105/AntigravityCLIMultiAccounts&type=date&legend=top-left" />
 </picture>
</a>
