# Antigravity CLI Multi-Account Switcher

[![npm version](https://img.shields.io/npm/v/antigravity-cli-multi-accounts?label=npm)](https://www.npmjs.com/package/antigravity-cli-multi-accounts)
[![npm downloads](https://img.shields.io/npm/dm/antigravity-cli-multi-accounts)](https://www.npmjs.com/package/antigravity-cli-multi-accounts)

Switch between several Google [Antigravity CLI](https://antigravity.google/) (`agy`) accounts from the terminal.
Account snapshots live in `~/.AntigravityCLIMultiAccounts.json`; switching writes only the active account's oauth token back into `agy`'s live credential file.

Works on Windows (PowerShell / CMD / Git Bash), WSL, macOS, and Linux. Requires Node.js 18+ and an `agy` that has logged in at least once.

## Install

```bash
npx antigravity-cli-multi-accounts install
```

This installs four commands, `ag-switch`, `ag-sync-oauth`, and their short aliases `ags` and `agso`, and adds a `SessionStart` hook to `~/.gemini/config/hooks.json` that refreshes the "last used" time and prints a short reminder (other hook groups are left untouched). Backups of the live files and the store go to `~/.gemini/multi-account-switch/backups`.

If a shell says `command not found` right after install, open a new terminal. On Windows the installer also adds `~/bin` to your user `PATH` so the commands resolve in cmd/PowerShell too.

Manual install from source:

```bash
git clone https://github.com/thecats1105/AntigravityCLIMultiAccounts.git
cd AntigravityCLIMultiAccounts
./install.sh    # macOS / Linux / WSL
./install.cmd   # Windows
```

## Usage

```bash
ag-switch                      # list stored accounts with usage
ag-switch 1                    # switch to account [1]
ag-switch --rename 1 Personal  # label an account (omit the name to clear it)
ag-switch --remove 1           # forget a stored account
ag-switch usage                # refresh and show quota usage
ag-switch --hide-usage         # turn usage display off (persisted); --show-usage turns it back on
ag-sync-oauth                  # sync the current live login into the store
```

`ags` and `agso` are short aliases for `ag-switch` and `ag-sync-oauth`.

Log into each account once in `agy`, run `ag-sync-oauth` (or just `ag-switch`) to store it, then switch with `ag-switch <index>` and restart `agy`.

Example:

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

Columns: `5H` / `7D` are the remaining quota and reset estimate for the 5-hour and weekly windows, shown as `Gemini ... / Other ...` because Gemini and Claude/GPT calls draw from separate quotas. For stored (non-active) accounts the figures come from the last fetch, adjusted to the present: a window whose reset time has passed shows as full, and an exhausted weekly window also zeroes the 5-hour one. `used` is when the account was last selected, or when the `SessionStart` hook last refreshed it. The top `--- Usage ---` block is the current account's exact usage, fetched live.

## Notes

- Accounts are keyed by the Google account's stable `sub` id (from Google's userinfo endpoint), not email, because `~/.gemini/google_accounts.json` and `~/.gemini/google_account_id` don't reliably track the active login.
- Switching writes only `~/.gemini/antigravity-cli/antigravity-oauth-token`, then reads it back to confirm the swap took hold (a running `agy` may rewrite it). If it didn't, the switch is reported as unconfirmed - close every `agy` session and run it again. Settings, conversation history, caches, and brain files are never touched.
- Running `agy` sessions are detected and warned about, not blocked; restart `agy` after switching.
- Every write to the live file or the store is backed up first (latest 3 kept per file), and a lock prevents concurrent invocations (including the `SessionStart` hook) from clobbering each other.
- Token refresh before restoring a stale account, or before resolving the live account's identity, is best-effort: a failed refresh does not abort the switch, it proceeds with the existing token and warns. If the _live_ token is expired and can't be refreshed, commands tell you to run `agy` once (which refreshes its own token) and try again.
- Usage display calls `cloudcode-pa.googleapis.com`'s quota-summary endpoint, the same private API `agy` itself uses. It is always best-effort and never blocks list/switch/sync.

## Warnings

- This is a local workaround, not an official Google/Antigravity tool.
- Proactive OAuth token refresh uses OAuth client ids recovered from the `agy` binary and is confirmed **not to work**: Google rejects both candidates with "client_secret is missing", and no secret is embedded in the binary as a plain string. `agy` clearly refreshes its own live token some other way. Every command degrades gracefully on a refresh failure.
- Usage display uses an undocumented, reverse-engineered endpoint. The response shape was confirmed against a real account, but Google could change it at any time; if that happens the usage columns just stop appearing rather than erroring.
- No slash-command (`/ag-switch`) support - `agy`'s slash commands route through its `skills/` system rather than a flat command directory.
- Windows/macOS are untested for the live-file swap. On Linux/WSL, `agy` falls back to file-based token storage when the OS keyring is unavailable; on macOS/Windows the keyring may succeed instead, which could make the live file this tool watches stale or unused.

## Credits

This project's architecture (account snapshot store, atomic file writes with backups, single-active-account swap model, hook-based session reminders) is ported from [Leuconoe/ClaudeCodeMultiAccounts](https://github.com/Leuconoe/ClaudeCodeMultiAccounts), the original Claude Code multi-account switcher. All credit for that design goes to its author.

## Uninstall

```bash
npx antigravity-cli-multi-accounts uninstall
```

Manual: `./uninstall.sh` (macOS / Linux / WSL) or `./uninstall.cmd` (Windows).

## Star History

<a href="https://www.star-history.com/?repos=thecats1105%2FAntigravityCLIMultiAccounts&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=thecats1105/AntigravityCLIMultiAccounts&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=thecats1105/AntigravityCLIMultiAccounts&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=thecats1105/AntigravityCLIMultiAccounts&type=date&legend=top-left" />
 </picture>
</a>
