# AshNotes

Windows desktop sticky-note todo app built with Tauri, React, TypeScript, Rust, and SQLite.

## Quick Start

```powershell
git clone https://github.com/AshYang-right/ash-notes-win.git
cd ash-notes-win
npm.cmd run setup
npm.cmd run app:dev
```

Prerequisites: Git, Node.js LTS, Rust stable, and a Windows desktop environment.

## Development

- Setup or refresh dependencies: `npm.cmd run setup`
- Environment doctor: `npm.cmd run doctor`
- Full local check: `npm.cmd run check`
- Frontend build: `npm.cmd run build`
- Agent context check: `npm.cmd run agent:check`
- Desktop dev app: `npm.cmd run app:dev`
- Tauri build without bundling: `npm.cmd run app:build`
- Rust check: run `cargo check` from `src-tauri/`

Use `npm.cmd` on Windows to avoid PowerShell execution-policy issues with `npm.ps1`.

## Project Context

- Agent guide: `AGENTS.md`
- Prompt-engineering index: `.agents/INDEX.md`
- Documentation index: `docs/INDEX.md`
- Onboarding guide: `docs/onboarding.md`
- Origin plan and first dev log: `docs/dev-log/2026-06-08-first-version-plan.md`
- AI context maintenance decision: `docs/decisions/0001-ai-context-maintenance.md`
- Zero-friction onboarding decision: `docs/decisions/0002-zero-friction-onboarding.md`
