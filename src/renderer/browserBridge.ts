import { defaultAppState, defaultSettings } from "../shared/defaults";
import { AvailabilitySubmission, CloudConfig, DAYS, DayName, ExportPayload, ShiftAvailabilityMap, SubmissionStatus, Worker } from "../shared/types";

const STATE_KEY = "habaneros-web-state";
const SETTINGS_KEY = "habaneros-web-settings";
const CLOUD_KEY = "habaneros-web-cloud-config";

if (!window.habanerosDesktop) {
  let dirty = false;
  const api: Window["habanerosDesktop"] = {
    loadState: async () => readStorage(STATE_KEY, defaultAppState()),
    saveState: async (state) => writeStorage(STATE_KEY, state),
    loadSettings: async () => readStorage(SETTINGS_KEY, defaultSettings()),
    saveSettings: async (settings) => writeStorage(SETTINGS_KEY, settings),
    setDirty: async (isDirty) => (dirty = Boolean(isDirty)),
    restoreFocus: async () => window.focus(),
    showMessage: async (message) => { window.alert(message); },
    showConfirmation: async (message) => window.confirm(message),
    confirmClose: async () => !dirty || window.confirm("Close without saving?"),
    printSchedule: async (html) => printInBrowser(html),
    exportData: async (payload) => exportInBrowser(payload),
    importData: async () => importInBrowser(),
    loadCloudConfig: async () => readStorage(CLOUD_KEY, { supabaseUrl: "", anonKey: "" }),
    saveCloudConfig: async (config) => writeStorage(CLOUD_KEY, config),
    testCloudConfig: async (config) => {
      await callRpc(config, "manager_list_availability_submissions", { p_status: "pending" });
      return { success: true, message: "Connected to Supabase." };
    },
    syncCloudEmployees: async (workers) => syncEmployees(readStorage(CLOUD_KEY, { supabaseUrl: "", anonKey: "" }), workers),
    listAvailabilitySubmissions: async (status) => listSubmissions(readStorage(CLOUD_KEY, { supabaseUrl: "", anonKey: "" }), status),
    updateAvailabilitySubmission: async (input) => {
      await callRpc(readStorage(CLOUD_KEY, { supabaseUrl: "", anonKey: "" }), "manager_update_availability_submission", { p_submission_id: input.id, p_available_days: input.availableDays, p_shift_availability: input.shiftAvailability, p_status: input.status, p_manager_notes: input.managerNotes });
      return { success: true, message: "Submission updated." };
    },
    deleteAvailabilitySubmission: async (id) => {
      await callRpc(readStorage(CLOUD_KEY, { supabaseUrl: "", anonKey: "" }), "manager_delete_availability_submission", { p_submission_id: id });
      return { success: true, message: "Submission permanently deleted." };
    }
  };
  window.habanerosDesktop = api;
}

function readStorage<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(key);
  if (!value) return structuredClone(fallback);
  try { return JSON.parse(value) as T; } catch { return structuredClone(fallback); }
}

function writeStorage<T>(key: string, value: T): T {
  localStorage.setItem(key, JSON.stringify(value));
  return structuredClone(value);
}

function printInBrowser(html: string): { success: boolean; message: string } {
  if (!html.trim()) return { success: false, message: "Generate a schedule before printing." };
  const printWindow = window.open("", "_blank");
  if (!printWindow) return { success: false, message: "The print window was blocked by the browser." };
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  return { success: true, message: "Print window opened." };
}

