import { defaultAppState, defaultWorkerShiftTimes, normalizeWorker } from "../shared/defaults";
import { DAYS, SHORT_DAYS, DayName, AppSettings, AppState, ExportFormat, ImportResult, ShiftSchedule, Worker, WorkerRole } from "../shared/types";
import { formatDate, formatDuration, formatTime, nextMonday } from "../shared/time";
import { createWorker } from "./modules/employees/employees";
import { toggleAvailability } from "./modules/availability/availability";
import { generateSchedule } from "./modules/scheduling/scheduler";
import { countScheduleWarnings } from "./modules/reports/reports";
import { applyTheme } from "./modules/settings/settings";
import { byId, escapeHtml } from "./shared/dom";

let state: AppState = defaultAppState();
let settings: AppSettings = { darkMode: false, confirmBeforeClose: true };

const els = {
  availabilityChecks: byId<HTMLDivElement>("availabilityChecks"),
  workerForm: byId<HTMLFormElement>("workerForm"),
  workerName: byId<HTMLInputElement>("workerName"),
  workerPosition: byId<HTMLInputElement>("workerPosition"),
  isManager: byId<HTMLSelectElement>("isManager"),
  maxWeeklyHours: byId<HTMLInputElement>("maxWeeklyHours"),
  preferredWeeklyHours: byId<HTMLInputElement>("preferredWeeklyHours"),
  canOpen: byId<HTMLInputElement>("canOpen"),
  canClose: byId<HTMLInputElement>("canClose"),
  needsBreakFlag: byId<HTMLInputElement>("needsBreakFlag"),
  workerOpenStart: byId<HTMLInputElement>("workerOpenStart"),
  workerOpenEnd: byId<HTMLInputElement>("workerOpenEnd"),
  workerCloseStart: byId<HTMLInputElement>("workerCloseStart"),
  workerCloseEnd: byId<HTMLInputElement>("workerCloseEnd"),
  workerNotes: byId<HTMLTextAreaElement>("workerNotes"),
  weekStart: byId<HTMLInputElement>("weekStart"),
  openShift: byId<HTMLInputElement>("openShift"),
  closeShift: byId<HTMLInputElement>("closeShift"),
  shiftHours: byId<HTMLInputElement>("shiftHours"),
  mealBreakHours: byId<HTMLInputElement>("mealBreakHours"),
  staffingTable: byId<HTMLDivElement>("staffingTable"),
  workersList: byId<HTMLDivElement>("workersList"),
  workerCount: byId<HTMLSpanElement>("workerCount"),
  scheduleOutput: byId<HTMLDivElement>("scheduleOutput"),
  scheduleStatus: byId<HTMLSpanElement>("scheduleStatus"),
  generateBtn: byId<HTMLButtonElement>("generateBtn"),
  printBtn: byId<HTMLButtonElement>("printBtn"),
  importBtn: byId<HTMLButtonElement>("importBtn"),
  exportJsonBtn: byId<HTMLButtonElement>("exportJsonBtn"),
  exportCsvBtn: byId<HTMLButtonElement>("exportCsvBtn"),
  clearBtn: byId<HTMLButtonElement>("clearBtn"),
  darkModeToggle: byId<HTMLInputElement>("darkModeToggle")
};

void init();

async function init(): Promise<void> {
  try {
    state = await window.habanerosDesktop.loadState();
    settings = await window.habanerosDesktop.loadSettings();
  } catch (error) {
    showError("The local data file could not be loaded. The app will start with an empty schedule.", error);
    state = defaultAppState();
  }

  if (!state.rules.weekStart) state.rules.weekStart = nextMonday();
  state.workers = state.workers.map((worker) => normalizeWorker(worker, state.rules));
  applyTheme(settings);
  els.darkModeToggle.checked = settings.darkMode;
  renderAvailabilityInputs();
  renderStaffingInputs();
  bindEvents();
  resetWorkerTimeInputs();
  render();
}

function bindEvents(): void {
  els.workerForm.addEventListener("submit", (event) => void addWorker(event));
  els.generateBtn.addEventListener("click", () => void generateAndSaveSchedule());
  els.printBtn.addEventListener("click", () => void printSchedule());
  els.importBtn.addEventListener("click", () => void importData());
  els.exportJsonBtn.addEventListener("click", () => void exportData("json"));
  els.exportCsvBtn.addEventListener("click", () => void exportData("csv"));
  els.clearBtn.addEventListener("click", () => void clearData());
  els.darkModeToggle.addEventListener("change", () => void updateTheme());
  [els.weekStart, els.openShift, els.closeShift, els.shiftHours, els.mealBreakHours].forEach((input) => input.addEventListener("change", () => void rulesChanged()));
}

