# Development Verification Workflow

## Summary

- Clarified the standard write, compile, run, test, and context-check loop for AshNotes development.
- Added the workflow to human onboarding docs, project engineering rules, the root agent guide, and the AshNotes vibecoding skill.

## Implementation Notes

- `AGENTS.md` now lists the surface-based verification flow Codex should follow.
- `docs/onboarding.md` now gives developers a daily development loop after the command list.
- `.agents/rules/onboarding.md` and `.agents/rules/engineering.md` now define the standard workflow as durable agent-facing rules.
- `.agents/skills/ashnotes-vibecoding/SKILL.md` now points to `npm.cmd run app:dev`, `npm.cmd run app:build`, and `npm.cmd run agent:check` as first-class commands.
- `.agents/rules/user-data-analytics.md` keeps sub-agent analytics review as the default requirement for product behavior, state transition, storage, and command changes.

## Verification

- `npm.cmd run build` passed.
- `npm.cmd run agent:check` passed.
- `cargo check` could not run because `cargo` is not available in PATH.

## Assumptions

- `npm.cmd run check` remains the standard pre-publish command, even though it depends on Rust/Cargo being installed.
- Running app restarts stay manual or explicitly authorized because draft UI state may be unsaved.
