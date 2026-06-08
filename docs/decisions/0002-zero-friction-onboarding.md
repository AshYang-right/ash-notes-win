# 0002 Optimize For Clone-And-Work Development

## Status

Accepted

## Context

AshNotes should be approachable to any developer or AI coding agent that clones the repository. Repeated manual setup, hidden prerequisites, and scattered commands create avoidable friction.

## Decision

Maintain a zero-friction onboarding path:

- `README.md` shows the shortest path to a running app.
- `docs/onboarding.md` explains prerequisites and daily commands.
- `npm.cmd run setup` installs dependencies and verifies agent context.
- `npm.cmd run doctor` diagnoses local prerequisites.
- `npm.cmd run check` runs the standard local verification suite.
- `.agents/rules/onboarding.md` and `.agents/skills/zero-friction-onboarding/SKILL.md` tell Codex how to keep the path current.

## Consequences

- New contributors can start faster.
- Codex sessions have fewer project-specific assumptions to rediscover.
- Setup scripts and onboarding docs must be updated whenever prerequisites or workflows change.

## Related Files

- `README.md`
- `docs/onboarding.md`
- `.agents/rules/onboarding.md`
- `.agents/skills/zero-friction-onboarding/SKILL.md`
- `scripts/bootstrap.mjs`
- `scripts/doctor.mjs`
- `scripts/check-project.mjs`
