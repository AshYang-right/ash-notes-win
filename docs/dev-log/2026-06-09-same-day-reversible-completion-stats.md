# Same-Day Reversible Completion Stats

## Change

- Completion stats now count same-day effective completions instead of every checkbox-on transition.
- Checking a task immediately updates the durable `tasks` state and writes `task_completed`.
- Unchecking a task immediately updates the durable `tasks` state and writes `task_uncompleted`.
- `list_completion_day_stats` excludes a task's `task_completed` events for any local day where the same task also has a `task_uncompleted` event.
- Repeated same-day open/close toggles therefore contribute 0 completed items for that task on that day.

## Analytics Review

- User action measured: a task completion or completion reversal within a local day.
- State transition: `tasks.completed` remains the current source of truth; `user_events` remains the source of truth for historical behavior and stats.
- Events: `task_completed` records checkbox-on transitions and `task_uncompleted` records checkbox-off transitions.
- Stats source: SQLite `list_completion_day_stats` aggregates `task_completed` events and excludes task/day pairs that also contain `task_uncompleted`.
- Metadata: task id, task title snapshot, title length, previous and next completion state, task timestamps, `completed_at`, source, session id, app version, and window label. All analytics remain local.
- Sub-agent review: Leibniz reviewed the completion stats and inline editing analytics before publishing. The review found no blocking lifecycle-event issues and required renaming stats metric metadata/copy away from raw event-count wording.
- Verification: run `npm.cmd run build` and `cargo check` from `src-tauri/`; manually verify that complete-then-uncomplete on the same local day contributes 0 to that day.

## Notes

- Existing historical `task_completed` events remain valid.
- This avoids hidden timing thresholds. Users only need the visible model: if a task is reopened on the same day, that day no longer counts it as completed.
- A task completed on one day and reopened on another day keeps the original day's completion contribution.
