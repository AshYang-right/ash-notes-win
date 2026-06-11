# User Data Analytics

AshNotes treats local user behavior data as product infrastructure. Missing durable analytics for a new feature is a blocking implementation gap.

## Source Of Truth

- Store durable analytics in local SQLite through Tauri/Rust commands.
- Use append-only event records for behavior history. Do not derive historical analytics from current React state.
- Keep `tasks` as the source of truth for current task state and `user_events` as the source of truth for historical behavior.
- Pure frontend aggregation may render views, but it must be rebuildable from SQLite events.
- Do not upload analytics or add third-party telemetry without a separate explicit product decision and opt-in path.

## Required Event Review

Every new feature, changed interaction, state transition, storage change, or command must include a user data analytics review before implementation.

The review must be performed by a sub-agent when sub-agent tooling is available. The review output must answer:

- What user action or system outcome is being measured.
- What state transition occurs, if any.
- The event name or the reason no new event is needed.
- The durable SQLite source of truth.
- The required metadata fields and their privacy boundary.
- How the event is verified.

If no new event is needed, record that conclusion with the reason. A feature with no analytics review is not ready to merge.

## Event Design Rules

- Use stable snake_case event names.
- Include `schema_version`, `source`, `app_version`, `session_id`, and `window_label` in event metadata when available.
- Task lifecycle events must include `task_id`, `task_title_snapshot`, previous and next completion state, and relevant task timestamps.
- Record task lifecycle events inside the same SQLite transaction as the task mutation.
- UI events should capture meaningful interactions and outcomes, not continuous noise such as mouse movement streams or every intermediate draft character.
- Store task title snapshots for lifecycle events so deleted tasks remain explainable in analytics history.

## Current Required Events

- Task lifecycle: `task_created`, `task_completed`, `task_uncompleted`, `task_title_updated`, `task_deleted`.
- Task UI: `task_draft_focused`, `task_draft_changed`, `task_create_submitted`, `task_checkbox_clicked`, `task_title_edit_started`, `task_title_edit_submitted`, `task_title_edit_cancelled`, `task_title_edit_failed`, `task_context_menu_opened`, `task_delete_clicked`.
- Window UI: `window_always_on_top_toggled`, `window_always_on_top_toggle_failed`, `window_edge_docked`, `window_edge_expanded`, `window_edge_collapsed`, `window_edge_undocked`, `window_edge_animation_failed`.
- Stats UI: `stats_entry_clicked`, `stats_window_opened`, `stats_window_focused`, `stats_window_closed`, `stats_heatmap_viewed`, `stats_heatmap_day_hovered`, `stats_heatmap_day_selected`.
- Failure outcomes should use explicit failure events or `success: false` metadata where useful for diagnosis.
