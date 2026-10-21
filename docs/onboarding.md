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
- A supported Node.js LTS release with npm; use Node 22.12+ or 24 LTS
- Rust stable with the MSVC toolchain, including `rustc` and `cargo`
- Windows desktop environment for running the Tauri app
- Microsoft C++ Build Tools with Desktop development with C++ and a Windows SDK
- Microsoft Edge WebView2 Runtime

See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
Dependency downloads need network access. For a clean lockfile-based JavaScript
installation, use `npm.cmd ci`; `setup` currently uses `npm install`.

The Vite-only preview cannot replace Tauri for persistence and window features.
The current desktop hooks use `npm.cmd`; Linux and macOS desktop builds are not
verified.

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

## Development Loop

1. Write: decide whether the change touches frontend UI, Tauri/Rust commands, SQLite/analytics, docs, or agent context.
2. Compile: run `npm.cmd run build` for frontend changes; also run `cargo check` from `src-tauri/` for Tauri, SQLite, analytics, or Rust command changes.
3. Run: use `npm.cmd run app:dev` to launch the desktop app. If a build succeeds while AshNotes is already open, restart only after confirming that no live draft text or inline edit will be lost.
4. Test: run `npm.cmd run check` before publishing when prerequisites are available. If it stops because Rust/Cargo is missing, run `npm.cmd run doctor` and record the missing prerequisite plus any narrower checks that passed.
5. Context: run `npm.cmd run agent:check` after changing `AGENTS.md`, `.agents/`, durable docs, or workflow guidance.

## Codex Start

When using Codex, start by reading:

- `AGENTS.md`
- `.agents/INDEX.md`
- `.agents/rules/onboarding.md`
- `.agents/rules/engineering.md`

Codex should update onboarding docs, rules, or scripts in the same change whenever it changes how future developers start, verify, or run the project.
