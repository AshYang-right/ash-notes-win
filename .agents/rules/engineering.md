# AshNotes Engineering Rules

## Product Boundary

- AshNotes starts as a local-first desktop todo note, not a general knowledge base.
- Keep the main window compact and immediately usable.
- Do not add accounts, cloud sync, global shortcuts, tray behavior, voice, MCP ingestion, or Git/Codex context reading unless a new plan explicitly brings that scope in.

## Onboarding Rules

- Keep clone-and-work setup simple enough to explain from `README.md`.
- Prefer npm scripts for common project tasks so developers do not memorize tool-specific command chains.
- Update `docs/onboarding.md` whenever setup, prerequisites, commands, or verification steps change.

## Frontend Rules

- Keep UI state in React and durable state in Tauri commands.
- Preserve keyboard-first task creation: typing plus Enter should stay fast.
- Use icons for compact actions when available through `lucide-react`.
- Avoid instructional text inside the app surface unless it directly labels current state.
- Maintain stable dimensions for titlebar controls, input controls, and task rows so resizing the desktop window does not cause jitter.

## Backend Rules

- SQLite is the source of truth for tasks and window state.
- SQLite `user_events` is the source of truth for durable user behavior analytics.
- Keep database access in `src-tauri/src/lib.rs` until the backend grows enough to justify modules.
- Use parameterized SQL through `rusqlite`.
- Validate task titles on both frontend and backend boundaries.
- Keep Tauri command names stable unless all frontend invoke calls and docs are updated together.
- Write task lifecycle analytics in the same transaction as the task mutation.

## Documentation Rules

- `docs/dev-log/` records durable decisions and implementation snapshots.
- Development logs should include date, summary, implementation notes, verification, and assumptions.
- `.agents/` contains agent-facing context, rules, and skills. It should not become a scratchpad.
- Any new prompt-engineering asset must be linked from `.agents/INDEX.md`.

## Verification Rules

- For setup or workflow changes, run `npm.cmd run doctor` and `npm.cmd run agent:check`.
- For frontend-only changes, run `npm.cmd run build`.
- For Tauri command, SQLite, config, or Rust changes, also run `cargo check` from `src-tauri/`.
- For analytics changes, verify event names, required metadata, and source-of-truth queries against `.agents/rules/user-data-analytics.md`.
- For release-facing changes, run `npm.cmd run tauri -- build --no-bundle` when feasible.
