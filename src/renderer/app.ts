import { defaultAppState, normalizeWorker } from "../shared/defaults";
import { DAYS, SHORT_DAYS, AvailabilitySubmission, CloudConfig, DayName, AppSettings, AppState, ExportFormat, ImportResult, ShiftName, ShiftSchedule, SubmissionStatus, Worker, WorkerRole } from "../shared/types";
import { formatDate, formatDuration, formatTime, nextMonday } from "../shared/time";
import { createWorker } from "./modules/employees/employees";
import { toggleAvailability } from "./modules/availability/availability";
import { generateSchedule } from "./modules/scheduling/scheduler";
import { duplicateAssignment, findAssignment, moveAssignment, normalizeSchedule, refreshAssignment, refreshScheduleCoverage, removeAssignment, replaceAssignedEmployee } from "./modules/scheduling/scheduleEditor";
import { countScheduleWarnings } from "./modules/reports/reports";
import { applyTheme } from "./modules/settings/settings";
import { byId, escapeHtml } from "./shared/dom";

let state: AppState = defaultAppState();
let settings: AppSettings = { darkMode: false, confirmBeforeClose: true };
let cloudConfig: CloudConfig = { supabaseUrl: "", anonKey: "" };
let submissions: AvailabilitySubmission[] = [];

const els = {
  availabilityChecks: byId<HTMLDivElement>("availabilityChecks"),
  workerForm: byId<HTMLFormElement>("workerForm"),
  workerName: byId<HTMLInputElement>("workerName"),
  employeeCode: byId<HTMLInputElement>("employeeCode"),
  workerPosition: byId<HTMLInputElement>("workerPosition"),
  isManager: byId<HTMLSelectElement>("isManager"),
  noHourLimits: byId<HTMLInputElement>("noHourLimits"),
  maxWeeklyHours: byId<HTMLInputElement>("maxWeeklyHours"),
  preferredWeeklyHours: byId<HTMLInputElement>("preferredWeeklyHours"),
  canOpen: byId<HTMLInputElement>("canOpen"),
  canClose: byId<HTMLInputElement>("canClose"),
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
  darkModeToggle: byId<HTMLInputElement>("darkModeToggle"),
  cloudConfigForm: byId<HTMLFormElement>("cloudConfigForm"),
  supabaseUrl: byId<HTMLInputElement>("supabaseUrl"),
  supabaseAnonKey: byId<HTMLInputElement>("supabaseAnonKey"),
  cloudStatus: byId<HTMLSpanElement>("cloudStatus"),
  testCloudBtn: byId<HTMLButtonElement>("testCloudBtn"),
  syncEmployeesBtn: byId<HTMLButtonElement>("syncEmployeesBtn"),
  refreshSubmissionsBtn: byId<HTMLButtonElement>("refreshSubmissionsBtn"),
  applyAllBtn: byId<HTMLButtonElement>("applyAllBtn"),
  submissionCount: byId<HTMLSpanElement>("submissionCount"),
  submissionsList: byId<HTMLDivElement>("submissionsList"),
  historyCount: byId<HTMLSpanElement>("historyCount"),
  historyEmployeeFilter: byId<HTMLSelectElement>("historyEmployeeFilter"),
  historyWeekFilter: byId<HTMLSelectElement>("historyWeekFilter"),
  historyStatusFilter: byId<HTMLSelectElement>("historyStatusFilter"),
  historyList: byId<HTMLDivElement>("historyList")
};

const workerIdentityFields = [els.workerName, els.employeeCode, els.workerPosition];
let lastFocusedWorkerField: HTMLInputElement | null = null;

void init();

async function init(): Promise<void> {
  try {
    state = await window.habanerosDesktop.loadState();
    settings = await window.habanerosDesktop.loadSettings();
    cloudConfig = await window.habanerosDesktop.loadCloudConfig();
  } catch (error) {
    showError("The local data file could not be loaded. The app will start with an empty schedule.", error);
    state = defaultAppState();
  }

  if (!state.rules.weekStart) state.rules.weekStart = nextMonday();
  state.workers = state.workers.map((worker) => normalizeWorker(worker, state.rules));
  normalizeSchedule(state.schedule, state.rules.mealBreakHours);
  applyTheme(settings);
  els.darkModeToggle.checked = settings.darkMode;
  renderCloudConfig();
  renderAvailabilityInputs();
  renderStaffingInputs();
  bindEvents();
  updateAddWorkerHourFields();
  render();
}

