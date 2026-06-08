# 2026-06-08 AI Context Maintenance System

## Summary

- Added a project-wide system for maintaining prompt-engineering assets during AI-assisted development.
- Kept the system IDE independent and Codex friendly.

## Implementation Notes

- Extended `AGENTS.md` with prompt-engineering maintenance triggers and placement rules.
- Added `.agents/rules/prompt-engineering-maintenance.md`.
- Added reusable templates for dev logs, decision records, and skills under `.agents/templates/`.
- Added `.github/pull_request_template.md` with a `Context Delta` checklist.
- Added `scripts/check-agent-context.mjs` and `npm.cmd run agent:check` for structural validation.
- Added `docs/decisions/0001-ai-context-maintenance.md`.
- Later extended this context system with onboarding-specific rules and checks in `docs/dev-log/2026-06-08-zero-friction-onboarding.md`.

## Verification

- Passed `npm.cmd run agent:check`.

## Assumptions

- Not every code change should update prompt-engineering files.
- Durable changes to product direction, architecture, persistence, commands, release flow, or repeated workflows should update context in the same change.