function renderAvailabilityInputs(): void {
  els.availabilityChecks.innerHTML = DAYS.map((day) => '<label class="day-chip"><input type="checkbox" name="availableDay" value="' + day + '"> ' + day + '</label>').join("");
}

function renderStaffingInputs(): void {
  els.staffingTable.innerHTML = DAYS.map((day) => {
    const needed = state.rules.staffing[day];
    return '<div class="staffing-row"><div><strong>' + day + '</strong><span>Minimum people needed</span></div><label>Open <input data-day="' + day + '" data-shift="open" type="number" min="0" max="20" value="' + needed.open + '"></label><label>Close <input data-day="' + day + '" data-shift="close" type="number" min="0" max="20" value="' + needed.close + '"></label></div>';
  }).join("");
  els.staffingTable.querySelectorAll<HTMLInputElement>("input").forEach((input) => input.addEventListener("change", () => void rulesChanged()));
}

function render(): void {
  els.weekStart.value = state.rules.weekStart;
  els.openShift.value = state.rules.openShift;
  els.closeShift.value = state.rules.closeShift;
  els.shiftHours.value = String(state.rules.shiftHours);
  els.mealBreakHours.value = String(state.rules.mealBreakHours);
  renderWorkers();
  renderSchedule();
}

async function addWorker(event: Event): Promise<void> {
  event.preventDefault();
  try {
    const availability = selectedAvailableDays();
    if (!els.workerName.value.trim()) { alert("Enter an employee name before saving."); return; }
    if (!availability.length) { alert("Please choose at least one available day."); return; }
    state.workers.push(createWorker({
      name: els.workerName.value,
      position: els.workerPosition.value,
      isManager: els.isManager.value === "true",
      maxWeeklyHours: Number(els.maxWeeklyHours.value) || 0,
      preferredWeeklyHours: Number(els.preferredWeeklyHours.value) || 0,
      canOpen: els.canOpen.checked,
      canClose: els.canClose.checked,
      needsBreakFlag: els.needsBreakFlag.checked,
      notes: els.workerNotes.value,
      availability,
      openStart: els.workerOpenStart.value,
      openEnd: els.workerOpenEnd.value,
      closeStart: els.workerCloseStart.value,
      closeEnd: els.workerCloseEnd.value
    }, state));
    resetWorkerForm();
    state.schedule = null;
    await saveState();
    render();
  } catch (error) {
    showError("The worker could not be added.", error);
  }
}

function selectedAvailableDays(): DayName[] {
  return [...document.querySelectorAll<HTMLInputElement>("input[name='availableDay']:checked")].map((input) => input.value as DayName);
}

function resetWorkerForm(): void {
  els.workerForm.reset();
  els.workerPosition.value = "Crew";
  els.isManager.value = "false";
  els.maxWeeklyHours.value = "40";
  els.preferredWeeklyHours.value = "32";
  els.needsBreakFlag.checked = true;
  resetWorkerTimeInputs();
}

