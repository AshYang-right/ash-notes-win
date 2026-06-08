# 2026-06-08 Zero-Friction Onboarding

## Summary

- Added a clone-and-work onboarding path for AshNotes.
- Reduced common setup and verification work to npm scripts.

## Implementation Notes

- Added `docs/onboarding.md` with fast path, prerequisites, daily commands, and Codex start guidance.
- Added `.agents/rules/onboarding.md` and `.agents/skills/zero-friction-onboarding/SKILL.md`.
- Added `scripts/doctor.mjs`, `scripts/bootstrap.mjs`, and `scripts/check-project.mjs`.
- Added package scripts for setup, doctor, app dev, app build, and full checks.
- Added decision record `docs/decisions/0002-zero-friction-onboarding.md`.

## Verification

- Passed `node scripts/doctor.mjs --allow-missing-rust`.
- Passed `npm.cmd run agent:check`.
- Passed `npm.cmd run build`.
- `npm.cmd run doctor` and `npm.cmd run check` correctly report missing `rustc` and `cargo` in the current execution environment.

## Assumptions

- The primary runtime target is Windows.
- The setup script can automate project dependencies, but system prerequisites such as Node.js and Rust still need to exist locally.