function exportInBrowser(payload: ExportPayload): { success: boolean; message: string } {
  const extension = payload.format === "csv" ? "csv" : "json";
  const content = payload.format === "csv" ? toCsv(payload) : JSON.stringify({ state: payload.state, settings: payload.settings, exportedAt: new Date().toISOString() }, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: payload.format === "csv" ? "text/csv" : "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "habaneros-scheduler-export." + extension;
  link.click();
  URL.revokeObjectURL(url);
  return { success: true, message: "Export downloaded." };
}

function importInBrowser(): Promise<{ canceled: boolean; fileName?: string; content?: string }> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.csv,application/json,text/csv";
    let finished = false;
    input.addEventListener("change", async () => {
      finished = true;
      const file = input.files?.[0];
      resolve(file ? { canceled: false, fileName: file.name, content: await file.text() } : { canceled: true });
    }, { once: true });
    input.addEventListener("cancel", () => { if (!finished) resolve({ canceled: true }); }, { once: true });
    input.click();
  });
}

async function syncEmployees(config: CloudConfig, workers: Worker[]): Promise<{ success: boolean; message: string }> {
  const eligible = workers.filter((worker) => /^\d{4}$/.test(worker.employeeCode));
  for (const worker of eligible) await callRpc(config, "manager_upsert_employee", { p_local_worker_id: worker.id, p_name: worker.name, p_employee_code: worker.employeeCode, p_active: worker.active, p_no_hour_limits: worker.noHourLimits });
  return { success: true, message: eligible.length + " employee" + (eligible.length === 1 ? "" : "s") + " synced." };
}

interface SubmissionRow { id: string; employee_id: string; local_worker_id: string; employee_name: string; week_start: string; available_days: DayName[]; shift_availability: ShiftAvailabilityMap | null; submitted_at: string; status: SubmissionStatus; action_at: string | null; manager_notes: string | null; }

async function listSubmissions(config: CloudConfig, status: SubmissionStatus | null): Promise<AvailabilitySubmission[]> {
  const rows = await callRpc<SubmissionRow[]>(config, "manager_list_availability_submissions", { p_status: status });
  return rows.map((row) => ({ id: row.id, employeeId: row.employee_id, localWorkerId: row.local_worker_id, employeeName: row.employee_name, weekStart: row.week_start, availableDays: row.available_days, shiftAvailability: DAYS.reduce((map, day) => ({ ...map, [day]: row.available_days.includes(day) ? row.shift_availability?.[day] || "Both" : "Unavailable" }), {} as ShiftAvailabilityMap), submittedAt: row.submitted_at, status: row.status, actionAt: row.action_at, managerNotes: row.manager_notes || "" }));
}

async function callRpc<T>(config: CloudConfig, functionName: string, body: Record<string, unknown>): Promise<T> {
  if (!config.supabaseUrl || !config.anonKey) throw new Error("Supabase URL and anon key are required.");
  const response = await fetch(config.supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/" + functionName, { method: "POST", headers: { apikey: config.anonKey, Authorization: "Bearer " + config.anonKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) {
    let message = "Supabase request failed (" + response.status + ").";
    try { message = (JSON.parse(text) as { message?: string }).message || message; } catch { /* Keep status message. */ }
    throw new Error(message);
  }
  return (text ? JSON.parse(text) : null) as T;
}

function toCsv(payload: ExportPayload): string {
  const rows = [["Name", "Employee Code", "Position", "Lead", "Skill Rating", "No Hour Limits", "Active", "Max Weekly Hours", "Preferred Weekly Hours", "Available Days", "Shift Availability", "Default Open Start", "Default Open End", "Default Close Start", "Default Close End", "Notes"]];
  for (const worker of payload.state.workers) rows.push([worker.name, worker.employeeCode, worker.position, worker.isManager ? "Yes" : "No", String(worker.skillRating), worker.noHourLimits ? "Yes" : "No", worker.active ? "Yes" : "No", String(worker.maxWeeklyHours), String(worker.preferredWeeklyHours), worker.availability.join(";"), Object.entries(worker.shiftAvailability).map(([day, shift]) => day + ":" + shift).join(";"), worker.shiftTimes.open.start, worker.shiftTimes.open.end, worker.shiftTimes.close.start, worker.shiftTimes.close.end, worker.notes]);
  return rows.map((row) => row.map((value) => '"' + String(value).replaceAll('"', '""') + '"').join(",")).join("\n");
}
