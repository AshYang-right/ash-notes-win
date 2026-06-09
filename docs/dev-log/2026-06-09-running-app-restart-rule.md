# Running App Restart Rule

Date: 2026-06-09

## Summary

- Added an agent working rule for handling the AshNotes desktop app when it is already running during development.
- The rule asks agents to check for a running app after successful compile/build work.
- Restarting the live app requires explicit user authorization in the current conversation.

## Rationale

- A restart is useful because an already-open Tauri app will not automatically load newly compiled frontend or backend code.
- Silent restarts are risky because draft text and in-progress inline edits may exist only in frontend state.
- The intended behavior is convenience with a guardrail: detect and offer restart by default, restart automatically only when the user has clearly opted in for that session.

## Verification

- Run `npm.cmd run agent:check` after updating agent-facing rules and documentation indexes.

## Assumptions

- Durable created tasks are stored in SQLite and survive a restart.
- Unsubmitted draft input should be treated as potentially unsaved local UI state.
