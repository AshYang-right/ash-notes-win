# Contributing to AshNotes

Thanks for helping improve AshNotes. The current focus is a reliable, compact,
local-first Windows task note.

## Report a problem or propose a feature

Open an issue with expected behavior, actual behavior, reproduction steps,
Windows version, app revision, and relevant tool versions. Explain the user
problem before proposing a large feature. Use synthetic tasks and redact personal
paths, credentials, and note contents from logs or screenshots.

If you discover a security issue or committed credential, do not include the secret
in a public issue. Use GitHub private vulnerability reporting if enabled. Otherwise,
open a minimal issue requesting a private contact channel without sensitive details.

## Set up a change

1. Read [README.md](README.md), [AGENTS.md](AGENTS.md), and
   [docs/onboarding.md](docs/onboarding.md).
2. Install the Windows prerequisites, then run `npm.cmd run setup`.
3. Create a branch for one focused change. Preserve both dependency lockfiles and
   keep dependencies and generated files out of unrelated patches.
4. Keep persistence in Rust/SQLite and transient UI state in React. Update relevant
   documentation whenever setup or behavior changes.

Do not commit `.env` files, API keys, signing keys, databases, event histories,
build outputs, or downloaded dependencies. `.gitignore` cannot remove content
already committed to history.

## Verify and submit

- Documentation and agent context: `npm.cmd run agent:check`.
- Frontend: `npm.cmd run build`.
- Backend: `cargo check --locked` and `cargo test --locked` from `src-tauri/`.
- Before release: `npm.cmd run check`, `npm.cmd run app:build`, and a Windows
  desktop smoke test.

For task or window changes, verify create/edit/complete/reopen/delete, restart
persistence, statistics, pinning, and docking where relevant. Do not close someone's
running app or discard draft text without their permission.

Explain the problem, resulting behavior, verification, and missing checks in a pull
request. Do not claim build success when downloads or prerequisites prevented it.

## Licensing

Submit only material you can contribute under the project's MIT license. Preserve
third-party notices and document new assets' origins and redistribution terms.
Do not introduce paid asset packs or private source material.