function bindEvents(): void {
  els.workerForm.addEventListener("submit", (event) => void addWorker(event));
  els.workerForm.addEventListener("reset", () => queueMicrotask(ensureWorkerFormInteractive));
  workerIdentityFields.forEach((field) => field.addEventListener("focus", () => { lastFocusedWorkerField = field; }));
  window.addEventListener("focus", restoreWorkerFormAfterFocusReturn);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) restoreWorkerFormAfterFocusReturn(); });
  els.noHourLimits.addEventListener("change", updateAddWorkerHourFields);
  els.generateBtn.addEventListener("click", () => void generateAndSaveSchedule());
  els.printBtn.addEventListener("click", () => void printSchedule());
  els.importBtn.addEventListener("click", () => void importData());
  els.exportJsonBtn.addEventListener("click", () => void exportData("json"));
  els.exportCsvBtn.addEventListener("click", () => void exportData("csv"));
  els.clearBtn.addEventListener("click", () => void clearData());
  els.darkModeToggle.addEventListener("change", () => void updateTheme());
  els.cloudConfigForm.addEventListener("submit", (event) => void saveCloudConfig(event));
  els.testCloudBtn.addEventListener("click", () => void testCloudConfig());
  els.syncEmployeesBtn.addEventListener("click", () => void syncCloudEmployees());
  els.refreshSubmissionsBtn.addEventListener("click", () => void refreshSubmissions());
  els.applyAllBtn.addEventListener("click", () => void applyAllSubmissions());
  [els.historyEmployeeFilter, els.historyWeekFilter, els.historyStatusFilter].forEach((filter) => filter.addEventListener("change", renderHistory));
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
  ensureWorkerFormInteractive();
}

