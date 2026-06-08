# AshNotes Onboarding

Goal: a developer should be able to clone the repository, run one setup command, and start useful work without hunting for project context.

## Fast Path

```powershell
git clone https://github.com/AshYang-right/ash-notes-win.git
cd ash-notes-win
npm.cmd run setup
npm.cmd run app:dev
```

Use `npm.cmd` on Windows to avoid PowerShell execution-policy issues with `npm.ps1`.

## Prerequisites

- Git
- Node.js LTS, including npm
- Rust stable, including `rustc` and `cargo`
- Windows desktop environment for running the Tauri app

`setup` installs JavaScript dependencies and verifies the agent context. If system prerequisites such as Rust are missing, it will finish the parts it can and then print the shortest fix.

Run the doctor any time setup feels suspicious:

```powershell
npm.cmd run doctor
```

## Daily Commands

- Setup or refresh dependencies: `npm.cmd run setup`
- Start the desktop app: `npm.cmd run app:dev`
- Full local check: `npm.cmd run check`
- Agent context check only: `npm.cmd run agent:check`
- Frontend build only: `npm.cmd run build`
- Tauri release compile check: `npm.cmd run app:build`

## Codex Start

When using Codex, start by reading:

- `AGENTS.md`
- `.agents/INDEX.md`
- `.agents/rules/onboarding.md`
- `.agents/rules/engineering.md`

Codex should update onboarding docs, rules, or scripts in the same change whenever it changes how future developers start, verify, or run the project.
