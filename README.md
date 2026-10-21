# AshNotes

A small, local-first sticky-note task app for Windows. Capture a task, get it done,
and keep a quiet view of your progress without opening a full project manager.

Built with **Tauri 2, React 19, TypeScript, Rust, and SQLite**. This is an early
project (0.1.0); Windows is the development target. Reproducible bug reports and
focused contributions are welcome.

## Features

- Create tasks with Enter; edit titles, complete, reopen, and delete tasks.
- Persist tasks and window state in a local SQLite database.
- Pin the note above other windows, dock it to a screen edge, and collapse it
  into a narrow strip when idle.
- Explore completion history in a statistics window with a calendar heatmap
  and daily task details.
- Use a compact, resizable, frameless desktop window.

## Build and run

Use a Windows desktop with Git, a supported Node.js LTS release (Node 22.12+
or 24 LTS is recommended), npm, and stable Rust with the MSVC toolchain.
Install Microsoft C++ Build Tools with **Desktop development with C++** and a
Windows SDK, and ensure Microsoft Edge WebView2 Runtime is available.
See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
git clone https://github.com/AshYang-right/ash-notes-win.git
cd ash-notes-win
npm.cmd run setup
npm.cmd run app:dev
```

`setup` installs JavaScript dependencies, checks project context, and diagnoses
prerequisites. Downloads need network access. Use `npm.cmd` in PowerShell to avoid
execution-policy problems with `npm.ps1`.

For a clean installation using the committed JavaScript lockfile:

```powershell
npm.cmd ci
npm.cmd run doctor
npm.cmd run app:dev
```

Build the desktop executable without creating an installer:

```powershell
npm.cmd run app:build
```

The executable is normally under `src-tauri/target/release/`. For installer bundles,
use `npm.cmd run tauri -- build`; additional Windows packaging tools may be needed.
Signed installers and a release download are not provided by this preparation branch.

`npm.cmd run dev` starts only the Vite frontend. Persistent tasks and window
features require the Tauri desktop runtime. Current desktop hooks use `npm.cmd`;
Linux and macOS desktop builds are not verified.

## Data and privacy

The backend stores `ashnotes.sqlite3` in Tauri's application data directory for
`com.ashnotes.desktop`. Alongside tasks, it records local interaction events and
task-title snapshots for statistics. Deleting a task does not erase its historical
event snapshots. Treat database copies and debug logs as personal data; use
synthetic tasks when sharing diagnostics.

Current application code has no cloud sync, account system, or remote analytics
uploader. Data export and complete-history deletion interfaces remain roadmap work.
Close the app before backing up or removing its database.

## Development and verification

| Command | Purpose |
| --- | --- |
| `npm.cmd run doctor` | Diagnose local tools and project files |
| `npm.cmd run agent:check` | Check documentation and agent-context links |
| `npm.cmd run build` | Type-check and build the frontend |
| `npm.cmd run check` | Run doctor, context checks, frontend build, and Rust check |
| `npm.cmd run app:dev` | Start the desktop development app |
| `npm.cmd run app:build` | Compile a desktop release without bundling |

For backend changes, also run `cargo check --locked` and `cargo test --locked`
from `src-tauri/`. Before release, manually verify persistence, title edits,
statistics, and docking on Windows. The preparation audit passed the context check;
dependency downloads were unavailable in its Linux environment, so it did not
establish a successful frontend or desktop build.

## Roadmap

- Verify a reproducible Windows build and prepare the first release.
- Add regression coverage for persistence, statistics, and multi-monitor docking.
- Improve keyboard accessibility and document backup, export, and event deletion.
- Review starter artwork provenance and third-party notices before release.
- Evaluate other desktop platforms after Windows behavior is reliable.

These are proposed next steps, not a delivery schedule.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), describe the problem or proposed change,
and keep patches focused. Include verification results and use synthetic data in
screenshots or logs. Do not commit credentials, local databases, or personal notes.

Project context:

- [AGENTS.md](AGENTS.md): development rules and commands.
- [.agents/INDEX.md](.agents/INDEX.md): agent-facing rules and workflows.
- [docs/INDEX.md](docs/INDEX.md): product and engineering records.
- [docs/onboarding.md](docs/onboarding.md): setup and verification.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): dependency and starter-asset scope.

## License

Original project code and documentation are available under the [MIT License](LICENSE).
Third-party dependencies, logos, and starter artwork retain their upstream terms;
the project license does not replace those terms or grant trademark rights.

## 中文简介

AshNotes 是一款面向 Windows 的本地便签待办应用，使用 Tauri、React、Rust 和
SQLite，支持任务编辑、完成统计、窗口置顶及贴边收起。安装 Node.js、Rust MSVC、
C++ 构建工具和 WebView2 后，运行 `npm.cmd run setup`、`npm.cmd run app:dev`。
数据及包含任务标题的统计事件保存在本机；分享日志和截图时请使用虚构内容。
项目仍处于早期阶段，欢迎通过 Issue 和小范围 PR 参与改进。
