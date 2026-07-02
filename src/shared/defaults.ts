import { AppSettings, AppState, DAYS, ScheduleRules, Worker, WorkerRole } from "./types";

export function defaultRules(): ScheduleRules {
  return {
    weekStart: "",
    openShift: "08:00",
    closeShift: "16:00",
    shiftHours: 8,
    mealBreakHours: 6,
    staffing: DAYS.reduce((days, day) => {
      days[day] = { open: 2, close: 2 };
      return days;
    }, {} as ScheduleRules["staffing"])
  };
}

export function defaultSettings(): AppSettings {
  return { darkMode: false, confirmBeforeClose: true };
}

export function defaultAppState(): AppState {
  return { workers: [], rules: defaultRules(), schedule: null };
}

function normalizeRole(role: unknown, position: string, isManager: boolean): WorkerRole {
  if (role === "Manager" || role === "Lead" || isManager) return "Lead";
  if (role === "Lead") return "Lead";
  if (position.toLowerCase().includes("lead")) return "Lead";
  return "Crew";
}

export function normalizeWorker(worker: Partial<Worker> & { id: string; name: string }, rules: ScheduleRules): Worker {
  const rawPosition = String(worker.position || worker.role || "Crew");
  const position = rawPosition.toLowerCase() === "manager" ? "Lead" : rawPosition;
  const isManager = Boolean(worker.isManager || String(worker.role) === "Manager" || worker.role === "Lead");
  const role = normalizeRole(worker.role, position, isManager);
  const maxWeeklyHours = Number(worker.maxWeeklyHours || 40);
  return {
    id: worker.id,
    employeeCode: /^\d{4}$/.test(String(worker.employeeCode || "")) ? String(worker.employeeCode) : "",
    name: String(worker.name || "Unnamed Worker"),
    position,
    role,
    isManager: role === "Lead" || isManager,
    noHourLimits: Boolean(worker.noHourLimits),
    maxWeeklyHours,
    preferredWeeklyHours: Number(worker.preferredWeeklyHours || Math.min(maxWeeklyHours, 32)),
    maxDays: Number(worker.maxDays || 7),
    canOpen: Boolean(worker.canOpen),
    canClose: Boolean(worker.canClose),
    active: worker.active !== false,
    notes: String(worker.notes || ""),
    availability: worker.availability || []
  };
}
