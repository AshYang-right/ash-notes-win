# 2026-06-08 User Data Analytics And Stats Window

## Summary

- Added a local append-only `user_events` analytics ledger.
- Added a stats entry in the main titlebar and a separate stats window with a 90-day completion heatmap.
- Added project rules requiring sub-agent analytics review for future feature changes.

## Implementation Notes

- `src-tauri/src/lib.rs` now creates `user_events`, analytics indexes, and an analytics migration table.
- Task create, complete, uncomplete, and delete commands write lifecycle events in the same SQLite transaction as the task change.
- Pure UI events use `record_user_event`; contribution-wall stats use `list_completion_day_stats`.
- `src/App.tsx` renders the compact task window or the `#/stats` window route and records high-granularity UI events.
- `.agents/rules/user-data-analytics.md` defines analytics source-of-truth and sub-agent review requirements.

## Verification

- `npm.cmd run build` passed.
- `cargo check` could not run because `cargo` is not available in the current PATH.

## Assumptions

- Analytics are local-only and do not upload to any external service.
- Task title snapshots are allowed to remain in `user_events` after task deletion.
- The contribution wall uses gross `task_completed` event counts, not net current completion state.

## Follow-Ups

- Add Rust integration tests for lifecycle event transaction behavior once Rust tooling is available in the environment.
- Consider a future UI for inspecting raw analytics events.
