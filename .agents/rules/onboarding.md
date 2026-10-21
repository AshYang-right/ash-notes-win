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

Document the Windows prerequisites consistently in README and onboarding:
supported Node.js LTS (Node 22.12+ or 24 LTS), Rust stable MSVC, Microsoft C++ Build
Tools with a Windows SDK, and WebView2. Distinguish Vite-only frontend builds from
verification of Tauri desktop behavior.

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

## Standard Development Loop

- Write: classify the touched surface before editing so the right verification path is obvious.
- Compile: use `npm.cmd run build` for frontend changes and add `cargo check` from `src-tauri/` for Rust, Tauri commands, SQLite, or analytics changes.
- Run: use `npm.cmd run app:dev` for the desktop app; restart an already-running app only with explicit current-session authorization.
- Test: use `npm.cmd run check` before publishing when prerequisites are installed. If a prerequisite is missing, keep the failure actionable by naming the missing tool and the checks that already passed.
- Context: use `npm.cmd run agent:check` after changing prompt-engineering files, durable docs, or workflow guidance.
