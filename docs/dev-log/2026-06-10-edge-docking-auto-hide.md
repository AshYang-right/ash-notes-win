# Edge Docking Auto-Hide

## Summary

- Added QQ-style edge docking for the main AshNotes task window.
- Dragging the main window near the left, right, or top work-area edge docks it.
- Docked windows auto-hide after pointer leave and expand again when the visible edge strip is hovered.
- The stats window does not participate in edge docking.

## Implementation Notes

- `src/App.tsx` owns the runtime state machine, pointer/focus guards, and time-based window-position animation.
- `src-tauri/src/lib.rs` persists `window_state.dock_edge` and restores docked main windows directly into their collapsed position on startup.
- Window coordinates remain physical pixels from Tauri APIs; visible strip and dock threshold are scaled from logical pixels using the monitor scale factor.
- The persisted `x/y` are always the expanded dock anchor, not the off-screen collapsed position.
- Animation uses `requestAnimationFrame` plus `performance.now()` and coalesces `setPosition` calls so high-refresh displays do not enqueue stale position updates.
- While dragging near a dock threshold, the task window shows a lightweight internal edge preview band for the current candidate edge; this preview is visual only and does not write window state.
- Dragging into the dock threshold only shows a candidate preview while the mouse button remains down. The actual dock check is gated on physical primary-button release, using a Windows native mouse-state query so Tauri native drag swallowing `pointerup` cannot trigger a premature success effect.
- After that release-gated pointer-drag dock check succeeds, the task window plays a short edge-lock confirmation effect; startup restore, hover expand, auto-collapse, and resize reflow do not trigger it.

## Analytics Review

- Sub-agent review: Cicero reviewed the event surface and privacy boundaries before final implementation.
- Current state source of truth: SQLite `window_state.dock_edge` plus expanded `x/y/width/height` for `key = "main"`.
- Historical source of truth: SQLite `user_events`.
- Events: `window_edge_docked`, `window_edge_expanded`, `window_edge_collapsed`, `window_edge_undocked`, and `window_edge_animation_failed`.
- Metadata includes screen, route, edge, action, trigger, rounded duration for animations, success/failure, normalized error code, and failure stage.
- Metadata does not include monitor names, monitor indexes, absolute coordinates, task text, draft text, OS account data, or external telemetry.

## Verification

- Run `npm.cmd run build`.
- Run `cargo test` and `cargo check` from `src-tauri/`.
- Manually verify left, right, and top docking; hover expand; delayed collapse; drag-away undock; resize while docked; and restart restore.

## Assumptions

- Bottom docking remains out of scope because it conflicts with common Windows taskbar placement.
- Edge docking only applies to the compact main task window.
- Docking does not change the existing always-on-top preference.
