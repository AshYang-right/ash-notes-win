# 0001 Maintain AI Context As Project Infrastructure

## Status

Accepted

## Context

AshNotes is being developed heavily through Codex-style AI sessions. Without a maintained context layer, useful decisions and workflows stay trapped in chat history and are easy to lose.

## Decision

Maintain prompt-engineering assets as first-class project files:

- `AGENTS.md` is the root agent entry point.
- `.agents/` stores agent-facing indexes, rules, skills, and templates.
- `docs/dev-log/` stores dated implementation snapshots.
- `docs/decisions/` stores durable decisions and tradeoffs.
- Pull requests include a `Context Delta` checklist.
- `npm.cmd run agent:check` verifies the context layer structure.

## Consequences

- AI sessions can recover project intent faster.
- Human developers have a shared place to record reusable guidance.
- Context files need occasional pruning so they do not become stale or noisy.

## Related Files

- `AGENTS.md`
- `.agents/INDEX.md`
- `.agents/rules/prompt-engineering-maintenance.md`
- `.github/pull_request_template.md`
- `scripts/check-agent-context.mjs`
