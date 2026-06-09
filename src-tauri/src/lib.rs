use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
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

const EVENT_SCHEMA_VERSION: i64 = 1;

#[derive(Clone, Debug, Serialize)]
struct Task {
    id: String,
    title: String,
    completed: bool,
    created_at: i64,
    updated_at: i64,
    completed_at: Option<i64>,
}

#[derive(Debug, Serialize)]
struct CompletionDayStat {
    date: String,
    completed_count: i64,
}

#[derive(Debug, Serialize)]
struct UserEvent {
    id: String,
    event_type: String,
    occurred_at: i64,
    local_day: String,
    timezone_offset_minutes: i64,
    source_window: String,
    entity_type: Option<String>,
    entity_id: Option<String>,
    metadata_json: String,
    schema_version: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserEventInput {
    event_type: String,
    #[serde(default)]
    source_window: Option<String>,
    #[serde(default)]
    entity_type: Option<String>,
    #[serde(default)]
    entity_id: Option<String>,
    #[serde(default)]
    metadata: Option<Value>,
    #[serde(default)]
    session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowState {
    #[serde(default)]
    key: Option<String>,
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

            CREATE TABLE IF NOT EXISTS user_events (
                id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                occurred_at INTEGER NOT NULL,
                local_day TEXT NOT NULL,
                timezone_offset_minutes INTEGER NOT NULL,
                source_window TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                schema_version INTEGER NOT NULL DEFAULT 1
            );

            CREATE INDEX IF NOT EXISTS idx_user_events_type_day
            ON user_events(event_type, local_day);

            CREATE INDEX IF NOT EXISTS idx_user_events_entity
            ON user_events(entity_type, entity_id, occurred_at);

            CREATE TABLE IF NOT EXISTS analytics_migrations (
                key TEXT PRIMARY KEY,
                applied_at INTEGER NOT NULL
            );
            ",
        )
        .map_err(|error| error.to_string())?;

    backfill_legacy_task_events(&connection)?;

    Ok(())
}

fn clean_or_default(value: Option<String>, fallback: &str) -> String {
    let Some(value) = value else {
        return fallback.to_string();
    };

    let clean_value = value.trim();
    if clean_value.is_empty() {
        fallback.to_string()
    } else {
        clean_value.to_string()
    }
}

fn enrich_metadata(
    metadata: Value,
    source: &str,
    source_window: &str,
    session_id: Option<&str>,
) -> Value {
    let mut metadata = match metadata {
        Value::Object(metadata) => metadata,
        other => {
            let mut wrapped = Map::new();
            wrapped.insert("value".to_string(), other);
            wrapped
        }
    };

    metadata
        .entry("source".to_string())
        .or_insert_with(|| json!(source));
    metadata
        .entry("app_version".to_string())
        .or_insert_with(|| json!(env!("CARGO_PKG_VERSION")));
    metadata
        .entry("window_label".to_string())
        .or_insert_with(|| json!(source_window));

    if let Some(session_id) = session_id {
        metadata
            .entry("session_id".to_string())
            .or_insert_with(|| json!(session_id));
    }

    Value::Object(metadata)
}

fn insert_user_event_with_mode(
    connection: &Connection,
    event_id: String,
    event_type: &str,
    occurred_at: i64,
    source_window: &str,
    entity_type: Option<&str>,
    entity_id: Option<&str>,
    metadata: &Value,
    ignore_duplicate: bool,
) -> Result<(), String> {
    let sql = if ignore_duplicate {
        "
        INSERT OR IGNORE INTO user_events (
            id,
            event_type,
            occurred_at,
            local_day,
            timezone_offset_minutes,
            source_window,
            entity_type,
            entity_id,
            metadata_json,
            schema_version
        )
        VALUES (
            ?1,
            ?2,
            ?3,
            date(?3 / 1000, 'unixepoch', 'localtime'),
            CAST(round(
                (
                    julianday(?3 / 1000, 'unixepoch', 'localtime') -
                    julianday(?3 / 1000, 'unixepoch')
                ) * 1440
            ) AS INTEGER),
            ?4,
            ?5,
            ?6,
            ?7,
            ?8
        )
        "
    } else {
        "
        INSERT INTO user_events (
            id,
            event_type,
            occurred_at,
            local_day,
            timezone_offset_minutes,
            source_window,
            entity_type,
            entity_id,
            metadata_json,
            schema_version
        )
        VALUES (
            ?1,
            ?2,
            ?3,
            date(?3 / 1000, 'unixepoch', 'localtime'),
            CAST(round(
                (
                    julianday(?3 / 1000, 'unixepoch', 'localtime') -
                    julianday(?3 / 1000, 'unixepoch')
                ) * 1440
            ) AS INTEGER),
            ?4,
            ?5,
            ?6,
            ?7,
            ?8
        )
        "
    };

    connection
        .execute(
            sql,
            params![
                event_id,
                event_type,
                occurred_at,
                source_window,
                entity_type,
                entity_id,
                metadata.to_string(),
                EVENT_SCHEMA_VERSION
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn insert_user_event(
    connection: &Connection,
    event_type: &str,
    occurred_at: i64,
    source_window: &str,
    entity_type: Option<&str>,
    entity_id: Option<&str>,
    metadata: &Value,
) -> Result<(), String> {
    insert_user_event_with_mode(
        connection,
        Uuid::new_v4().to_string(),
        event_type,
        occurred_at,
        source_window,
        entity_type,
        entity_id,
        metadata,
        false,
    )
}

fn backfill_legacy_task_events(connection: &Connection) -> Result<(), String> {
    let already_applied = connection
        .query_row(
            "SELECT 1 FROM analytics_migrations WHERE key = 'legacy_task_events_v1'",
            [],
            |_| Ok(()),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .is_some();

    if already_applied {
        return Ok(());
    }

    let tasks = {
        let mut statement = connection
            .prepare(
                "
                SELECT id, title, completed, created_at, updated_at, completed_at
                FROM tasks
                ORDER BY created_at ASC
                ",
            )
            .map_err(|error| error.to_string())?;

        let tasks = statement
            .query_map([], row_to_task)
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        tasks
    };

    for task in tasks {
        let created_metadata = enrich_metadata(
            json!({
                "legacy": true,
                "event_source": "legacy_backfill",
                "task_id": &task.id,
                "task_title_snapshot": &task.title,
                "title_length": task.title.chars().count(),
                "previous_completed": null,
                "next_completed": false,
                "task_created_at": task.created_at,
                "task_updated_at": task.updated_at,
                "completed_at": task.completed_at,
            }),
            "rust_command",
            "legacy",
            None,
        );

        insert_user_event_with_mode(
            connection,
            format!("legacy-task-created-{}", task.id),
            "task_created",
            task.created_at,
            "legacy",
            Some("task"),
            Some(&task.id),
            &created_metadata,
            true,
        )?;

        if let Some(completed_at) = task.completed_at {
            let completed_metadata = enrich_metadata(
                json!({
                    "legacy": true,
                    "event_source": "legacy_backfill",
                    "task_id": &task.id,
                    "task_title_snapshot": &task.title,
                    "title_length": task.title.chars().count(),
                    "previous_completed": false,
                    "next_completed": true,
                    "task_created_at": task.created_at,
                    "task_updated_at": task.updated_at,
                    "completed_at": completed_at,
                }),
                "rust_command",
                "legacy",
                None,
            );

            insert_user_event_with_mode(
                connection,
                format!("legacy-task-completed-{}-{}", task.id, completed_at),
                "task_completed",
                completed_at,
                "legacy",
                Some("task"),
                Some(&task.id),
                &completed_metadata,
                true,
            )?;
        }
    }

    connection
        .execute(
            "
            INSERT INTO analytics_migrations (key, applied_at)
            VALUES ('legacy_task_events_v1', ?1)
            ",
            params![now_ms()],
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

fn row_to_user_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<UserEvent> {
    Ok(UserEvent {
        id: row.get(0)?,
        event_type: row.get(1)?,
        occurred_at: row.get(2)?,
        local_day: row.get(3)?,
        timezone_offset_minutes: row.get(4)?,
        source_window: row.get(5)?,
        entity_type: row.get(6)?,
        entity_id: row.get(7)?,
        metadata_json: row.get(8)?,
        schema_version: row.get(9)?,
    })
}

fn is_valid_local_day(value: &str) -> bool {
    let bytes = value.as_bytes();

    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
}

fn load_window_state(db_path: &Path) -> Result<Option<WindowState>, String> {
    let connection = connect(db_path)?;

    connection
        .query_row(
            "SELECT x, y, width, height FROM window_state WHERE key = 'main'",
            [],
            |row| {
                Ok(WindowState {
                    key: None,
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
fn create_task(
    title: String,
    source_window: Option<String>,
    trigger: Option<String>,
    session_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let clean_title = title.trim();

    if clean_title.is_empty() {
        return Err("Task title cannot be empty.".to_string());
    }

    let timestamp = now_ms();
    let source_window = clean_or_default(source_window, "main");
    let trigger = clean_or_default(trigger, "unknown");
    let task = Task {
        id: Uuid::new_v4().to_string(),
        title: clean_title.to_string(),
        completed: false,
        created_at: timestamp,
        updated_at: timestamp,
        completed_at: None,
    };

    let mut connection = connect(&state.db_path)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "
            INSERT INTO tasks (id, title, completed, created_at, updated_at, completed_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ",
            params![
                &task.id,
                &task.title,
                0,
                task.created_at,
                task.updated_at,
                task.completed_at
            ],
        )
        .map_err(|error| error.to_string())?;

    let metadata = enrich_metadata(
        json!({
            "event_source": "task_command",
            "ui_action": "create_task",
            "input_method": trigger,
            "task_id": &task.id,
            "task_title_snapshot": &task.title,
            "title_length": task.title.chars().count(),
            "previous_completed": null,
            "next_completed": false,
            "task_created_at": task.created_at,
            "task_updated_at": task.updated_at,
            "completed_at": task.completed_at,
            "success": true,
        }),
        "rust_command",
        &source_window,
        session_id.as_deref(),
    );

    insert_user_event(
        &transaction,
        "task_created",
        timestamp,
        &source_window,
        Some("task"),
        Some(&task.id),
        &metadata,
    )?;

    transaction.commit().map_err(|error| error.to_string())?;

    Ok(task)
}

#[tauri::command]
fn set_task_completed(
    id: String,
    completed: bool,
    source_window: Option<String>,
    trigger: Option<String>,
    session_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let source_window = clean_or_default(source_window, "main");
    let trigger = clean_or_default(trigger, "unknown");
    let mut connection = connect(&state.db_path)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    let current_task = transaction
        .query_row(
            "
            SELECT id, title, completed, created_at, updated_at, completed_at
            FROM tasks
            WHERE id = ?1
            ",
            params![&id],
            row_to_task,
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Task not found.".to_string())?;

    if current_task.completed == completed {
        return Ok(current_task);
    }

    let updated_at = now_ms();
    let completed_at = completed.then_some(updated_at);
    let updated_task = Task {
        completed,
        updated_at,
        completed_at,
        ..current_task.clone()
    };

    transaction
        .execute(
            "
            UPDATE tasks
            SET completed = ?1, updated_at = ?2, completed_at = ?3
            WHERE id = ?4
            ",
            params![
                updated_task.completed as i64,
                updated_task.updated_at,
                updated_task.completed_at,
                &updated_task.id
            ],
        )
        .map_err(|error| error.to_string())?;

    let event_type = if completed {
        "task_completed"
    } else {
        "task_uncompleted"
    };
    let metadata = enrich_metadata(
        json!({
            "event_source": "task_command",
            "ui_action": "set_task_completed",
            "input_method": trigger,
            "task_id": &updated_task.id,
            "task_title_snapshot": &updated_task.title,
            "title_length": updated_task.title.chars().count(),
            "previous_completed": current_task.completed,
            "next_completed": updated_task.completed,
            "task_created_at": updated_task.created_at,
            "previous_task_updated_at": current_task.updated_at,
            "task_updated_at": updated_task.updated_at,
            "previous_completed_at": current_task.completed_at,
            "completed_at": updated_task.completed_at,
            "success": true,
        }),
        "rust_command",
        &source_window,
        session_id.as_deref(),
    );

    insert_user_event(
        &transaction,
        event_type,
        updated_at,
        &source_window,
        Some("task"),
        Some(&updated_task.id),
        &metadata,
    )?;

    transaction.commit().map_err(|error| error.to_string())?;

    Ok(updated_task)
}

#[tauri::command]
fn delete_task(
    id: String,
    source_window: Option<String>,
    trigger: Option<String>,
    session_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let source_window = clean_or_default(source_window, "main");
    let trigger = clean_or_default(trigger, "unknown");
    let deleted_at = now_ms();
    let mut connection = connect(&state.db_path)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    let task = transaction
        .query_row(
            "
            SELECT id, title, completed, created_at, updated_at, completed_at
            FROM tasks
            WHERE id = ?1
            ",
            params![&id],
            row_to_task,
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if let Some(task) = task {
        let metadata = enrich_metadata(
            json!({
                "event_source": "task_command",
                "ui_action": "delete_task",
                "input_method": trigger,
                "task_id": &task.id,
                "task_title_snapshot": &task.title,
                "title_length": task.title.chars().count(),
                "was_completed": task.completed,
                "previous_completed": task.completed,
                "next_completed": null,
                "task_created_at": task.created_at,
                "task_updated_at": task.updated_at,
                "completed_at": task.completed_at,
                "deleted_at": deleted_at,
                "task_age_ms": (deleted_at - task.created_at).max(0),
                "success": true,
            }),
            "rust_command",
            &source_window,
            session_id.as_deref(),
        );

        insert_user_event(
            &transaction,
            "task_deleted",
            deleted_at,
            &source_window,
            Some("task"),
            Some(&task.id),
            &metadata,
        )?;

        transaction
            .execute("DELETE FROM tasks WHERE id = ?1", params![&task.id])
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn record_user_event(event: UserEventInput, state: State<'_, AppState>) -> Result<(), String> {
    let event_type = event.event_type.trim();
    if event_type.is_empty() {
        return Err("Event type cannot be empty.".to_string());
    }

    let source_window = clean_or_default(event.source_window, "main");
    let metadata = enrich_metadata(
        event.metadata.unwrap_or_else(|| json!({})),
        "frontend_ui",
        &source_window,
        event.session_id.as_deref(),
    );

    let connection = connect(&state.db_path)?;
    insert_user_event(
        &connection,
        event_type,
        now_ms(),
        &source_window,
        event.entity_type.as_deref(),
        event.entity_id.as_deref(),
        &metadata,
    )
}

#[tauri::command]
fn list_completion_day_stats(
    start_date: String,
    end_date: String,
    state: State<'_, AppState>,
) -> Result<Vec<CompletionDayStat>, String> {
    if !is_valid_local_day(&start_date) || !is_valid_local_day(&end_date) {
        return Err("Date range must use YYYY-MM-DD local day keys.".to_string());
    }

    if start_date > end_date {
        return Err("Start date must be before or equal to end date.".to_string());
    }

    let connection = connect(&state.db_path)?;
    let mut statement = connection
        .prepare(
            "
            SELECT local_day, COUNT(*)
            FROM user_events
            WHERE event_type = 'task_completed'
                AND local_day >= ?1
                AND local_day <= ?2
            GROUP BY local_day
            ORDER BY local_day ASC
            ",
        )
        .map_err(|error| error.to_string())?;

    let stats = statement
        .query_map(params![start_date, end_date], |row| {
            Ok(CompletionDayStat {
                date: row.get(0)?,
                completed_count: row.get(1)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(stats)
}

#[tauri::command]
fn list_user_events(state: State<'_, AppState>) -> Result<Vec<UserEvent>, String> {
    let connection = connect(&state.db_path)?;
    let mut statement = connection
        .prepare(
            "
            SELECT
                id,
                event_type,
                occurred_at,
                local_day,
                timezone_offset_minutes,
                source_window,
                entity_type,
                entity_id,
                metadata_json,
                schema_version
            FROM user_events
            ORDER BY occurred_at DESC
            LIMIT 500
            ",
        )
        .map_err(|error| error.to_string())?;

    let events = statement
        .query_map([], row_to_user_event)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(events)
}

#[tauri::command]
fn debug_log(label: String, message: String, metadata: Option<Value>) {
    let label = label.trim();
    let message = message.trim();
    let label = if label.is_empty() { "debug" } else { label };
    let message = if message.is_empty() {
        "No debug message"
    } else {
        message
    };

    match metadata {
        Some(metadata) => println!("[AshNotes debug][{label}] {message}: {metadata}"),
        None => println!("[AshNotes debug][{label}] {message}"),
    }
}

#[tauri::command]
fn save_window_state(
    window_state: WindowState,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let connection = connect(&state.db_path)?;
    let key = clean_or_default(window_state.key, "main");

    connection
        .execute(
            "
            INSERT INTO window_state (key, x, y, width, height, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(key) DO UPDATE SET
                x = excluded.x,
                y = excluded.y,
                width = excluded.width,
                height = excluded.height,
                updated_at = excluded.updated_at
            ",
            params![
                key,
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
            record_user_event,
            list_completion_day_stats,
            list_user_events,
            debug_log,
            save_window_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
