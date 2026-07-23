type ReminderType = "first" | "final";

interface EmployeeRow {
  id: string;
  local_worker_id: string;
  name: string;
  active: boolean;
  mobile_phone: string;
}

interface SubmissionRow { employee_id: string; }
interface ReminderLogRow { employee_id: string; status: string; }
interface SchedulePostedRecipient { id?: string; name: string; phone: string; }

interface AvailabilityDeadlineSettings {
  smsRemindersEnabled: boolean;
  deadlineDay: string;
  deadlineTime: string;
  firstReminderTime: string;
  secondReminderTime: string;
  firstReminderMessage: string;
  secondReminderMessage: string;
  schedulePostedMessage: string;
  employeeScheduleUrl: string;
}

const DEFAULT_SETTINGS: AvailabilityDeadlineSettings = {
  smsRemindersEnabled: false,
  deadlineDay: "Tuesday",
  deadlineTime: "23:59",
  firstReminderTime: "12:00",
  secondReminderTime: "20:00",
  firstReminderMessage: "Habaneros Reminder: Please submit your availability for next week's schedule before tonight's deadline.",
  secondReminderMessage: "Habaneros Final Reminder: We have not received your availability. Please submit it before tonight's deadline.",
  schedulePostedMessage: "Habaneros Schedule Posted: Next week's schedule is now available. Please view it here: [employee schedule link]",
  employeeScheduleUrl: "https://ibahri1.github.io/Habaneros-scheduler-2.0/employee-availability/"
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse({});
  if (request.method !== "POST") return jsonResponse({ error: "Use POST." }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "test" ? "test" : body.mode === "dryRun" ? "dryRun" : body.mode === "schedulePosted" ? "schedulePosted" : "send";
    const settings = await loadDeadlineSettings();
    const now = new Date();
    const timeZone = Deno.env.get("HABANEROS_TIME_ZONE") || "America/Los_Angeles";
    const targetWeek = targetWeekStart(now, timeZone);
    const reminderType = dueReminderType(settings, now, timeZone);

    if (mode === "test") {
      const testPhoneNumber = String(body.testPhoneNumber || "").trim();
      if (!testPhoneNumber) return jsonResponse({ error: "Test phone number is required." }, 400);
      if (!settings.smsRemindersEnabled) return jsonResponse({ mode, smsRemindersEnabled: false, reminderType: "test", targetWeek, employeesChecked: 0, messagesSent: 0, employeesSkipped: 0, errors: [], message: "SMS reminders are disabled." });
      const messageId = await sendTextbeltSms(testPhoneNumber, renderMessage(settings.firstReminderMessage, settings, targetWeek, "Test Employee"));
      return jsonResponse({ mode, reminderType: "test", targetWeek, employeesChecked: 1, messagesSent: 1, employeesSkipped: 0, errors: [], messageId });
    }

    if (mode === "schedulePosted") {
      const weekStart = String(body.weekStart || targetWeek);
      const message = String(body.message || settings.schedulePostedMessage).trim().slice(0, 500);
      const recipients = Array.isArray(body.recipients) ? body.recipients.map(normalizeSchedulePostedRecipient).filter(Boolean) as SchedulePostedRecipient[] : [];
      if (!message) return jsonResponse({ error: "Schedule posted message is required." }, 400);
      if (!recipients.length) return jsonResponse({ error: "At least one recipient is required." }, 400);
      const errors: Array<{ employee: string; message: string }> = [];
      let sent = 0;
      for (const recipient of recipients) {
        try {
          await sendTextbeltSms(recipient.phone, message);
          sent++;
        } catch (error) {
          errors.push({ employee: recipient.name, message: error instanceof Error ? error.message : "Unknown SMS error." });
        }
      }
      return jsonResponse({ mode, reminderType: "schedulePosted", targetWeek: weekStart, employeesChecked: recipients.length, messagesSent: sent, messagesFailed: errors.length, employeesSkipped: 0, errors });
    }

    const employees = await loadReminderEmployees();
    const submittedIds = new Set((await loadSubmittedEmployees(targetWeek)).map((row) => row.employee_id));
    const skippedSubmitted = employees.filter((employee) => submittedIds.has(employee.id)).length;
    const missing = employees.filter((employee) => !submittedIds.has(employee.id));

    if (!settings.smsRemindersEnabled) {
      return jsonResponse({ mode, smsRemindersEnabled: false, reminderType, targetWeek, employeesChecked: employees.length, messagesSent: 0, employeesSkipped: employees.length, stillWaiting: missing.length, errors: [], message: "SMS reminders are disabled." });
    }

    if (!reminderType) {
      return jsonResponse({ mode, reminderType: null, targetWeek, employeesChecked: employees.length, messagesSent: 0, employeesSkipped: skippedSubmitted + missing.length, stillWaiting: missing.length, errors: [], message: "No reminder is due right now." });
    }

    const alreadyLogged = new Set((await loadReminderLog(targetWeek, reminderType)).map((row) => row.employee_id));
    const candidates = missing.filter((employee) => !alreadyLogged.has(employee.id));

    if (mode === "dryRun") {
      return jsonResponse({ mode, reminderType, targetWeek, employeesChecked: employees.length, messagesSent: 0, employeesSkipped: employees.length - candidates.length, stillWaiting: missing.length, wouldSend: candidates.length, errors: [] });
    }

    const messageTemplate = reminderType === "first" ? settings.firstReminderMessage : settings.secondReminderMessage;
    const errors: Array<{ employee: string; message: string }> = [];
    let sent = 0;

    for (const employee of candidates) {
      const message = renderMessage(messageTemplate, settings, targetWeek, employee.name);
      try {
        const messageId = await sendTextbeltSms(employee.mobile_phone, message);
        await recordReminder(employee, targetWeek, reminderType, "sent", messageId, "");
        sent++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown SMS error.";
        await recordReminder(employee, targetWeek, reminderType, "failed", "", errorMessage);
        errors.push({ employee: employee.name, message: errorMessage });
      }
    }

    return jsonResponse({ mode, reminderType, targetWeek, employeesChecked: employees.length, messagesSent: sent, employeesSkipped: employees.length - candidates.length, stillWaiting: missing.length, errors });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Reminder function failed." }, 500);
  }
});

