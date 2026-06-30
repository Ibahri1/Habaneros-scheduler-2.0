export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type DayName = typeof DAYS[number];
export type ShiftName = "open" | "close";
export type WorkerRole = "Crew" | "Lead" | "Manager";
export type ExportFormat = "json" | "csv";

export interface ShiftTime { start: string; end: string; }
export interface WorkerShiftTimes { open: ShiftTime; close: ShiftTime; }

export interface Worker {
  id: string;
  name: string;
  position: string;
  role: WorkerRole;
  isManager: boolean;
  maxWeeklyHours: number;
  preferredWeeklyHours: number;
  maxDays: number;
  canOpen: boolean;
  canClose: boolean;
  needsBreakFlag: boolean;
  active: boolean;
  notes: string;
  availability: DayName[];
  shiftTimes: WorkerShiftTimes;
}

export interface StaffingRule { open: number; close: number; }
export interface ScheduleRules {
  weekStart: string;
  openShift: string;
  closeShift: string;
  shiftHours: number;
  mealBreakHours: number;
  staffing: Record<DayName, StaffingRule>;
}

export interface AssignedWorker {
  id: string;
  name: string;
  position: string;
  role: WorkerRole;
  isManager: boolean;
  start: string;
  end: string;
  timeRange: string;
  durationHours: number;
  needsLunch: boolean;
}

export interface ShiftSchedule {
  name: ShiftName;
  needed: number;
  time: string;
  assigned: AssignedWorker[];
  hasQualified: boolean;
  hasManager: boolean;
}

export interface DaySchedule {
  day: DayName;
  date: string;
  shifts: Record<ShiftName, ShiftSchedule>;
  warnings: string[];
}

export interface GeneratedSchedule { createdAt: string; days: DaySchedule[]; }
export interface AppState { workers: Worker[]; rules: ScheduleRules; schedule: GeneratedSchedule | null; }
export interface AppSettings { darkMode: boolean; confirmBeforeClose: boolean; }
export interface WindowBounds { width: number; height: number; x?: number; y?: number; }

export interface ImportResult {
  imported: number;
  skipped: number;
  messages: string[];
}

export interface ExportPayload {
  format: ExportFormat;
  state: AppState;
  settings: AppSettings;
}
