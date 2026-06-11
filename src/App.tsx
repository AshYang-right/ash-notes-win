import {
  FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  currentMonitor,
  getCurrentWindow,
  monitorFromPoint,
  PhysicalPosition,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { CalendarDays, Minus, Pin, PinOff, Plus, Trash2, X } from "lucide-react";
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

type DockEdge = "left" | "right" | "top";
type DockPhase = "free" | "dockedExpanded" | "dockedCollapsed" | "animating";
type DockTargetPhase = "dockedExpanded" | "dockedCollapsed";
type DockTrigger =
  | "pointer_drag"
  | "hover"
  | "focus"
  | "blur"
  | "timeout"
  | "startup_restore"
  | "resize";

type WindowStateSnapshot = {
  key?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  alwaysOnTop?: boolean;
  dockEdge?: DockEdge | null;
};

type WindowPoint = {
  x: number;
  y: number;
};

type WindowSize = {
  width: number;
  height: number;
};

type WorkArea = {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
};

type DockGeometry = {
  edge: DockEdge;
  expanded: WindowPoint;
  collapsed: WindowPoint;
};

type DockSuccessEffect = {
  edge: DockEdge;
  token: number;
};

type DetectDockCandidateOptions = {
  debug?: boolean;
};

type SaveMainWindowStateOptions = {
  dockEdge?: DockEdge | null;
  position?: WindowPoint;
  size?: WindowSize;
};

const HEATMAP_DAYS = 90;
const COMPLETION_STATS_METRIC = "effective_completed_tasks_count";
const TASK_REORDER_ANIMATION_MS = 280;
const TASK_REORDER_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const EDGE_DOCK_THRESHOLD_LOGICAL_PX = 18;
const EDGE_VISIBLE_STRIP_LOGICAL_PX = 14;
const EDGE_VISIBLE_STRIP_MIN_PX = 8;
const EDGE_DOCK_EXPAND_MS = 180;
const EDGE_DOCK_COLLAPSE_MS = 220;
const EDGE_DOCK_COLLAPSE_DELAY_MS = 500;
const EDGE_DOCK_MOVE_SETTLE_MS = 220;
const EDGE_DOCK_PREVIEW_THROTTLE_MS = 48;
const EDGE_DOCK_SUCCESS_EFFECT_MS = 460;
const EDGE_DOCK_RELEASE_POLL_MS = 48;
const EDGE_DOCK_PROGRAMMATIC_MOVE_SETTLE_GRACE_MS = 360;
const EDGE_DOCK_RESIZE_SUPPRESS_MS = 450;
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

function isDockEdge(value: unknown): value is DockEdge {
  return value === "left" || value === "right" || value === "top";
}

function normalizeDockEdge(value: unknown): DockEdge | null {
  return isDockEdge(value) ? value : null;
}

function workAreaFromMonitor(monitor: Monitor): WorkArea {
  return {
    x: monitor.workArea.position.x,
    y: monitor.workArea.position.y,
    width: monitor.workArea.size.width,
    height: monitor.workArea.size.height,
    scaleFactor: monitor.scaleFactor,
  };
}

function scaledPhysicalPx(logicalPx: number, scaleFactor: number, minimum = 1) {
  return Math.max(minimum, Math.round(logicalPx * scaleFactor));
}

function workAreaRight(workArea: WorkArea) {
  return workArea.x + workArea.width;
}

function clampAxis(
  value: number,
  length: number,
  areaStart: number,
  areaLength: number,
) {
  if (length >= areaLength) return Math.round(areaStart);

  const maxValue = areaStart + areaLength - length;
  return Math.round(Math.min(Math.max(value, areaStart), maxValue));
}

function expandedDockPosition(
  edge: DockEdge,
  anchor: WindowPoint,
  size: WindowSize,
  workArea: WorkArea,
): WindowPoint {
  if (edge === "left") {
    return {
      x: Math.round(workArea.x),
      y: clampAxis(anchor.y, size.height, workArea.y, workArea.height),
    };
  }

  if (edge === "right") {
    return {
      x: Math.round(workAreaRight(workArea) - size.width),
      y: clampAxis(anchor.y, size.height, workArea.y, workArea.height),
    };
  }

  return {
    x: clampAxis(anchor.x, size.width, workArea.x, workArea.width),
    y: Math.round(workArea.y),
  };
}

function collapsedDockPosition(
  edge: DockEdge,
  expanded: WindowPoint,
  size: WindowSize,
  workArea: WorkArea,
  stripPx: number,
): WindowPoint {
  if (edge === "left") {
    return {
      x: Math.round(workArea.x - size.width + stripPx),
      y: expanded.y,
    };
  }

  if (edge === "right") {
    return {
      x: Math.round(workAreaRight(workArea) - stripPx),
      y: expanded.y,
    };
  }

  return {
    x: expanded.x,
    y: Math.round(workArea.y - size.height + stripPx),
  };
}

function samePoint(left: WindowPoint | null, right: WindowPoint | null) {
  return Boolean(left && right && left.x === right.x && left.y === right.y);
}

function cubicOut(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

function activeElementDebugInfo(): AnalyticsMetadata {
  const element = document.activeElement;

  if (!(element instanceof HTMLElement)) {
    return { active_element: "none" };
  }

  return {
    active_element: element.tagName.toLowerCase(),
    active_element_type:
      element instanceof HTMLInputElement ? element.type : null,
    active_element_class:
      typeof element.className === "string" ? element.className : null,
    active_element_role: element.getAttribute("role"),
    active_element_aria_label: element.getAttribute("aria-label"),
  };
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

function debugEdgeDock(message: string, metadata: AnalyticsMetadata = {}) {
  const payload = {
    window_label: sourceWindow(),
    route: window.location.hash || "#/",
    timestamp: Date.now(),
    ...metadata,
  };

  console.info(`[AshNotes edge] ${message}`, payload);
  void invoke("debug_log", {
    label: "edge_docking",
    message,
    metadata: payload,
  }).catch((debugError) => {
    console.error("Unable to write edge docking debug log", debugError);
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
  isAlwaysOnTop,
  onToggleAlwaysOnTop,
  onClose,
  title = "AshNotes",
}: {
  onOpenStats?: () => void;
  isAlwaysOnTop?: boolean;
  onToggleAlwaysOnTop?: () => void;
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
        {onToggleAlwaysOnTop ? (
          <button
            className={`icon-button ${isAlwaysOnTop ? "active" : ""}`}
            type="button"
            aria-label={isAlwaysOnTop ? "Unpin from top" : "Pin on top"}
            aria-pressed={Boolean(isAlwaysOnTop)}
            title={isAlwaysOnTop ? "Unpin from top" : "Pin on top"}
            onClick={onToggleAlwaysOnTop}
          >
            {isAlwaysOnTop ? (
              <PinOff size={15} strokeWidth={2.2} />
            ) : (
              <Pin size={15} strokeWidth={2.2} />
            )}
          </button>
        ) : null}
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
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [dockPhase, setDockPhase] = useState<DockPhase>("free");
  const [dockEdge, setDockEdge] = useState<DockEdge | null>(null);
  const [dockPreviewEdge, setDockPreviewEdge] = useState<DockEdge | null>(null);
  const [dockSuccessEffect, setDockSuccessEffect] =
    useState<DockSuccessEffect | null>(null);
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
  const isAlwaysOnTopRef = useRef(isAlwaysOnTop);
  const dockPhaseRef = useRef<DockPhase>("free");
  const dockEdgeRef = useRef<DockEdge | null>(null);
  const dockPreviewEdgeRef = useRef<DockEdge | null>(null);
  const expandedDockAnchor = useRef<WindowPoint | null>(null);
  const saveSuppressionDepth = useRef(0);
  const moveSettleTimer = useRef<number | undefined>(undefined);
  const dockPreviewTimer = useRef<number | undefined>(undefined);
  const dockPreviewLastCheckedAt = useRef(0);
  const dockSuccessTimer = useRef<number | undefined>(undefined);
  const dockSuccessEffectToken = useRef(0);
  const collapseTimer = useRef<number | undefined>(undefined);
  const programmaticMoveSuppressUntil = useRef(0);
  const resizeSuppressUntil = useRef(0);
  const animationFrame = useRef<number | undefined>(undefined);
  const activeAnimationId = useRef(0);
  const isPointerDown = useRef(false);
  const isWaitingForPointerRelease = useRef(false);
  const pointerDownStartedAt = useRef(0);
  const isComposingText = useRef(false);
  const draftRef = useRef(draft);
  const editingTaskIdRef = useRef(editingTaskId);
  const taskMenuRef = useRef(taskMenu);
  const positionQueue = useRef<{
    inFlight: boolean;
    pending: WindowPoint | null;
    lastSent: WindowPoint | null;
    idleResolvers: Array<() => void>;
    idleRejecters: Array<(error: unknown) => void>;
  }>({
    inFlight: false,
    pending: null,
    lastSent: null,
    idleResolvers: [],
    idleRejecters: [],
  });

  const openCount = useMemo(
    () => tasks.filter((task) => !task.completed).length,
    [tasks],
  );
  const isDocked = dockEdge !== null;

  useEffect(() => {
    isAlwaysOnTopRef.current = isAlwaysOnTop;
  }, [isAlwaysOnTop]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    editingTaskIdRef.current = editingTaskId;
  }, [editingTaskId]);

  useEffect(() => {
    taskMenuRef.current = taskMenu;
  }, [taskMenu]);

  useEffect(() => {
    loadTasks();
    void loadInitialWindowState();

    if (!hasRecordedInitialOpen.current) {
      hasRecordedInitialOpen.current = true;
      void recordAnalyticsEvent("app_opened", {
        screen: "task_window",
        route: window.location.hash || "#/",
        window_label: sourceWindow(),
      });
    }
  }, []);

  async function loadInitialWindowState() {
    try {
      const [alwaysOnTop, savedWindowState] = await Promise.all([
        currentWindow.isAlwaysOnTop(),
        invoke<WindowStateSnapshot | null>("get_window_state", { key: "main" }),
      ]);
      const savedDockEdge = normalizeDockEdge(savedWindowState?.dockEdge);

      debugEdgeDock("initial window state loaded", {
        always_on_top: alwaysOnTop,
        has_saved_state: Boolean(savedWindowState),
        saved_dock_edge: savedDockEdge,
        saved_x: savedWindowState?.x ?? null,
        saved_y: savedWindowState?.y ?? null,
        saved_width: savedWindowState?.width ?? null,
        saved_height: savedWindowState?.height ?? null,
      });

      isAlwaysOnTopRef.current = alwaysOnTop;
      setIsAlwaysOnTop(alwaysOnTop);

      if (savedWindowState && savedDockEdge) {
        expandedDockAnchor.current = {
          x: savedWindowState.x,
          y: savedWindowState.y,
        };
        setDockState("dockedCollapsed", savedDockEdge);
        await moveDockedWindow(savedDockEdge, "dockedCollapsed", {
          animate: false,
          trigger: "startup_restore",
          recordTransition: false,
        });
      }
    } catch (windowError) {
      debugEdgeDock("initial window state load failed", {
        error_code: errorCode(windowError),
      });
      console.error("Unable to load window state", windowError);
    }
  }

  function setDockState(nextPhase: DockPhase, nextEdge: DockEdge | null) {
    if (dockPhaseRef.current !== nextPhase || dockEdgeRef.current !== nextEdge) {
      debugEdgeDock("dock state changed", {
        previous_phase: dockPhaseRef.current,
        previous_edge: dockEdgeRef.current,
        next_phase: nextPhase,
        next_edge: nextEdge,
      });
    }

    dockPhaseRef.current = nextPhase;
    dockEdgeRef.current = nextEdge;
    setDockPhase(nextPhase);
    setDockEdge(nextEdge);
  }

  function setDockPreviewEdgeState(nextEdge: DockEdge | null) {
    if (dockPreviewEdgeRef.current === nextEdge) return;

    debugEdgeDock("dock preview changed", {
      previous_edge: dockPreviewEdgeRef.current,
      next_edge: nextEdge,
      phase: dockPhaseRef.current,
      active_edge: dockEdgeRef.current,
    });
    dockPreviewEdgeRef.current = nextEdge;
    setDockPreviewEdge(nextEdge);
  }

  function clearDockPreview() {
    window.clearTimeout(dockPreviewTimer.current);
    dockPreviewTimer.current = undefined;
    setDockPreviewEdgeState(null);
  }

  function clearDockSuccessEffect() {
    window.clearTimeout(dockSuccessTimer.current);
    dockSuccessTimer.current = undefined;
    setDockSuccessEffect(null);
  }

  function playDockSuccessEffect(edge: DockEdge) {
    window.clearTimeout(dockSuccessTimer.current);

    const token = dockSuccessEffectToken.current + 1;
    dockSuccessEffectToken.current = token;

    debugEdgeDock("dock success effect started", {
      edge,
      token,
      phase: dockPhaseRef.current,
    });
    setDockSuccessEffect({ edge, token });
    dockSuccessTimer.current = window.setTimeout(() => {
      if (dockSuccessEffectToken.current === token) {
        dockSuccessTimer.current = undefined;
        setDockSuccessEffect(null);
      }
    }, EDGE_DOCK_SUCCESS_EFFECT_MS);
  }

  function clearCollapseTimer() {
    window.clearTimeout(collapseTimer.current);
    collapseTimer.current = undefined;
  }

  function beginMoveSuppression() {
    saveSuppressionDepth.current += 1;
    isWaitingForPointerRelease.current = false;
    window.clearTimeout(moveSettleTimer.current);
    clearDockPreview();
    clearDockSuccessEffect();
  }

  function endMoveSuppression() {
    saveSuppressionDepth.current = Math.max(0, saveSuppressionDepth.current - 1);
    programmaticMoveSuppressUntil.current = Math.max(
      programmaticMoveSuppressUntil.current,
      Date.now() + EDGE_DOCK_PROGRAMMATIC_MOVE_SETTLE_GRACE_MS,
    );
    window.clearTimeout(moveSettleTimer.current);
  }

  function dockTransitionMetadata(
    edge: DockEdge,
    uiAction: "dock" | "expand" | "collapse" | "undock",
    trigger: DockTrigger,
    metadata: AnalyticsMetadata = {},
  ) {
    return {
      screen: "task_window",
      route: window.location.hash || "#/",
      ui_target: "window_edge",
      ui_action: uiAction,
      dock_edge: edge,
      trigger,
      ...metadata,
    };
  }

  async function recordDockAnimationFailure(
    edge: DockEdge,
    uiAction: "dock" | "expand" | "collapse" | "undock",
    trigger: DockTrigger,
    startedAt: number,
    failureStage: "measure" | "position_window" | "window_api",
    animationError: unknown,
  ) {
    await recordAnalyticsEvent(
      "window_edge_animation_failed",
      dockTransitionMetadata(edge, uiAction, trigger, {
        duration_ms: Math.round(performance.now() - startedAt),
        success: false,
        failure_stage: failureStage,
        error_code: errorCode(animationError),
      }),
    );
  }

  async function currentWindowSize(): Promise<WindowSize> {
    const size = await currentWindow.outerSize();
    return { width: size.width, height: size.height };
  }

  async function currentWindowPosition(): Promise<WindowPoint> {
    const position = await currentWindow.outerPosition();
    return { x: position.x, y: position.y };
  }

  async function isPrimaryMouseButtonDown() {
    try {
      return await invoke<boolean>("is_primary_mouse_button_down");
    } catch (mouseError) {
      debugEdgeDock("primary mouse button query failed", {
        error_code: errorCode(mouseError),
        pointer_down_ref: isPointerDown.current,
      });
      return isPointerDown.current;
    }
  }

  async function monitorForAnchor(
    anchor: WindowPoint,
    size: WindowSize,
  ): Promise<Monitor> {
    const centerX = anchor.x + size.width / 2;
    const centerY = anchor.y + size.height / 2;
    let monitor = await monitorFromPoint(centerX, centerY).catch(() => null);

    if (!monitor) {
      monitor = await currentMonitor().catch(() => null);
    }

    if (!monitor) {
      monitor = await primaryMonitor().catch(() => null);
    }

    if (!monitor) {
      throw new Error("monitor_unavailable");
    }

    return monitor;
  }

  async function resolveDockGeometry(
    edge: DockEdge,
    anchorOverride?: WindowPoint,
  ): Promise<DockGeometry> {
    const size = await currentWindowSize();
    const livePosition = await currentWindowPosition();
    const anchor = anchorOverride ?? expandedDockAnchor.current ?? livePosition;
    const workArea = workAreaFromMonitor(await monitorForAnchor(anchor, size));
    const stripPx = scaledPhysicalPx(
      EDGE_VISIBLE_STRIP_LOGICAL_PX,
      workArea.scaleFactor,
      EDGE_VISIBLE_STRIP_MIN_PX,
    );
    const expanded = expandedDockPosition(edge, anchor, size, workArea);
    const collapsed = collapsedDockPosition(
      edge,
      expanded,
      size,
      workArea,
      stripPx,
    );

    return { edge, expanded, collapsed };
  }

  async function detectDockCandidate(
    position: WindowPoint,
    size: WindowSize,
    options: DetectDockCandidateOptions = {},
  ): Promise<DockGeometry | null> {
    const shouldDebug = options.debug !== false;
    const workArea = workAreaFromMonitor(await monitorForAnchor(position, size));
    const thresholdPx = scaledPhysicalPx(
      EDGE_DOCK_THRESHOLD_LOGICAL_PX,
      workArea.scaleFactor,
      1,
    );
    const stripPx = scaledPhysicalPx(
      EDGE_VISIBLE_STRIP_LOGICAL_PX,
      workArea.scaleFactor,
      EDGE_VISIBLE_STRIP_MIN_PX,
    );
    const candidates: Array<{ edge: DockEdge; distance: number }> = [
      { edge: "left" as DockEdge, distance: Math.abs(position.x - workArea.x) },
      {
        edge: "right" as DockEdge,
        distance: Math.abs(position.x + size.width - workAreaRight(workArea)),
      },
      { edge: "top" as DockEdge, distance: Math.abs(position.y - workArea.y) },
    ];
    const matchingCandidates = candidates.filter(
      (candidate) => candidate.distance <= thresholdPx,
    );

    if (shouldDebug) {
      debugEdgeDock("dock candidate measured", {
        position_x: position.x,
        position_y: position.y,
        width: size.width,
        height: size.height,
        work_area_x: workArea.x,
        work_area_y: workArea.y,
        work_area_width: workArea.width,
        work_area_height: workArea.height,
        scale_factor: workArea.scaleFactor,
        threshold_px: thresholdPx,
        strip_px: stripPx,
        left_distance: candidates[0].distance,
        right_distance: candidates[1].distance,
        top_distance: candidates[2].distance,
        candidate_edges: matchingCandidates.map((candidate) => candidate.edge),
      });
    }

    if (matchingCandidates.length === 0) return null;

    matchingCandidates.sort((left, right) => left.distance - right.distance);
    const edge = matchingCandidates[0].edge;
    const expanded = expandedDockPosition(edge, position, size, workArea);
    const collapsed = collapsedDockPosition(
      edge,
      expanded,
      size,
      workArea,
      stripPx,
    );

    return { edge, expanded, collapsed };
  }

  async function isDockableWindowMode() {
    const [isMinimized, isMaximized, isFullscreen] = await Promise.all([
      currentWindow.isMinimized(),
      currentWindow.isMaximized(),
      currentWindow.isFullscreen(),
    ]);

    return !isMinimized && !isMaximized && !isFullscreen;
  }

  function shouldTrackDockPreview() {
    const phase = dockPhaseRef.current;
    const now = Date.now();

    return (
      (phase === "free" || phase === "dockedExpanded") &&
      saveSuppressionDepth.current === 0 &&
      now >= programmaticMoveSuppressUntil.current &&
      now >= resizeSuppressUntil.current
    );
  }

  async function updateDockPreview() {
    dockPreviewLastCheckedAt.current = performance.now();

    if (!shouldTrackDockPreview() || !(await isDockableWindowMode())) {
      setDockPreviewEdgeState(null);
      return;
    }

    if (!shouldTrackDockPreview()) {
      setDockPreviewEdgeState(null);
      return;
    }

    const [position, size] = await Promise.all([
      currentWindowPosition(),
      currentWindowSize(),
    ]);
    const candidate = await detectDockCandidate(position, size, {
      debug: false,
    });

    if (!shouldTrackDockPreview()) {
      setDockPreviewEdgeState(null);
      return;
    }

    setDockPreviewEdgeState(candidate?.edge ?? null);
  }

  function scheduleDockPreviewCheck() {
    if (!shouldTrackDockPreview()) {
      clearDockPreview();
      return;
    }

    if (dockPreviewTimer.current !== undefined) return;

    const elapsedMs = performance.now() - dockPreviewLastCheckedAt.current;
    const delayMs = Math.max(0, EDGE_DOCK_PREVIEW_THROTTLE_MS - elapsedMs);

    dockPreviewTimer.current = window.setTimeout(() => {
      dockPreviewTimer.current = undefined;
      void updateDockPreview().catch((previewError) => {
        setDockPreviewEdgeState(null);
        debugEdgeDock("dock preview failed", {
          error_code: errorCode(previewError),
          phase: dockPhaseRef.current,
          edge: dockEdgeRef.current,
        });
      });
    }, delayMs);
  }

  async function canAutoCollapse() {
    if (!(await isDockableWindowMode())) {
      debugEdgeDock("auto collapse blocked", {
        reason: "window_mode",
        phase: dockPhaseRef.current,
        edge: dockEdgeRef.current,
      });
      return false;
    }

    if (await isPrimaryMouseButtonDown()) {
      debugEdgeDock("auto collapse blocked", {
        reason: "primary_mouse_down",
        phase: dockPhaseRef.current,
        edge: dockEdgeRef.current,
      });
      return false;
    }

    if (isPointerDown.current) {
      debugEdgeDock("pointer down cleared after physical release", {
        phase: dockPhaseRef.current,
        edge: dockEdgeRef.current,
        pointer_age_ms: Date.now() - pointerDownStartedAt.current,
      });
      isPointerDown.current = false;
      pointerDownStartedAt.current = 0;
    }

    if (isComposingText.current) {
      debugEdgeDock("auto collapse blocked", {
        reason: "ime_composition",
        phase: dockPhaseRef.current,
        edge: dockEdgeRef.current,
      });
      return false;
    }

    if (editingTaskIdRef.current) {
      debugEdgeDock("auto collapse blocked", {
        reason: "task_title_editing",
        phase: dockPhaseRef.current,
        edge: dockEdgeRef.current,
      });
      return false;
    }

    if (taskMenuRef.current) {
      debugEdgeDock("auto collapse blocked", {
        reason: "task_menu_open",
        phase: dockPhaseRef.current,
        edge: dockEdgeRef.current,
      });
      return false;
    }

    const activeElement = document.activeElement;
    const activeTextInput =
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement;
    const focused = await currentWindow.isFocused().catch(() => false);

    if (focused && activeTextInput) {
      const isEmptyDraftInput =
        activeElement instanceof HTMLInputElement &&
        activeElement.getAttribute("aria-label") === "Add a task" &&
        draftRef.current.trim().length === 0;

      if (isEmptyDraftInput) {
        debugEdgeDock("auto collapse allowed with empty draft focus", {
          phase: dockPhaseRef.current,
          edge: dockEdgeRef.current,
          focused,
          draft_length: draftRef.current.length,
          ...activeElementDebugInfo(),
        });
        return true;
      }

      debugEdgeDock("auto collapse blocked", {
        reason: "focused_text_input",
        phase: dockPhaseRef.current,
        edge: dockEdgeRef.current,
        focused,
        draft_length: draftRef.current.length,
        ...activeElementDebugInfo(),
      });
      return false;
    }

    debugEdgeDock("auto collapse allowed", {
      phase: dockPhaseRef.current,
      edge: dockEdgeRef.current,
      focused,
      ...activeElementDebugInfo(),
    });
    return true;
  }

  function resolvePositionQueue(error?: unknown) {
    const queue = positionQueue.current;
    const resolvers = queue.idleResolvers.splice(0);
    const rejecters = queue.idleRejecters.splice(0);

    if (error) {
      rejecters.forEach((reject) => reject(error));
    } else {
      resolvers.forEach((resolve) => resolve());
    }
  }

  function pumpPositionQueue() {
    const queue = positionQueue.current;
    if (queue.inFlight) return;

    queue.inFlight = true;
    void (async () => {
      try {
        while (queue.pending) {
          const nextPosition = queue.pending;
          queue.pending = null;

          if (!samePoint(nextPosition, queue.lastSent)) {
            await currentWindow.setPosition(
              new PhysicalPosition(nextPosition.x, nextPosition.y),
            );
            queue.lastSent = nextPosition;
          }
        }

        resolvePositionQueue();
      } catch (positionError) {
        queue.pending = null;
        resolvePositionQueue(positionError);
      } finally {
        queue.inFlight = false;
        if (queue.pending) {
          pumpPositionQueue();
        }
      }
    })();
  }

  function queueWindowPosition(position: WindowPoint) {
    const roundedPosition = {
      x: Math.round(position.x),
      y: Math.round(position.y),
    };
    const queue = positionQueue.current;

    if (!queue.inFlight && samePoint(roundedPosition, queue.lastSent)) return;

    queue.pending = roundedPosition;
    pumpPositionQueue();
  }

  function waitForPositionQueue() {
    const queue = positionQueue.current;

    if (!queue.inFlight && !queue.pending) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      queue.idleResolvers.push(resolve);
      queue.idleRejecters.push(reject);
    });
  }

  async function moveWindowToPosition(target: WindowPoint, durationMs: number) {
    const animationId = activeAnimationId.current + 1;
    activeAnimationId.current = animationId;
    programmaticMoveSuppressUntil.current = Math.max(
      programmaticMoveSuppressUntil.current,
      Date.now() + durationMs + EDGE_DOCK_PROGRAMMATIC_MOVE_SETTLE_GRACE_MS,
    );
    beginMoveSuppression();

    try {
      const start = await currentWindowPosition();
      debugEdgeDock("window move animation started", {
        animation_id: animationId,
        start_x: start.x,
        start_y: start.y,
        target_x: target.x,
        target_y: target.y,
        duration_ms: durationMs,
        reduced_motion: prefersReducedMotion(),
      });

      if (durationMs <= 0 || prefersReducedMotion() || samePoint(start, target)) {
        queueWindowPosition(target);
        await waitForPositionQueue();
        debugEdgeDock("window move animation completed", {
          animation_id: animationId,
          mode: "instant",
          target_x: target.x,
          target_y: target.y,
        });
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const startedAt = performance.now();

        const tick = (now: number) => {
          if (activeAnimationId.current !== animationId) {
            resolve();
            return;
          }

          const progress = Math.min(1, (now - startedAt) / durationMs);
          const easedProgress = cubicOut(progress);
          queueWindowPosition({
            x: start.x + (target.x - start.x) * easedProgress,
            y: start.y + (target.y - start.y) * easedProgress,
          });

          if (progress < 1) {
            animationFrame.current = window.requestAnimationFrame(tick);
            return;
          }

          queueWindowPosition(target);
          void waitForPositionQueue().then(resolve, reject);
        };

        animationFrame.current = window.requestAnimationFrame(tick);
      });
      debugEdgeDock("window move animation completed", {
        animation_id: animationId,
        mode: "animated",
        target_x: target.x,
        target_y: target.y,
      });
    } finally {
      if (activeAnimationId.current === animationId) {
        animationFrame.current = undefined;
      }
      endMoveSuppression();
    }
  }

  async function dockToCandidate(candidate: DockGeometry, trigger: DockTrigger) {
    if (dockEdgeRef.current === candidate.edge && dockPhaseRef.current !== "free") {
      debugEdgeDock("dock request ignored", {
        reason: "already_docked",
        edge: candidate.edge,
        phase: dockPhaseRef.current,
        trigger,
      });
      return;
    }

    const startedAt = performance.now();
    const previousPhase = dockPhaseRef.current;
    const previousEdge = dockEdgeRef.current;

    try {
      debugEdgeDock("dock request started", {
        edge: candidate.edge,
        trigger,
        expanded_x: candidate.expanded.x,
        expanded_y: candidate.expanded.y,
        collapsed_x: candidate.collapsed.x,
        collapsed_y: candidate.collapsed.y,
      });

      if (!(await isDockableWindowMode())) {
        debugEdgeDock("dock request ignored", {
          reason: "window_mode",
          edge: candidate.edge,
          trigger,
        });
        return;
      }

      clearCollapseTimer();
      expandedDockAnchor.current = candidate.expanded;
      setDockState("animating", candidate.edge);
      await moveWindowToPosition(candidate.expanded, EDGE_DOCK_EXPAND_MS);
      setDockState("dockedExpanded", candidate.edge);
      await saveMainWindowState(isAlwaysOnTopRef.current, {
        dockEdge: candidate.edge,
        position: candidate.expanded,
      });
      await recordAnalyticsEvent(
        "window_edge_docked",
        dockTransitionMetadata(candidate.edge, "dock", trigger, {
          duration_ms: Math.round(performance.now() - startedAt),
          success: true,
        }),
      );
      if (trigger === "pointer_drag") {
        playDockSuccessEffect(candidate.edge);
      }
      debugEdgeDock("dock request completed", {
        edge: candidate.edge,
        trigger,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } catch (dockError) {
      setDockState(previousPhase, previousEdge);
      debugEdgeDock("dock request failed", {
        edge: candidate.edge,
        trigger,
        error_code: errorCode(dockError),
      });
      await recordDockAnimationFailure(
        candidate.edge,
        "dock",
        trigger,
        startedAt,
        "position_window",
        dockError,
      );
    }
  }

  async function moveDockedWindow(
    edge: DockEdge,
    targetPhase: DockTargetPhase,
    {
      animate,
      trigger,
      recordTransition = true,
    }: {
      animate: boolean;
      trigger: DockTrigger;
      recordTransition?: boolean;
    },
  ) {
    if (
      recordTransition &&
      dockPhaseRef.current === targetPhase &&
      dockEdgeRef.current === edge
    ) {
      debugEdgeDock("docked move ignored", {
        reason: "already_in_target_phase",
        edge,
        target_phase: targetPhase,
        trigger,
      });
      return;
    }

    const uiAction = targetPhase === "dockedCollapsed" ? "collapse" : "expand";
    const eventType =
      targetPhase === "dockedCollapsed"
        ? "window_edge_collapsed"
        : "window_edge_expanded";
    const startedAt = performance.now();
    const previousPhase = dockPhaseRef.current;
    const previousEdge = dockEdgeRef.current;

    try {
      debugEdgeDock("docked move started", {
        edge,
        target_phase: targetPhase,
        animate,
        trigger,
        record_transition: recordTransition,
      });

      if (!(await isDockableWindowMode())) {
        debugEdgeDock("docked move ignored", {
          reason: "window_mode",
          edge,
          target_phase: targetPhase,
          trigger,
        });
        return;
      }

      clearCollapseTimer();
      const geometry = await resolveDockGeometry(edge);
      const target =
        targetPhase === "dockedCollapsed"
          ? geometry.collapsed
          : geometry.expanded;
      const duration = animate
        ? targetPhase === "dockedCollapsed"
          ? EDGE_DOCK_COLLAPSE_MS
          : EDGE_DOCK_EXPAND_MS
        : 0;

      debugEdgeDock("docked move target resolved", {
        edge,
        target_phase: targetPhase,
        expanded_x: geometry.expanded.x,
        expanded_y: geometry.expanded.y,
        collapsed_x: geometry.collapsed.x,
        collapsed_y: geometry.collapsed.y,
        target_x: target.x,
        target_y: target.y,
        duration_ms: duration,
      });

      expandedDockAnchor.current = geometry.expanded;
      setDockState("animating", edge);
      await moveWindowToPosition(target, duration);
      setDockState(targetPhase, edge);
      await saveMainWindowState(isAlwaysOnTopRef.current, {
        dockEdge: edge,
        position: geometry.expanded,
      });

      if (recordTransition) {
        await recordAnalyticsEvent(
          eventType,
          dockTransitionMetadata(edge, uiAction, trigger, {
            duration_ms: Math.round(performance.now() - startedAt),
            success: true,
          }),
        );
      }
      debugEdgeDock("docked move completed", {
        edge,
        target_phase: targetPhase,
        trigger,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } catch (moveError) {
      setDockState(previousPhase, previousEdge);
      debugEdgeDock("docked move failed", {
        edge,
        target_phase: targetPhase,
        trigger,
        error_code: errorCode(moveError),
      });
      await recordDockAnimationFailure(
        edge,
        uiAction,
        trigger,
        startedAt,
        "position_window",
        moveError,
      );
    }
  }

  async function undockFromEdge(
    position: WindowPoint,
    size: WindowSize,
    trigger: DockTrigger,
  ) {
    const previousEdge = dockEdgeRef.current;
    if (!previousEdge) return;

    clearCollapseTimer();
    clearDockPreview();
    clearDockSuccessEffect();
    debugEdgeDock("undock started", {
      previous_edge: previousEdge,
      trigger,
      position_x: position.x,
      position_y: position.y,
      width: size.width,
      height: size.height,
    });
    expandedDockAnchor.current = null;
    setDockState("free", null);
    await saveMainWindowState(isAlwaysOnTopRef.current, {
      dockEdge: null,
      position,
      size,
    });
    await recordAnalyticsEvent(
      "window_edge_undocked",
      dockTransitionMetadata(previousEdge, "undock", trigger, {
        success: true,
      }),
    );
    debugEdgeDock("undock completed", {
      previous_edge: previousEdge,
      trigger,
    });
  }

  function scheduleWindowMoveSettledCheck(delayMs: number) {
    window.clearTimeout(moveSettleTimer.current);
    moveSettleTimer.current = window.setTimeout(() => {
      void handleWindowMoveSettled().catch((moveError) => {
        debugEdgeDock("move settle failed", {
          error_code: errorCode(moveError),
        });
        console.error("Unable to settle edge docking", moveError);
      });
    }, delayMs);
  }

  async function handleWindowMoveSettled() {
    if (await isPrimaryMouseButtonDown()) {
      if (!isWaitingForPointerRelease.current) {
        debugEdgeDock("move settle waiting for mouse release", {
          phase: dockPhaseRef.current,
          edge: dockEdgeRef.current,
          pointer_age_ms: Date.now() - pointerDownStartedAt.current,
          poll_ms: EDGE_DOCK_RELEASE_POLL_MS,
        });
      }
      isWaitingForPointerRelease.current = true;
      scheduleWindowMoveSettledCheck(EDGE_DOCK_RELEASE_POLL_MS);
      return;
    }

    if (isWaitingForPointerRelease.current) {
      debugEdgeDock("mouse released before dock check", {
        phase: dockPhaseRef.current,
        edge: dockEdgeRef.current,
        pointer_age_ms: Date.now() - pointerDownStartedAt.current,
      });
      isWaitingForPointerRelease.current = false;
    }

    if (isPointerDown.current) {
      debugEdgeDock("pointer down cleared after physical release", {
        pointer_age_ms: Date.now() - pointerDownStartedAt.current,
        phase: dockPhaseRef.current,
        edge: dockEdgeRef.current,
      });
      isPointerDown.current = false;
      pointerDownStartedAt.current = 0;
    }

    clearDockPreview();

    if (saveSuppressionDepth.current > 0) {
      debugEdgeDock("move settle skipped", {
        reason: "save_suppressed",
        suppression_depth: saveSuppressionDepth.current,
      });
      return;
    }

    if (Date.now() < programmaticMoveSuppressUntil.current) {
      debugEdgeDock("move settle skipped", {
        reason: "programmatic_move",
        suppress_until: programmaticMoveSuppressUntil.current,
        phase: dockPhaseRef.current,
        edge: dockEdgeRef.current,
      });
      return;
    }

    if (dockPhaseRef.current === "animating") {
      debugEdgeDock("move settle skipped", {
        reason: "animating",
        edge: dockEdgeRef.current,
      });
      return;
    }

    if (dockPhaseRef.current === "dockedCollapsed" && dockEdgeRef.current) {
      debugEdgeDock("move settle skipped", {
        reason: "collapsed_position",
        edge: dockEdgeRef.current,
      });
      return;
    }

    if (Date.now() < resizeSuppressUntil.current) {
      debugEdgeDock("move settle skipped", {
        reason: "resize_suppression",
        suppress_until: resizeSuppressUntil.current,
      });
      return;
    }

    if (!(await isDockableWindowMode())) {
      debugEdgeDock("move settle skipped", {
        reason: "window_mode",
      });
      return;
    }

    const [position, size] = await Promise.all([
      currentWindowPosition(),
      currentWindowSize(),
    ]);
    const candidate = await detectDockCandidate(position, size);
    const activeEdge = dockEdgeRef.current;

    debugEdgeDock("move settled", {
      phase: dockPhaseRef.current,
      active_edge: activeEdge,
      candidate_edge: candidate?.edge ?? null,
      position_x: position.x,
      position_y: position.y,
      width: size.width,
      height: size.height,
    });

    if (activeEdge) {
      if (candidate && candidate.edge === activeEdge) {
        expandedDockAnchor.current = candidate.expanded;
        if (dockPhaseRef.current !== "dockedCollapsed") {
          setDockState("dockedExpanded", activeEdge);
        }
        await saveMainWindowState(isAlwaysOnTopRef.current, {
          dockEdge: activeEdge,
          position: candidate.expanded,
          size,
        });
        playDockSuccessEffect(activeEdge);
        return;
      }

      await undockFromEdge(position, size, "pointer_drag");
      return;
    }

    if (candidate) {
      await dockToCandidate(candidate, "pointer_drag");
    }
  }

  async function reflowDockedWindow(trigger: DockTrigger) {
    const edge = dockEdgeRef.current;
    if (!edge) return;

    const targetPhase =
      dockPhaseRef.current === "dockedCollapsed"
        ? "dockedCollapsed"
        : "dockedExpanded";
    await moveDockedWindow(edge, targetPhase, {
      animate: false,
      trigger,
      recordTransition: false,
    });
  }

  function scheduleCollapse(trigger: DockTrigger) {
    clearCollapseTimer();
    debugEdgeDock("collapse scheduled", {
      trigger,
      phase: dockPhaseRef.current,
      edge: dockEdgeRef.current,
      delay_ms: EDGE_DOCK_COLLAPSE_DELAY_MS,
    });

    collapseTimer.current = window.setTimeout(() => {
      void (async () => {
        const edge = dockEdgeRef.current;
        debugEdgeDock("collapse timer fired", {
          trigger,
          phase: dockPhaseRef.current,
          edge,
        });

        if (!edge || dockPhaseRef.current !== "dockedExpanded") {
          debugEdgeDock("collapse timer ignored", {
            reason: "not_expanded_or_no_edge",
            trigger,
            phase: dockPhaseRef.current,
            edge,
          });
          return;
        }

        if (!(await canAutoCollapse())) return;

        await moveDockedWindow(edge, "dockedCollapsed", {
          animate: true,
          trigger,
        });
      })();
    }, EDGE_DOCK_COLLAPSE_DELAY_MS);
  }

  function handleDockMouseEnter() {
    clearCollapseTimer();
    debugEdgeDock("mouse entered docked window", {
      phase: dockPhaseRef.current,
      edge: dockEdgeRef.current,
    });

    const edge = dockEdgeRef.current;
    if (edge && dockPhaseRef.current === "dockedCollapsed") {
      void moveDockedWindow(edge, "dockedExpanded", {
        animate: true,
        trigger: "hover",
      });
    }
  }

  function handleDockMouseLeave() {
    debugEdgeDock("mouse left docked window", {
      phase: dockPhaseRef.current,
      edge: dockEdgeRef.current,
    });

    if (dockPhaseRef.current === "dockedExpanded") {
      scheduleCollapse("timeout");
    }
  }

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
      if (saveSuppressionDepth.current > 0) return;

      window.clearTimeout(saveTimer.current);

      saveTimer.current = window.setTimeout(async () => {
        await saveMainWindowState(isAlwaysOnTop).catch((windowError) => {
          console.error("Unable to save window state", windowError);
        });
      }, 250);
    };

    const scheduleMoveSettleCheck = () => {
      if (saveSuppressionDepth.current > 0) return;

      if (Date.now() < programmaticMoveSuppressUntil.current) {
        debugEdgeDock("move settle schedule skipped", {
          reason: "programmatic_move",
          suppress_until: programmaticMoveSuppressUntil.current,
          phase: dockPhaseRef.current,
          edge: dockEdgeRef.current,
        });
        return;
      }

      window.clearTimeout(moveSettleTimer.current);
      debugEdgeDock("move settle scheduled", {
        delay_ms: EDGE_DOCK_MOVE_SETTLE_MS,
        phase: dockPhaseRef.current,
        edge: dockEdgeRef.current,
      });
      scheduleWindowMoveSettledCheck(EDGE_DOCK_MOVE_SETTLE_MS);
    };

    const handleMoved = () => {
      persistWindowState();
      scheduleDockPreviewCheck();
      scheduleMoveSettleCheck();
    };

    const handleResized = () => {
      resizeSuppressUntil.current = Date.now() + EDGE_DOCK_RESIZE_SUPPRESS_MS;
      clearDockPreview();
      clearDockSuccessEffect();
      debugEdgeDock("window resized", {
        phase: dockPhaseRef.current,
        edge: dockEdgeRef.current,
        suppress_ms: EDGE_DOCK_RESIZE_SUPPRESS_MS,
      });
      persistWindowState();
      void reflowDockedWindow("resize").catch((resizeError) => {
        debugEdgeDock("resize reflow failed", {
          error_code: errorCode(resizeError),
        });
        console.error("Unable to reflow edge docking after resize", resizeError);
      });
    };

    const handlePointerUp = () => {
      isPointerDown.current = false;
      pointerDownStartedAt.current = 0;
      if (isWaitingForPointerRelease.current) {
        scheduleWindowMoveSettledCheck(0);
      }
    };

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    Promise.all([
      currentWindow.onMoved(handleMoved),
      currentWindow.onResized(handleResized),
      currentWindow.onScaleChanged(() => {
        resizeSuppressUntil.current = Date.now() + EDGE_DOCK_RESIZE_SUPPRESS_MS;
        clearDockPreview();
        clearDockSuccessEffect();
        debugEdgeDock("window scale changed", {
          phase: dockPhaseRef.current,
          edge: dockEdgeRef.current,
          suppress_ms: EDGE_DOCK_RESIZE_SUPPRESS_MS,
        });
        void reflowDockedWindow("resize").catch((scaleError) => {
          debugEdgeDock("scale reflow failed", {
            error_code: errorCode(scaleError),
          });
          console.error("Unable to reflow edge docking after scale change", scaleError);
        });
      }),
      currentWindow.onFocusChanged(({ payload: focused }) => {
        debugEdgeDock("window focus changed", {
          focused,
          phase: dockPhaseRef.current,
          edge: dockEdgeRef.current,
          ...activeElementDebugInfo(),
        });
        if (!focused && dockPhaseRef.current === "dockedExpanded") {
          scheduleCollapse("blur");
        }
      }),
    ]).then((unlisteners) => {
      cleanup = unlisteners;
    });

    return () => {
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(moveSettleTimer.current);
      window.clearTimeout(dockPreviewTimer.current);
      window.clearTimeout(dockSuccessTimer.current);
      clearCollapseTimer();
      if (animationFrame.current) {
        window.cancelAnimationFrame(animationFrame.current);
      }
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      cleanup.forEach((unlisten) => unlisten());
    };
  }, [isAlwaysOnTop]);

  async function saveMainWindowState(
    alwaysOnTop: boolean,
    options: SaveMainWindowStateOptions = {},
  ) {
    const [livePosition, liveSize] = await Promise.all([
      currentWindowPosition(),
      currentWindowSize(),
    ]);
    const nextDockEdge =
      options.dockEdge === undefined ? dockEdgeRef.current : options.dockEdge;
    let position = options.position ?? livePosition;
    const size = options.size ?? liveSize;

    if (nextDockEdge && !options.position) {
      if (expandedDockAnchor.current) {
        position = expandedDockAnchor.current;
      } else {
        const geometry = await resolveDockGeometry(nextDockEdge);
        position = geometry.expanded;
      }
    }

    await invoke("save_window_state", {
      windowState: {
        key: "main",
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        alwaysOnTop,
        dockEdge: nextDockEdge,
      },
    });
  }

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

  async function toggleAlwaysOnTop() {
    const previousAlwaysOnTop = isAlwaysOnTop;
    const nextAlwaysOnTop = !previousAlwaysOnTop;

    try {
      setError("");
      await currentWindow.setAlwaysOnTop(nextAlwaysOnTop);
      await saveMainWindowState(nextAlwaysOnTop);
      isAlwaysOnTopRef.current = nextAlwaysOnTop;
      setIsAlwaysOnTop(nextAlwaysOnTop);
      await recordAnalyticsEvent("window_always_on_top_toggled", {
        screen: "task_window",
        route: window.location.hash || "#/",
        ui_target: "titlebar_always_on_top_button",
        ui_action: "toggle",
        previous_always_on_top: previousAlwaysOnTop,
        next_always_on_top: nextAlwaysOnTop,
        persisted: true,
        success: true,
      });
    } catch (toggleError) {
      try {
        const liveAlwaysOnTop = await currentWindow.isAlwaysOnTop();
        isAlwaysOnTopRef.current = liveAlwaysOnTop;
        setIsAlwaysOnTop(liveAlwaysOnTop);
      } catch {
        isAlwaysOnTopRef.current = previousAlwaysOnTop;
        setIsAlwaysOnTop(previousAlwaysOnTop);
      }

      setError(errorMessage(toggleError));
      await recordAnalyticsEvent("window_always_on_top_toggle_failed", {
        screen: "task_window",
        route: window.location.hash || "#/",
        ui_target: "titlebar_always_on_top_button",
        ui_action: "toggle",
        previous_always_on_top: previousAlwaysOnTop,
        next_always_on_top: nextAlwaysOnTop,
        persisted: false,
        success: false,
        error_code: errorMessage(toggleError),
      });
    }
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

  const shellClassName = [
    "shell",
    isDocked ? `edge-docked edge-${dockEdge} edge-${dockPhase}` : "",
    dockPreviewEdge
      ? `edge-snap-preview edge-snap-${dockPreviewEdge}`
      : "",
    dockSuccessEffect
      ? `edge-dock-success edge-dock-success-${dockSuccessEffect.edge}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main
      className={shellClassName}
      onMouseEnter={handleDockMouseEnter}
      onMouseLeave={handleDockMouseLeave}
      onPointerDown={() => {
        isPointerDown.current = true;
        isWaitingForPointerRelease.current = false;
        pointerDownStartedAt.current = Date.now();
      }}
    >
      {isDocked ? (
        <div
          className={`edge-peek-handle edge-${dockEdge}`}
          aria-hidden="true"
        />
      ) : null}

      {dockPreviewEdge ? (
        <div
          className={`edge-snap-preview-band edge-${dockPreviewEdge}`}
          aria-hidden="true"
        />
      ) : null}

      {dockSuccessEffect ? (
        <div
          key={dockSuccessEffect.token}
          className={`edge-dock-success-band edge-${dockSuccessEffect.edge}`}
          aria-hidden="true"
        />
      ) : null}

      <Titlebar
        isAlwaysOnTop={isAlwaysOnTop}
        onToggleAlwaysOnTop={() => void toggleAlwaysOnTop()}
        onOpenStats={openStatsWindow}
      />

      <section className="composer">
        <form onSubmit={createTask} className="task-form">
          <input
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onCompositionStart={() => {
              isComposingText.current = true;
            }}
            onCompositionEnd={() => {
              isComposingText.current = false;
            }}
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
                  onCompositionStart={() => {
                    isComposingText.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingText.current = false;
                  }}
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