async function loadDeadlineSettings(): Promise<AvailabilityDeadlineSettings> {
  const rows = await supabaseRequest<Array<{ state_data: { settings?: { availabilityDeadline?: Partial<AvailabilityDeadlineSettings> } } }>>("/rest/v1/manager_app_state?id=eq.habaneros-manager&select=state_data");
  return normalizeSettings(rows[0]?.state_data?.settings?.availabilityDeadline || {});
}

function normalizeSettings(input: Partial<AvailabilityDeadlineSettings>): AvailabilityDeadlineSettings {
  const settings = { ...DEFAULT_SETTINGS, ...input };
  settings.smsRemindersEnabled = settings.smsRemindersEnabled === true;
  if (!DAYS.includes(settings.deadlineDay)) settings.deadlineDay = DEFAULT_SETTINGS.deadlineDay;
  settings.deadlineTime = normalizeTime(settings.deadlineTime, DEFAULT_SETTINGS.deadlineTime);
  settings.firstReminderTime = normalizeTime(settings.firstReminderTime, DEFAULT_SETTINGS.firstReminderTime);
  settings.secondReminderTime = normalizeTime(settings.secondReminderTime, DEFAULT_SETTINGS.secondReminderTime);
  settings.firstReminderMessage = String(settings.firstReminderMessage || DEFAULT_SETTINGS.firstReminderMessage).slice(0, 500);
  settings.secondReminderMessage = String(settings.secondReminderMessage || DEFAULT_SETTINGS.secondReminderMessage).slice(0, 500);
  settings.schedulePostedMessage = String(settings.schedulePostedMessage || DEFAULT_SETTINGS.schedulePostedMessage).slice(0, 500);
  settings.employeeScheduleUrl = String(settings.employeeScheduleUrl || DEFAULT_SETTINGS.employeeScheduleUrl).slice(0, 500);
  return settings;
}