function renderWorkers(): void {
  els.workerCount.textContent = state.workers.length + " worker" + (state.workers.length === 1 ? "" : "s");
  if (!state.workers.length) {
    els.workersList.innerHTML = '<div class="empty-state">No workers yet. Add workers and availability to begin.</div>';
    return;
  }

  els.workersList.innerHTML = state.workers.map((worker) => {
    const openTime = worker.shiftTimes.open;
    const closeTime = worker.shiftTimes.close;
    return '<article class="worker-card ' + (!worker.active ? 'inactive' : '') + '"><div class="worker-top"><div><h3>' + escapeHtml(worker.name) + '</h3><div class="meta">' + escapeHtml(worker.position) + (worker.isManager ? ' | Manager' : '') + ' | ' + worker.maxWeeklyHours + ' max hrs | ' + worker.preferredWeeklyHours + ' preferred</div></div><div class="card-actions"><button class="secondary" type="button" data-toggle-active="' + worker.id + '">' + (worker.active ? 'Deactivate' : 'Activate') + '</button><button class="secondary danger" type="button" data-delete="' + worker.id + '">Delete</button></div></div><div class="tag-row">' + (!worker.active ? '<span class="tag bad">Inactive</span>' : '') + (worker.canOpen ? '<span class="tag good">Can Open</span>' : '') + (worker.canClose ? '<span class="tag good">Can Close</span>' : '') + (worker.needsBreakFlag ? '<span class="tag warn">Lunch flag</span>' : '') + '</div><div class="meta">Open ' + formatTime(openTime.start) + '-' + formatTime(openTime.end) + ' | Close ' + formatTime(closeTime.start) + '-' + formatTime(closeTime.end) + '</div>' + (worker.notes ? '<div class="meta">Notes: ' + escapeHtml(worker.notes) + '</div>' : '') + '<div class="worker-days">' + DAYS.map((day, index) => '<span class="day-mini ' + (worker.availability.includes(day) ? 'on' : '') + '">' + SHORT_DAYS[index] + '</span>').join("") + '</div><div class="worker-edit"><label>Position <input data-edit="' + worker.id + '" data-field="position" type="text" value="' + escapeHtml(worker.position) + '"></label><label>Manager <select data-edit="' + worker.id + '" data-field="isManager"><option value="false" ' + selected(String(worker.isManager), 'false') + '>No</option><option value="true" ' + selected(String(worker.isManager), 'true') + '>Yes</option></select></label><label>Max weekly hours <input data-edit="' + worker.id + '" data-field="maxWeeklyHours" type="number" min="0" max="168" step="0.5" value="' + worker.maxWeeklyHours + '"></label><label>Preferred weekly hours <input data-edit="' + worker.id + '" data-field="preferredWeeklyHours" type="number" min="0" max="168" step="0.5" value="' + worker.preferredWeeklyHours + '"></label><label class="check-row"><input data-edit="' + worker.id + '" data-field="canOpen" type="checkbox" ' + checked(worker.canOpen) + '> Can Open</label><label class="check-row"><input data-edit="' + worker.id + '" data-field="canClose" type="checkbox" ' + checked(worker.canClose) + '> Can Close</label><label class="check-row full"><input data-edit="' + worker.id + '" data-field="needsBreakFlag" type="checkbox" ' + checked(worker.needsBreakFlag) + '> Lunch reminder</label><div class="full time-grid"><label>Open start <input data-shift-time="' + worker.id + '" data-shift="open" data-part="start" type="time" value="' + openTime.start + '"></label><label>Open end <input data-shift-time="' + worker.id + '" data-shift="open" data-part="end" type="time" value="' + openTime.end + '"></label><label>Close start <input data-shift-time="' + worker.id + '" data-shift="close" data-part="start" type="time" value="' + closeTime.start + '"></label><label>Close end <input data-shift-time="' + worker.id + '" data-shift="close" data-part="end" type="time" value="' + closeTime.end + '"></label></div><label class="full">Notes <textarea data-edit="' + worker.id + '" data-field="notes" rows="2">' + escapeHtml(worker.notes) + '</textarea></label><div class="full worker-days">' + DAYS.map((day, index) => '<label class="day-mini ' + (worker.availability.includes(day) ? 'on' : '') + '"><input data-edit-day="' + worker.id + '" value="' + day + '" type="checkbox" ' + checked(worker.availability.includes(day)) + '> ' + SHORT_DAYS[index] + '</label>').join("") + '</div></div></article>';
  }).join("");

  els.workersList.querySelectorAll<HTMLButtonElement>("[data-toggle-active]").forEach((button) => button.addEventListener("click", () => void toggleWorkerActive(button.dataset.toggleActive!)));
  els.workersList.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((button) => button.addEventListener("click", () => void deleteWorker(button.dataset.delete!)));
  els.workersList.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-edit]").forEach((input) => input.addEventListener("change", () => void editWorker(input)));
  els.workersList.querySelectorAll<HTMLInputElement>("[data-edit-day]").forEach((input) => input.addEventListener("change", () => void editWorkerDay(input)));
  els.workersList.querySelectorAll<HTMLInputElement>("[data-shift-time]").forEach((input) => input.addEventListener("change", () => void editWorkerShiftTime(input)));
}

