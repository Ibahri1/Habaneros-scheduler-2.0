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
  localWorkerId?: string;
  local_worker_id?: string;
  workerId?: string;
  employeeId?: string;
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
    if (!token) return textResponse("Missing calendar token", 400, "text/plain");
    if (!isTokenShape(token)) return textResponse("Calendar not found", 404, "text/plain");

    const employee = await loadEmployee(token);
    if (!employee || !employee.active || employee.deleted_at || employee.calendar_token_revoked_at) return textResponse("Calendar not found", 404, "text/plain");

    const schedules = await loadPublishedSchedules(employee.workspace_id);
    const calendar = buildCalendar(employee, schedules);
    console.error("employee-calendar-feed debug", {
      employeeId: employee.id,
      localWorkerId: employee.local_worker_id,
      employeeName: employee.name,
      publishedSchedulesLoaded: schedules.length,
      shiftMatchCount: calendar.shiftCount,
      skippedShiftCount: calendar.skippedCount
    });
    const ics = calendar.ics;
    return textResponse(ics, 200, "text/calendar; charset=utf-8", {
      "Content-Disposition": 'inline; filename="habaneros-work-schedule.ics"',
      "Cache-Control": "no-cache, no-store, must-revalidate"
    });
  } catch (error) {
    const failure = safeFailure(error);
    console.error("employee-calendar-feed failed", error);
    return textResponse("Calendar feed failed: " + failure, 500, "text/plain");
  }
});

async function loadEmployee(token: string): Promise<EmployeeRow | null> {
  const rows = await supabaseRequest<EmployeeRow[]>("/rest/v1/employees?select=id,local_worker_id,name,active,workspace_id,deleted_at,calendar_token_revoked_at&calendar_token=eq." + encodeURIComponent(token) + "&limit=1", "employee lookup failed");
  return rows[0] || null;
}

async function loadPublishedSchedules(workspaceId: string | null): Promise<PublishedScheduleRow[]> {
  const workspaceFilter = workspaceId ? "&workspace_id=eq." + encodeURIComponent(workspaceId) : "";
  return await supabaseRequest<PublishedScheduleRow[]>("/rest/v1/published_schedules?select=id,workspace_id,week_start,schedule_json,published_at,updated_at" + workspaceFilter + "&order=week_start.asc&limit=80", "published schedule lookup failed");
}

function buildCalendar(employee: EmployeeRow, schedules: PublishedScheduleRow[]): { ics: string; shiftCount: number; skippedCount: number } {
  const stats = { skippedCount: 0 };
  const events = schedules.flatMap((schedule) => eventsForSchedule(employee, schedule, stats));
  const eventLines = events.flat();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Habaneros Scheduler//Employee Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Habaneros Work Schedule",
    "X-WR-TIMEZONE:America/Los_Angeles",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    "X-HABANEROS-SHIFT-COUNT:" + events.length,
    "X-HABANEROS-EMPLOYEE-NAME:" + icsText(employee.name),
    ...(events.length ? losAngelesTimezoneBlock() : []),
    ...eventLines,
    "END:VCALENDAR"
  ];
  return { ics: serializeCalendar(lines), shiftCount: events.length, skippedCount: stats.skippedCount };
}