function normalizeSchedulePostedRecipient(value: unknown): SchedulePostedRecipient | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const phone = String(item.phone || "").trim();
  if (!phone) return null;
  return { id: String(item.id || ""), name: String(item.name || "Employee"), phone };
}

async function loadReminderEmployees(): Promise<EmployeeRow[]> {
  return await supabaseRequest<EmployeeRow[]>("/rest/v1/employees?select=id,local_worker_id,name,active,mobile_phone&active=eq.true&mobile_phone=neq.");
}

async function loadSubmittedEmployees(weekStart: string): Promise<SubmissionRow[]> {
  return await supabaseRequest<SubmissionRow[]>("/rest/v1/availability_submissions?select=employee_id&week_start=eq." + encodeURIComponent(weekStart));
}

async function loadReminderLog(weekStart: string, reminderType: ReminderType): Promise<ReminderLogRow[]> {
  return await supabaseRequest<ReminderLogRow[]>("/rest/v1/availability_reminder_log?select=employee_id,status&week_start=eq." + encodeURIComponent(weekStart) + "&reminder_type=eq." + reminderType);
}

async function recordReminder(employee: EmployeeRow, weekStart: string, reminderType: ReminderType, status: "sent" | "failed", messageId: string, errorMessage: string): Promise<void> {
  await supabaseRequest("/rest/v1/availability_reminder_log", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ employee_id: employee.id, employee_name: employee.name, phone_number: employee.mobile_phone, week_start: weekStart, reminder_type: reminderType, status, twilio_message_sid: messageId || null, error_message: errorMessage || "" })
  });
}

async function sendTextbeltSms(phone: string, message: string): Promise<string> {
  const key = requireSecret("TEXTBELT_API_KEY");
  const params = new URLSearchParams({ phone, message, key });
  const response = await fetch("https://textbelt.com/text", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || "Textbelt rejected the SMS request.");
  return String(result.textId || "");
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = requireSecret("SUPABASE_URL").replace(/\/$/, "") + path;
  const serviceRole = requireSecret("SERVICE_ROLE_KEY");
  const response = await fetch(url, {
    ...init,
    headers: { apikey: serviceRole, Authorization: "Bearer " + serviceRole, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || "Supabase request failed.");
  return (text ? JSON.parse(text) : null) as T;
}

function dueReminderType(settings: AvailabilityDeadlineSettings, now: Date, timeZone: string): ReminderType | null {
  const parts = localDateParts(now, timeZone);
  if (parts.weekday !== settings.deadlineDay) return null;
  const current = parts.hour * 60 + parts.minute;
  const deadline = minutes(settings.deadlineTime);
  if (current > deadline) return null;
  if (current >= minutes(settings.secondReminderTime)) return "final";
  if (current >= minutes(settings.firstReminderTime)) return "first";
  return null;
}

function targetWeekStart(now: Date, timeZone: string): string {
  const parts = localDateParts(now, timeZone);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  localDate.setUTCDate(localDate.getUTCDate() + ((7 - DAYS.indexOf(parts.weekday)) % 7));
  return localDate.toISOString().slice(0, 10);
}

function renderMessage(template: string, settings: AvailabilityDeadlineSettings, weekStart: string, employeeName: string): string {
  return template
    .replaceAll("{employeeName}", employeeName)
    .replaceAll("{deadlineDay}", settings.deadlineDay)
    .replaceAll("{deadlineTime}", formatTime(settings.deadlineTime))
    .replaceAll("{weekOf}", formatWeek(weekStart));
}

function localDateParts(date: Date, timeZone: string): { weekday: string; year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { weekday: get("weekday"), year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

function minutes(value: string): number {
  const [hours, mins] = value.split(":").map(Number);
  return (hours || 0) * 60 + (mins || 0);
}

function normalizeTime(value: string, fallback: string): string {
  return /^\d{2}:\d{2}$/.test(String(value || "")) ? String(value) : fallback;
}

function formatTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return hour12 + ":" + String(minute || 0).padStart(2, "0") + " " + suffix;
}

function formatWeek(value: string): string {
  return new Date(value + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function requireSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(name + " is not configured.");
  return value;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
