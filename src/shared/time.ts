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
export function nextMonday(): string {
  const date = new Date();
  const day = date.getDay();
  const distance = (8 - day) % 7 || 7;
  date.setDate(date.getDate() + distance);
  return date.toISOString().slice(0, 10);
}
export function addDays(dateString: string, days: number): string {
  const date = new Date(dateString + "T12:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString();
}
export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(dateString));
}
