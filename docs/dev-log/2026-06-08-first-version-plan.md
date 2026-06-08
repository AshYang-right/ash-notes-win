# AshNotes 第一版执行计划

## Summary

- 在 `E:\AshNotes` 创建 **Tauri + React + TypeScript + SQLite** Windows 桌面应用。
- 第一版做桌面便签型 todo：新增任务、勾选完成、删除、本地持久化。
- 窗口做成无边框便签：可拖拽、可缩放，并记住上次位置和大小。
- 暂不做 MCP、Git/Codex 上下文读取、语音、托盘、全局快捷键和云同步。

## Implementation Changes

### 初始化项目

- 在 `E:\AshNotes` 使用 React + TypeScript 模板创建 Tauri 项目。
- 使用 `npm.cmd` 运行 npm 命令，避免 PowerShell `npm.ps1` 策略问题。
- 应用名使用 `AshNotes`。

### 桌面窗口

- 配置 `decorations: false`、`resizable: true`，默认尺寸约 `420x560`。
- 顶部做自定义便签栏，使用 Tauri 拖拽区域实现窗口拖动。
- 自定义最小化、关闭按钮。
- 保存并恢复窗口 `x/y/width/height`。

### Todo 功能

- 输入框回车新增任务。
- 空文本和纯空格不创建任务。
- checkbox 切换完成状态。
- completed 任务显示删除线。
- 删除按钮移除任务。

### SQLite 存储

- 数据库放在 Tauri app data 目录。
- Rust/Tauri 后端负责数据库读写。
- 最小字段：`id`、`title`、`completed`、`created_at`、`updated_at`、`completed_at`。

### 前后端接口

- `list_tasks() -> Task[]`
- `create_task(title: string) -> Task`
- `set_task_completed(id: string, completed: boolean) -> Task`
- `delete_task(id: string) -> void`
- `save_window_state(window_state) -> void`

## Test Plan

- 启动验证：`npm.cmd run tauri dev` 能打开 AshNotes 桌面窗口。
- 任务验证：新增、完成、取消完成、删除均正确刷新 UI。
- 持久化验证：关闭重开后任务状态仍存在。
- 窗口验证：窗口可拖拽、可缩放；关闭重开后恢复上次位置和尺寸。
- 构建验证：运行前端构建和 Tauri/Rust 编译检查。

## Assumptions

- `E:\AshNotes` 是正式项目根目录；若为空目录，直接在根目录初始化。
- 第一版优先打磨“便签手感 + 本地任务可靠性”。
- SQLite 从第一版开始使用，为后续 MCP、智能 Inbox、事件记录和同步留空间。
- 第一版不引入云账号、远程数据库或同步服务。

## Completed Implementation Snapshot

- 项目已创建在 `E:\AshNotes`。
- 远程仓库已同步到 `https://github.com/AshYang-right/ash-notes-win`。
- 初始提交：`e0dfc5a Initial AshNotes desktop MVP`。
- Release 可执行文件：`E:\AshNotes\src-tauri\target\release\ashnotes.exe`。
- 已通过：
  - `npm.cmd run build`
  - `cargo check`
  - `cargo build`
  - `npm.cmd run tauri -- build --no-bundle`
