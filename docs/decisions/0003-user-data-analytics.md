# 0003 User Data Analytics Ledger

## Status

Accepted

## Context

AshNotes is growing from a simple task list into a local-first product that needs trustworthy history. A contribution-style calendar cannot be built from the current task state alone because reopening, recompleting, and deleting tasks would erase or distort historical behavior.

The product direction also requires detailed user behavior data to exist before every future feature decides what to display.

## Decision

Add a local SQLite `user_events` ledger as the durable source of truth for user behavior analytics. Task lifecycle events are written by Rust/Tauri commands in the same transaction as the task mutation. Frontend-only interactions use a dedicated `record_user_event` command.

Require a user data analytics review for every new or changed feature. When sub-agent tooling is available, that review must be performed by a sub-agent and must decide the event names, metadata, privacy boundary, source of truth, and verification path.

All analytics remain local unless a future explicit opt-in decision adds external telemetry.

## Consequences

- Historical task behavior remains explainable even when current task state changes.
- Contribution-wall data can aggregate `task_completed` events instead of current `tasks.completed_at`.
- Deleted task titles may remain in local analytics snapshots by design.
- Feature work now has an extra review step for analytics coverage.
- Event schemas and metadata need versioning discipline as the app evolves.

## Related Files

- `AGENTS.md`
- `.agents/INDEX.md`
- `.agents/rules/user-data-analytics.md`
- `.agents/skills/ashnotes-vibecoding/SKILL.md`
- `src-tauri/src/lib.rs`
- `src/App.tsx`
