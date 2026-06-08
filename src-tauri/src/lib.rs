use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, PhysicalPosition, PhysicalSize, State};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    db_path: PathBuf,
}

#[derive(Debug, Serialize)]
struct Task {
    id: String,
    title: String,
    completed: bool,
    created_at: i64,
    updated_at: i64,
    completed_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn connect(db_path: &Path) -> Result<Connection, String> {
    Connection::open(db_path).map_err(|error| error.to_string())
}

fn init_database(db_path: &Path) -> Result<(), String> {
    let connection = connect(db_path)?;

    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                completed_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS window_state (
                key TEXT PRIMARY KEY,
                x INTEGER NOT NULL,
                y INTEGER NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            ",
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn app_data_db_path(app: &tauri::App) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;

    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    Ok(data_dir.join("ashnotes.sqlite3"))
}

fn row_to_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    let completed: i64 = row.get(2)?;

    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        completed: completed == 1,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        completed_at: row.get(5)?,
    })
}

fn load_window_state(db_path: &Path) -> Result<Option<WindowState>, String> {
    let connection = connect(db_path)?;

    connection
        .query_row(
            "SELECT x, y, width, height FROM window_state WHERE key = 'main'",
            [],
            |row| {
                Ok(WindowState {
                    x: row.get(0)?,
                    y: row.get(1)?,
                    width: row.get(2)?,
                    height: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn restore_window_state(app: &tauri::App, db_path: &Path) -> Result<(), String> {
    let Some(saved_state) = load_window_state(db_path)? else {
        return Ok(());
    };

    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    window
        .set_size(PhysicalSize::new(saved_state.width, saved_state.height))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(saved_state.x, saved_state.y))
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn list_tasks(state: State<'_, AppState>) -> Result<Vec<Task>, String> {
    let connection = connect(&state.db_path)?;
    let mut statement = connection
        .prepare(
            "
            SELECT id, title, completed, created_at, updated_at, completed_at
            FROM tasks
            ORDER BY completed ASC, created_at DESC
            ",
        )
        .map_err(|error| error.to_string())?;

    let tasks = statement
        .query_map([], row_to_task)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(tasks)
}

#[tauri::command]
fn create_task(title: String, state: State<'_, AppState>) -> Result<Task, String> {
    let clean_title = title.trim();

    if clean_title.is_empty() {
        return Err("Task title cannot be empty.".to_string());
    }

    let task = Task {
        id: Uuid::new_v4().to_string(),
        title: clean_title.to_string(),
        completed: false,
        created_at: now_ms(),
        updated_at: now_ms(),
        completed_at: None,
    };

    let connection = connect(&state.db_path)?;
    connection
        .execute(
            "
            INSERT INTO tasks (id, title, completed, created_at, updated_at, completed_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ",
            params![
                task.id,
                task.title,
                0,
                task.created_at,
                task.updated_at,
                task.completed_at
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(task)
}

#[tauri::command]
fn set_task_completed(
    id: String,
    completed: bool,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let completed_at = completed.then(now_ms);
    let updated_at = now_ms();
    let connection = connect(&state.db_path)?;

    let changed = connection
        .execute(
            "
            UPDATE tasks
            SET completed = ?1, updated_at = ?2, completed_at = ?3
            WHERE id = ?4
            ",
            params![completed as i64, updated_at, completed_at, id],
        )
        .map_err(|error| error.to_string())?;

    if changed == 0 {
        return Err("Task not found.".to_string());
    }

    connection
        .query_row(
            "
            SELECT id, title, completed, created_at, updated_at, completed_at
            FROM tasks
            WHERE id = ?1
            ",
            params![id],
            row_to_task,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_task(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let connection = connect(&state.db_path)?;

    connection
        .execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn save_window_state(
    window_state: WindowState,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let connection = connect(&state.db_path)?;

    connection
        .execute(
            "
            INSERT INTO window_state (key, x, y, width, height, updated_at)
            VALUES ('main', ?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(key) DO UPDATE SET
                x = excluded.x,
                y = excluded.y,
                width = excluded.width,
                height = excluded.height,
                updated_at = excluded.updated_at
            ",
            params![
                window_state.x,
                window_state.y,
                window_state.width,
                window_state.height,
                now_ms()
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let db_path = app_data_db_path(app)?;
            init_database(&db_path)?;
            restore_window_state(app, &db_path)?;
            app.manage(AppState { db_path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_tasks,
            create_task,
            set_task_completed,
            delete_task,
            save_window_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
