# Prompt Engineering Maintenance

AshNotes treats AI context as project infrastructure. Developers and coding agents should maintain it in the same change that creates durable project knowledge.

## Update Triggers

Update the prompt-engineering layer when a change:

- Changes product scope, architecture, persistence, release behavior, or command workflows.
- Changes setup, prerequisites, onboarding, local development, or verification workflows.
- Adds a repeated development workflow that should be reusable.
- Adds a project rule that future contributors or agents should follow.
- Discovers a repeated pitfall, broken assumption, or Windows-specific setup issue.
- Adds, moves, renames, or deletes any agent-facing file.
- Changes how verification, build, release, or local development should be performed.

## Where Knowledge Belongs

- `AGENTS.md`: short, root-level guidance that should always be loaded first.
- `.agents/INDEX.md`: map of all agent-facing context files.
- `.agents/rules/`: durable constraints and engineering rules.
- `.agents/skills/`: repeatable workflows with clear activation conditions.
- `.agents/templates/`: reusable shapes for logs, decisions, and skills.
- `docs/onboarding.md`: clone-and-work setup and daily commands.
- `docs/dev-log/`: dated implementation snapshots.
- `docs/decisions/`: durable decisions, tradeoffs, and consequences.
- `.github/pull_request_template.md`: human review checklist for context deltas.

## Noise Control

Do not update context files for every minor edit. Skip prompt-engineering changes when the work is:

- A local typo or copy tweak.
- A tiny visual adjustment that does not change design direction.
- A one-off bug fix with no reusable lesson.
- A mechanical dependency or formatting change that does not alter workflows.

When in doubt, add a short note to the PR `Context Delta` section instead of creating a new rule.

## Index Discipline

- Every rule file must be linked from `.agents/INDEX.md`.
- Every skill `SKILL.md` must be linked from `.agents/INDEX.md`.
- Every reusable template must be linked from `.agents/INDEX.md`.
- Every durable decision must be linked from `docs/INDEX.md`.
- Run `npm.cmd run agent:check` after context changes.

## Stewardship

Prompt-engineering files should be pruned as the project evolves. Prefer updating or merging old rules over adding near-duplicates.
