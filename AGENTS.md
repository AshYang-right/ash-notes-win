# AshNotes Agent Guide

This file is the first stop for Codex-style development in AshNotes.

## Project Shape

- AshNotes is a Windows desktop sticky-note todo app.
- Stack: Tauri 2, React 19, TypeScript, Rust, SQLite.
- Frontend lives in `src/`.
- Tauri backend and SQLite commands live in `src-tauri/`.
- Prompt-engineering assets live in `.agents/`.
- Product and development records live in `docs/`.

## Working Rules

- Optimize for clone-and-work development: a new developer should be able to run setup, start the app, and find context without project-specific ceremony.
- Preserve the sticky-note feeling: small surface, fast input, calm visual weight.
- Keep the first-version promise reliable before expanding scope.
- Store durable local app data through the Tauri backend, not browser-only storage.
- Treat local user analytics as product infrastructure: new or changed features need a sub-agent analytics review and durable SQLite events when user behavior or state transitions change.
- Prefer small, inspectable changes over broad rewrites.
- After successful development compile/build work, check whether the AshNotes desktop app is already running. If it is running, offer or perform a restart only when the user has explicitly authorized restarting the live app in the current conversation; avoid silently closing a window that may contain unsaved draft text.
- Update `docs/onboarding.md` and `.agents/rules/onboarding.md` when setup, prerequisites, commands, or verification workflows change.
- Update `docs/dev-log/` when a decision changes product direction, persistence, architecture, or release behavior.
- Update `docs/decisions/` when a change records a durable architectural or process decision.
- Update `.agents/INDEX.md` when adding or moving rules, skills, or project guidance.

## Prompt Engineering Maintenance

Every developer and coding agent is responsible for keeping the prompt-engineering layer current when a change creates durable knowledge.

Update context in the same change when you:

- Change product scope, architecture, storage, release behavior, or command workflows.
- Change setup, prerequisites, onboarding, local development, or verification workflows.
- Introduce a recurring development workflow that should become a skill.
- Discover a repeated pitfall that should become a rule.
- Add, rename, or move agent-facing files, docs, scripts, or templates.

Put durable knowledge in the smallest useful place:

- Project-wide behavior: `AGENTS.md`
- Clone-and-work onboarding: `docs/onboarding.md`
- Long-lived engineering constraints: `.agents/rules/`
- Repeatable workflows: `.agents/skills/`
- Reusable document shapes: `.agents/templates/`
- Implementation snapshots: `docs/dev-log/`
- Durable decisions and tradeoffs: `docs/decisions/`

Do not turn `.agents/` into a scratchpad. Skip prompt-engineering updates for purely local edits, tiny copy changes, or one-off fixes that do not change future development behavior.

## Commands

- Setup or refresh workspace: `npm.cmd run setup`
- Environment doctor: `npm.cmd run doctor`
- Full local check: `npm.cmd run check`
- Frontend build: `npm.cmd run build`
- Agent context check: `npm.cmd run agent:check`
- Tauri dev app: `npm.cmd run app:dev`
- Tauri build without bundling: `npm.cmd run app:build`
- Rust check: run `cargo check` from `src-tauri/`

Use `npm.cmd` on Windows to avoid PowerShell execution-policy issues with `npm.ps1`.

## Development Flow

- Before editing, identify the touched surface: frontend UI, Tauri/Rust command, SQLite schema/query, analytics event, docs, or agent context.
- While editing, keep React UI state separate from durable Tauri/SQLite state and preserve compact sticky-note interactions.
- For frontend-only changes, run `npm.cmd run build`.
- For Tauri, SQLite, analytics, or Rust command changes, run `npm.cmd run build` and `cargo check` from `src-tauri/`; if Rust/Cargo is missing, record that blocker and run `npm.cmd run doctor`.
- For docs, rules, skills, templates, or onboarding changes, run `npm.cmd run agent:check`.
- For end-to-end confidence before publishing, run `npm.cmd run check`; if it stops at a missing prerequisite, report the exact missing tool and which earlier checks already passed.
- To manually run the desktop app during development, use `npm.cmd run app:dev`. After any successful build/check, inspect whether AshNotes is already running and only restart it with explicit user authorization in the current conversation.

## Navigation

- Agent index: `.agents/INDEX.md`
- Project docs index: `docs/INDEX.md`
- Onboarding guide: `docs/onboarding.md`
- Onboarding rule: `.agents/rules/onboarding.md`
- Git branch hygiene rule: `.agents/rules/git-branch-hygiene.md`
- User data analytics rule: `.agents/rules/user-data-analytics.md`
- Onboarding skill: `.agents/skills/zero-friction-onboarding/SKILL.md`
- Prompt maintenance rule: `.agents/rules/prompt-engineering-maintenance.md`
- Prompt maintenance decision: `docs/decisions/0001-ai-context-maintenance.md`
- Zero-friction onboarding decision: `docs/decisions/0002-zero-friction-onboarding.md`
- Origin plan and first implementation log: `docs/dev-log/2026-06-08-first-version-plan.md`