function selected(current: string, value: string): string { return current === value ? "selected" : ""; }
function checked(value: boolean): string { return value ? "checked" : ""; }

async function toggleWorkerActive(id: string): Promise<void> {
  const worker = findWorker(id);
  if (!worker) return;
  worker.active = !worker.active;
  state.schedule = null;
  await saveStateAndRender();
}

async function deleteWorker(id: string): Promise<void> {
  const worker = findWorker(id);
  if (!worker) return;
  if (!confirm("Delete " + worker.name + "? This cannot be undone.")) return;
  state.workers = state.workers.filter((item) => item.id !== id);
  state.schedule = null;
  await saveStateAndRender();
}

async function editWorker(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): Promise<void> {
  const worker = findWorker(input.dataset.edit || "");
  if (!worker) return;
  switch (input.dataset.field) {
    case "position": worker.position = input.value || "Crew"; worker.role = worker.isManager ? "Manager" : "Crew"; break;
    case "isManager": worker.isManager = input.value === "true"; worker.role = worker.isManager ? "Manager" : "Crew"; break;
    case "maxWeeklyHours": worker.maxWeeklyHours = Number(input.value) || 0; break;
    case "preferredWeeklyHours": worker.preferredWeeklyHours = Number(input.value) || 0; break;
    case "canOpen": worker.canOpen = input instanceof HTMLInputElement ? input.checked : worker.canOpen; break;
    case "canClose": worker.canClose = input instanceof HTMLInputElement ? input.checked : worker.canClose; break;
    case "needsBreakFlag": worker.needsBreakFlag = input instanceof HTMLInputElement ? input.checked : worker.needsBreakFlag; break;
    case "notes": worker.notes = input.value; break;
    default: return;
  }
  state.schedule = null;
  await saveStateAndRender();
}

async function editWorkerDay(input: HTMLInputElement): Promise<void> {
  const worker = findWorker(input.dataset.editDay || "");
  if (!worker) return;
  worker.availability = toggleAvailability(worker.availability, input.value as DayName, input.checked);
  state.schedule = null;
  await saveStateAndRender();
}

async function editWorkerShiftTime(input: HTMLInputElement): Promise<void> {
  const worker = findWorker(input.dataset.shiftTime || "");
  if (!worker) return;
  const shift = input.dataset.shift === "close" ? "close" : "open";
  const part = input.dataset.part === "end" ? "end" : "start";
  worker.shiftTimes[shift][part] = input.value;
  state.schedule = null;
  await saveStateAndRender();
}

function findWorker(id: string): Worker | undefined { return state.workers.find((worker) => worker.id === id); }
async function rulesChanged(): Promise<void> { syncRulesFromInputs(); state.schedule = null; await saveStateAndRender(); }

function syncRulesFromInputs(): void {
  state.rules.weekStart = els.weekStart.value || nextMonday();
  state.rules.openShift = els.openShift.value || "08:00";
  state.rules.closeShift = els.closeShift.value || "16:00";
  state.rules.shiftHours = Number(els.shiftHours.value) || 8;
  state.rules.mealBreakHours = Number(els.mealBreakHours.value) || 6;
  els.staffingTable.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
    const day = input.dataset.day as DayName;
    const shift = input.dataset.shift === "close" ? "close" : "open";
    state.rules.staffing[day][shift] = Number(input.value) || 0;
  });
}

async function generateAndSaveSchedule(): Promise<void> {
  try {
    syncRulesFromInputs();
    state.schedule = generateSchedule(state);
    await saveStateAndRender();
    const warnings = state.schedule.days.flatMap((day) => day.warnings);
    if (warnings.length) alert("Schedule generated with warnings:\n\n" + warnings.slice(0, 8).join("\n") + (warnings.length > 8 ? "\n..." : ""));
  } catch (error) {
    showError("The schedule could not be generated.", error);
  }
}

