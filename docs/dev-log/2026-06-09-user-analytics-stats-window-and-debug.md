# 2026-06-09 User Analytics Stats Window And Debug

## Summary

- Added a local user analytics ledger and a 90-day stats heatmap window.
- Added project rules requiring sub-agent analytics review for future feature changes.
- Fixed the stats window launch path by granting the required Tauri webview-window capability.
- Added Windows helper scripts for development and release builds.

## Implementation Notes

- `src-tauri/src/lib.rs` now owns the append-only `user_events` table, lifecycle event writes, stats aggregation commands, and a `debug_log` command for launch diagnostics.
- `src/App.tsx` now renders the main task window or the `#/stats` route, records UI analytics events, and opens/focuses a singleton `stats` webview window.
- `src/App.css` includes the stats window layout, summary sidebar, and fixed-size contribution-wall cells.
- `src-tauri/capabilities/default.json` now allows the main app to create the `stats` webview window and focus/show it.
- `.agents/rules/user-data-analytics.md` records the durable analytics and sub-agent review requirements.
- `dev.bat` and `build-release.bat` prepend `%USERPROFILE%\.cargo\bin` to `PATH` before running app dev/build commands.

## Verification

- `npm.cmd run build`
- `npm.cmd run agent:check`
- `cargo check`
- `npm.cmd run check` with `%USERPROFILE%\.cargo\bin` added to the command PATH

## Assumptions

- Analytics remain local-only in SQLite.
- Task title snapshots are intentionally retained in analytics history.
- `task_completed` event counts are the contribution-wall source of truth.
- The stats window should be opened through a Tauri `WebviewWindow` rather than expanding the compact main task window.

## Follow-Ups

- Confirm manually that clicking the titlebar stats button prints `stats window created` and opens the large overview window in a fresh `npm.cmd run app:dev` session.
- Add automated Rust tests for analytics event transaction behavior when the project gets a test harness.