async function addWorker(event: Event): Promise<void> {
  event.preventDefault();
  try {
    const availability = selectedAvailableDays();
    if (!els.workerName.value.trim()) { alert("Enter an employee name before saving."); return; }
    if (!/^\d{4}$/.test(els.employeeCode.value)) { alert("Enter a valid 4-digit employee code."); return; }
    if (state.workers.some((worker) => worker.employeeCode === els.employeeCode.value)) { alert("That employee code is already assigned."); return; }
    state.workers.push(createWorker({
      employeeCode: els.employeeCode.value,
      name: els.workerName.value,
      position: els.workerPosition.value,
      isManager: els.isManager.value === "true",
      noHourLimits: els.noHourLimits.checked,
      maxWeeklyHours: Number(els.maxWeeklyHours.value) || 0,
      preferredWeeklyHours: Number(els.preferredWeeklyHours.value) || 0,
      canOpen: els.canOpen.checked,
      canClose: els.canClose.checked,
      notes: els.workerNotes.value,
      availability
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
  els.maxWeeklyHours.value = "45";
  els.preferredWeeklyHours.value = "40";
  updateAddWorkerHourFields();
  lastFocusedWorkerField = null;
  ensureWorkerFormInteractive();
}

function ensureWorkerFormInteractive(): void {
  els.workerForm.removeAttribute("inert");
  els.workerForm.removeAttribute("aria-disabled");
  els.workerForm.style.pointerEvents = "";
  workerIdentityFields.forEach((field) => {
    field.disabled = false;
    field.readOnly = false;
    field.removeAttribute("aria-disabled");
    field.style.pointerEvents = "";
  });
}

function restoreWorkerFormAfterFocusReturn(): void {
  requestAnimationFrame(() => {
    ensureWorkerFormInteractive();
    if (lastFocusedWorkerField?.isConnected && document.activeElement === document.body) {
      lastFocusedWorkerField.focus({ preventScroll: true });
    }
  });
}

function updateAddWorkerHourFields(): void {
  els.preferredWeeklyHours.disabled = els.noHourLimits.checked;
  els.maxWeeklyHours.disabled = els.noHourLimits.checked;
}

function renderWorkers(): void {
  els.workerCount.textContent = state.workers.length + " worker" + (state.workers.length === 1 ? "" : "s");
  if (!state.workers.length) {
    els.workersList.innerHTML = '<div class="empty-state">No workers yet. Add workers and availability to begin.</div>';
    return;
  }

  els.workersList.innerHTML = state.workers.map((worker) => {
    const tags = (!worker.active ? '<span class="tag bad">Inactive</span>' : '') + (worker.noHourLimits ? '<span class="tag good">No Hour Limits</span>' : '') + (worker.canOpen ? '<span class="tag good">Can Open</span>' : '') + (worker.canClose ? '<span class="tag good">Can Close</span>' : '');
    const daySummary = DAYS.map((day, index) => '<span class="day-mini ' + (worker.availability.includes(day) ? 'on' : '') + '">' + SHORT_DAYS[index] + '</span>').join("");
    const dayEditors = DAYS.map((day, index) => '<label class="day-mini ' + (worker.availability.includes(day) ? 'on' : '') + '"><input data-edit-day="' + worker.id + '" value="' + day + '" type="checkbox" ' + checked(worker.availability.includes(day)) + '> ' + SHORT_DAYS[index] + '</label>').join("");
    const hourSummary = worker.noHourLimits ? 'No hour limits' : worker.preferredWeeklyHours + ' preferred hrs | ' + worker.maxWeeklyHours + ' max hrs';
    return '<article class="worker-card ' + (!worker.active ? 'inactive' : '') + '"><div class="worker-top"><div><h3>' + escapeHtml(worker.name) + '</h3><div class="meta">Code ' + escapeHtml(worker.employeeCode || 'Not set') + ' | ' + escapeHtml(worker.position) + (worker.isManager ? ' | Lead' : '') + ' | ' + hourSummary + '</div></div><div class="card-actions"><button class="secondary" type="button" data-toggle-active="' + worker.id + '">' + (worker.active ? 'Deactivate' : 'Activate') + '</button><button class="secondary danger" type="button" data-delete="' + worker.id + '">Delete</button></div></div><div class="tag-row">' + tags + '</div>' + (worker.notes ? '<div class="meta">Notes: ' + escapeHtml(worker.notes) + '</div>' : '') + '<div class="worker-days">' + daySummary + '</div><div class="worker-edit"><label>Employee code <input data-edit="' + worker.id + '" data-field="employeeCode" type="text" inputmode="numeric" pattern="\\d{4}" maxlength="4" value="' + escapeHtml(worker.employeeCode) + '"></label><label>Position <input data-edit="' + worker.id + '" data-field="position" type="text" value="' + escapeHtml(worker.position) + '"></label><label>Lead <select data-edit="' + worker.id + '" data-field="isManager"><option value="false" ' + selected(String(worker.isManager), 'false') + '>No</option><option value="true" ' + selected(String(worker.isManager), 'true') + '>Yes</option></select></label><label class="check-row full"><input data-edit="' + worker.id + '" data-field="noHourLimits" type="checkbox" ' + checked(worker.noHourLimits) + '> No Hour Limits</label><label>Preferred Weekly Hours <input data-edit="' + worker.id + '" data-field="preferredWeeklyHours" type="number" min="0" max="168" step="0.5" value="' + worker.preferredWeeklyHours + '" ' + disabled(worker.noHourLimits) + '></label><label>Maximum Weekly Hours <input data-edit="' + worker.id + '" data-field="maxWeeklyHours" type="number" min="0" max="168" step="0.5" value="' + worker.maxWeeklyHours + '" ' + disabled(worker.noHourLimits) + '></label><label class="check-row"><input data-edit="' + worker.id + '" data-field="canOpen" type="checkbox" ' + checked(worker.canOpen) + '> Can Open</label><label class="check-row"><input data-edit="' + worker.id + '" data-field="canClose" type="checkbox" ' + checked(worker.canClose) + '> Can Close</label><label class="full">Notes <textarea data-edit="' + worker.id + '" data-field="notes" rows="2">' + escapeHtml(worker.notes) + '</textarea></label><div class="full worker-days">' + dayEditors + '</div></div></article>';
  }).join("");

  els.workersList.querySelectorAll<HTMLButtonElement>("[data-toggle-active]").forEach((button) => button.addEventListener("click", () => void toggleWorkerActive(button.dataset.toggleActive!)));
  els.workersList.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((button) => button.addEventListener("click", () => void deleteWorker(button.dataset.delete!)));
  els.workersList.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-edit]").forEach((input) => input.addEventListener("change", () => void editWorker(input)));
  els.workersList.querySelectorAll<HTMLInputElement>("[data-edit-day]").forEach((input) => input.addEventListener("change", () => void editWorkerDay(input)));
}

function selected(current: string, value: string): string { return current === value ? "selected" : ""; }
function checked(value: boolean): string { return value ? "checked" : ""; }
function disabled(value: boolean): string { return value ? "disabled" : ""; }

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
    case "employeeCode":
      if (!/^\d{4}$/.test(input.value)) { alert("Employee code must contain exactly 4 digits."); renderWorkers(); return; }
      if (state.workers.some((item) => item.id !== worker.id && item.employeeCode === input.value)) { alert("That employee code is already assigned."); renderWorkers(); return; }
      worker.employeeCode = input.value;
      break;
    case "position": worker.position = input.value || "Crew"; worker.role = worker.isManager ? "Lead" : "Crew"; break;
    case "isManager": worker.isManager = input.value === "true"; worker.role = worker.isManager ? "Lead" : "Crew"; break;
    case "noHourLimits": worker.noHourLimits = input instanceof HTMLInputElement ? input.checked : worker.noHourLimits; break;
    case "maxWeeklyHours": worker.maxWeeklyHours = Number(input.value) || 0; break;
    case "preferredWeeklyHours": worker.preferredWeeklyHours = Number(input.value) || 0; break;
    case "canOpen": worker.canOpen = input instanceof HTMLInputElement ? input.checked : worker.canOpen; break;
    case "canClose": worker.canClose = input instanceof HTMLInputElement ? input.checked : worker.canClose; break;
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
  els.scheduleOutput.innerHTML = state.schedule.days.map((day) => '<article class="schedule-day"><div class="schedule-day-head"><div><strong>' + day.day + '</strong><div class="small-muted">' + formatDate(day.date) + '</div></div>' + (day.warnings.length ? '<span class="tag bad">' + day.warnings.length + ' issue' + (day.warnings.length === 1 ? '' : 's') + '</span>' : '<span class="tag good">Covered</span>') + '</div><div class="shift-list">' + renderShift(day.day, day.shifts.open, "Opening") + renderShift(day.day, day.shifts.close, "Closing") + '</div>' + (day.warnings.length ? '<div class="warnings">' + day.warnings.map((warning) => '<div class="warning problem">' + escapeHtml(warning) + '</div>').join("") + '</div>' : '') + '</article>').join("");
  bindScheduleEditorEvents();
}

function renderShift(day: DayName, shift: ShiftSchedule, label: string): string {
  return '<div class="shift-box"><div class="shift-title"><span>' + label + '</span><span class="small-muted">Default ' + formatTime(shift.time) + ' | Need ' + shift.needed + '</span></div><div class="assigned-list">' + (shift.assigned.length ? shift.assigned.map((assignment) => renderAssignment(day, shift.name, assignment.assignmentId)).join("") : '<div class="empty-state">No one assigned.</div>') + '</div></div>';
}

function renderAssignment(day: DayName, shift: ShiftName, assignmentId: string): string {
  const assignment = findAssignment(state.schedule!, assignmentId)!.assignment;
  const workerOptions = state.workers.map((worker) => '<option value="' + worker.id + '" ' + selected(worker.id, assignment.id) + '>' + escapeHtml(worker.name) + '</option>').join("");
  const dayOptions = DAYS.map((item) => '<option value="' + item + '" ' + selected(item, day) + '>' + item + '</option>').join("");
  return '<div class="assignment-editor" data-assignment-row="' + assignment.assignmentId + '"><label>Employee<select data-assignment-field="employee" data-assignment-id="' + assignment.assignmentId + '">' + workerOptions + '</select></label><label>Day<select data-assignment-field="day" data-assignment-id="' + assignment.assignmentId + '">' + dayOptions + '</select></label><label>Shift<select data-assignment-field="shift" data-assignment-id="' + assignment.assignmentId + '"><option value="open" ' + selected(shift, 'open') + '>Open</option><option value="close" ' + selected(shift, 'close') + '>Close</option></select></label><label>Start<input data-assignment-field="start" data-assignment-id="' + assignment.assignmentId + '" type="time" value="' + assignment.start + '"></label><label>End<input data-assignment-field="end" data-assignment-id="' + assignment.assignmentId + '" type="time" value="' + assignment.end + '"></label><div class="assignment-summary"><span>' + escapeHtml(assignment.position) + (assignment.isManager ? ' | Lead' : '') + '</span><span>' + formatDuration(assignment.durationHours) + '</span></div></div>' + (assignment.needsLunch ? '<div class="warning lunch">' + escapeHtml(assignment.name) + ' reaches the configured lunch threshold. Plan lunch break.</div>' : '');
}

function bindScheduleEditorEvents(): void {
  els.scheduleOutput.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-assignment-field]").forEach((input) => input.addEventListener("change", () => void editScheduleAssignment(input)));
  els.scheduleOutput.querySelectorAll<HTMLButtonElement>("[data-assignment-duplicate]").forEach((button) => button.addEventListener("click", () => void duplicateScheduleAssignment(button.dataset.assignmentDuplicate!)));
  els.scheduleOutput.querySelectorAll<HTMLButtonElement>("[data-assignment-remove]").forEach((button) => button.addEventListener("click", () => void removeScheduleAssignment(button.dataset.assignmentRemove!)));
}

async function editScheduleAssignment(input: HTMLInputElement | HTMLSelectElement): Promise<void> {
  if (!state.schedule) return;
  const location = findAssignment(state.schedule, input.dataset.assignmentId || "");
  if (!location) return;
  const field = input.dataset.assignmentField;
  if (field === "employee") {
    const worker = findWorker(input.value);
    if (worker) replaceAssignedEmployee(location.assignment, worker);
  } else if (field === "day") {
    moveAssignment(state.schedule, location.assignment.assignmentId, input.value as DayName, location.shift);
  } else if (field === "shift") {
    moveAssignment(state.schedule, location.assignment.assignmentId, location.day, input.value as ShiftName);
  } else if (field === "start" || field === "end") {
    location.assignment[field] = input.value;
    refreshAssignment(location.assignment, state.rules.mealBreakHours);
  }
  await saveEditedSchedule();
}

async function duplicateScheduleAssignment(assignmentId: string): Promise<void> {
  if (!state.schedule) return;
  const location = findAssignment(state.schedule, assignmentId);
  if (!location) return;
  const nextDay = DAYS[(DAYS.indexOf(location.day) + 1) % DAYS.length];
  duplicateAssignment(state.schedule, assignmentId, nextDay, location.shift);
  await saveEditedSchedule();
}

async function removeScheduleAssignment(assignmentId: string): Promise<void> {
  if (!state.schedule) return;
  removeAssignment(state.schedule, assignmentId);
  await saveEditedSchedule();
}

async function saveEditedSchedule(): Promise<void> {
  if (!state.schedule) return;
  refreshScheduleCoverage(state.schedule, state.workers);
  await saveStateAndRender();
}

async function printSchedule(): Promise<void> {
  if (!state.schedule) { alert("Generate a schedule before printing."); return; }
  const result = await window.habanerosDesktop.printSchedule(buildPrintHtml());
  if (!result.success) alert(result.message);
}

function buildPrintHtml(): string {
  const schedule = state.schedule!;
  const compact = schedule.days.every((day) => day.shifts.open.assigned.length <= 4 && day.shifts.close.assigned.length <= 4);
  const warnings = schedule.days.flatMap((day) => day.warnings.map((warning) => '<div class="warning"><strong>' + day.day + ':</strong> ' + escapeHtml(warning) + '</div>')).join("");
  const css = '@page{size:landscape;margin:.25in}*{box-sizing:border-box}body{font-family:Segoe UI,Arial,sans-serif;color:#182018;margin:0;font-size:8pt;line-height:1.15}.print-header{display:flex;align-items:end;justify-content:space-between;border-bottom:1.5px solid #246b46;padding:0 0 5px;margin:0 0 5px}.print-header h1{font-size:14pt;margin:0}.week{font-weight:700;color:#4d5a4e}.week-grid{display:grid;gap:3px;align-items:start}.week-grid.compact{grid-template-columns:repeat(7,minmax(0,1fr))}.week-grid.expanded{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.day{border:1px solid #aeb9ac;break-inside:avoid;page-break-inside:avoid;min-width:0}.day-head{background:#e9f1e8;border-bottom:1px solid #aeb9ac;padding:3px 4px;font-size:8pt;font-weight:800}.day-date{display:block;color:#536154;font-size:6.8pt;font-weight:600}.shift{padding:3px 4px;break-inside:avoid;page-break-inside:avoid}.shift+.shift{border-top:1px solid #cbd3c9}.shift-head{display:flex;justify-content:space-between;gap:3px;margin-bottom:2px;font-size:7pt}.shift-time{color:#59665a;white-space:nowrap}.person{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px;border-top:1px dotted #d4dbd2;padding:2px 0;break-inside:avoid;page-break-inside:avoid;font-size:7pt}.person-name{font-weight:700;overflow-wrap:anywhere}.person-time{white-space:nowrap}.empty{color:#697369;font-style:italic;padding:2px 0}.warnings-section{border-top:1px solid #aeb9ac;margin-top:5px;padding-top:4px;break-before:auto}.warnings-title{font-size:8pt;margin:0 0 3px}.warnings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 8px}.warning{color:#7d301b;font-size:6.8pt;break-inside:avoid;page-break-inside:avoid}@media print{html,body{width:100%;height:auto}.print-header{margin-top:0}.week-grid.compact{grid-template-columns:repeat(7,minmax(0,1fr))}.day,.shift,.person,.warning{break-inside:avoid;page-break-inside:avoid}.week-grid.expanded .day{margin-bottom:0}}';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Habaneros Scheduler</title><style>' + css + '</style></head><body><header class="print-header"><h1>Habaneros Scheduler</h1><div class="week">Week of ' + escapeHtml(state.rules.weekStart) + '</div></header><main class="week-grid ' + (compact ? 'compact' : 'expanded') + '">' + schedule.days.map((day) => '<section class="day"><div class="day-head">' + day.day + '<span class="day-date">' + formatDate(day.date) + '</span></div>' + printShift(day.shifts.open, 'Opening') + printShift(day.shifts.close, 'Closing') + '</section>').join('') + '</main>' + (warnings ? '<section class="warnings-section"><h2 class="warnings-title">Schedule Warnings</h2><div class="warnings-grid">' + warnings + '</div></section>' : '') + '</body></html>';
}

function printShift(shift: ShiftSchedule, label: string): string {
  return '<div class="shift"><div class="shift-head"><strong>' + label + '</strong><span class="shift-time">' + formatTime(shift.time) + '</span></div>' + (shift.assigned.length ? shift.assigned.map((worker) => '<div class="person"><span class="person-name">' + escapeHtml(worker.name) + (worker.isManager ? ' (Lead)' : '') + '</span><span class="person-time">' + worker.timeRange + '</span></div>').join('') : '<div class="empty">No one assigned</div>') + '</div>';
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
  if (importedState.schedule) {
    state.schedule = importedState.schedule;
    normalizeSchedule(state.schedule, state.rules.mealBreakHours);
  }
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
    const isLead = yes(get("lead")) || yes(get("manager"));
    const worker = normalizeWorker({ id: crypto.randomUUID(), employeeCode: get("employee code"), name, position: get("position") || "Crew", role: isLead ? "Lead" : "Crew", isManager: isLead, noHourLimits: yes(get("no hour limits")), maxWeeklyHours: Number(get("max weekly hours")) || 45, preferredWeeklyHours: Number(get("preferred weekly hours")) || 40, maxDays: 7, canOpen: yes(get("can open")), canClose: yes(get("can close")), active: !no(get("active")), notes: get("notes"), availability: splitDays(get("available days")) }, state.rules);
    if (mergeWorker(worker)) imported++; else skipped++;
  }
  return { imported, skipped, messages: skipped ? [String(skipped) + " duplicate or invalid row(s) skipped."] : [] };
}

