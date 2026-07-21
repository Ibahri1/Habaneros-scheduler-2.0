import { DAYS, DayName } from "./types";

export function timeToMinutes(value: string): number {
  const [hourText, minuteText] = String(value || "00:00").split(":");
  return (Number(hourText) || 0) * 60 + (Number(minuteText) || 0);
}
export function addHoursToTime(value: string, hours: number): string {
  const total = (timeToMinutes(value) + Math.round(hours * 60)) % (24 * 60);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}
export function getShiftDurationHours(start: string, end: string): number {
  const startMinutes = timeToMinutes(start);
  let endMinutes = timeToMinutes(end);
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return (endMinutes - startMinutes) / 60;
}
export function formatTime(value: string): string {
  const [hourText, minuteText] = String(value || "00:00").split(":");
  const hour = Number(hourText) || 0;
  const minute = Number(minuteText) || 0;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return displayHour + ":" + String(minute).padStart(2, "0") + " " + suffix;
}
export function formatDuration(hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (!minutes) return whole + " hr" + (whole === 1 ? "" : "s");
  return whole + " hr " + minutes + " min";
}
export function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) {
    const date = new Date(value);
    date.setHours(12, 0, 0, 0);
    return date;
  }
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  const date = year && month && day ? new Date(year, month - 1, day) : new Date();
  date.setHours(12, 0, 0, 0);
  return date;
}
export function toIsoDate(date: Date): string {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
export function mondayWeekStart(value: string | Date): string {
  const date = parseLocalDate(value);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return toIsoDate(date);
}
export function nextMonday(): string {
  const date = new Date();
  const day = date.getDay();
  const distance = (8 - day) % 7 || 7;
  date.setDate(date.getDate() + distance);
  date.setHours(12, 0, 0, 0);
  return toIsoDate(date);
}
export function addDays(dateString: string, days: number): string {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}
export function getDateForWeekDay(weekStart: string, dayName: DayName): string {
  const index = DAYS.indexOf(dayName);
  return addDays(mondayWeekStart(weekStart), index >= 0 ? index : 0);
}
export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parseLocalDate(dateString));
}
