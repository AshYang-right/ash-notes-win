# AshNotes Prompt Engineering Index

Use this directory as the maintainable context layer for Codex and other coding agents.

## Core Files

- `../AGENTS.md`: root-level operating guide that Codex should read first.
- `rules/engineering.md`: durable engineering rules for AshNotes.
- `rules/git-branch-hygiene.md`: branch naming, branch descriptions, and commit/push scope rules.
- `rules/onboarding.md`: clone-and-work onboarding rules.
- `rules/prompt-engineering-maintenance.md`: how every developer keeps agent context current.
- `rules/user-data-analytics.md`: mandatory local analytics and sub-agent review rules.
- `skills/ashnotes-vibecoding/SKILL.md`: project skill for vibecoding sessions.
- `skills/zero-friction-onboarding/SKILL.md`: workflow for setup, verification, and onboarding changes.
- `templates/dev-log.md`: reusable development log shape.
- `templates/decision.md`: reusable decision-record shape.
- `templates/skill.md`: reusable project skill shape.
- `../docs/INDEX.md`: human-facing documentation index.
- `../docs/onboarding.md`: clone-and-work guide for new contributors and agents.
- `../docs/dev-log/2026-06-08-first-version-plan.md`: origin plan and first implementation snapshot.
- `../docs/dev-log/2026-06-08-ai-context-maintenance.md`: implementation log for the AI context maintenance system.
- `../docs/dev-log/2026-06-08-zero-friction-onboarding.md`: implementation log for onboarding automation.
- `../docs/dev-log/2026-06-08-user-data-analytics-and-stats-window.md`: implementation log for the analytics ledger and stats heatmap.
- `../docs/dev-log/2026-06-09-inline-task-title-editing.md`: implementation log for double-click task title editing and analytics.
- `../docs/dev-log/2026-06-09-running-app-restart-rule.md`: implementation log for the post-build live app restart rule.
- `../docs/dev-log/2026-06-09-completed-task-reorder-animation.md`: implementation log for completed-task tail ordering and FLIP animation.
- `../docs/dev-log/2026-06-09-same-day-reversible-completion-stats.md`: implementation log for same-day reversible completion stats.
- `../docs/dev-log/2026-06-09-development-verification-workflow.md`: implementation log for the write, compile, run, test workflow.
- `../docs/dev-log/2026-06-09-window-always-on-top-toggle.md`: implementation log for the main-window pin-on-top toggle.
- `../docs/dev-log/2026-06-10-edge-docking-auto-hide.md`: implementation log for QQ-style main-window edge docking and auto-hide.
- `../docs/decisions/0001-ai-context-maintenance.md`: decision record for maintaining prompt engineering as project infrastructure.
- `../docs/decisions/0002-zero-friction-onboarding.md`: decision record for clone-and-work development.
- `../docs/decisions/0003-user-data-analytics.md`: decision record for local analytics and sub-agent analytics review.
- `../.github/pull_request_template.md`: PR checklist with context-delta prompts.
- `../scripts/check-agent-context.mjs`: structural check for this context layer.
- `../scripts/doctor.mjs`: local prerequisite diagnostics.
- `../scripts/bootstrap.mjs`: one-command workspace setup.
- `../scripts/check-project.mjs`: standard local verification suite.

## Context Loading Order

1. Read `AGENTS.md` for project shape, commands, and maintenance expectations.
2. Read `rules/onboarding.md` before changing setup, commands, prerequisites, or verification.
3. Read `rules/engineering.md` before touching architecture, storage, or UI behavior.
4. Read `rules/git-branch-hygiene.md` before committing, pushing, or creating branches.
5. Read `rules/user-data-analytics.md` before planning or implementing features, interactions, state transitions, or commands.
6. Read `rules/prompt-engineering-maintenance.md` before changing project rules, skills, docs, or workflows.
7. Use `skills/ashnotes-vibecoding/SKILL.md` when planning or implementing AshNotes features.
8. Use `skills/zero-friction-onboarding/SKILL.md` when changing setup or contributor workflow.
9. Check `docs/dev-log/` and `docs/decisions/` for prior decisions before changing product direction.

## Maintenance Rule

When a new rule, skill, or durable project document is added, update this index in the same change.

Run `npm.cmd run agent:check` after changing this directory, `AGENTS.md`, or durable docs.
