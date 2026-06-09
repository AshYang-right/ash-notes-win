import {
  FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { CalendarDays, Minus, Plus, Trash2, X } from "lucide-react";
import "./App.css";

type Task = {
  id: string;
  title: string;
  completed: boolean;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
};

type CompletionDayStat = {
  date: string;
  completed_count: number;
};

type AnalyticsMetadata = Record<string, unknown>;

type HeatmapDay = {
  date: Date;
  key: string;
  completedCount: number;
  isToday: boolean;
};

const HEATMAP_DAYS = 90;
const COMPLETION_STATS_METRIC = "effective_completed_tasks_count";
const TASK_REORDER_ANIMATION_MS = 280;
const TASK_REORDER_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const SESSION_ID = `session-${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;
const currentWindow = getCurrentWindow();

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function compareTasksForDisplay(left: Task, right: Task) {
  if (left.completed !== right.completed) {
    return Number(left.completed) - Number(right.completed);
  }

  if (left.completed) {
    const leftCompletedAt = left.completed_at ?? left.updated_at;
    const rightCompletedAt = right.completed_at ?? right.updated_at;

    if (leftCompletedAt !== rightCompletedAt) {
      return leftCompletedAt - rightCompletedAt;
    }
  }

  if (left.created_at !== right.created_at) {
    return right.created_at - left.created_at;
  }

  return left.id.localeCompare(right.id);
}

function orderTasksForDisplay(tasks: Task[]) {
  return [...tasks].sort(compareTasksForDisplay);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown) {
  const message = errorMessage(error).toLowerCase();

  if (message.includes("permission") || message.includes("not allowed")) {
    return "permission_denied";
  }

  if (message.includes("label") && message.includes("exist")) {
    return "window_label_exists";
  }

  if (message.includes("invalid") && message.includes("url")) {
    return "invalid_window_url";
  }

  if (message.includes("webview")) {
    return "webview_error";
  }

  if (message.includes("window")) {
    return "window_error";
  }

  return "unknown_error";
}

function sourceWindow() {
  return currentWindow.label || "main";
}

async function recordAnalyticsEvent(
  eventType: string,
  metadata: AnalyticsMetadata = {},
  options: {
    entityType?: string;
    entityId?: string;
    sourceWindow?: string;
  } = {},
) {
  try {
    await invoke("record_user_event", {
      event: {
        eventType,
        sourceWindow: options.sourceWindow ?? sourceWindow(),
        entityType: options.entityType,
        entityId: options.entityId,
        sessionId: SESSION_ID,
        metadata: {
          schema_version: 1,
          occurred_at_client: Date.now(),
          ...metadata,
        },
      },
    });
  } catch (eventError) {
    console.error("Unable to record analytics event", eventError);
  }
}

function debugStatsWindow(message: string, metadata: AnalyticsMetadata = {}) {
  const payload = {
    window_label: sourceWindow(),
    route: window.location.hash || "#/",
    timestamp: Date.now(),
    ...metadata,
  };

  console.info(`[AshNotes stats] ${message}`, payload);
  void invoke("debug_log", {
    label: "stats_window",
    message,
    metadata: payload,
  }).catch((debugError) => {
    console.error("Unable to write Rust debug log", debugError);
  });
}

function localDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatCreatedAt(timestamp: number) {
  const createdAt = new Date(timestamp);
  const now = new Date();
  const today = startOfLocalDay(now);
  const createdDay = startOfLocalDay(createdAt);

  if (createdDay.getTime() === today.getTime()) {
    return createdAt.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const dayInMs = 24 * 60 * 60 * 1000;
  const daysAgo = Math.max(
    1,
    Math.floor((today.getTime() - createdDay.getTime()) / dayInMs),
  );

  return `${daysAgo}天前`;
}

function formatCalendarDate(date: Date) {
  return date.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function buildEmptyHeatmapDays() {
  const today = startOfLocalDay(new Date());
  const firstDay = addLocalDays(today, -(HEATMAP_DAYS - 1));

  return Array.from({ length: HEATMAP_DAYS }, (_, index) => {
    const date = addLocalDays(firstDay, index);
    return {
      date,
      key: localDayKey(date),
      completedCount: 0,
      isToday: localDayKey(date) === localDayKey(today),
    };
  });
}

function heatLevel(count: number) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

function computeCurrentStreak(days: HeatmapDay[]) {
  let streak = 0;

  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].completedCount === 0) break;
    streak += 1;
  }

  return streak;
}

function Titlebar({
  onOpenStats,
  onClose,
  title = "AshNotes",
}: {
  onOpenStats?: () => void;
  onClose?: () => void;
  title?: string;
}) {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="title-lockup" data-tauri-drag-region>
        <span className="brand-mark" data-tauri-drag-region />
        <span className="brand-name" data-tauri-drag-region>
          {title}
        </span>
      </div>
      <div className="window-actions">
        {onOpenStats ? (
          <button
            className="icon-button"
            type="button"
            aria-label="Open stats"
            title="Open stats"
            onClick={onOpenStats}
          >
            <CalendarDays size={15} strokeWidth={2.2} />
          </button>
        ) : null}
        <button
          className="icon-button"
          type="button"
          aria-label="Minimize"
          title="Minimize"
          onClick={() => currentWindow.minimize()}
        >
          <Minus size={15} strokeWidth={2.2} />
        </button>
        <button
          className="icon-button danger"
          type="button"
          aria-label="Close"
          title="Close"
          onClick={onClose ?? (() => currentWindow.close())}
        >
          <X size={15} strokeWidth={2.2} />
        </button>
      </div>
    </header>
  );
}

function TaskWindow() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [taskMenu, setTaskMenu] = useState<{
    taskId: string;
    x: number;
    y: number;
  } | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const ignoreNextEditBlur = useRef(false);
  const taskItemRefs = useRef(new Map<string, HTMLElement>());
  const previousTaskRects = useRef(new Map<string, DOMRect>());
  const shouldAnimateTaskList = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const draftEventTimer = useRef<number | undefined>(undefined);
  const taskToggleQueues = useRef(new Map<string, Promise<void>>());
  const latestTaskCompletionIntent = useRef(new Map<string, boolean>());
  const hasRecordedInitialOpen = useRef(false);

  const openCount = useMemo(
    () => tasks.filter((task) => !task.completed).length,
    [tasks],
  );

  useEffect(() => {
    loadTasks();

    if (!hasRecordedInitialOpen.current) {
      hasRecordedInitialOpen.current = true;
      void recordAnalyticsEvent("app_opened", {
        screen: "task_window",
        route: window.location.hash || "#/",
        window_label: sourceWindow(),
      });
    }
  }, []);

  useEffect(() => {
    window.clearTimeout(draftEventTimer.current);

    if (!draft) return;

    draftEventTimer.current = window.setTimeout(() => {
      void recordAnalyticsEvent("task_draft_changed", {
        screen: "task_window",
        ui_target: "task_draft",
        ui_action: "changed",
        title_length: draft.length,
        trimmed_length: draft.trim().length,
        is_empty: draft.trim().length === 0,
      });
    }, 450);

    return () => window.clearTimeout(draftEventTimer.current);
  }, [draft]);

  useEffect(() => {
    if (!taskMenu) return;

    const closeTaskMenu = () => setTaskMenu(null);
    const closeTaskMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTaskMenu(null);
      }
    };

    window.addEventListener("click", closeTaskMenu);
    window.addEventListener("keydown", closeTaskMenuOnEscape);

    return () => {
      window.removeEventListener("click", closeTaskMenu);
      window.removeEventListener("keydown", closeTaskMenuOnEscape);
    };
  }, [taskMenu]);

  useEffect(() => {
    if (!editingTaskId) return;

    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [editingTaskId]);

  useLayoutEffect(() => {
    if (!shouldAnimateTaskList.current) return;

    shouldAnimateTaskList.current = false;
    const previousRects = previousTaskRects.current;
    previousTaskRects.current = new Map();

    if (prefersReducedMotion()) return;

    taskItemRefs.current.forEach((element, taskId) => {
      const previousRect = previousRects.get(taskId);
      if (!previousRect) return;

      const currentRect = element.getBoundingClientRect();
      const deltaX = previousRect.left - currentRect.left;
      const deltaY = previousRect.top - currentRect.top;

      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

      element.getAnimations().forEach((animation) => animation.cancel());
      element.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: TASK_REORDER_ANIMATION_MS,
          easing: TASK_REORDER_EASING,
        },
      );
    });
  }, [tasks]);

  useEffect(() => {
    let cleanup: Array<() => void> = [];

    const persistWindowState = () => {
      window.clearTimeout(saveTimer.current);

      saveTimer.current = window.setTimeout(async () => {
        try {
          const [position, size] = await Promise.all([
            currentWindow.outerPosition(),
            currentWindow.outerSize(),
          ]);

          await invoke("save_window_state", {
            windowState: {
              key: "main",
              x: position.x,
              y: position.y,
              width: size.width,
              height: size.height,
            },
          });
        } catch (windowError) {
          console.error("Unable to save window state", windowError);
        }
      }, 250);
    };

    Promise.all([
      currentWindow.onMoved(persistWindowState),
      currentWindow.onResized(persistWindowState),
    ]).then((unlisteners) => {
      cleanup = unlisteners;
    });

    return () => {
      window.clearTimeout(saveTimer.current);
      cleanup.forEach((unlisten) => unlisten());
    };
  }, []);

  async function loadTasks() {
    try {
      setIsLoading(true);
      setError("");
      const loadedTasks = await invoke<Task[]>("list_tasks");
      setTasks(orderTasksForDisplay(loadedTasks));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  function captureTaskListPositions() {
    if (prefersReducedMotion()) return;

    const rects = new Map<string, DOMRect>();
    taskItemRefs.current.forEach((element, taskId) => {
      rects.set(taskId, element.getBoundingClientRect());
    });
    previousTaskRects.current = rects;
    shouldAnimateTaskList.current = true;
  }

  async function openStatsWindow() {
    debugStatsWindow("stats entry clicked");
    await recordAnalyticsEvent("stats_entry_clicked", {
      screen: "task_window",
      ui_target: "stats_entry",
      ui_action: "click",
    });

    let statsLaunchStage = "get_existing_window";

    try {
      debugStatsWindow("checking existing stats window");
      let existingStatsWindow: WebviewWindow | null = null;

      try {
        statsLaunchStage = "get_existing_window";
        existingStatsWindow = await WebviewWindow.getByLabel("stats");
      } catch (lookupError) {
        debugStatsWindow("stats window lookup failed", {
          failure_stage: "get_existing_window",
          error_code: errorCode(lookupError),
        });
        throw lookupError;
      }
      debugStatsWindow("existing stats window lookup finished", {
        found_existing_window: Boolean(existingStatsWindow),
      });

      if (existingStatsWindow) {
        debugStatsWindow("showing existing stats window");
        try {
          statsLaunchStage = "show_existing";
          await existingStatsWindow.show();
        } catch (showError) {
          debugStatsWindow("show existing stats window failed", {
            failure_stage: "show_existing",
            error_code: errorCode(showError),
          });
          throw showError;
        }
        debugStatsWindow("focusing existing stats window");
        try {
          statsLaunchStage = "focus_existing";
          await existingStatsWindow.setFocus();
        } catch (focusError) {
          debugStatsWindow("focus existing stats window failed", {
            failure_stage: "focus_existing",
            error_code: errorCode(focusError),
          });
          throw focusError;
        }
        debugStatsWindow("existing stats window focused");
        await recordAnalyticsEvent("stats_window_focused", {
          screen: "task_window",
          ui_target: "stats_window",
          ui_action: "focus_existing",
          success: true,
        });
        return;
      }

      debugStatsWindow("creating stats window", {
        stats_url: "index.html#/stats",
        width: 980,
        height: 660,
      });
      statsLaunchStage = "create_window";
      const statsWindow = new WebviewWindow("stats", {
        url: "index.html#/stats",
        title: "AshNotes Stats",
        width: 980,
        height: 660,
        minWidth: 760,
        minHeight: 480,
        decorations: false,
        resizable: true,
        center: true,
        parent: "main",
        focus: true,
      });

      statsWindow.once("tauri://created", () => {
        debugStatsWindow("stats window created");
        void recordAnalyticsEvent("stats_window_opened", {
          screen: "task_window",
          ui_target: "stats_window",
          ui_action: "open_new",
          success: true,
        });
      });

      statsWindow.once("tauri://error", (event) => {
        debugStatsWindow("stats window create event failed", {
          failure_stage: "tauri_error_event",
          error_code: errorCode(event.payload),
        });
        void recordAnalyticsEvent("stats_window_open_failed", {
          screen: "task_window",
          ui_target: "stats_window",
          ui_action: "open_new",
          success: false,
          failure_stage: "tauri_error_event",
          error_code: errorCode(event.payload),
        });
      });
    } catch (statsError) {
      debugStatsWindow("stats window open threw", {
        failure_stage: statsLaunchStage,
        error_code: errorCode(statsError),
      });
      setError(errorMessage(statsError));
      await recordAnalyticsEvent("stats_window_open_failed", {
        screen: "task_window",
        ui_target: "stats_window",
        ui_action: "open_new",
        success: false,
        failure_stage: statsLaunchStage,
        error_code: errorCode(statsError),
      });
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = draft.trim();
    await recordAnalyticsEvent("task_create_submitted", {
      screen: "task_window",
      ui_target: "task_form",
      ui_action: "submit",
      input_method: "keyboard_submit",
      title_length: draft.length,
      trimmed_length: title.length,
      is_empty: title.length === 0,
      success: title.length > 0,
      error_code: title.length > 0 ? null : "empty_title",
    });

    if (!title) return;

    try {
      setError("");
      const task = await invoke<Task>("create_task", {
        title,
        sourceWindow: "main",
        trigger: "keyboard_submit",
        sessionId: SESSION_ID,
      });
      setTasks((currentTasks) => [task, ...currentTasks]);
      setDraft("");
    } catch (createError) {
      setError(errorMessage(createError));
      await recordAnalyticsEvent("task_create_failed", {
        screen: "task_window",
        ui_target: "task_form",
        ui_action: "submit",
        input_method: "keyboard_submit",
        title_length: title.length,
        success: false,
        error_code: errorMessage(createError),
      });
    }
  }

  async function setTaskCompleted(task: Task, completed: boolean) {
    latestTaskCompletionIntent.current.set(task.id, completed);
    void recordAnalyticsEvent(
      "task_checkbox_clicked",
      {
        screen: "task_window",
        ui_target: "task_checkbox",
        ui_action: "toggle",
        input_method: "pointer",
        task_id: task.id,
        task_title_snapshot: task.title,
        title_length: task.title.length,
        previous_completed: task.completed,
        next_completed: completed,
      },
      { entityType: "task", entityId: task.id },
    );

    const changedAt = Date.now();
    const optimisticTask = {
      ...task,
      completed,
      updated_at: changedAt,
      completed_at: completed ? changedAt : null,
    };

    captureTaskListPositions();
    setTasks((currentTasks) =>
      orderTasksForDisplay(
        currentTasks.map((currentTask) =>
          currentTask.id === task.id ? optimisticTask : currentTask,
        ),
      ),
    );

    const previousToggle = taskToggleQueues.current.get(task.id) ?? Promise.resolve();
    const toggleOperation = previousToggle
      .catch(() => undefined)
      .then(async () => {
        try {
          setError("");
          const updatedTask = await invoke<Task>("set_task_completed", {
            id: task.id,
            completed,
            sourceWindow: "main",
            trigger: "checkbox",
            sessionId: SESSION_ID,
          });

          if (latestTaskCompletionIntent.current.get(task.id) !== updatedTask.completed) {
            return;
          }

          setTasks((currentTasks) =>
            orderTasksForDisplay(
              currentTasks.map((currentTask) =>
                currentTask.id === task.id ? updatedTask : currentTask,
              ),
            ),
          );
        } catch (updateError) {
          if (latestTaskCompletionIntent.current.get(task.id) !== completed) {
            return;
          }

          setError(errorMessage(updateError));
          captureTaskListPositions();
          setTasks((currentTasks) =>
            orderTasksForDisplay(
              currentTasks.map((currentTask) =>
                currentTask.id === task.id ? task : currentTask,
              ),
            ),
          );
          await recordAnalyticsEvent(
            "task_checkbox_toggle_failed",
            {
              screen: "task_window",
              ui_target: "task_checkbox",
              ui_action: "toggle",
              task_id: task.id,
              previous_completed: task.completed,
              next_completed: completed,
              success: false,
              error_code: errorMessage(updateError),
            },
            { entityType: "task", entityId: task.id },
          );
        }
      });

    taskToggleQueues.current.set(task.id, toggleOperation);
    void toggleOperation.finally(() => {
      if (taskToggleQueues.current.get(task.id) === toggleOperation) {
        taskToggleQueues.current.delete(task.id);
      }
    });
  }

  async function startEditingTask(task: Task) {
    ignoreNextEditBlur.current = false;
    setTaskMenu(null);
    setEditingTaskId(task.id);
    setEditingTitle(task.title);

    await recordAnalyticsEvent(
      "task_title_edit_started",
      {
        screen: "task_window",
        ui_target: "task_title",
        ui_action: "edit_start",
        input_method: "double_click",
        task_id: task.id,
        task_title_snapshot: task.title,
        title_length: task.title.length,
        was_completed: task.completed,
      },
      { entityType: "task", entityId: task.id },
    );
  }

  async function cancelEditingTask(task: Task, inputMethod: string) {
    ignoreNextEditBlur.current = true;
    setEditingTaskId(null);
    setEditingTitle("");

    await recordAnalyticsEvent(
      "task_title_edit_cancelled",
      {
        screen: "task_window",
        ui_target: "task_title",
        ui_action: "edit_cancel",
        input_method: inputMethod,
        task_id: task.id,
        task_title_snapshot: task.title,
        title_length: task.title.length,
        attempted_title_length: editingTitle.length,
        attempted_trimmed_length: editingTitle.trim().length,
        was_completed: task.completed,
      },
      { entityType: "task", entityId: task.id },
    );
  }

  async function submitTaskTitleEdit(task: Task, inputMethod: string) {
    const title = editingTitle.trim();
    const changed = title !== task.title;
    const isEmpty = title.length === 0;

    await recordAnalyticsEvent(
      "task_title_edit_submitted",
      {
        screen: "task_window",
        ui_target: "task_title",
        ui_action: "edit_submit",
        input_method: inputMethod,
        task_id: task.id,
        task_title_snapshot: task.title,
        title_length: task.title.length,
        next_title_length: title.length,
        was_completed: task.completed,
        changed,
        success: !isEmpty,
        error_code: isEmpty ? "empty_title" : null,
      },
      { entityType: "task", entityId: task.id },
    );

    if (isEmpty) {
      setError("");
      setEditingTaskId(null);
      setEditingTitle("");
      return;
    }

    setError("");

    if (!changed) {
      setEditingTaskId(null);
      setEditingTitle("");
      return;
    }

    try {
      setError("");
      const updatedTask = await invoke<Task>("update_task_title", {
        id: task.id,
        title,
        sourceWindow: "main",
        trigger: inputMethod,
        sessionId: SESSION_ID,
      });

      setTasks((currentTasks) =>
        currentTasks.map((currentTask) =>
          currentTask.id === task.id ? updatedTask : currentTask,
        ),
      );
      setEditingTaskId(null);
      setEditingTitle("");
    } catch (updateError) {
      setError(errorMessage(updateError));
      await recordAnalyticsEvent(
        "task_title_edit_failed",
        {
          screen: "task_window",
          ui_target: "task_title",
          ui_action: "edit_submit",
          input_method: inputMethod,
          task_id: task.id,
          task_title_snapshot: task.title,
          title_length: task.title.length,
          next_title_length: title.length,
          success: false,
          error_code: errorMessage(updateError),
        },
        { entityType: "task", entityId: task.id },
      );
    }
  }

  async function deleteTask(taskId: string) {
    const task = tasks.find((currentTask) => currentTask.id === taskId);
    latestTaskCompletionIntent.current.delete(taskId);

    await recordAnalyticsEvent(
      "task_delete_clicked",
      {
        screen: "task_window",
        ui_target: "task_context_menu",
        ui_action: "delete",
        input_method: "context_menu",
        task_id: taskId,
        task_title_snapshot: task?.title ?? null,
        title_length: task?.title.length ?? null,
        was_completed: task?.completed ?? null,
      },
      { entityType: "task", entityId: taskId },
    );

    try {
      setError("");
      setTaskMenu(null);
      await invoke("delete_task", {
        id: taskId,
        sourceWindow: "main",
        trigger: "context_menu",
        sessionId: SESSION_ID,
      });
      setTasks((currentTasks) =>
        currentTasks.filter((currentTask) => currentTask.id !== taskId),
      );
    } catch (deleteError) {
      setError(errorMessage(deleteError));
      await recordAnalyticsEvent(
        "task_delete_failed",
        {
          screen: "task_window",
          ui_target: "task_context_menu",
          ui_action: "delete",
          task_id: taskId,
          success: false,
          error_code: errorMessage(deleteError),
        },
        { entityType: "task", entityId: taskId },
      );
    }
  }

  return (
    <main className="shell">
      <Titlebar onOpenStats={openStatsWindow} />

      <section className="composer">
        <form onSubmit={createTask} className="task-form">
          <input
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onFocus={() =>
              void recordAnalyticsEvent("task_draft_focused", {
                screen: "task_window",
                ui_target: "task_draft",
                ui_action: "focus",
                draft_length: draft.length,
                trimmed_length: draft.trim().length,
              })
            }
            placeholder="Add a task"
            aria-label="Add a task"
            autoFocus
          />
          <button className="add-button" type="submit" aria-label="Add">
            <Plus size={18} strokeWidth={2.4} />
          </button>
        </form>
        <div className="status-line">
          <span>{openCount} open</span>
          <span>{tasks.length} total</span>
        </div>
      </section>

      <section className="task-list" aria-live="polite">
        {isLoading ? (
          <div className="empty-state">Loading</div>
        ) : tasks.length === 0 ? (
          <div className="empty-state">No tasks yet</div>
        ) : (
          tasks.map((task) => (
            <article
              className={`task-item ${task.completed ? "completed" : ""}`}
              key={task.id}
              ref={(element) => {
                if (element) {
                  taskItemRefs.current.set(task.id, element);
                } else {
                  taskItemRefs.current.delete(task.id);
                }
              }}
              title="Right-click to delete"
              onContextMenu={(event) => {
                event.preventDefault();
                setTaskMenu({
                  taskId: task.id,
                  x: Math.max(
                    4,
                    Math.min(event.clientX, window.innerWidth - 118),
                  ),
                  y: Math.max(
                    4,
                    Math.min(event.clientY, window.innerHeight - 42),
                  ),
                });
                void recordAnalyticsEvent(
                  "task_context_menu_opened",
                  {
                    screen: "task_window",
                    ui_target: "task_item",
                    ui_action: "context_menu",
                    input_method: "right_click",
                    task_id: task.id,
                    task_title_snapshot: task.title,
                    title_length: task.title.length,
                    was_completed: task.completed,
                  },
                  { entityType: "task", entityId: task.id },
                );
              }}
            >
              <label className="task-check">
                <input
                  checked={task.completed}
                  type="checkbox"
                  onChange={(event) =>
                    setTaskCompleted(task, event.currentTarget.checked)
                  }
                />
                <span aria-hidden="true" />
              </label>
              {editingTaskId === task.id ? (
                <input
                  ref={editInputRef}
                  className="task-title-edit"
                  value={editingTitle}
                  aria-label="Edit task"
                  onChange={(event) => setEditingTitle(event.currentTarget.value)}
                  onBlur={() => {
                    if (ignoreNextEditBlur.current) {
                      ignoreNextEditBlur.current = false;
                      return;
                    }

                    void submitTaskTitleEdit(task, "blur");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      ignoreNextEditBlur.current = true;
                      void submitTaskTitleEdit(task, "enter_key");
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      void cancelEditingTask(task, "escape_key");
                    }
                  }}
                />
              ) : (
                <span
                  className="task-title"
                  title="Double-click to edit"
                  onDoubleClick={() => void startEditingTask(task)}
                >
                  {task.title}
                </span>
              )}
              <time
                className="task-created"
                dateTime={new Date(task.created_at).toISOString()}
              >
                {formatCreatedAt(task.created_at)}
              </time>
            </article>
          ))
        )}
      </section>

      {taskMenu ? (
        <div
          className="task-context-menu"
          role="menu"
          style={{ left: taskMenu.x, top: taskMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="task-context-menu-item"
            type="button"
            role="menuitem"
            onClick={() => deleteTask(taskMenu.taskId)}
          >
            <Trash2 size={15} strokeWidth={2.1} />
            Delete
          </button>
        </div>
      ) : null}

      {error ? <div className="error-line">{error}</div> : null}
    </main>
  );
}

function StatsWindow() {
  const [baseDays, setBaseDays] = useState<HeatmapDay[]>(() =>
    buildEmptyHeatmapDays(),
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    localDayKey(new Date()),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);
  const openedAt = useRef(Date.now());
  const hoveredDays = useRef(new Set<string>());

  const days = useMemo(() => baseDays, [baseDays]);
  const heatmapCells = useMemo(() => {
    const firstWeekday = (days[0].date.getDay() + 6) % 7;
    return [
      ...Array.from({ length: firstWeekday }, () => null),
      ...days,
    ] as Array<HeatmapDay | null>;
  }, [days]);
  const totalCompleted = useMemo(
    () => days.reduce((total, day) => total + day.completedCount, 0),
    [days],
  );
  const activeDays = useMemo(
    () => days.filter((day) => day.completedCount > 0).length,
    [days],
  );
  const bestDay = useMemo(
    () =>
      days.reduce(
        (best, day) =>
          day.completedCount > best.completedCount ? day : best,
        days[0],
      ),
    [days],
  );
  const currentStreak = useMemo(() => computeCurrentStreak(days), [days]);
  const selectedDay = useMemo(
    () => days.find((day) => day.key === selectedDate) ?? days[days.length - 1],
    [days, selectedDate],
  );

  useEffect(() => {
    void recordAnalyticsEvent("app_opened", {
      screen: "stats_window",
      route: window.location.hash,
      window_label: sourceWindow(),
    });
    void recordAnalyticsEvent("stats_window_loaded", {
      screen: "stats_window",
      ui_target: "stats_window",
      ui_action: "load",
      success: true,
    });
    loadStats();
  }, []);

  useEffect(() => {
    let cleanup: Array<() => void> = [];

    const persistWindowState = () => {
      window.clearTimeout(saveTimer.current);

      saveTimer.current = window.setTimeout(async () => {
        try {
          const [position, size] = await Promise.all([
            currentWindow.outerPosition(),
            currentWindow.outerSize(),
          ]);

          await invoke("save_window_state", {
            windowState: {
              key: "stats",
              x: position.x,
              y: position.y,
              width: size.width,
              height: size.height,
            },
          });
        } catch (windowError) {
          console.error("Unable to save stats window state", windowError);
        }
      }, 250);
    };

    Promise.all([
      currentWindow.onMoved(persistWindowState),
      currentWindow.onResized(persistWindowState),
    ]).then((unlisteners) => {
      cleanup = unlisteners;
    });

    return () => {
      window.clearTimeout(saveTimer.current);
      cleanup.forEach((unlisten) => unlisten());
    };
  }, []);

  async function loadStats() {
    const emptyDays = buildEmptyHeatmapDays();
    const startDate = emptyDays[0].key;
    const endDate = emptyDays[emptyDays.length - 1].key;

    try {
      setIsLoading(true);
      setError("");

      const stats = await invoke<CompletionDayStat[]>(
        "list_completion_day_stats",
        {
          startDate,
          endDate,
        },
      );
      const statsByDate = new Map(
        stats.map((stat) => [stat.date, stat.completed_count]),
      );
      const nextDays = emptyDays.map((day) => ({
        ...day,
        completedCount: statsByDate.get(day.key) ?? 0,
      }));

      setBaseDays(nextDays);
      setSelectedDate(endDate);
      await recordAnalyticsEvent("stats_heatmap_viewed", {
        screen: "stats_window",
        ui_target: "stats_heatmap",
        ui_action: "view",
        range_start_day: startDate,
        range_end_day: endDate,
        days: HEATMAP_DAYS,
        metric: COMPLETION_STATS_METRIC,
        nonzero_days: nextDays.filter((day) => day.completedCount > 0).length,
        total_completed: nextDays.reduce(
          (total, day) => total + day.completedCount,
          0,
        ),
        success: true,
      });
    } catch (loadError) {
      const message = errorMessage(loadError);
      setError(message);
      await recordAnalyticsEvent("stats_heatmap_load_failed", {
        screen: "stats_window",
        ui_target: "stats_heatmap",
        ui_action: "load",
        range_start_day: startDate,
        range_end_day: endDate,
        days: HEATMAP_DAYS,
        success: false,
        error_code: message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function closeStatsWindow() {
    const [position, size] = await Promise.all([
      currentWindow.outerPosition(),
      currentWindow.outerSize(),
    ]);

    await recordAnalyticsEvent("stats_window_closed", {
      screen: "stats_window",
      ui_target: "stats_window",
      ui_action: "close",
      close_reason: "titlebar_button",
      duration_ms: Date.now() - openedAt.current,
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    });
    await currentWindow.close();
  }

  function selectDay(day: HeatmapDay) {
    setSelectedDate(day.key);
    void recordAnalyticsEvent("stats_heatmap_day_selected", {
      screen: "stats_window",
      ui_target: "stats_heatmap_day",
      ui_action: "select",
      selected_day: day.key,
      completed_count: day.completedCount,
      metric: COMPLETION_STATS_METRIC,
    });
  }

  function recordDayHover(day: HeatmapDay) {
    if (hoveredDays.current.has(day.key)) return;

    hoveredDays.current.add(day.key);
    void recordAnalyticsEvent("stats_heatmap_day_hovered", {
      screen: "stats_window",
      ui_target: "stats_heatmap_day",
      ui_action: "hover",
      hovered_day: day.key,
      completed_count: day.completedCount,
      metric: COMPLETION_STATS_METRIC,
    });
  }

  return (
    <main className="shell stats-shell">
      <Titlebar title="AshNotes Stats" onClose={closeStatsWindow} />

      <section className="stats-layout">
        <aside className="stats-sidebar">
          <div className="stats-kicker">Last {HEATMAP_DAYS} days</div>
          <h1 className="stats-title">{totalCompleted}</h1>
          <div className="stats-subtitle">effective completions</div>

          <div className="stats-metrics" aria-label="Stats summary">
            <div className="stats-metric">
              <span>Active days</span>
              <strong>{activeDays}</strong>
            </div>
            <div className="stats-metric">
              <span>Streak</span>
              <strong>{currentStreak}</strong>
            </div>
            <div className="stats-metric">
              <span>Best day</span>
              <strong>{bestDay.completedCount}</strong>
            </div>
          </div>

          <div className="selected-day">
            <span>{formatCalendarDate(selectedDay.date)}</span>
            <strong>{selectedDay.completedCount}</strong>
          </div>

          <div className="heat-legend" aria-label="Contribution color scale">
            {[0, 1, 2, 3, 4].map((level) => (
              <span
                className={`heat-cell level-${level}`}
                key={level}
                aria-label={`Level ${level}`}
              />
            ))}
          </div>
        </aside>

        <section className="stats-board" aria-live="polite">
          <div className="heatmap-header">
            <span>{days[0].key}</span>
            <span>{days[days.length - 1].key}</span>
          </div>
          <div className="heatmap-wrap">
            <div className="weekday-labels" aria-hidden="true">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                (label) => (
                  <span key={label}>{label}</span>
                ),
              )}
            </div>
            <div className="heatmap-grid" role="grid" aria-label="Completion calendar">
              {heatmapCells.map((day, index) =>
                day ? (
                  <button
                    className={`heat-cell level-${heatLevel(
                      day.completedCount,
                    )} ${day.key === selectedDate ? "selected" : ""} ${
                      day.isToday ? "today" : ""
                    }`}
                    key={day.key}
                    type="button"
                    role="gridcell"
                    aria-label={`${day.key}: ${day.completedCount} effective completions`}
                    title={`${day.key}: ${day.completedCount} effective completions`}
                    onClick={() => selectDay(day)}
                    onMouseEnter={() => recordDayHover(day)}
                  />
                ) : (
                  <span
                    className="heat-cell spacer"
                    key={`spacer-${index}`}
                    aria-hidden="true"
                  />
                ),
              )}
            </div>
          </div>
          {isLoading ? <div className="stats-loading">Loading</div> : null}
          {error ? <div className="error-line stats-error">{error}</div> : null}
        </section>
      </section>
    </main>
  );
}

function App() {
  return window.location.hash === "#/stats" ? <StatsWindow /> : <TaskWindow />;
}

export default App;
