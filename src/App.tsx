import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Plus, Trash2, X } from "lucide-react";
import "./App.css";

type Task = {
  id: string;
  title: string;
  completed: boolean;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
};

const currentWindow = getCurrentWindow();

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);

  const openCount = useMemo(
    () => tasks.filter((task) => !task.completed).length,
    [tasks],
  );

  useEffect(() => {
    loadTasks();
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
      setTasks(await invoke<Task[]>("list_tasks"));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = draft.trim();
    if (!title) return;

    try {
      setError("");
      const task = await invoke<Task>("create_task", { title });
      setTasks((currentTasks) => [task, ...currentTasks]);
      setDraft("");
    } catch (createError) {
      setError(errorMessage(createError));
    }
  }

  async function setTaskCompleted(task: Task, completed: boolean) {
    try {
      setError("");
      const updatedTask = await invoke<Task>("set_task_completed", {
        id: task.id,
        completed,
      });

      setTasks((currentTasks) =>
        currentTasks.map((currentTask) =>
          currentTask.id === task.id ? updatedTask : currentTask,
        ),
      );
    } catch (updateError) {
      setError(errorMessage(updateError));
    }
  }

  async function deleteTask(taskId: string) {
    try {
      setError("");
      await invoke("delete_task", { id: taskId });
      setTasks((currentTasks) =>
        currentTasks.filter((task) => task.id !== taskId),
      );
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  }

  return (
    <main className="shell">
      <header className="titlebar" data-tauri-drag-region>
        <div className="title-lockup" data-tauri-drag-region>
          <span className="brand-mark" data-tauri-drag-region />
          <span className="brand-name" data-tauri-drag-region>
            AshNotes
          </span>
        </div>
        <div className="window-actions">
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
            onClick={() => currentWindow.close()}
          >
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      <section className="composer">
        <form onSubmit={createTask} className="task-form">
          <input
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
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
              <span className="task-title">{task.title}</span>
              <button
                className="icon-button task-delete"
                type="button"
                aria-label="Delete task"
                title="Delete"
                onClick={() => deleteTask(task.id)}
              >
                <Trash2 size={16} strokeWidth={2.1} />
              </button>
            </article>
          ))
        )}
      </section>

      {error ? <div className="error-line">{error}</div> : null}
    </main>
  );
}

export default App;