function renderSchedule(): void {
  if (!state.schedule) {
    els.scheduleStatus.textContent = "Not generated";
    els.scheduleOutput.innerHTML = '<div class="empty-state">Add workers, confirm rules, then generate a schedule.</div>';
    return;
  }
  const warningCount = countScheduleWarnings(state);
  els.scheduleStatus.textContent = warningCount ? warningCount + " warning" + (warningCount === 1 ? "" : "s") : "Ready";
  els.scheduleOutput.innerHTML = state.schedule.days.map((day) => '<article class="schedule-day"><div class="schedule-day-head"><div><strong>' + day.day + '</strong><div class="small-muted">' + formatDate(day.date) + '</div></div>' + (day.warnings.length ? '<span class="tag bad">' + day.warnings.length + ' issue' + (day.warnings.length === 1 ? '' : 's') + '</span>' : '<span class="tag good">Covered</span>') + '</div><div class="shift-list">' + renderShift(day.shifts.open, "Opening") + renderShift(day.shifts.close, "Closing") + '</div>' + (day.warnings.length ? '<div class="warnings">' + day.warnings.map((warning) => '<div class="warning problem">' + escapeHtml(warning) + '</div>').join("") + '</div>' : '') + '</article>').join("");
}

function renderShift(shift: ShiftSchedule, label: string): string {
  return '<div class="shift-box"><div class="shift-title"><span>' + label + '</span><span class="small-muted">Default ' + formatTime(shift.time) + ' | Need ' + shift.needed + '</span></div><div class="assigned-list">' + (shift.assigned.length ? shift.assigned.map((worker) => '<div class="assigned-person"><span>' + escapeHtml(worker.name) + '</span><span class="small-muted">' + escapeHtml(worker.position) + (worker.isManager ? ' | Manager' : '') + '</span><span class="person-time">' + worker.timeRange + ' (' + formatDuration(worker.durationHours) + ')</span></div>' + (worker.needsLunch ? '<div class="warning lunch">' + escapeHtml(worker.name) + ' reaches the configured lunch threshold. Plan lunch break.</div>' : '')).join("") : '<div class="empty-state">No one assigned.</div>') + '</div></div>';
}

async function printSchedule(): Promise<void> {
  if (!state.schedule) { alert("Generate a schedule before printing."); return; }
  const result = await window.habanerosDesktop.printSchedule(buildPrintHtml());
  if (!result.success) alert(result.message);
}

function buildPrintHtml(): string {
  return '<!doctype html><html><head><meta charset="utf-8"><title>Habaneros Schedule</title><style>body{font-family:Segoe UI,Arial,sans-serif;color:#1c211b;margin:24px}h1{margin:0 0 4px}.muted{color:#667}.day{break-inside:avoid;border:1px solid #ccc;margin:14px 0}.head{background:#eef3ea;padding:10px 12px;font-weight:700}.shifts{display:grid;grid-template-columns:1fr 1fr}.shift{padding:10px 12px;border-top:1px solid #ccc}.shift+ .shift{border-left:1px solid #ccc}.person{margin:6px 0;padding:6px;border:1px solid #ddd}.warning{color:#8a2f14;font-weight:700}</style></head><body><h1>Habaneros Schedule</h1><div class="muted">Week of ' + escapeHtml(state.rules.weekStart) + '</div>' + state.schedule!.days.map((day) => '<section class="day"><div class="head">' + day.day + ' | ' + formatDate(day.date) + '</div><div class="shifts">' + printShift(day.shifts.open, 'Opening') + printShift(day.shifts.close, 'Closing') + '</div>' + day.warnings.map((warning) => '<div class="warning">' + escapeHtml(warning) + '</div>').join('') + '</section>').join('') + '</body></html>';
}

function printShift(shift: ShiftSchedule, label: string): string {
  return '<div class="shift"><strong>' + label + ' - Need ' + shift.needed + '</strong>' + (shift.assigned.length ? shift.assigned.map((worker) => '<div class="person">' + escapeHtml(worker.name) + ' - ' + escapeHtml(worker.position) + '<br>' + worker.timeRange + (worker.isManager ? '<br>Manager' : '') + '</div>').join('') : '<p>No one assigned.</p>') + '</div>';
}

async function exportData(format: ExportFormat): Promise<void> {
  try {
    syncRulesFromInputs();
    const result = await window.habanerosDesktop.exportData({ format, state, settings });
    alert(result.message);
  } catch (error) {
    showError("Export failed.", error);
  }
}

async function importData(): Promise<void> {
  try {
    const imported = await window.habanerosDesktop.importData();
    if (imported.canceled) return;
    const result = imported.fileName?.toLowerCase().endsWith(".csv") ? importCsv(imported.content || "") : importJson(imported.content || "");
    await saveStateAndRender();
    alert("Import complete.\n\nImported: " + result.imported + "\nSkipped: " + result.skipped + (result.messages.length ? "\n\n" + result.messages.join("\n") : ""));
  } catch (error) {
    showError("Import failed.", error);
  }
}

