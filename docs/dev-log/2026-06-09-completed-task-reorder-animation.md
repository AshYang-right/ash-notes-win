# Completed Task Reorder Animation

Date: 2026-06-09

## Summary

- Completed tasks now move to the end of the sticky-note task list immediately after the checkbox is toggled.
- The list uses a lightweight FLIP animation instead of adding an animation dependency.
- The backend list order now matches the UI: open tasks first, completed tasks last, with newly completed tasks at the tail.

## Implementation Notes

- `src/App.tsx` captures task row positions before completion changes, applies an optimistic completion update, sorts the list, and animates moved rows with the Web Animations API.
- The animation only uses `transform: translate3d(...)`, which avoids layout-heavy per-frame work and keeps motion smooth at high refresh rates.
- `prefers-reduced-motion: reduce` disables the motion path.
- `src-tauri/src/lib.rs` orders completed tasks by `completed_at` ascending so the newest completion loads at the bottom after app restart.

## Analytics Review

- The measured user action remains the existing checkbox toggle.
- Existing events cover the behavior: `task_checkbox_clicked` records the UI action, and `task_completed` / `task_uncompleted` record the durable state transition in SQLite.
- No new analytics event is needed because the reorder animation is presentation derived from existing task state.

## Verification

- `npm.cmd run build` passed.
- `npm.cmd run agent:check` passed.
- `cargo check` could not run because `cargo` is not available in PATH in this environment.
- Manually verify that checking a task moves it to the bottom smoothly and that unchecking a completed task moves it back into the open section.

## Assumptions

- "Queue tail" means the bottom of the full task list.
- The task list remains small enough that local FLIP measurement is simpler and lighter than adding a general animation library.
