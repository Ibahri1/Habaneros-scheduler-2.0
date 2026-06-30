import { AppSettings, AppState, DAYS, ScheduleRules, Worker, WorkerRole, WorkerShiftTimes } from "./types";
import { addHoursToTime } from "./time";

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

export function defaultWorkerShiftTimes(rules: ScheduleRules): WorkerShiftTimes {
  return {
    open: { start: rules.openShift || "08:00", end: addHoursToTime(rules.openShift || "08:00", Number(rules.shiftHours) || 8) },
    close: { start: rules.closeShift || "16:00", end: addHoursToTime(rules.closeShift || "16:00", Number(rules.shiftHours) || 8) }
  };
}

function normalizeRole(role: unknown, position: string, isManager: boolean): WorkerRole {
  if (role === "Manager" || isManager) return "Manager";
  if (role === "Lead") return "Lead";
  if (position.toLowerCase().includes("lead")) return "Lead";
  return "Crew";
}

export function normalizeWorker(worker: Partial<Worker> & { id: string; name: string }, rules: ScheduleRules): Worker {
  const defaults = defaultWorkerShiftTimes(rules);
  const position = String(worker.position || worker.role || "Crew");
  const isManager = Boolean(worker.isManager || worker.role === "Manager");
  const role = normalizeRole(worker.role, position, isManager);
  const maxWeeklyHours = Number(worker.maxWeeklyHours || 40);
  return {
    id: worker.id,
    name: String(worker.name || "Unnamed Worker"),
    position,
    role,
    isManager: role === "Manager" || isManager,
    maxWeeklyHours,
    preferredWeeklyHours: Number(worker.preferredWeeklyHours || Math.min(maxWeeklyHours, 32)),
    maxDays: Number(worker.maxDays || 7),
    canOpen: Boolean(worker.canOpen),
    canClose: Boolean(worker.canClose),
    needsBreakFlag: worker.needsBreakFlag !== false,
    active: worker.active !== false,
    notes: String(worker.notes || ""),
    availability: worker.availability || [],
    shiftTimes: {
      ...defaults,
      ...(worker.shiftTimes || {}),
      open: { ...defaults.open, ...(worker.shiftTimes?.open || {}) },
      close: { ...defaults.close, ...(worker.shiftTimes?.close || {}) }
    }
  };
}
