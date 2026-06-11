# Window Always-On-Top Toggle

## Summary

- Added a titlebar pin button for the main AshNotes task window.
- The button toggles whether the main window stays above other windows.
- The preference is persisted in SQLite and restored on app startup.

## Implementation Notes

- `src/App.tsx` uses Tauri `currentWindow.isAlwaysOnTop()` and `currentWindow.setAlwaysOnTop(...)` for the live window behavior.
- `src-tauri/capabilities/default.json` grants the required always-on-top window permissions.
- `src-tauri/src/lib.rs` adds `window_state.always_on_top` with a lightweight schema check for existing databases.
- `save_window_state` now persists `always_on_top` alongside geometry.

## Analytics Review

- Sub-agent review: Fermat reviewed the planned feature before implementation.
- Current state source of truth: SQLite `window_state.always_on_top` for `key = "main"`.
- Historical source of truth: SQLite `user_events`.
- Events: `window_always_on_top_toggled` for successful toggles and `window_always_on_top_toggle_failed` for failures.
- Metadata includes screen, route, titlebar target, previous and next boolean state, persistence outcome, and success/failure diagnostics. No task text, note text, monitor names, OS account data, or external telemetry are recorded.

## Verification

- Run `npm.cmd run build`.
- Run `cargo check` from `src-tauri/` when Rust/Cargo is available.
- Manually verify pin on, pin off, restart restore, and one local analytics event per click.

## Assumptions

- The always-on-top preference applies to the compact main task window, not the stats window.
- Persisting the preference is more predictable than making the pin a session-only toggle.
