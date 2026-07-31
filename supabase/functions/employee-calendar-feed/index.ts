interface EmployeeRow {
  id: string;
  local_worker_id: string;
  name: string;
  active: boolean;
  workspace_id: string | null;
  deleted_at: string | null;
  calendar_token_revoked_at: string | null;
}

interface PublishedScheduleRow {
  id: string;
  workspace_id: string;
  week_start: string;
  schedule_json: { days?: DaySchedule[] };
  published_at: string;
  updated_at: string;
}

interface DaySchedule {
  day: string;
  date?: string;
  shifts?: Record<string, { assigned?: AssignedWorker[] }>;
}

interface AssignedWorker {
  id?: string;
  name?: string;
  position?: string;
  start?: string;
  end?: string;
  notes?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return textResponse("", 204, "text/plain");
  if (request.method !== "GET") return textResponse("Use GET.", 405, "text/plain");

  try {
    const token = new URL(request.url).searchParams.get("token")?.trim() || "";
    if (!isTokenShape(token)) return textResponse("Calendar feed not found.", 404, "text/plain");

    const employee = await loadEmployee(token);
    if (!employee || !employee.active || employee.deleted_at || employee.calendar_token_revoked_at) return textResponse("Calendar feed not found.", 404, "text/plain");

    const schedules = await loadPublishedSchedules(employee.workspace_id);
    const ics = buildCalendar(employee, schedules);
    return textResponse(ics, 200, "text/calendar; charset=utf-8", {
      "Content-Disposition": 'inline; filename="habaneros-schedule.ics"',
      "Cache-Control": "no-store"
    });
  } catch (error) {
    console.error(error);
    return textResponse("Calendar feed failed.", 500, "text/plain");
  }
});

async function loadEmployee(token: string): Promise<EmployeeRow | null> {
  const rows = await supabaseRequest<EmployeeRow[]>("/rest/v1/employees?select=id,local_worker_id,name,active,workspace_id,deleted_at,calendar_token_revoked_at&calendar_token=eq." + encodeURIComponent(token) + "&limit=1");
  return rows[0] || null;
}

async function loadPublishedSchedules(workspaceId: string | null): Promise<PublishedScheduleRow[]> {
  const workspaceFilter = workspaceId ? "&workspace_id=eq." + encodeURIComponent(workspaceId) : "";
  return await supabaseRequest<PublishedScheduleRow[]>("/rest/v1/published_schedules?select=id,workspace_id,week_start,schedule_json,published_at,updated_at" + workspaceFilter + "&order=week_start.asc&limit=80");
}

function buildCalendar(employee: EmployeeRow, schedules: PublishedScheduleRow[]): string {
  const events = schedules.flatMap((schedule) => eventsForSchedule(employee, schedule));
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Habaneros Scheduler//Employee Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Habaneros Work Schedule",
    "X-WR-TIMEZONE:America/Los_Angeles",
    ...events,
    "END:VCALENDAR"
  ].join("\r\n");
}

function eventsForSchedule(employee: EmployeeRow, schedule: PublishedScheduleRow): string[] {
  const days = Array.isArray(schedule.schedule_json?.days) ? schedule.schedule_json.days : [];
  return days.flatMap((day) => Object.entries(day.shifts || {}).flatMap(([shiftName, shift]) => {
    const assigned = Array.isArray(shift.assigned) ? shift.assigned : [];
    return assigned.filter((worker) => worker.id === employee.local_worker_id).map((worker) => eventForWorker(employee, schedule, day, shiftName, worker));
  }));
}

function eventForWorker(employee: EmployeeRow, schedule: PublishedScheduleRow, day: DaySchedule, shiftName: string, worker: AssignedWorker): string {
  const date = day.date || dateForDay(schedule.week_start, day.day);
  const start = localDateTime(date, worker.start || "08:00");
  const end = localDateTime(date, worker.end || "08:00", start.date);
  const updated = new Date(schedule.updated_at || schedule.published_at || new Date().toISOString());
  const uid = [
    "habaneros",
    schedule.workspace_id,
    employee.id,
    schedule.week_start,
    day.day,
    shiftName,
    worker.start || "",
    worker.end || ""
  ].map((part) => String(part).replace(/[^a-zA-Z0-9_-]/g, "")).join("-") + "@habaneros-scheduler";
  const description = [
    worker.position ? "Position: " + worker.position : "",
    worker.notes ? "Notes: " + worker.notes : "",
    "Week of " + schedule.week_start,
    "Published from Habaneros Scheduler"
  ].filter(Boolean).join("\\n");
  return [
    "BEGIN:VEVENT",
    "UID:" + uid,
    "DTSTAMP:" + utcStamp(updated),
    "LAST-MODIFIED:" + utcStamp(updated),
    "SUMMARY:Habaneros Shift",
    "LOCATION:Habaneros Mexican Food",
    "DESCRIPTION:" + icsText(description),
    "DTSTART;TZID=America/Los_Angeles:" + start.text,
    "DTEND;TZID=America/Los_Angeles:" + end.text,
    "END:VEVENT"
  ].join("\r\n");
}

function localDateTime(dateValue: string, timeValue: string, previous?: Date): { date: Date; text: string } {
  const date = parseDate(dateValue);
  const [hours, minutes] = String(timeValue || "00:00").split(":").map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  if (previous && date <= previous) date.setDate(date.getDate() + 1);
  return { date, text: date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + "T" + pad(date.getHours()) + pad(date.getMinutes()) + "00" };
}

function dateForDay(weekStart: string, dayName: string): string {
  const index = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(dayName);
  const date = parseDate(weekStart);
  date.setDate(date.getDate() + Math.max(0, index));
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function parseDate(value: string): Date {
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value: string): string {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function isTokenShape(token: string): boolean {
  return /^[a-f0-9]{64}-[a-f0-9]{32}$/i.test(token);
}

async function supabaseRequest<T>(path: string): Promise<T> {
  const url = requireSecret("SUPABASE_URL").replace(/\/$/, "") + path;
  const serviceRole = requireSecret("SERVICE_ROLE_KEY");
  const response = await fetch(url, {
    headers: { apikey: serviceRole, Authorization: "Bearer " + serviceRole, "Content-Type": "application/json" }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || "Supabase request failed.");
  return (text ? JSON.parse(text) : null) as T;
}

function requireSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(name + " is not configured.");
  return value;
}

function textResponse(body: string, status: number, contentType: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...corsHeaders, ...headers, "Content-Type": contentType } });
}
