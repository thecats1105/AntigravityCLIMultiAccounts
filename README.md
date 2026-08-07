# Antigravity CLI Multi-Account Switcher

This project installs a local workaround for switching Google [Antigravity CLI](https://antigravity.google/)
(`agy`) accounts. Antigravity CLI has no native multi-account, login, or logout command - switching
Google accounts today means fully re-authenticating through the browser every time. This tool keeps
account snapshots in `~/.AntigravityCLIMultiAccounts.json` and writes only the active account's oauth
token back into `agy`'s live credential file when switching.

Supported user-facing commands:
- `ag-switch`
- `ag-switch <index>`
- `ag-switch --rename <index> [name]`
- `ag-switch --remove <index>`
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

## Install

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
- only runs if `~/.gemini/antigravity-cli` is detected on the machine (i.e. `agy` has been used at
  least once); otherwise it prints a message and exits without doing anything
- copies the Node CLI into `~/.gemini/multi-account-switch/bin`
- installs `ag-switch`, `ag-sync-oauth`, `ags`, and `agso` wrapper commands
- keeps stored account snapshots in `~/.AntigravityCLIMultiAccounts.json`
- merges a `SessionStart` hook into `~/.gemini/config/hooks.json` (any other hook groups already
  registered there are left untouched)
- creates backups under `~/.gemini/multi-account-switch/backups`

## Uninstall

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

## Usage

```bash
ag-switch
ag-switch 1
ag-switch --rename 1 Personal
ag-switch --rename 1
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
Available Antigravity accounts:
  [0] alex.work <alex.work@example.invalid> | used:6m ago
* [1] alex.personal <alex.personal@example.invalid> | used:just now

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

Platform notes:
- Windows installs `ag-switch.cmd` and `ag-sync-oauth.cmd` into `~/bin`, plus Git Bash-friendly
  `ag-switch` and `ag-sync-oauth` wrappers in the same directory.
- Short aliases `ags` and `agso` are installed alongside the full command names.
- Native macOS/Linux installs commands into `~/.local/bin`.
- WSL also uses the Unix shell wrappers.
- If a shell says `command not found` right after install, restart the shell or run `hash -r` once.

## Behavior notes

- Stored account snapshots live in `~/.AntigravityCLIMultiAccounts.json`, keyed by the Google
  account's stable `sub` id (fetched from Google's userinfo endpoint) - the closest analog to an
  account UUID Google exposes for this.
- Switching only writes one live file: `~/.gemini/antigravity-cli/antigravity-oauth-token`. Two other
  files were originally assumed to also carry account identity -
  `~/.gemini/google_accounts.json` (an `active` email field) and `~/.gemini/google_account_id` - but a
  real second-account login test showed **both stay stale and don't track the actual live login**, so
  they are deliberately left untouched. Every `sync`/`list`/`switch` instead calls
  `https://www.googleapis.com/oauth2/v3/userinfo` with the live access token to reliably determine
  which account it belongs to. This means those commands require network access.
- It never touches `~/.gemini/antigravity-cli/settings.json`, conversation history, caches, or brain
  files - only the oauth token.
- It creates backups before writing the live file or the store file (latest 3 kept per file).
- The `SessionStart` hook refreshes the "last used" timestamp and prints a reminder at the start of
  each `agy` session.
- Token refresh before restoring a stale account is attempted best-effort. Unlike a naive
  implementation, a failed refresh does **not** abort the switch - it restores the stored token as-is
  and warns, since the refresh implementation itself is unverified (see Warnings below).

## Warnings

- This is a local workaround, not an official Google/Antigravity tool.
- Proactive OAuth token refresh uses `https://oauth2.googleapis.com/token` with an OAuth client id
  recovered from strings in the `agy`/`antigravity` binary; there is no confirmation this client id
  (or the lack of a client secret) actually works for a refresh grant. Treat refresh failures as
  expected until this is verified - the switch still proceeds using the unrefreshed token.
- No usage/quota display - there's no known public equivalent of a per-account quota API for
  Antigravity/Cloud Code Assist.
- No slash-command (`/ag-switch`) support - `agy`'s slash commands appear to route through its
  `skills/` system rather than a flat command directory, and this hasn't been investigated yet.
- Windows/macOS are untested for the live-file swap. On Linux/WSL, `agy` falls back to file-based
  token storage when the OS keyring is unavailable (confirmed on this project's dev machine); on
  macOS/Windows the keyring may succeed instead, which could make the live file this tool watches
  stale or unused. If that turns out to be the case, this tool would need to shell out to the native
  keyring (Keychain/Credential Manager) instead of/in addition to the file above.

## Credits

This project's architecture (account snapshot store, atomic file writes with backups, single-active-account
swap model, hook-based session reminders) is ported from
[**Leuconoe/ClaudeCodeMultiAccounts**](https://github.com/Leuconoe/ClaudeCodeMultiAccounts), the
original Claude Code multi-account switcher. All credit for that design goes to its author -
this project just retargets the same approach at Google Antigravity CLI.

## Star History

<a href="https://www.star-history.com/?repos=thecats1105%2FAntigravityCLIMultiAccounts&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=thecats1105/AntigravityCLIMultiAccounts&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=thecats1105/AntigravityCLIMultiAccounts&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=thecats1105/AntigravityCLIMultiAccounts&type=date&legend=top-left" />
 </picture>
</a>