function eventsForSchedule(employee: EmployeeRow, schedule: PublishedScheduleRow, stats: { skippedCount: number }): string[][] {
  const days = Array.isArray(schedule.schedule_json?.days) ? schedule.schedule_json.days : [];
  return orderScheduleDays(days, schedule.week_start).flatMap((day) => collectShiftAssignments(day).flatMap(({ shiftName, worker }) => {
    if (!employeeMatchesWorker(employee, worker)) return [];
    try {
      return [eventForWorker(employee, schedule, day, shiftName, worker)];
    } catch (error) {
      stats.skippedCount += 1;
      console.error("employee-calendar-feed skipped shift", { employeeId: employee.id, localWorkerId: employee.local_worker_id, weekStart: schedule.week_start, day: day.day, shiftName, error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }));
}

function eventForWorker(employee: EmployeeRow, schedule: PublishedScheduleRow, day: DaySchedule, shiftName: string, worker: AssignedWorker): string[] {
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
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Habaneros shift reminder",
    "END:VALARM",
    "END:VEVENT"
  ];
}

function localDateTime(dateValue: string, timeValue: string, previous?: Date): { date: Date; text: string } {
  const date = parseDate(dateValue);
  const parsedTime = parseTime(timeValue);
  date.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
  if (previous && date <= previous) date.setDate(date.getDate() + 1);
  return { date, text: date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + "T" + pad(date.getHours()) + pad(date.getMinutes()) + "00" };
}

function parseTime(value: string): { hours: number; minutes: number } {
  const text = String(value || "00:00").trim();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return { hours: 0, minutes: 0 };
  let hours = Number(match[1]) || 0;
  const minutes = Number(match[2] || "0") || 0;
  const meridiem = (match[3] || "").toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return { hours: Math.max(0, Math.min(23, hours)), minutes: Math.max(0, Math.min(59, minutes)) };
}

function dateForDay(weekStart: string, dayName: string): string {
  const index = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(dayName);
  const date = parseDate(weekStart);
  date.setDate(date.getDate() + Math.max(0, index));
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function orderScheduleDays(days: DaySchedule[], weekStart: string): DaySchedule[] {
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => {
    const existing = days.find((item) => normalizeText(item.day) === normalizeText(day)) || { day, shifts: {} };
    return { ...existing, day, date: existing.date || dateForDay(weekStart, day) };
  });
}

function collectShiftAssignments(day: DaySchedule): Array<{ shiftName: string; worker: AssignedWorker }> {
  const shifts = day.shifts || {};
  if (Array.isArray(shifts)) {
    return shifts.flatMap((shift, index) => workersFromShift(shift).map((worker) => ({ shiftName: shift?.name || shift?.type || String(index), worker })));
  }
  return Object.entries(shifts).flatMap(([shiftName, shift]) => workersFromShift(shift).map((worker) => ({ shiftName, worker })));
}

function workersFromShift(shift: unknown): AssignedWorker[] {
  if (Array.isArray(shift)) return shift as AssignedWorker[];
  const value = shift as { assigned?: AssignedWorker[]; workers?: AssignedWorker[]; employees?: AssignedWorker[]; employee?: AssignedWorker; worker?: AssignedWorker } | null | undefined;
  if (!value) return [];
  if (Array.isArray(value.assigned)) return value.assigned;
  if (Array.isArray(value.workers)) return value.workers;
  if (Array.isArray(value.employees)) return value.employees;
  if (value.employee) return [value.employee];
  if (value.worker) return [value.worker];
  return [];
}

function employeeMatchesWorker(employee: EmployeeRow, worker: AssignedWorker): boolean {
  const employeeIds = [employee.local_worker_id, employee.id].map(normalizeText).filter(Boolean);
  const workerIds = [worker.id, worker.localWorkerId, worker.local_worker_id, worker.workerId, worker.employeeId].map(normalizeText).filter(Boolean);
  if (workerIds.some((id) => employeeIds.includes(id))) return true;
  return normalizeText(worker.name) !== "" && normalizeText(worker.name) === normalizeText(employee.name);
}

function normalizeText(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
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

function serializeCalendar(lines: string[]): string {
  return lines.flatMap(foldIcsLine).join("\r\n") + "\r\n";
}

function foldIcsLine(line: string): string[] {
  const text = String(line || "");
  if (text.length <= 75) return [text];
  const folded: string[] = [];
  let remaining = text;
  folded.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    folded.push(" " + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  return folded;
}

function losAngelesTimezoneBlock(): string[] {
  return [
    "BEGIN:VTIMEZONE",
    "TZID:America/Los_Angeles",
    "X-LIC-LOCATION:America/Los_Angeles",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0800",
    "TZOFFSETTO:-0700",
    "TZNAME:PDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0800",
    "TZNAME:PST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE"
  ];
}

function isTokenShape(token: string): boolean {
  return /^[a-f0-9]{64}-[a-f0-9]{32}$/i.test(token);
}

async function supabaseRequest<T>(path: string, context: string): Promise<T> {
  const url = requireSupabaseUrl().replace(/\/$/, "") + path;
  const serviceRole = requireServiceRoleKey();
  const response = await fetch(url, {
    headers: { apikey: serviceRole, Authorization: "Bearer " + serviceRole, "Content-Type": "application/json" }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(context + ": " + (safeSupabaseError(text) || "Supabase request failed."));
  return (text ? JSON.parse(text) : null) as T;
}

function requireSupabaseUrl(): string {
  const value = Deno.env.get("SUPABASE_URL");
  if (!value) throw new Error("missing SUPABASE_URL");
  return value;
}

function requireServiceRoleKey(): string {
  const value = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!value) throw new Error("missing SERVICE_ROLE_KEY");
  return value;
}

function safeSupabaseError(text: string): string {
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as { message?: string; code?: string; hint?: string; details?: string };
    return [parsed.code, parsed.message, parsed.details, parsed.hint].filter(Boolean).join(" - ");
  } catch {
    return text.slice(0, 500);
  }
}

function safeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "unknown error");
  if (/missing SUPABASE_URL/i.test(message)) return "missing SUPABASE_URL";
  if (/missing SERVICE_ROLE_KEY/i.test(message)) return "missing SERVICE_ROLE_KEY";
  if (/employee lookup failed/i.test(message)) return message.slice(0, 500);
  if (/published schedule lookup failed/i.test(message)) return message.slice(0, 500);
  if (/Unexpected end of JSON input|JSON/i.test(message)) return "database response could not be parsed";
  return message.slice(0, 500) || "unknown error";
}

function textResponse(body: string, status: number, contentType: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...corsHeaders, ...headers, "Content-Type": contentType } });
}
