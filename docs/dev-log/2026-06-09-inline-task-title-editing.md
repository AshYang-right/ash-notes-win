# Inline Task Title Editing

Date: 2026-06-09

## Summary

- Added double-click inline editing for task titles in the sticky-note task window.
- Added a durable `update_task_title` Tauri command that persists title changes to SQLite.
- Added local analytics for edit intent, submit/cancel/failure outcomes, and successful durable title changes.

## Implementation Notes

- `src/App.tsx` renders a compact title input when a task title is double-clicked.
- Enter and blur submit the edit; Escape cancels and restores the existing title.
- Empty edits are treated as a cancelled inline edit in the UI and restore the previous task title; the Rust command boundary still rejects empty titles.
- `src-tauri/src/lib.rs` records `task_title_updated` in the same SQLite transaction as the `tasks.title` and `tasks.updated_at` mutation.
- UI-only edit interactions are recorded through `record_user_event`.

## Analytics Review

- A sub-agent analytics review was completed for this feature during the publish pass.
- `tasks` remains the source of truth for current task title state.
- `user_events` remains the source of truth for historical edit behavior.
- Task title snapshots remain local-only in SQLite and are not sent to external telemetry.

## Verification

- `npm.cmd run build` passed.
- `npm.cmd run agent:check` passed.
- `npm.cmd run check` could not complete because the local environment doctor did not find Rust/Cargo.
- `cargo check` could not run because `cargo` was not available in PATH.
- Manual app verification remains needed for double-click edit, Enter submit, blur submit, Escape cancel, and empty-title restoration.

## Assumptions

- Title editing is part of the task lifecycle because it changes durable task state.
- No schema migration is needed because the existing `tasks.title`, `tasks.updated_at`, and `user_events` tables support the feature.