function mergeWorker(worker: Worker): boolean {
  const key = worker.name.trim().toLowerCase();
  if (state.workers.some((existing) => existing.name.trim().toLowerCase() === key)) return false;
  if (worker.employeeCode && state.workers.some((existing) => existing.employeeCode === worker.employeeCode)) return false;
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

function renderCloudConfig(): void {
  els.supabaseUrl.value = cloudConfig.supabaseUrl;
  els.supabaseAnonKey.value = cloudConfig.anonKey;
  els.cloudStatus.textContent = cloudConfig.supabaseUrl && cloudConfig.anonKey ? "Configured" : "Not configured";
}

function readCloudConfigForm(): CloudConfig {
  return { supabaseUrl: els.supabaseUrl.value.trim().replace(/\/$/, ""), anonKey: els.supabaseAnonKey.value.trim() };
}

async function saveCloudConfig(event: Event): Promise<void> {
  event.preventDefault();
  try {
    cloudConfig = await window.habanerosDesktop.saveCloudConfig(readCloudConfigForm());
    renderCloudConfig();
    alert("Supabase settings saved.");
  } catch (error) { showError("Supabase settings could not be saved.", error); }
}

async function testCloudConfig(): Promise<void> {
  try {
    const config = readCloudConfigForm();
    const result = await window.habanerosDesktop.testCloudConfig(config);
    els.cloudStatus.textContent = "Connected";
    alert(result.message);
  } catch (error) { els.cloudStatus.textContent = "Connection failed"; showError("Supabase connection failed.", error); }
}

async function syncCloudEmployees(): Promise<void> {
  try {
    cloudConfig = await window.habanerosDesktop.saveCloudConfig(readCloudConfigForm());
    const missingCodes = state.workers.filter((worker) => !/^\d{4}$/.test(worker.employeeCode));
    if (missingCodes.length) { alert("Add a 4-digit code for every employee before syncing. Missing: " + missingCodes.map((worker) => worker.name).join(", ")); return; }
    const result = await window.habanerosDesktop.syncCloudEmployees(state.workers);
    els.cloudStatus.textContent = "Employees synced";
    alert(result.message);
  } catch (error) { showError("Employees could not be synced.", error); }
}

async function refreshSubmissions(): Promise<void> {
  try {
    submissions = await window.habanerosDesktop.listAvailabilitySubmissions(null);
    renderSubmissions();
    renderHistoryFilters();
    renderHistory();
  } catch (error) { showError("Availability submissions could not be loaded. The local scheduler is still available.", error); }
}

function renderSubmissions(): void {
  const pending = submissions.filter((submission) => submission.status === "pending");
  els.submissionCount.textContent = pending.length + " pending";
  els.applyAllBtn.disabled = pending.length === 0;
  if (!pending.length) { els.submissionsList.innerHTML = '<div class="empty-state">No pending availability submissions.</div>'; return; }
  els.submissionsList.innerHTML = pending.map((submission) => '<article class="submission-row"><div><strong>' + escapeHtml(submission.employeeName) + '</strong><div class="meta">Week of ' + formatWeek(submission.weekStart) + '</div><div class="status-line">Submitted ' + formatSubmittedAt(submission.submittedAt) + '</div></div><div class="submission-days">' + DAYS.map((day, index) => '<label class="day-mini ' + (submission.availableDays.includes(day) ? 'on' : '') + '"><input data-submission-day="' + submission.id + '" value="' + day + '" type="checkbox" ' + checked(submission.availableDays.includes(day)) + '> ' + SHORT_DAYS[index] + '</label>').join("") + '</div><div class="submission-actions"><button class="primary" data-submission-action="apply" data-submission-id="' + submission.id + '" type="button">Apply</button><button class="secondary" data-submission-action="reviewed" data-submission-id="' + submission.id + '" type="button">Mark Reviewed</button><button class="secondary danger" data-submission-action="rejected" data-submission-id="' + submission.id + '" type="button">Reject</button></div><label class="submission-notes">Manager Notes <textarea data-submission-notes="' + submission.id + '" rows="2" maxlength="1000" placeholder="Optional notes">' + escapeHtml(submission.managerNotes) + '</textarea></label></article>').join("");
  els.submissionsList.querySelectorAll<HTMLInputElement>("[data-submission-day]").forEach((input) => input.addEventListener("change", () => editSubmissionDay(input)));
  els.submissionsList.querySelectorAll<HTMLTextAreaElement>("[data-submission-notes]").forEach((input) => input.addEventListener("input", () => editSubmissionNotes(input)));
  els.submissionsList.querySelectorAll<HTMLButtonElement>("[data-submission-action]").forEach((button) => button.addEventListener("click", () => void handleSubmission(button)));
}

function editSubmissionDay(input: HTMLInputElement): void {
  const submission = submissions.find((item) => item.id === input.dataset.submissionDay);
  if (!submission) return;
  submission.availableDays = toggleAvailability(submission.availableDays, input.value as DayName, input.checked);
  renderSubmissions();
}

function editSubmissionNotes(input: HTMLTextAreaElement): void {
  const submission = submissions.find((item) => item.id === input.dataset.submissionNotes);
  if (submission) submission.managerNotes = input.value;
}

async function handleSubmission(button: HTMLButtonElement): Promise<void> {
  const submission = submissions.find((item) => item.id === button.dataset.submissionId);
  if (!submission) return;
  const action = button.dataset.submissionAction as "apply" | "reviewed" | "rejected";
  try {
    if (action === "apply") {
      const worker = findWorker(submission.localWorkerId);
      if (!worker) { alert("This submission is not linked to a local employee. Sync employees and try again."); return; }
      worker.availability = [...submission.availableDays];
      await saveState();
    }
    const status: SubmissionStatus = action === "apply" ? "applied" : action;
    await window.habanerosDesktop.updateAvailabilitySubmission({ id: submission.id, availableDays: submission.availableDays, status, managerNotes: submission.managerNotes });
    submission.status = status;
    submission.actionAt = new Date().toISOString();
    renderWorkers();
    renderSubmissions();
    renderHistoryFilters();
    renderHistory();
  } catch (error) { showError("The submission could not be updated.", error); }
}

async function applyAllSubmissions(): Promise<void> {
  const pending = submissions.filter((submission) => submission.status === "pending");
  if (!pending.length) return;
  const missing = pending.filter((submission) => !findWorker(submission.localWorkerId));
  if (missing.length) { alert("These submissions are not linked to local employees: " + missing.map((item) => item.employeeName).join(", ") + ". Sync employees and try again."); return; }
  if (!confirm("Apply all " + pending.length + " pending availability submissions?")) return;
  try {
    for (const submission of pending) {
      await window.habanerosDesktop.updateAvailabilitySubmission({ id: submission.id, availableDays: submission.availableDays, status: "applied", managerNotes: submission.managerNotes });
    }
    for (const submission of pending) {
      const worker = findWorker(submission.localWorkerId)!;
      worker.availability = [...submission.availableDays];
      submission.status = "applied";
      submission.actionAt = new Date().toISOString();
    }
    await saveState();
    renderWorkers();
    renderSubmissions();
    renderHistoryFilters();
    renderHistory();
  } catch (error) { showError("Not every submission could be applied. Refresh the inbox before trying again.", error); }
}

function renderHistoryFilters(): void {
  const history = submissions.filter((submission) => submission.status !== "pending");
  const employeeValue = els.historyEmployeeFilter.value;
  const weekValue = els.historyWeekFilter.value;
  const employees = [...new Set(history.map((submission) => submission.employeeName))].sort();
  const weeks = [...new Set(history.map((submission) => submission.weekStart))].sort().reverse();
  els.historyEmployeeFilter.innerHTML = '<option value="">All employees</option>' + employees.map((name) => '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>').join("");
  els.historyWeekFilter.innerHTML = '<option value="">All weeks</option>' + weeks.map((week) => '<option value="' + week + '">Week of ' + formatWeek(week) + '</option>').join("");
  els.historyEmployeeFilter.value = employees.includes(employeeValue) ? employeeValue : "";
  els.historyWeekFilter.value = weeks.includes(weekValue) ? weekValue : "";
}

function renderHistory(): void {
  const history = submissions.filter((submission) => submission.status !== "pending" && (!els.historyEmployeeFilter.value || submission.employeeName === els.historyEmployeeFilter.value) && (!els.historyWeekFilter.value || submission.weekStart === els.historyWeekFilter.value) && (!els.historyStatusFilter.value || submission.status === els.historyStatusFilter.value));
  els.historyCount.textContent = history.length + " record" + (history.length === 1 ? "" : "s");
  if (!history.length) { els.historyList.innerHTML = '<div class="empty-state">No history records match these filters.</div>'; return; }
  els.historyList.innerHTML = history.map((submission) => '<article class="history-row"><div><strong>' + escapeHtml(submission.employeeName) + '</strong><div class="meta">Week of ' + formatWeek(submission.weekStart) + '</div><span class="tag ' + (submission.status === 'rejected' ? 'bad' : 'good') + '">' + escapeHtml(submission.status) + '</span></div><div class="history-details"><span>Submitted: ' + formatSubmittedAt(submission.submittedAt) + '</span><span>Action: ' + (submission.actionAt ? formatSubmittedAt(submission.actionAt) : 'Not recorded') + '</span><span>Manager Notes: ' + (submission.managerNotes ? escapeHtml(submission.managerNotes) : 'None') + '</span></div><button class="secondary danger" data-history-delete="' + submission.id + '" type="button">Delete Permanently</button></article>').join("");
  els.historyList.querySelectorAll<HTMLButtonElement>("[data-history-delete]").forEach((button) => button.addEventListener("click", () => void deleteHistorySubmission(button.dataset.historyDelete!)));
}

async function deleteHistorySubmission(id: string): Promise<void> {
  if (!confirm("Are you sure?")) return;
  try {
    await window.habanerosDesktop.deleteAvailabilitySubmission(id);
    submissions = submissions.filter((submission) => submission.id !== id);
    renderHistoryFilters();
    renderHistory();
  } catch (error) { showError("The history record could not be deleted.", error); }
}

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatWeek(value: string): string {
  const date = new Date(value + "T12:00:00");
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

async function clearData(): Promise<void> {
  if (!confirm("Clear the current generated schedule? Employee profiles and settings will not be affected.")) return;
  state.schedule = null;
  await saveStateAndRender();
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
  try {
    state = await window.habanerosDesktop.saveState(state);
    await window.habanerosDesktop.setDirty(false);
  } finally {
    ensureWorkerFormInteractive();
  }
}

function showError(message: string, error: unknown): void {
  console.error(message, error);
  alert(message + "\n\n" + (error instanceof Error ? error.message : "Please try again."));
}
