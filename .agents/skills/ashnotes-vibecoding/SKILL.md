# AshNotes Vibecoding Skill

Use this skill when developing AshNotes features, refactors, UI changes, storage changes, or project documentation.

## Goal

Help AshNotes evolve without losing the original product feel: a small, reliable, local-first Windows sticky-note todo app.

## Workflow

1. Read `AGENTS.md`.
2. Read `.agents/rules/onboarding.md` when setup, commands, or verification are involved.
3. Read `.agents/rules/engineering.md`.
4. Read `.agents/rules/user-data-analytics.md` before feature, interaction, state, storage, or command changes.
5. Spawn a sub-agent for user data analytics review when the change adds or alters product behavior.
6. Check `docs/INDEX.md` and the relevant `docs/dev-log/` entries.
7. Inspect the files touched by the request before editing.
8. Make the smallest coherent change that satisfies the request.
9. Run the verification command that matches the changed surface.
10. If a successful build/check occurs, check whether AshNotes is already running and restart only with explicit current-session authorization.
11. Add or update a dev-log entry when the change creates a durable decision.

## Current Architecture

- `src/App.tsx`: React task UI, Tauri invoke calls, window-state save wiring.
- `src/App.css`: sticky-note visual system and compact desktop layout.
- `src-tauri/src/lib.rs`: SQLite setup, task commands, window-state persistence.
- `src-tauri/tauri.conf.json`: Tauri app metadata and main window sizing.

## Command Reference

- Frontend check: `npm.cmd run build`
- Full project check: `npm.cmd run check`
- Environment doctor: `npm.cmd run doctor`
- Agent context check: `npm.cmd run agent:check`
- Desktop dev run: `npm.cmd run app:dev`
- Rust check: `cargo check` from `src-tauri/`
- Release compile check: `npm.cmd run app:build`

## Write Compile Run Test Loop

- Write: classify the changed surface first: frontend, Rust/Tauri command, SQLite/analytics, docs/agent context, or release behavior.
- Compile: run `npm.cmd run build` for UI/frontend changes; add `cargo check` from `src-tauri/` for Tauri, SQLite, analytics, or Rust changes.
- Run: use `npm.cmd run app:dev` for manual desktop testing. Do not silently restart a live app window.
- Test: use `npm.cmd run check` as the pre-publish path when prerequisites are installed. If it fails because Rust/Cargo is unavailable, report that blocker and keep the successful narrower checks in the final summary.
- Context: run `npm.cmd run agent:check` whenever `.agents/`, `AGENTS.md`, durable docs, or workflow guidance changed.

## Decision Heuristics

- If a feature makes capture faster or persistence more trustworthy, it likely fits.
- If a feature makes the app feel like a dashboard, project manager, or synced workspace, it needs an explicit product decision first.
- If a change touches persistence, prefer a migration-minded shape even before a formal migration system exists.
- If a change affects user behavior or state transitions, analytics events are required unless the sub-agent review explicitly says no new event is needed.
- If the app surface gets more complex, protect the compact note feel first.
