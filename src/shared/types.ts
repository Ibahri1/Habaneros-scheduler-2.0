export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type DayName = typeof DAYS[number];
export type ShiftName = "open" | "close";
export type ShiftAvailability = "Open" | "Close" | "Both" | "Unavailable";
export type ShiftAvailabilityMap = Partial<Record<DayName, ShiftAvailability>>;
export type WorkerRole = "Crew" | "Lead";
export type ExportFormat = "json" | "csv";
export type SubmissionStatus = "pending" | "reviewed" | "applied" | "rejected";

export interface ShiftTime { start: string; end: string; }
export interface WorkerShiftTimes { open: ShiftTime; close: ShiftTime; }

export interface Worker {
  id: string;
  employeeCode: string;
  name: string;
  position: string;
  role: WorkerRole;
  isManager: boolean;
  noHourLimits: boolean;
  maxWeeklyHours: number;
  preferredWeeklyHours: number;
  maxDays: number;
  canOpen: boolean;
  canClose: boolean;
  active: boolean;
  notes: string;
  availability: DayName[];
  shiftAvailability: ShiftAvailabilityMap;
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
  assignmentId: string;
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
export interface CloudConfig { supabaseUrl: string; anonKey: string; }
export interface AvailabilitySubmission {
  id: string;
  employeeId: string;
  localWorkerId: string;
  employeeName: string;
  weekStart: string;
  availableDays: DayName[];
  shiftAvailability: ShiftAvailabilityMap;
  submittedAt: string;
  status: SubmissionStatus;
  actionAt: string | null;
  managerNotes: string;
}
export interface CloudResult { success: boolean; message: string; }
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
