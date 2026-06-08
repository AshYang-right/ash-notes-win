# Zero-Friction Onboarding

AshNotes should stay easy to clone, understand, run, and verify.

## Objective

Any developer or coding agent should be able to clone the repository and start productive work with minimal project-specific ceremony.

## Required Entry Points

- `README.md` must show the shortest working path.
- `docs/onboarding.md` must explain setup, prerequisites, and daily commands.
- `AGENTS.md` must list the commands Codex should use.
- `npm.cmd run setup` must prepare the workspace as much as possible.
- `npm.cmd run doctor` must diagnose missing local prerequisites.
- `npm.cmd run check` must run the standard local verification path.

## Maintenance Triggers

Update onboarding assets when a change:

- Adds, removes, or changes a prerequisite.
- Changes package manager, build tool, Tauri command, Rust workflow, or local port behavior.
- Adds a required environment variable or local secret.
- Adds a migration, generated asset, or prebuild step.
- Changes the expected verification path.

## Friction Budget

Prefer one memorable command over several manual steps. If a setup task can be automated safely, put it behind `npm.cmd run setup` or `npm.cmd run check`.

If something cannot be automated, document the exact failure symptom and the shortest fix in `docs/onboarding.md`.
