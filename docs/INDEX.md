# AshNotes Documentation Index

## Start Here

- `../AGENTS.md`: agent operating guide for Codex-style development.
- `../.agents/INDEX.md`: prompt-engineering index for rules and skills.
- `onboarding.md`: clone-and-work onboarding guide.
- `dev-log/2026-06-08-first-version-plan.md`: origin plan and first completed implementation snapshot.
- `decisions/0001-ai-context-maintenance.md`: decision to maintain AI context as project infrastructure.
- `decisions/0002-zero-friction-onboarding.md`: decision to optimize for clone-and-work development.
- `decisions/0003-user-data-analytics.md`: decision to use a local analytics ledger and sub-agent analytics review.

## Project Summary

AshNotes is a Windows desktop sticky-note todo app built with Tauri, React, TypeScript, Rust, and SQLite. The first version focuses on local task capture, completion, deletion, and window-state persistence.

## Development Log

- `dev-log/2026-06-08-first-version-plan.md`: first-version execution plan, implementation notes, test plan, assumptions, and completed snapshot.
- `dev-log/2026-06-08-ai-context-maintenance.md`: implementation notes for the AI context maintenance system.
- `dev-log/2026-06-08-zero-friction-onboarding.md`: implementation notes for onboarding automation.
- `dev-log/2026-06-08-user-data-analytics-and-stats-window.md`: implementation notes for the analytics ledger and stats heatmap.
- `dev-log/2026-06-09-user-analytics-stats-window-and-debug.md`: implementation notes for analytics, stats window launch, and debug fixes.
- `dev-log/2026-06-09-inline-task-title-editing.md`: implementation notes for double-click task title editing and analytics.
- `dev-log/2026-06-09-running-app-restart-rule.md`: implementation notes for the post-build live app restart rule.
- `dev-log/2026-06-09-completed-task-reorder-animation.md`: implementation notes for completed-task tail ordering and FLIP animation.
- `dev-log/2026-06-09-same-day-reversible-completion-stats.md`: implementation notes for same-day reversible completion stats.
- `dev-log/2026-06-09-development-verification-workflow.md`: implementation notes for the write, compile, run, test workflow.

## Decisions

- `decisions/0001-ai-context-maintenance.md`: AI context maintenance protocol and consequences.
- `decisions/0002-zero-friction-onboarding.md`: clone-and-work development protocol and consequences.
- `decisions/0003-user-data-analytics.md`: local analytics source of truth and sub-agent review protocol.

## Documentation Maintenance

Add implementation snapshots to `dev-log/`. Add durable product, architecture, process, or release decisions to `decisions/`. Keep this index current when adding new documentation.
