import { AppSettings, AppState, DAYS, PreferredSettings, ScheduleRules, Worker, WorkerRole, WorkerShiftTimes } from "./types";
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
      smsRemindersEnabled: false,
      deadlineDay: "Tuesday",
      deadlineTime: "23:59",
      firstReminderTime: "12:00",
      secondReminderTime: "20:00",
      firstReminderMessage: "Habaneros Reminder: Please submit your availability for next week's schedule before tonight's deadline.",
      secondReminderMessage: "Habaneros Final Reminder: We have not received your availability. Please submit it before tonight's deadline."
    },
    preferredSettings: defaultPreferredSettings()
  };
}

export function defaultAppState(): AppState {
  return { workers: [], rules: defaultRules(), schedule: null, scheduleHistory: [] };
}

export function defaultPreferredSettings(): PreferredSettings {
  const rules = defaultRules();
  rules.openShift = "08:00";
  rules.closeShift = "15:00";
  rules.shiftHours = 7;
  rules.mealBreakHours = 5.01;
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].forEach((day) => {
    rules.staffing[day as keyof typeof rules.staffing] = { open: 3, close: 3 };
  });
  return {
    scheduleRules: {
      openShift: rules.openShift,
      closeShift: rules.closeShift,
      shiftHours: rules.shiftHours,
      mealBreakHours: rules.mealBreakHours,
      staffing: rules.staffing
    },
    availabilityDeadline: {
      smsRemindersEnabled: false,
      deadlineDay: "Tuesday",
      deadlineTime: "23:59",
      firstReminderTime: "20:00",
      secondReminderTime: "19:00",
      firstReminderMessage: "Habaneros Reminder: Please submit your availability for next week's schedule before tonight's deadline. Deadline is tonight at 11:59PM",
      secondReminderMessage: "Habaneros Final Reminder: We have not received your availability. Please submit it before tonight's deadline, TONIGHT AT 11:59PM"
    },
    cloudConfig: {
      supabaseUrl: "https://zwrgrgzixfrlipvdydtq.supabase.co",
      anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3cmdyZ3ppeGZybGlwdmR5ZHRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NTU5NzQsImV4cCI6MjA5ODQzMTk3NH0.AtSV5Wg_hHX8YG2tJzuVDg9-TRjV6mCjpziMzLy0XKk"
    }
  };
}

export function normalizePreferredSettings(input: Partial<PreferredSettings> | null | undefined): PreferredSettings {
  const defaults = defaultPreferredSettings();
  const scheduleInput = (input?.scheduleRules || {}) as Partial<PreferredSettings["scheduleRules"]>;
  const staffingInput = (scheduleInput.staffing || {}) as Partial<PreferredSettings["scheduleRules"]["staffing"]>;
  const timeValue = (value: unknown, fallback: string) => /^\d{2}:\d{2}$/.test(String(value || "")) ? String(value) : fallback;
  const messageValue = (value: unknown, fallback: string) => {
    const clean = String(value || "").trim();
    return clean ? clean.slice(0, 500) : fallback;
  };
  return {
    scheduleRules: {
      openShift: timeValue(scheduleInput.openShift, defaults.scheduleRules.openShift),
      closeShift: timeValue(scheduleInput.closeShift, defaults.scheduleRules.closeShift),
      shiftHours: Math.min(24, Math.max(1, Number(scheduleInput.shiftHours) || defaults.scheduleRules.shiftHours)),
      mealBreakHours: Math.min(24, Math.max(1, Number(scheduleInput.mealBreakHours) || defaults.scheduleRules.mealBreakHours)),
      staffing: DAYS.reduce((staffing, day) => {
        staffing[day] = {
          open: Math.min(100, Math.max(0, Number(staffingInput[day]?.open ?? defaults.scheduleRules.staffing[day].open) || 0)),
          close: Math.min(100, Math.max(0, Number(staffingInput[day]?.close ?? defaults.scheduleRules.staffing[day].close) || 0))
        };
        return staffing;
      }, {} as PreferredSettings["scheduleRules"]["staffing"])
    },
    availabilityDeadline: {
      smsRemindersEnabled: input?.availabilityDeadline?.smsRemindersEnabled === true,
      deadlineDay: DAYS.includes(input?.availabilityDeadline?.deadlineDay as never) ? input!.availabilityDeadline!.deadlineDay : defaults.availabilityDeadline.deadlineDay,
      deadlineTime: timeValue(input?.availabilityDeadline?.deadlineTime, defaults.availabilityDeadline.deadlineTime),
      firstReminderTime: timeValue(input?.availabilityDeadline?.firstReminderTime, defaults.availabilityDeadline.firstReminderTime),
      secondReminderTime: timeValue(input?.availabilityDeadline?.secondReminderTime, defaults.availabilityDeadline.secondReminderTime),
      firstReminderMessage: messageValue(input?.availabilityDeadline?.firstReminderMessage, defaults.availabilityDeadline.firstReminderMessage),
      secondReminderMessage: messageValue(input?.availabilityDeadline?.secondReminderMessage, defaults.availabilityDeadline.secondReminderMessage)
    },
    cloudConfig: {
      supabaseUrl: String(input?.cloudConfig?.supabaseUrl || defaults.cloudConfig.supabaseUrl).trim().replace(/\/$/, ""),
      anonKey: String(input?.cloudConfig?.anonKey || defaults.cloudConfig.anonKey).trim()
    }
  };
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
