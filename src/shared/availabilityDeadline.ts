import { AppSettings, AvailabilitySubmission, DAYS, DayName, Worker } from "./types";
import { defaultSettings } from "./defaults";
import { formatTime } from "./time";

export interface AvailabilityStatusSummary {
  submitted: number;
  waiting: number;
  missing: number;
  deadlineAt: Date | null;
  weekStart: string;
}

const DAY_INDEX: Record<DayName, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6
};

export function normalizeSettings(settings: Partial<AppSettings> | null | undefined): AppSettings {
  const defaults = defaultSettings();
  const deadline = { ...defaults.availabilityDeadline, ...(settings?.availabilityDeadline || {}) };
  deadline.smsRemindersEnabled = deadline.smsRemindersEnabled === true;
  if (!DAYS.includes(deadline.deadlineDay)) deadline.deadlineDay = defaults.availabilityDeadline.deadlineDay;
  deadline.deadlineTime = normalizeTime(deadline.deadlineTime, defaults.availabilityDeadline.deadlineTime);
  deadline.firstReminderTime = normalizeTime(deadline.firstReminderTime, defaults.availabilityDeadline.firstReminderTime);
  deadline.secondReminderTime = normalizeTime(deadline.secondReminderTime, defaults.availabilityDeadline.secondReminderTime);
  deadline.firstReminderMessage = normalizeMessage(deadline.firstReminderMessage, defaults.availabilityDeadline.firstReminderMessage);
  deadline.secondReminderMessage = normalizeMessage(deadline.secondReminderMessage, defaults.availabilityDeadline.secondReminderMessage);
  return { ...defaults, ...(settings || {}), availabilityDeadline: deadline };
}

export function getAvailabilityWeekStart(scheduleWeekStart: string): string {
  const date = parseDate(scheduleWeekStart);
  if (!date) return "";
  date.setDate(date.getDate() - date.getDay());
  return toIsoDate(date);
}

export function getDeadlineDate(settings: AppSettings, scheduleWeekStart: string): Date | null {
  const weekStart = parseDate(getAvailabilityWeekStart(scheduleWeekStart));
  if (!weekStart) return null;
  const configuredDay = settings.availabilityDeadline.deadlineDay;
  const daysBeforeWeek = (7 - DAY_INDEX[configuredDay]) % 7;
  weekStart.setDate(weekStart.getDate() - daysBeforeWeek);
  const [hours, minutes] = settings.availabilityDeadline.deadlineTime.split(":").map(Number);
  weekStart.setHours(hours || 0, minutes || 0, 0, 0);
  return weekStart;
}

export function buildReminderMessage(message: string, settings: AppSettings): string {
  const deadline = settings.availabilityDeadline.deadlineDay + " at " + formatTime(settings.availabilityDeadline.deadlineTime);
  return message.toLowerCase().includes("deadline") ? message + " Deadline: " + deadline + "." : message + " Please submit by " + deadline + ".";
}

export function calculateAvailabilityStatus(workers: Worker[], submissions: AvailabilitySubmission[], settings: AppSettings, scheduleWeekStart: string, now = new Date()): AvailabilityStatusSummary {
  const weekStart = getAvailabilityWeekStart(scheduleWeekStart);
  const deadlineAt = getDeadlineDate(settings, scheduleWeekStart);
  const activeWorkers = workers.filter((worker) => worker.active && /^\d{4}$/.test(worker.employeeCode));
  const submittedWorkerIds = new Set(submissions.filter((submission) => submission.weekStart === weekStart).map((submission) => submission.localWorkerId).filter(Boolean));
  const submitted = activeWorkers.filter((worker) => submittedWorkerIds.has(worker.id)).length;
  const outstanding = Math.max(0, activeWorkers.length - submitted);
  const isPastDeadline = Boolean(deadlineAt && now.getTime() > deadlineAt.getTime());
  return { submitted, waiting: isPastDeadline ? 0 : outstanding, missing: isPastDeadline ? outstanding : 0, deadlineAt, weekStart };
}

export function formatDeadlineSummary(settings: AppSettings): string {
  return settings.availabilityDeadline.deadlineDay + " at " + formatTime(settings.availabilityDeadline.deadlineTime);
}

function normalizeTime(value: string | undefined, fallback: string): string {
  return /^\d{2}:\d{2}$/.test(String(value || "")) ? String(value) : fallback;
}

function normalizeMessage(value: string | undefined, fallback: string): string {
  const clean = String(value || "").trim();
  return clean ? clean.slice(0, 500) : fallback;
}

function parseDate(value: string): Date | null {
  const date = new Date(value + "T12:00:00");
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date): string {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
