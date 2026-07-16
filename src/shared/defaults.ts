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
  return {
    darkMode: false,
    confirmBeforeClose: true,
    availabilityDeadline: {
      smsRemindersEnabled: true,
      deadlineDay: "Tuesday",
      deadlineTime: "23:59",
      firstReminderTime: "12:00",
      secondReminderTime: "20:00",
      firstReminderMessage: "Habaneros Reminder: Please submit your availability for next week's schedule before tonight's deadline.",
      secondReminderMessage: "Habaneros Final Reminder: We have not received your availability. Please submit it before tonight's deadline."
    }
  };
}

export function defaultAppState(): AppState {
  return { workers: [], rules: defaultRules(), schedule: null, scheduleHistory: [] };
}

export function defaultWorkerShiftTimes(rules: ScheduleRules): WorkerShiftTimes {
  const hours = Number(rules.shiftHours) || 8;
  return {
    open: { start: rules.openShift || "08:00", end: addHoursToTime(rules.openShift || "08:00", hours) },
    close: { start: rules.closeShift || "16:00", end: addHoursToTime(rules.closeShift || "16:00", hours) }
  };
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
  const availability = worker.availability || [];
  const shiftAvailability = DAYS.reduce((result, day) => {
    const value = worker.shiftAvailability?.[day];
    result[day] = availability.includes(day) ? (value === "Open" || value === "Close" || value === "Both" ? value : "Both") : "Unavailable";
    return result;
  }, {} as Worker["shiftAvailability"]);
  const defaultTimes = defaultWorkerShiftTimes(rules);
  const timeValue = (value: unknown, fallback: string) => /^\d{2}:\d{2}$/.test(String(value || "")) ? String(value) : fallback;
  return {
    id: worker.id,
    employeeCode: /^\d{4}$/.test(String(worker.employeeCode || "")) ? String(worker.employeeCode) : "",
    mobilePhone: String(worker.mobilePhone || "").trim(),
    name: String(worker.name || "Unnamed Worker"),
    position,
    role,
    isManager: role === "Lead" || isManager,
    skillRating: Math.min(10, Math.max(1, Number(worker.skillRating) || 5)),
    noHourLimits: Boolean(worker.noHourLimits),
    maxWeeklyHours,
    preferredWeeklyHours: Number(worker.preferredWeeklyHours || Math.min(maxWeeklyHours, 32)),
    maxDays: Number(worker.maxDays || 7),
    active: worker.active !== false,
    notes: String(worker.notes || ""),
    availability,
    shiftAvailability,
    shiftTimes: {
      open: { start: timeValue(worker.shiftTimes?.open?.start, defaultTimes.open.start), end: timeValue(worker.shiftTimes?.open?.end, defaultTimes.open.end) },
      close: { start: timeValue(worker.shiftTimes?.close?.start, defaultTimes.close.start), end: timeValue(worker.shiftTimes?.close?.end, defaultTimes.close.end) }
    }
  };
}