function importJson(content: string): ImportResult {
  const parsed = JSON.parse(content) as { state?: AppState; settings?: AppSettings; workers?: Worker[] } | AppState;
  const importedState = "state" in parsed && parsed.state ? parsed.state : parsed as AppState;
  const workers = importedState.workers || [];
  let imported = 0;
  let skipped = 0;
  for (const worker of workers) {
    if (mergeWorker(normalizeWorker(worker, state.rules))) imported++; else skipped++;
  }
  if ("settings" in parsed && parsed.settings) settings = { ...settings, ...parsed.settings };
  if (importedState.rules) state.rules = { ...state.rules, ...importedState.rules };
  if (importedState.schedule) state.schedule = importedState.schedule;
  return { imported, skipped, messages: skipped ? [String(skipped) + " duplicate employee(s) skipped."] : [] };
}

function importCsv(content: string): ImportResult {
  const rows = parseCsv(content);
  if (rows.length < 2) return { imported: 0, skipped: 0, messages: ["CSV file did not contain employee rows."] };
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  let imported = 0;
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const get = (name: string) => row[headers.indexOf(name)] || "";
    const name = get("name") || get("employee name");
    if (!name.trim()) { skipped++; continue; }
    const worker = normalizeWorker({ id: crypto.randomUUID(), name, position: get("position") || "Crew", role: yes(get("manager")) ? "Manager" : "Crew", isManager: yes(get("manager")), maxWeeklyHours: Number(get("max weekly hours")) || 40, preferredWeeklyHours: Number(get("preferred weekly hours")) || 32, maxDays: 7, canOpen: yes(get("can open")), canClose: yes(get("can close")), needsBreakFlag: true, active: !no(get("active")), notes: get("notes"), availability: splitDays(get("available days")), shiftTimes: defaultWorkerShiftTimes(state.rules) }, state.rules);
    if (mergeWorker(worker)) imported++; else skipped++;
  }
  return { imported, skipped, messages: skipped ? [String(skipped) + " duplicate or invalid row(s) skipped."] : [] };
}

function mergeWorker(worker: Worker): boolean {
  const key = worker.name.trim().toLowerCase();
  if (state.workers.some((existing) => existing.name.trim().toLowerCase() === key)) return false;
  state.workers.push(worker);
  state.schedule = null;
  return true;
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ""; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function yes(value: string): boolean { return ["yes", "true", "1", "y"].includes(value.trim().toLowerCase()); }
function no(value: string): boolean { return ["no", "false", "0", "n", "inactive"].includes(value.trim().toLowerCase()); }
function splitDays(value: string): DayName[] { const parts = value.split(/[;,|]/).map((item) => item.trim().toLowerCase()); return DAYS.filter((day) => parts.includes(day.toLowerCase()) || parts.includes(day.slice(0, 3).toLowerCase())); }

async function clearData(): Promise<void> {
  if (!confirm("Clear all workers, rules, and generated schedules?")) return;
  state = defaultAppState();
  state.rules.weekStart = nextMonday();
  await saveStateAndRender();
  renderStaffingInputs();
  resetWorkerTimeInputs();
}

async function updateTheme(): Promise<void> {
  try {
    settings = { ...settings, darkMode: els.darkModeToggle.checked };
    applyTheme(settings);
    await window.habanerosDesktop.saveSettings(settings);
  } catch (error) {
    showError("Theme preference could not be saved.", error);
  }
}

async function saveStateAndRender(): Promise<void> {
  await saveState();
  render();
}

async function saveState(): Promise<void> {
  state = await window.habanerosDesktop.saveState(state);
  await window.habanerosDesktop.setDirty(false);
}

function resetWorkerTimeInputs(): void {
  const defaults = defaultWorkerShiftTimes(state.rules);
  els.workerOpenStart.value = defaults.open.start;
  els.workerOpenEnd.value = defaults.open.end;
  els.workerCloseStart.value = defaults.close.start;
  els.workerCloseEnd.value = defaults.close.end;
}

function showError(message: string, error: unknown): void {
  console.error(message, error);
  alert(message + "\n\n" + (error instanceof Error ? error.message : "Please try again."));
}
