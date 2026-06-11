use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{window::Monitor, Manager, PhysicalPosition, PhysicalSize, State};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    db_path: PathBuf,
}

const EVENT_SCHEMA_VERSION: i64 = 1;
const EDGE_VISIBLE_STRIP_LOGICAL_PX: f64 = 14.0;
const EDGE_VISIBLE_STRIP_MIN_PX: i32 = 8;

#[cfg(target_os = "windows")]
const SM_SWAPBUTTON: i32 = 23;
#[cfg(target_os = "windows")]
const VK_LBUTTON: i32 = 0x01;
#[cfg(target_os = "windows")]
const VK_RBUTTON: i32 = 0x02;

#[cfg(target_os = "windows")]
#[link(name = "user32")]
#[allow(non_snake_case)]
extern "system" {
    fn GetAsyncKeyState(v_key: i32) -> i16;
    fn GetSystemMetrics(n_index: i32) -> i32;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DockEdge {
    Left,
    Right,
    Top,
}

impl DockEdge {
    fn as_str(self) -> &'static str {
        match self {
            DockEdge::Left => "left",
            DockEdge::Right => "right",
            DockEdge::Top => "top",
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct WorkArea {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
}

#[derive(Clone, Copy, Debug)]
struct WindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

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

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowState {
    #[serde(default)]
    key: Option<String>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    #[serde(default)]
    always_on_top: bool,
    #[serde(default)]
    dock_edge: Option<String>,
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

fn parse_dock_edge(value: Option<&str>) -> Option<DockEdge> {
    match value.map(str::trim) {
        Some("left") => Some(DockEdge::Left),
        Some("right") => Some(DockEdge::Right),
        Some("top") => Some(DockEdge::Top),
        _ => None,
    }
}

fn normalize_dock_edge(value: Option<String>) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };

    let clean_value = value.trim();
    if clean_value.is_empty() {
        return Ok(None);
    }

    let Some(edge) = parse_dock_edge(Some(clean_value)) else {
        return Err("dockEdge must be left, right, top, or null.".to_string());
    };

    Ok(Some(edge.as_str().to_string()))
}

fn monitor_work_area(monitor: &Monitor) -> WorkArea {
    let work_area = monitor.work_area();

    WorkArea {
        x: work_area.position.x,
        y: work_area.position.y,
        width: work_area.size.width,
        height: work_area.size.height,
        scale_factor: monitor.scale_factor(),
    }
}

fn scaled_edge_strip(scale_factor: f64) -> i32 {
    ((EDGE_VISIBLE_STRIP_LOGICAL_PX * scale_factor).round() as i32).max(EDGE_VISIBLE_STRIP_MIN_PX)
}

fn axis_end(start: i32, length: u32) -> i32 {
    (start as i64 + length as i64).clamp(i32::MIN as i64, i32::MAX as i64) as i32
}

fn clamp_axis(value: i32, length: u32, area_start: i32, area_length: u32) -> i32 {
    if length >= area_length {
        return area_start;
    }

    let max_value = axis_end(area_start, area_length) - length as i32;
    value.clamp(area_start, max_value)
}

fn clamp_to_work_area(bounds: WindowBounds, work_area: WorkArea) -> PhysicalPosition<i32> {
    PhysicalPosition::new(
        clamp_axis(bounds.x, bounds.width, work_area.x, work_area.width),
        clamp_axis(bounds.y, bounds.height, work_area.y, work_area.height),
    )
}

fn dock_expanded_position(
    edge: DockEdge,
    bounds: WindowBounds,
    work_area: WorkArea,
) -> PhysicalPosition<i32> {
    match edge {
        DockEdge::Left => PhysicalPosition::new(
            work_area.x,
            clamp_axis(bounds.y, bounds.height, work_area.y, work_area.height),
        ),
        DockEdge::Right => PhysicalPosition::new(
            axis_end(work_area.x, work_area.width) - bounds.width as i32,
            clamp_axis(bounds.y, bounds.height, work_area.y, work_area.height),
        ),
        DockEdge::Top => PhysicalPosition::new(
            clamp_axis(bounds.x, bounds.width, work_area.x, work_area.width),
            work_area.y,
        ),
    }
}

fn dock_collapsed_position(
    edge: DockEdge,
    expanded_position: PhysicalPosition<i32>,
    bounds: WindowBounds,
    work_area: WorkArea,
) -> PhysicalPosition<i32> {
    let strip = scaled_edge_strip(work_area.scale_factor);

    match edge {
        DockEdge::Left => PhysicalPosition::new(
            work_area.x - bounds.width as i32 + strip,
            expanded_position.y,
        ),
        DockEdge::Right => PhysicalPosition::new(
            axis_end(work_area.x, work_area.width) - strip,
            expanded_position.y,
        ),
        DockEdge::Top => PhysicalPosition::new(
            expanded_position.x,
            work_area.y - bounds.height as i32 + strip,
        ),
    }
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
                always_on_top INTEGER NOT NULL DEFAULT 0,
                dock_edge TEXT,
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

    ensure_window_state_schema(&connection)?;
    backfill_legacy_task_events(&connection)?;

    Ok(())
}

fn ensure_window_state_schema(connection: &Connection) -> Result<(), String> {
    let mut statement = connection
        .prepare("PRAGMA table_info(window_state)")
        .map_err(|error| error.to_string())?;

    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let has_always_on_top = columns.iter().any(|column| column == "always_on_top");
    let has_dock_edge = columns.iter().any(|column| column == "dock_edge");

    if !has_always_on_top {
        connection
            .execute(
                "ALTER TABLE window_state ADD COLUMN always_on_top INTEGER NOT NULL DEFAULT 0",
                [],
            )
            .map_err(|error| error.to_string())?;
    }

    if !has_dock_edge {
        connection
            .execute("ALTER TABLE window_state ADD COLUMN dock_edge TEXT", [])
            .map_err(|error| error.to_string())?;
    }

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

fn task_completion_metadata(
    task: &Task,
    previous_task: Option<&Task>,
    source_window: &str,
    trigger: &str,
    session_id: Option<&str>,
) -> Value {
    enrich_metadata(
        json!({
            "event_source": "task_command",
            "ui_action": "set_task_completed",
            "input_method": trigger,
            "task_id": &task.id,
            "task_title_snapshot": &task.title,
            "title_length": task.title.chars().count(),
            "previous_completed": previous_task.map(|task| task.completed),
            "next_completed": task.completed,
            "task_created_at": task.created_at,
            "previous_task_updated_at": previous_task.map(|task| task.updated_at),
            "task_updated_at": task.updated_at,
            "previous_completed_at": previous_task.and_then(|task| task.completed_at),
            "completed_at": task.completed_at,
            "success": true,
        }),
        "rust_command",
        source_window,
        session_id,
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

fn query_window_state(connection: &Connection, key: &str) -> Result<Option<WindowState>, String> {
    connection
        .query_row(
            "SELECT x, y, width, height, always_on_top, dock_edge FROM window_state WHERE key = ?1",
            params![key],
            |row| {
                let always_on_top: i64 = row.get(4)?;
                let dock_edge: Option<String> = row.get(5)?;
                Ok(WindowState {
                    key: Some(key.to_string()),
                    x: row.get(0)?,
                    y: row.get(1)?,
                    width: row.get(2)?,
                    height: row.get(3)?,
                    always_on_top: always_on_top == 1,
                    dock_edge: parse_dock_edge(dock_edge.as_deref())
                        .map(|edge| edge.as_str().to_string()),
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn load_main_window_state(db_path: &Path) -> Result<Option<WindowState>, String> {
    let connection = connect(db_path)?;
    query_window_state(&connection, "main")
}

fn restore_window_state(app: &tauri::App, db_path: &Path) -> Result<(), String> {
    let Some(saved_state) = load_main_window_state(db_path)? else {
        return Ok(());
    };

    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    window
        .set_size(PhysicalSize::new(saved_state.width, saved_state.height))
        .map_err(|error| error.to_string())?;

    let saved_bounds = WindowBounds {
        x: saved_state.x,
        y: saved_state.y,
        width: saved_state.width,
        height: saved_state.height,
    };
    let center_x = saved_bounds.x as f64 + saved_bounds.width as f64 / 2.0;
    let center_y = saved_bounds.y as f64 + saved_bounds.height as f64 / 2.0;
    let mut monitor = window
        .monitor_from_point(center_x, center_y)
        .map_err(|error| error.to_string())?;

    if monitor.is_none() {
        monitor = window
            .current_monitor()
            .map_err(|error| error.to_string())?;
    }

    if monitor.is_none() {
        monitor = window
            .primary_monitor()
            .map_err(|error| error.to_string())?;
    }

    let restored_position = if let Some(monitor) = monitor {
        let work_area = monitor_work_area(&monitor);

        if let Some(edge) = parse_dock_edge(saved_state.dock_edge.as_deref()) {
            let expanded_position = dock_expanded_position(edge, saved_bounds, work_area);
            dock_collapsed_position(edge, expanded_position, saved_bounds, work_area)
        } else {
            clamp_to_work_area(saved_bounds, work_area)
        }
    } else {
        PhysicalPosition::new(saved_state.x, saved_state.y)
    };

    window
        .set_position(restored_position)
        .map_err(|error| error.to_string())?;
    window
        .set_always_on_top(saved_state.always_on_top)
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
            ORDER BY
                completed ASC,
                CASE WHEN completed = 0 THEN created_at END DESC,
                CASE WHEN completed = 1 THEN COALESCE(completed_at, updated_at) END ASC,
                created_at DESC
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
    let metadata = task_completion_metadata(
        &updated_task,
        Some(&current_task),
        &source_window,
        &trigger,
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
fn update_task_title(
    id: String,
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

    if current_task.title == clean_title {
        return Ok(current_task);
    }

    let updated_at = now_ms();
    let updated_task = Task {
        title: clean_title.to_string(),
        updated_at,
        ..current_task.clone()
    };

    transaction
        .execute(
            "
            UPDATE tasks
            SET title = ?1, updated_at = ?2
            WHERE id = ?3
            ",
            params![
                &updated_task.title,
                updated_task.updated_at,
                &updated_task.id
            ],
        )
        .map_err(|error| error.to_string())?;

    let metadata = enrich_metadata(
        json!({
            "event_source": "task_command",
            "ui_action": "update_task_title",
            "input_method": trigger,
            "task_id": &updated_task.id,
            "task_title_snapshot": &updated_task.title,
            "previous_task_title_snapshot": &current_task.title,
            "previous_title_length": current_task.title.chars().count(),
            "title_length": updated_task.title.chars().count(),
            "previous_completed": current_task.completed,
            "next_completed": updated_task.completed,
            "task_created_at": updated_task.created_at,
            "previous_task_updated_at": current_task.updated_at,
            "task_updated_at": updated_task.updated_at,
            "completed_at": updated_task.completed_at,
            "success": true,
        }),
        "rust_command",
        &source_window,
        session_id.as_deref(),
    );

    insert_user_event(
        &transaction,
        "task_title_updated",
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
            SELECT completed_events.local_day, COUNT(DISTINCT completed_events.entity_id)
            FROM user_events AS completed_events
            WHERE completed_events.event_type = 'task_completed'
                AND completed_events.local_day >= ?1
                AND completed_events.local_day <= ?2
                AND completed_events.entity_type = 'task'
                AND NOT EXISTS (
                    SELECT 1
                    FROM user_events AS uncompleted_events
                    WHERE uncompleted_events.event_type = 'task_uncompleted'
                        AND uncompleted_events.entity_type = 'task'
                        AND uncompleted_events.entity_id = completed_events.entity_id
                        AND uncompleted_events.local_day = completed_events.local_day
                )
            GROUP BY completed_events.local_day
            ORDER BY completed_events.local_day ASC
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

#[cfg(target_os = "windows")]
fn primary_mouse_virtual_key() -> i32 {
    let is_swapped = unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0;

    if is_swapped {
        VK_RBUTTON
    } else {
        VK_LBUTTON
    }
}

#[tauri::command]
fn is_primary_mouse_button_down() -> bool {
    #[cfg(target_os = "windows")]
    {
        let state = unsafe { GetAsyncKeyState(primary_mouse_virtual_key()) } as u16;
        return (state & 0x8000) != 0;
    }

    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[tauri::command]
fn get_window_state(
    key: Option<String>,
    state: State<'_, AppState>,
) -> Result<Option<WindowState>, String> {
    let connection = connect(&state.db_path)?;
    let key = clean_or_default(key, "main");

    query_window_state(&connection, &key)
}

#[tauri::command]
fn save_window_state(window_state: WindowState, state: State<'_, AppState>) -> Result<(), String> {
    let connection = connect(&state.db_path)?;
    let key = clean_or_default(window_state.key, "main");
    let dock_edge = normalize_dock_edge(window_state.dock_edge)?;

    connection
        .execute(
            "
            INSERT INTO window_state (key, x, y, width, height, always_on_top, dock_edge, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(key) DO UPDATE SET
                x = excluded.x,
                y = excluded.y,
                width = excluded.width,
                height = excluded.height,
                always_on_top = excluded.always_on_top,
                dock_edge = excluded.dock_edge,
                updated_at = excluded.updated_at
            ",
            params![
                key,
                window_state.x,
                window_state.y,
                window_state.width,
                window_state.height,
                window_state.always_on_top as i64,
                dock_edge,
                now_ms()
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn work_area() -> WorkArea {
        WorkArea {
            x: -1280,
            y: 0,
            width: 1280,
            height: 900,
            scale_factor: 1.25,
        }
    }

    #[test]
    fn clamp_to_work_area_keeps_normal_window_visible() {
        let position = clamp_to_work_area(
            WindowBounds {
                x: -4000,
                y: 1200,
                width: 420,
                height: 560,
            },
            work_area(),
        );

        assert_eq!(position.x, -1280);
        assert_eq!(position.y, 340);
    }

    #[test]
    fn right_dock_collapses_to_visible_strip() {
        let bounds = WindowBounds {
            x: -500,
            y: 20,
            width: 420,
            height: 560,
        };
        let work_area = work_area();
        let expanded = dock_expanded_position(DockEdge::Right, bounds, work_area);
        let collapsed = dock_collapsed_position(DockEdge::Right, expanded, bounds, work_area);

        assert_eq!(expanded.x, -420);
        assert_eq!(expanded.y, 20);
        assert_eq!(collapsed.x, -18);
        assert_eq!(collapsed.y, 20);
    }

    #[test]
    fn oversized_left_dock_still_exposes_strip() {
        let bounds = WindowBounds {
            x: -1280,
            y: 0,
            width: 1600,
            height: 1000,
        };
        let work_area = work_area();
        let expanded = dock_expanded_position(DockEdge::Left, bounds, work_area);
        let collapsed = dock_collapsed_position(DockEdge::Left, expanded, bounds, work_area);

        assert_eq!(expanded.x, -1280);
        assert_eq!(expanded.y, 0);
        assert_eq!(collapsed.x, -2862);
        assert_eq!(collapsed.y, 0);
    }

    #[test]
    fn invalid_dock_edge_is_rejected_for_saves() {
        assert!(normalize_dock_edge(Some("bottom".to_string())).is_err());
        assert_eq!(
            normalize_dock_edge(Some(" top ".to_string())).unwrap(),
            Some("top".to_string())
        );
        assert_eq!(normalize_dock_edge(None).unwrap(), None);
    }
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
            update_task_title,
            delete_task,
            record_user_event,
            list_completion_day_stats,
            list_user_events,
            debug_log,
            is_primary_mouse_button_down,
            get_window_state,
            save_window_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
