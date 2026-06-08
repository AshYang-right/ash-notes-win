# Zero-Friction Onboarding Skill

Use this skill when a request changes setup, local development, verification, prerequisites, or contributor onboarding.

## Goal

Keep AshNotes clone-and-work friendly for humans and coding agents.

## Workflow

1. Read `AGENTS.md`.
2. Read `.agents/rules/onboarding.md`.
3. Read `docs/onboarding.md`.
4. Inspect `package.json`, `scripts/`, `src-tauri/tauri.conf.json`, and any changed setup files.
5. Prefer automating repeatable setup and verification work through npm scripts.
6. Keep README quick-start instructions short and executable.
7. Update `docs/onboarding.md` when prerequisites or commands change.
8. Run `npm.cmd run doctor`, `npm.cmd run agent:check`, and when feasible `npm.cmd run check`.

## Verification

- `npm.cmd run doctor`
- `npm.cmd run agent:check`
- `npm.cmd run check` for workflow or build changes
