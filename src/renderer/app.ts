import "./browserBridge";
import { defaultAppState, defaultSettings, defaultWorkerShiftTimes, normalizeWorker } from "../shared/defaults";
import { DAYS, SHORT_DAYS, AvailabilitySubmission, CloudConfig, DayName, AppSettings, AppState, DaySchedule, ExportFormat, ImportResult, PublishedScheduleSummary, ScheduleHistoryEntry, ShiftAvailability, ShiftAvailabilityMap, ShiftName, ShiftSchedule, SubmissionStatus, WEEK_DAYS, Worker, WorkerRole } from "../shared/types";
import { addDays, formatDate, formatDuration, formatTime, getDateForWeekDay, mondayWeekStart, nextMonday, parseLocalDate } from "../shared/time";
import { buildReminderMessage, calculateAvailabilityStatus, formatDeadlineSummary, normalizeSettings } from "../shared/availabilityDeadline";
import { createWorker } from "./modules/employees/employees";
import { toggleAvailability } from "./modules/availability/availability";
import { generateSchedule } from "./modules/scheduling/scheduler";
import { addManualAssignment, duplicateAssignment, findAssignment, moveAssignment, normalizeSchedule, refreshAssignment, refreshScheduleCoverage, removeAssignment, replaceAssignedEmployee } from "./modules/scheduling/scheduleEditor";
import { countScheduleWarnings } from "./modules/reports/reports";
import { applyTheme } from "./modules/settings/settings";
import { byId, escapeHtml } from "./shared/dom";
import { createId } from "./shared/ids";
import { clearAllPublishedSchedules, clearAuthSession, clearPublishedSchedule, createAccount, getOrCreateDefaultWorkspace, listPublishedSchedules, loadStoredAuthSession, loadWorkspaceSnapshot, publishScheduleToEmployeeDomain, refreshAuthSession, saveWorkspaceSnapshot, sendPasswordReset, signInWithPassword, signOut, storeAuthSession, SupabaseAuthSession, WorkspaceSummary } from "./modules/auth/supabaseAuth";

let state: AppState = defaultAppState();
let settings: AppSettings = defaultSettings();
let cloudConfig: CloudConfig = { supabaseUrl: "", anonKey: "" };
let authSession: SupabaseAuthSession | null = null;
let activeWorkspace: WorkspaceSummary | null = null;
let submissions: AvailabilitySubmission[] = [];
let publishedSchedules: PublishedScheduleSummary[] = [];
let historyEditSourceId: string | null = null;
let workerSearchText = "";
let workerFilterValue = "all";
let activeSection = "dashboard";
let selectedWorkerId = "";
let availabilityDraftWorkerId = "";
let availabilityDraft: ShiftAvailabilityMap = {};
let availabilityDraftDirty = false;
let appEventsBound = false;
let workspaceHydrated = false;
let workspaceSaveChain = Promise.resolve();

const els = {
  loginScreen: byId<HTMLElement>("loginScreen"),
  toast: byId<HTMLDivElement>("toast"),
  addWorkerSection: byId<HTMLElement>("addWorkerSection"),
  loginForm: byId<HTMLFormElement>("loginForm"),
  loginSupabaseUrl: byId<HTMLInputElement>("loginSupabaseUrl"),
  loginSupabaseAnonKey: byId<HTMLInputElement>("loginSupabaseAnonKey"),
  loginEmail: byId<HTMLInputElement>("loginEmail"),
  loginPassword: byId<HTMLInputElement>("loginPassword"),
  loginError: byId<HTMLElement>("loginError"),
  createAccountBtn: byId<HTMLButtonElement>("createAccountBtn"),
  forgotPasswordBtn: byId<HTMLButtonElement>("forgotPasswordBtn"),
  saveStatus: byId<HTMLSpanElement>("saveStatus"),
  dashboardEmployees: byId<HTMLSpanElement>("dashboardEmployees"),
  dashboardSubmissions: byId<HTMLSpanElement>("dashboardSubmissions"),
  dashboardAvailabilityStatus: byId<HTMLSpanElement>("dashboardAvailabilityStatus"),
  dashboardPrintStatus: byId<HTMLSpanElement>("dashboardPrintStatus"),
  dashboardPrintBtn: byId<HTMLButtonElement>("dashboardPrintBtn"),
  dashboardHistory: byId<HTMLSpanElement>("dashboardHistory"),
  dashboardSettings: byId<HTMLSpanElement>("dashboardSettings"),
  attentionStatus: byId<HTMLSpanElement>("attentionStatus"),
  needsAttentionList: byId<HTMLDivElement>("needsAttentionList"),
  availabilityChecks: byId<HTMLDivElement>("availabilityChecks"),
  workerForm: byId<HTMLFormElement>("workerForm"),
  workerName: byId<HTMLInputElement>("workerName"),
  employeeCode: byId<HTMLInputElement>("employeeCode"),
  mobilePhone: byId<HTMLInputElement>("mobilePhone"),
  closeAddWorkerBtn: byId<HTMLButtonElement>("closeAddWorkerBtn"),
  workerPosition: byId<HTMLInputElement>("workerPosition"),
  isManager: byId<HTMLSelectElement>("isManager"),
  skillRating: byId<HTMLInputElement>("skillRating"),
  noHourLimits: byId<HTMLInputElement>("noHourLimits"),
  maxWeeklyHours: byId<HTMLInputElement>("maxWeeklyHours"),
  preferredWeeklyHours: byId<HTMLInputElement>("preferredWeeklyHours"),
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
  scheduleRulesDetails: byId<HTMLDetailsElement>("scheduleRulesDetails"),
  scheduleRulesSummary: byId<HTMLElement>("scheduleRulesSummary"),
  scheduleRulesToggleLabel: byId<HTMLElement>("scheduleRulesToggleLabel"),
  staffingTable: byId<HTMLDivElement>("staffingTable"),
  workerSearch: byId<HTMLInputElement>("workerSearch"),
  employeeSelector: byId<HTMLSelectElement>("employeeSelector"),
  workerFilter: byId<HTMLSelectElement>("workerFilter"),
  workersList: byId<HTMLDivElement>("workersList"),
  workerCount: byId<HTMLSpanElement>("workerCount"),
  scheduleOutput: byId<HTMLDivElement>("scheduleOutput"),
  scheduleStatus: byId<HTMLSpanElement>("scheduleStatus"),
  generateBtn: byId<HTMLButtonElement>("generateBtn"),
  printBtn: byId<HTMLButtonElement>("printBtn"),
  pushScheduleBtn: byId<HTMLButtonElement>("pushScheduleBtn"),
  importBtn: byId<HTMLButtonElement>("importBtn"),
  exportJsonBtn: byId<HTMLButtonElement>("exportJsonBtn"),
  exportCsvBtn: byId<HTMLButtonElement>("exportCsvBtn"),
  clearBtn: byId<HTMLButtonElement>("clearBtn"),
  darkModeToggle: byId<HTMLInputElement>("darkModeToggle"),
  deadlineSettingsForm: byId<HTMLFormElement>("deadlineSettingsForm"),
  smsRemindersEnabled: byId<HTMLInputElement>("smsRemindersEnabled"),
  deadlineDay: byId<HTMLSelectElement>("deadlineDay"),
  deadlineTime: byId<HTMLInputElement>("deadlineTime"),
  firstReminderTime: byId<HTMLInputElement>("firstReminderTime"),
  secondReminderTime: byId<HTMLInputElement>("secondReminderTime"),
  firstReminderMessage: byId<HTMLTextAreaElement>("firstReminderMessage"),
  secondReminderMessage: byId<HTMLTextAreaElement>("secondReminderMessage"),
  deadlinePreview: byId<HTMLDivElement>("deadlinePreview"),
  testSmsPhone: byId<HTMLInputElement>("testSmsPhone"),
  checkRemindersBtn: byId<HTMLButtonElement>("checkRemindersBtn"),
  sendTestSmsBtn: byId<HTMLButtonElement>("sendTestSmsBtn"),
  reminderStatus: byId<HTMLDivElement>("reminderStatus"),
  accountEmail: byId<HTMLInputElement>("accountEmail"),
  accountWorkspaceName: byId<HTMLInputElement>("accountWorkspaceName"),
  accountSyncStatus: byId<HTMLSpanElement>("accountSyncStatus"),
  importLocalAccountBtn: byId<HTMLButtonElement>("importLocalAccountBtn"),
  logoutBtn: byId<HTMLButtonElement>("logoutBtn"),
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
  historyList: byId<HTMLDivElement>("historyList"),
  scheduleHistoryCount: byId<HTMLSpanElement>("scheduleHistoryCount"),
  saveCurrentScheduleBtn: byId<HTMLButtonElement>("saveCurrentScheduleBtn"),
  bulkDeleteHistoryBtn: byId<HTMLButtonElement>("bulkDeleteHistoryBtn"),
  scheduleHistoryList: byId<HTMLDivElement>("scheduleHistoryList"),
  scheduleHistoryEditor: byId<HTMLDivElement>("scheduleHistoryEditor"),
  historyEditName: byId<HTMLInputElement>("historyEditName"),
  historyEditWeek: byId<HTMLInputElement>("historyEditWeek"),
  saveHistoryModificationsBtn: byId<HTMLButtonElement>("saveHistoryModificationsBtn"),
  publishedScheduleCount: byId<HTMLSpanElement>("publishedScheduleCount"),
  publishedSchedulesList: byId<HTMLDivElement>("publishedSchedulesList"),
  refreshPublishedSchedulesBtn: byId<HTMLButtonElement>("refreshPublishedSchedulesBtn"),
  clearAllPublishedSchedulesBtn: byId<HTMLButtonElement>("clearAllPublishedSchedulesBtn"),
  clearLastWeekBtn: byId<HTMLButtonElement>("clearLastWeekBtn"),
  clearCurrentWeekBtn: byId<HTMLButtonElement>("clearCurrentWeekBtn"),
  clearNextWeekBtn: byId<HTMLButtonElement>("clearNextWeekBtn")
};

const workerIdentityFields = [els.workerName, els.employeeCode, els.workerPosition];

void boot();

async function boot(): Promise<void> {
  try {
    cloudConfig = await window.habanerosDesktop.loadCloudConfig();
  } catch {
    cloudConfig = { supabaseUrl: "", anonKey: "" };
  }
  renderLoginDefaults();
  bindLoginEvents();
  await restoreStoredAccountSession();
  if (authSession && activeWorkspace) void init();
}

function renderLoginDefaults(): void {
  els.loginSupabaseUrl.value = cloudConfig.supabaseUrl;
  els.loginSupabaseAnonKey.value = cloudConfig.anonKey;
}

function bindLoginEvents(): void {
  els.loginForm.addEventListener("submit", (event) => void handleLogin(event));
  els.createAccountBtn.addEventListener("click", () => void handleCreateAccount());
  els.forgotPasswordBtn.addEventListener("click", () => void handleForgotPassword());
}

async function restoreStoredAccountSession(): Promise<void> {
  const stored = loadStoredAuthSession();
  if (!stored || !readLoginCloudConfig().supabaseUrl || !readLoginCloudConfig().anonKey) return;
  try {
    cloudConfig = readLoginCloudConfig();
    authSession = await refreshAuthSession(cloudConfig, stored);
    storeAuthSession(authSession);
    activeWorkspace = await getOrCreateDefaultWorkspace(cloudConfig, authSession);
  } catch (error) {
    console.warn("Saved account session could not be restored.", error);
    clearAuthSession();
    authSession = null;
    activeWorkspace = null;
  }
}

async function handleLogin(event: Event): Promise<void> {
  event.preventDefault();
  await authenticateWithAccount("login");
}

async function handleCreateAccount(): Promise<void> {
  await authenticateWithAccount("create");
}

async function authenticateWithAccount(mode: "login" | "create"): Promise<void> {
  try {
    setLoginBusy(true);
    cloudConfig = readLoginCloudConfig();
    const email = els.loginEmail.value.trim();
    const password = els.loginPassword.value;
    if (!email || !password) throw new Error("Enter your email and password.");
    authSession = mode === "create" ? await createAccount(cloudConfig, email, password) : await signInWithPassword(cloudConfig, email, password);
    storeAuthSession(authSession);
    activeWorkspace = await getOrCreateDefaultWorkspace(cloudConfig, authSession);
    cloudConfig = await window.habanerosDesktop.saveCloudConfig(cloudConfig);
    els.loginError.textContent = "";
    await init();
  } catch (error) {
    els.loginError.textContent = error instanceof Error ? error.message : "Login failed. Please try again.";
    clearAuthSession();
    authSession = null;
    activeWorkspace = null;
  } finally {
    setLoginBusy(false);
  }
}

async function handleForgotPassword(): Promise<void> {
  try {
    const config = readLoginCloudConfig();
    const email = els.loginEmail.value.trim();
    if (!email) throw new Error("Enter your email address first.");
    await sendPasswordReset(config, email);
    els.loginError.textContent = "Password reset email sent if the account exists.";
  } catch (error) {
    els.loginError.textContent = error instanceof Error ? error.message : "Password reset could not be started.";
  }
}

function readLoginCloudConfig(): CloudConfig {
  return { supabaseUrl: els.loginSupabaseUrl.value.trim().replace(/\/$/, ""), anonKey: els.loginSupabaseAnonKey.value.trim() };
}

function setLoginBusy(isBusy: boolean): void {
  els.loginForm.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button").forEach((control) => { control.disabled = isBusy; });
  if (isBusy) els.loginError.textContent = "Signing in...";
}

async function init(): Promise<void> {
  try {
    state = await window.habanerosDesktop.loadState();
    settings = await window.habanerosDesktop.loadSettings();
    cloudConfig = await window.habanerosDesktop.loadCloudConfig();
  } catch (error) {
    showError("The local data file could not be loaded. The app will start with an empty schedule.", error);
    state = defaultAppState();
  }

  normalizeLoadedData();
  await hydrateWorkspaceData();
  renderCloudConfig();
  renderAccountSettings();
  renderAvailabilityInputs();
  renderStaffingInputs();
  bindEvents();
  updateAddWorkerHourFields();
  resetWorkerTimeInputs();
  showSection("dashboard");
  document.body.classList.remove("login-locked");
  els.loginScreen.hidden = true;
  render();
  void refreshPublishedSchedules(false);
}

function normalizeLoadedData(): void {
  if (!state.rules.weekStart) state.rules.weekStart = nextMonday();
  else state.rules.weekStart = mondayWeekStart(state.rules.weekStart);
  state.workers = state.workers.map((worker) => normalizeWorker(worker, state.rules));
  settings = normalizeSettings(settings);
  normalizeSchedule(state.schedule, state.rules.mealBreakHours);
  state.scheduleHistory.forEach((entry) => normalizeSchedule(entry.schedule, state.rules.mealBreakHours));
  applyTheme(settings);
  els.darkModeToggle.checked = settings.darkMode;
  renderDeadlineSettings();
}

async function hydrateWorkspaceData(): Promise<void> {
  if (workspaceHydrated || !authSession || !activeWorkspace) return;
  workspaceHydrated = true;
  try {
    setAccountSyncStatus("Loading account data", "warn");
    const snapshot = await loadWorkspaceSnapshot(cloudConfig, authSession, activeWorkspace);
    if (snapshot?.state) {
      const localHasData = hasMeaningfulSchedulerData(state);
      if (localHasData) {
        const loadCloud = await confirmDialog("This account already has saved scheduler data. Load account data on this device? Choose No to keep this device's local data and upload it into the account.", "Load account data", "Keep local data");
        if (loadCloud) {
          state = snapshot.state;
          settings = normalizeSettings(snapshot.settings || settings);
          await persistWorkspaceSnapshotLocally();
        } else {
          await saveAuthenticatedWorkspaceSnapshot();
        }
      } else {
        state = snapshot.state;
        settings = normalizeSettings(snapshot.settings || settings);
        await persistWorkspaceSnapshotLocally();
      }
      setAccountSyncStatus("Account data loaded", "good");
      return;
    }

    if (hasMeaningfulSchedulerData(state)) {
      const importLocal = await confirmDialog("Import existing local scheduler data into this account?", "Import local data", "Start blank");
      if (importLocal) {
        await saveAuthenticatedWorkspaceSnapshot();
        setAccountSyncStatus("Local data imported", "good");
      } else {
        state = defaultAppState();
        settings = defaultSettings();
        normalizeLoadedData();
        await persistWorkspaceSnapshotLocally();
        await saveAuthenticatedWorkspaceSnapshot();
        setAccountSyncStatus("Blank account started", "good");
      }
    } else {
      await saveAuthenticatedWorkspaceSnapshot();
      setAccountSyncStatus("Account ready", "good");
    }
  } catch (error) {
    setAccountSyncStatus("Account sync warning", "warn");
    console.warn("Workspace data could not be loaded. Local data remains available.", error);
  }
}

async function persistWorkspaceSnapshotLocally(): Promise<void> {
  state = await window.habanerosDesktop.saveState(state);
  settings = await window.habanerosDesktop.saveSettings(settings);
  normalizeLoadedData();
}

function hasMeaningfulSchedulerData(value: AppState): boolean {
  return value.workers.length > 0 || Boolean(value.schedule) || value.scheduleHistory.length > 0;
}

function renderAccountSettings(): void {
  els.accountEmail.value = authSession?.user.email || "Not signed in";
  els.accountWorkspaceName.value = activeWorkspace?.name || "No workspace";
  if (authSession && activeWorkspace && els.accountSyncStatus.textContent === "Signed in") setAccountSyncStatus("Signed in", "good");
}

function setAccountSyncStatus(message: string, level: "good" | "warn" | "bad" = "good"): void {
  els.accountSyncStatus.textContent = message;
  els.accountSyncStatus.className = "count-pill status-" + level;
}

async function importLocalDataIntoAccount(): Promise<void> {
  if (!authSession || !activeWorkspace) { await showDialogMessage("Log in before importing local data into an account."); return; }
  if (!await confirmDialog("Import this device's current local scheduler data into the signed-in account? This will replace the account snapshot with this local copy.", "Import local data", "Cancel")) return;
  try {
    await saveAuthenticatedWorkspaceSnapshot();
    setAccountSyncStatus("Local data imported", "good");
    await showDialogMessage("Local scheduler data imported into this account.");
  } catch (error) {
    setAccountSyncStatus("Import failed", "bad");
    showError("Local data could not be imported into this account.", error);
  }
}

async function logoutAccount(): Promise<void> {
  if (!authSession) return;
  if (!await confirmDialog("Log out of this account? Local cached data will remain on this device.", "Log Out", "Cancel")) return;
  await signOut(cloudConfig, authSession);
  authSession = null;
  activeWorkspace = null;
  window.location.reload();
}

function bindEvents(): void {
  if (appEventsBound) return;
  appEventsBound = true;
  els.workerForm.addEventListener("submit", (event) => void addWorker(event));
  els.workerForm.addEventListener("reset", () => queueMicrotask(cleanupAfterDialog));
  els.closeAddWorkerBtn.addEventListener("click", closeAddWorkerModal);
  els.addWorkerSection.addEventListener("click", (event) => { if (event.target === els.addWorkerSection) closeAddWorkerModal(); });
  window.addEventListener("focus", cleanupAfterDialog);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) cleanupAfterDialog(); });
  els.noHourLimits.addEventListener("change", updateAddWorkerHourFields);
  els.generateBtn.addEventListener("click", () => void generateAndSaveSchedule());
  els.printBtn.addEventListener("click", () => void printSchedule());
  els.pushScheduleBtn.addEventListener("click", () => void pushScheduleToEmployeeDomain());
  els.dashboardPrintBtn.addEventListener("click", () => void printSchedule());
  els.importBtn.addEventListener("click", () => void importData());
  els.exportJsonBtn.addEventListener("click", () => void exportData("json"));
  els.exportCsvBtn.addEventListener("click", () => void exportData("csv"));
  els.clearBtn.addEventListener("click", () => void clearData());
  els.darkModeToggle.addEventListener("change", () => void updateTheme());
  els.deadlineSettingsForm.addEventListener("submit", (event) => void saveDeadlineSettings(event));
  [els.smsRemindersEnabled, els.deadlineDay, els.deadlineTime, els.firstReminderTime, els.secondReminderTime, els.firstReminderMessage, els.secondReminderMessage].forEach((input) => input.addEventListener("input", updateDeadlinePreview));
  els.scheduleRulesDetails.addEventListener("toggle", updateScheduleRulesToggleLabel);
  els.checkRemindersBtn.addEventListener("click", () => void checkReminderStatus());
  els.sendTestSmsBtn.addEventListener("click", () => void sendTestSms());
  els.importLocalAccountBtn.addEventListener("click", () => void importLocalDataIntoAccount());
  els.logoutBtn.addEventListener("click", () => void logoutAccount());
  els.cloudConfigForm.addEventListener("submit", (event) => void saveCloudConfig(event));
  els.testCloudBtn.addEventListener("click", () => void testCloudConfig());
  els.syncEmployeesBtn.addEventListener("click", () => void syncCloudEmployees());
  els.refreshSubmissionsBtn.addEventListener("click", () => void refreshSubmissions());
  els.applyAllBtn.addEventListener("click", () => void applyAllSubmissions());
  els.saveCurrentScheduleBtn.addEventListener("click", () => void saveCurrentScheduleToHistory());
  els.bulkDeleteHistoryBtn.addEventListener("click", () => void bulkDeleteScheduleHistory());
  els.saveHistoryModificationsBtn.addEventListener("click", () => void saveHistoryModifications());
  els.refreshPublishedSchedulesBtn.addEventListener("click", () => void refreshPublishedSchedules());
  els.clearAllPublishedSchedulesBtn.addEventListener("click", () => void clearAllEmployeeDomainSchedules());
  els.clearLastWeekBtn.addEventListener("click", () => void clearRelativePublishedSchedule(-7));
  els.clearCurrentWeekBtn.addEventListener("click", () => void clearRelativePublishedSchedule(0));
  els.clearNextWeekBtn.addEventListener("click", () => void clearRelativePublishedSchedule(7));
  [els.historyEmployeeFilter, els.historyWeekFilter, els.historyStatusFilter].forEach((filter) => filter.addEventListener("change", renderHistory));
  [els.weekStart, els.openShift, els.closeShift, els.shiftHours, els.mealBreakHours].forEach((input) => input.addEventListener("change", () => void rulesChanged()));
  els.workerSearch.addEventListener("input", () => { workerSearchText = els.workerSearch.value.trim().toLowerCase(); renderWorkers(); });
  els.employeeSelector.addEventListener("change", () => void selectWorkerFromDropdown());
  els.workerFilter.addEventListener("change", () => { workerFilterValue = els.workerFilter.value; renderWorkers(); });
  document.querySelectorAll<HTMLButtonElement>("[data-nav-section]").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.navSection || "dashboard")));
  document.querySelectorAll<HTMLButtonElement>("[data-nav-target]").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.navTarget || "dashboard")));
  document.querySelectorAll<HTMLButtonElement>("[data-open-add-worker]").forEach((button) => button.addEventListener("click", openAddWorkerModal));
}

function showSection(section: string): void {
  activeSection = section;
  document.querySelectorAll<HTMLElement>("[data-section]").forEach((panel) => {
    panel.hidden = panel.dataset.section !== activeSection;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-nav-section]").forEach((button) => {
    const active = button.dataset.navSection === activeSection;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openAddWorkerModal(): void {
  els.addWorkerSection.hidden = false;
  els.workerName.focus();
}

function closeAddWorkerModal(): void {
  els.addWorkerSection.hidden = true;
  cleanupAfterDialog();
}

let toastTimer: number | undefined;
function showToast(message: string, level: "good" | "warn" | "bad" = "good", duration = 7000): void {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = "app-toast " + level;
  els.toast.hidden = false;
  toastTimer = window.setTimeout(() => { els.toast.hidden = true; }, duration);
}

function renderAvailabilityInputs(): void {
  els.availabilityChecks.innerHTML = DAYS.map((day) => '<label class="availability-day"><span>' + day + '</span><select data-add-shift="' + day + '" required><option value="Open">Available for Open</option><option value="Close">Available for Close</option><option value="Both">Available for Both</option><option value="Unavailable" selected>Not Available on ' + day + '</option></select></label>').join("");
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
  renderScheduleRulesSummary();
  renderDeadlineSettings();
  renderWorkers();
  renderSchedule();
  renderScheduleHistory();
  renderPublishedSchedules();
  renderDashboard();
  renderNeedsAttention();
  renderAccountSettings();
  ensureWorkerFormInteractive();
}

function renderDashboard(): void {
  els.dashboardEmployees.textContent = state.workers.length + " worker" + (state.workers.length === 1 ? "" : "s");
  const pending = submissions.filter((submission) => submission.status === "pending").length;
  const availabilityStatus = calculateAvailabilityStatus(state.workers, submissions, settings, state.rules.weekStart);
  els.dashboardSubmissions.textContent = submissions.length ? pending + " pending" : "Not synced";
  els.dashboardAvailabilityStatus.textContent = "Submitted: " + availabilityStatus.submitted + " | Waiting: " + availabilityStatus.waiting + " | Missing: " + availabilityStatus.missing;
  els.dashboardHistory.textContent = state.scheduleHistory.length + " saved";
  els.dashboardSettings.textContent = settings.availabilityDeadline.smsRemindersEnabled ? "Deadline: " + formatDeadlineSummary(settings) : "SMS reminders disabled";
  els.dashboardPrintStatus.textContent = state.schedule ? "Ready to print" : "No schedule yet";
}

function renderScheduleRulesSummary(): void {
  const staffingTotal = DAYS.reduce((total, day) => total + state.rules.staffing[day].open + state.rules.staffing[day].close, 0);
  els.scheduleRulesSummary.textContent =
    "Open " + formatTime(state.rules.openShift) +
    " | Close " + formatTime(state.rules.closeShift) +
    " | Default " + formatDuration(state.rules.shiftHours) +
    " | Lunch after " + formatDuration(state.rules.mealBreakHours) +
    " | Week starts " + formatDate(state.rules.weekStart) +
    " | " + staffingTotal + " minimum weekly spots";
  updateScheduleRulesToggleLabel();
}

function updateScheduleRulesToggleLabel(): void {
  els.scheduleRulesToggleLabel.textContent = els.scheduleRulesDetails.open ? "Hide Schedule Rules" : "Edit Schedule Rules";
}

function renderNeedsAttention(): void {
  const items: { level: "bad" | "warn" | "good"; text: string }[] = [];
  const pending = submissions.filter((submission) => submission.status === "pending").length;
  const availabilityStatus = calculateAvailabilityStatus(state.workers, submissions, settings, state.rules.weekStart);
  if (pending) items.push({ level: "bad", text: pending + " availability submission" + (pending === 1 ? "" : "s") + " need review." });
  if (availabilityStatus.missing) items.push({ level: "bad", text: availabilityStatus.missing + " employee" + (availabilityStatus.missing === 1 ? "" : "s") + " missing availability after the " + formatDeadlineSummary(settings) + " deadline." });
  else if (availabilityStatus.waiting) items.push({ level: "warn", text: availabilityStatus.waiting + " employee" + (availabilityStatus.waiting === 1 ? "" : "s") + " still waiting to submit availability before the " + formatDeadlineSummary(settings) + " deadline." });
  if (state.schedule) {
    for (const day of orderedScheduleDays(state.schedule, state.rules.weekStart)) {
      const dayWarnings = [...new Set(day.warnings)];
      dayWarnings.filter(isMustFixWarning).forEach((warning) => items.push({ level: "bad", text: warning }));
      dayWarnings.filter((warning) => !isMustFixWarning(warning)).forEach((warning) => items.push({ level: "warn", text: warning }));
      const lunchNames = [...new Set((["open", "close"] as ShiftName[]).flatMap((shift) => day.shifts[shift].assigned.filter((worker) => worker.needsLunch).map((worker) => worker.name)))];
      if (lunchNames.length) items.push({ level: "warn", text: day.day + " lunch: " + lunchNames.join(", ") + "." });
    }
  }
  if (!items.length) {
    els.attentionStatus.textContent = state.schedule ? "Good" : "Not generated";
    els.attentionStatus.className = "count-pill tag good";
    els.needsAttentionList.innerHTML = '<div class="attention-item good">All shifts covered or no schedule issues to review.</div>';
    return;
  }
  const visible = items.slice(0, 6);
  const extra = items.length - visible.length;
  els.attentionStatus.textContent = items.some((item) => item.level === "bad") ? "Must fix" : "Review";
  els.attentionStatus.className = "count-pill tag " + (items.some((item) => item.level === "bad") ? "bad" : "warn");
  els.needsAttentionList.innerHTML = visible.map((item) => '<div class="attention-item ' + item.level + '">' + escapeHtml(item.text) + '</div>').join("") + (extra > 0 ? '<div class="attention-item warn">+' + extra + ' more item' + (extra === 1 ? "" : "s") + '.</div>' : "");
}

function isMustFixWarning(warning: string): boolean {
  const text = warning.toLowerCase();
  return text.includes("lead") || text.includes("unfilled") || text.includes("short") || text.includes("no employee") || text.includes("not enough");
}

async function addWorker(event: Event): Promise<void> {
  event.preventDefault();
  try {
    console.info("[AddEmployee] before count:", state.workers.length);
    const availability = selectedAvailableDays();
    const shiftAvailability = selectedShiftAvailability(availability);
    if (!els.workerName.value.trim() || !/^\d{4}$/.test(els.employeeCode.value) || state.workers.some((worker) => worker.employeeCode === els.employeeCode.value)) {
      showToast("Worker could not be added. Please check the required fields and try again.", "bad", 9000);
      return;
    }
    const newWorker = createWorker({
      employeeCode: els.employeeCode.value,
      mobilePhone: els.mobilePhone.value,
      name: els.workerName.value,
      position: els.workerPosition.value,
      isManager: els.isManager.value === "true",
      skillRating: Number(els.skillRating.value) || 5,
      noHourLimits: els.noHourLimits.checked,
      maxWeeklyHours: Number(els.maxWeeklyHours.value) || 0,
      preferredWeeklyHours: Number(els.preferredWeeklyHours.value) || 0,
      notes: els.workerNotes.value,
      availability,
      shiftAvailability,
      openStart: els.workerOpenStart.value,
      openEnd: els.workerOpenEnd.value,
      closeStart: els.workerCloseStart.value,
      closeEnd: els.workerCloseEnd.value
    }, state);
    console.info("[AddEmployee] created:", { id: newWorker.id, name: newWorker.name, active: newWorker.active, employeeCode: newWorker.employeeCode });
    state.workers.push(newWorker);
    revealNewWorkerInEmployees(newWorker);
    console.info("[AddEmployee] selected employee:", selectedWorkerId);
    console.info("[AddEmployee] current filter:", workerFilterValue);
    console.info("[AddEmployee] current search text:", workerSearchText);
    resetWorkerForm();
    state.schedule = null;
    await saveState();
    console.info("[AddEmployee] after local save count:", state.workers.length);
    render();
    console.info("[AddEmployee] visible employees:", visibleEmployeeCount());
    closeAddWorkerModal();
    showSection("employees");
    try {
      if (!cloudConfig.supabaseUrl || !cloudConfig.anonKey) throw new Error("Supabase is not configured.");
      console.info("[AddEmployee] Supabase sync started");
      await window.habanerosDesktop.syncCloudEmployees(state.workers);
      console.info("[AddEmployee] sync result:", "success");
      console.info("[AddEmployee] employee count after Supabase sync:", state.workers.length);
      els.cloudStatus.textContent = "Employees synced";
      showToast("Worker added and synced successfully.", "good", 9000);
    } catch (syncError) {
      console.info("[AddEmployee] sync result:", syncError instanceof Error ? syncError.message : "failed");
      console.info("[AddEmployee] employee count after Supabase sync:", state.workers.length);
      showToast("Worker added locally, but Supabase sync failed. Please try Sync Employees later.", "warn", 12000);
    }
  } catch (error) {
    console.error("The worker could not be added.", error);
    showToast("Worker could not be added. Please check the required fields and try again.", "bad", 9000);
  }
}

function selectedAvailableDays(): DayName[] {
  return DAYS.filter((day) => els.availabilityChecks.querySelector<HTMLSelectElement>("[data-add-shift='" + day + "']")?.value !== "Unavailable");
}

function selectedShiftAvailability(days: DayName[]): ShiftAvailabilityMap {
  return DAYS.reduce((result, day) => {
    const select = els.availabilityChecks.querySelector<HTMLSelectElement>("[data-add-shift='" + day + "']");
    result[day] = (select?.value || (days.includes(day) ? "Both" : "Unavailable")) as ShiftAvailability;
    return result;
  }, {} as ShiftAvailabilityMap);
}

function resetWorkerForm(): void {
  els.workerForm.reset();
  els.workerPosition.value = "Crew";
  els.mobilePhone.value = "";
  els.isManager.value = "false";
  els.skillRating.value = "5";
  els.maxWeeklyHours.value = "45";
  els.preferredWeeklyHours.value = "40";
  updateAddWorkerHourFields();
  els.availabilityChecks.querySelectorAll<HTMLSelectElement>("[data-add-shift]").forEach((select) => { select.value = "Unavailable"; });
  resetWorkerTimeInputs();
  ensureWorkerFormInteractive();
}

function ensureWorkerFormInteractive(): void {
  document.documentElement.removeAttribute("inert");
  document.documentElement.removeAttribute("aria-hidden");
  document.body.removeAttribute("inert");
  document.body.removeAttribute("aria-hidden");
  document.body.style.pointerEvents = "";
  els.workerForm.removeAttribute("inert");
  els.workerForm.removeAttribute("aria-hidden");
  els.workerForm.removeAttribute("aria-disabled");
  els.workerForm.style.pointerEvents = "";
  workerIdentityFields.forEach((field) => {
    field.disabled = false;
    field.readOnly = false;
    field.removeAttribute("aria-disabled");
    field.style.pointerEvents = "";
  });
}

function cleanupAfterDialog(): void {
  document.querySelectorAll<HTMLElement>("[data-dialog-overlay], .dialog-backdrop, .modal-backdrop").forEach((element) => element.remove());
  ensureWorkerFormInteractive();
  window.focus();
}

function updateAddWorkerHourFields(): void {
  els.preferredWeeklyHours.disabled = els.noHourLimits.checked;
  els.maxWeeklyHours.disabled = els.noHourLimits.checked;
}

function renderWorkers(): void {
  els.workerCount.textContent = state.workers.length + " worker" + (state.workers.length === 1 ? "" : "s");
  const workers = state.workers.filter(workerMatchesEmployeeFilters);
  if (!state.workers.length) {
    els.employeeSelector.innerHTML = '<option value="">No employees yet</option>';
    els.workersList.innerHTML = '<div class="empty-state">No workers yet. Add workers and availability to begin.</div>';
    return;
  }
  if (selectedWorkerId && !findWorker(selectedWorkerId)) {
    selectedWorkerId = "";
    resetAvailabilityDraft();
  }
  if (selectedWorkerId && !workers.some((worker) => worker.id === selectedWorkerId) && !availabilityDraftDirty) {
    selectedWorkerId = "";
    resetAvailabilityDraft();
  }
  els.employeeSelector.innerHTML = '<option value="">Select an employee</option>' + workers.map((worker) => {
    const status = hasAvailabilityEntered(worker) ? "Availability entered" : "Availability not entered";
    return '<option value="' + worker.id + '" ' + selected(selectedWorkerId, worker.id) + '>' + escapeHtml(worker.name + " - " + status) + '</option>';
  }).join("");
  if (!workers.length) {
    els.workersList.innerHTML = '<div class="empty-state">No workers match the current search or filter.</div>';
    return;
  }
  const worker = findWorker(selectedWorkerId);
  if (!worker) {
    els.workersList.innerHTML = '<div class="employee-results-list">' + workers.map((item) => employeeResultRow(item)).join("") + '</div><div class="empty-state">Select an employee from the dropdown to open the full profile editor.</div>';
  } else {
    ensureAvailabilityDraft(worker);
    els.workersList.innerHTML = renderSelectedWorkerProfile(worker);
  }

  els.workersList.querySelectorAll<HTMLButtonElement>("[data-select-worker]").forEach((button) => button.addEventListener("click", () => void selectWorker(button.dataset.selectWorker || "")));
  els.workersList.querySelectorAll<HTMLButtonElement>("[data-toggle-active]").forEach((button) => button.addEventListener("click", () => void toggleWorkerActive(button.dataset.toggleActive!)));
  els.workersList.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((button) => button.addEventListener("click", () => void deleteWorker(button.dataset.delete!)));
  els.workersList.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-edit]").forEach((input) => input.addEventListener("change", () => void editWorker(input)));
  els.workersList.querySelectorAll<HTMLSelectElement>("[data-availability-draft]").forEach((input) => input.addEventListener("change", () => updateAvailabilityDraft(input)));
  els.workersList.querySelectorAll<HTMLButtonElement>("[data-save-availability]").forEach((button) => button.addEventListener("click", () => void saveSelectedWorkerAvailability(button.dataset.saveAvailability || "")));
  els.workersList.querySelectorAll<HTMLButtonElement>("[data-cancel-availability]").forEach((button) => button.addEventListener("click", () => void cancelSelectedWorkerAvailability(button.dataset.cancelAvailability || "")));
  els.workersList.querySelectorAll<HTMLInputElement>("[data-worker-time]").forEach((input) => input.addEventListener("change", () => void editWorkerDefaultTime(input)));
}

function workerMatchesEmployeeFilters(worker: Worker): boolean {
  const search = [worker.name, worker.position, worker.employeeCode, worker.mobilePhone].join(" ").toLowerCase();
  const matchesSearch = !workerSearchText || search.includes(workerSearchText);
  return matchesSearch && workerMatchesCurrentFilter(worker);
}

function visibleEmployeeCount(): number {
  return state.workers.filter(workerMatchesEmployeeFilters).length;
}

function workerMatchesCurrentFilter(worker: Worker): boolean {
  return workerFilterValue === "all" ||
    (workerFilterValue === "leads" && worker.isManager) ||
    (workerFilterValue === "nonLeads" && !worker.isManager) ||
    (workerFilterValue === "active" && worker.active) ||
    (workerFilterValue === "inactive" && !worker.active) ||
    (workerFilterValue === "availabilityEntered" && hasAvailabilityEntered(worker)) ||
    (workerFilterValue === "availabilityMissing" && !hasAvailabilityEntered(worker));
}

function revealNewWorkerInEmployees(worker: Worker): void {
  const searchable = [worker.name, worker.position, worker.employeeCode, worker.mobilePhone].join(" ").toLowerCase();
  if (workerSearchText && !searchable.includes(workerSearchText)) {
    workerSearchText = "";
    els.workerSearch.value = "";
  }
  if (!workerMatchesCurrentFilter(worker)) {
    workerFilterValue = "all";
    els.workerFilter.value = "all";
  }
  selectedWorkerId = worker.id;
  resetAvailabilityDraft();
}

function hasAvailabilityEntered(worker: Worker): boolean {
  return DAYS.some((day) => worker.availability.includes(day) && worker.shiftAvailability[day] !== "Unavailable");
}

function availabilityStatusTag(worker: Worker): string {
  return hasAvailabilityEntered(worker) ? '<span class="tag good">Availability entered</span>' : '<span class="tag warn">Availability not entered</span>';
}

function employeeResultRow(worker: Worker): string {
  return '<div class="employee-result-row ' + (hasAvailabilityEntered(worker) ? 'availability-entered' : 'availability-missing') + '"><div><strong>' + escapeHtml(worker.name) + '</strong><div class="meta">' + escapeHtml(worker.position) + ' | ' + (worker.mobilePhone ? 'Phone set' : 'No phone') + '</div></div><div class="tag-row">' + availabilityStatusTag(worker) + '</div><button class="secondary" data-select-worker="' + worker.id + '" type="button">Open</button></div>';
}

function renderSelectedWorkerProfile(worker: Worker): string {
  const activeTag = worker.active ? '<span class="tag good">Active</span>' : '<span class="tag bad">Inactive</span>';
  const leadTag = worker.isManager ? '<span class="tag good">Lead</span>' : '<span class="tag">Non-Lead</span>';
  const phoneTag = worker.mobilePhone ? '<span class="tag good">Phone set</span>' : '<span class="tag warn">No phone</span>';
  const statusClass = hasAvailabilityEntered(worker) ? 'availability-entered' : 'availability-missing';
  const availabilityEditors = DAYS.map((day) => '<label class="worker-availability-day"><span>' + day + '</span><select data-availability-draft="' + day + '"><option value="Open" ' + selected(availabilityDraft[day] || 'Unavailable', 'Open') + '>Available for Open</option><option value="Close" ' + selected(availabilityDraft[day] || 'Unavailable', 'Close') + '>Available for Close</option><option value="Both" ' + selected(availabilityDraft[day] || 'Unavailable', 'Both') + '>Available for Both</option><option value="Unavailable" ' + selected(availabilityDraft[day] || 'Unavailable', 'Unavailable') + '>Not Available on ' + day + '</option></select></label>').join("");
  return '<article class="employee-profile ' + statusClass + '"><div class="employee-profile-head"><div><h3>' + escapeHtml(worker.name) + '</h3><div class="tag-row">' + activeTag + leadTag + phoneTag + availabilityStatusTag(worker) + (availabilityDraftDirty ? '<span class="tag warn">Unsaved availability changes</span>' : '') + '</div></div><div class="card-actions"><button class="secondary" type="button" data-toggle-active="' + worker.id + '">' + (worker.active ? 'Deactivate' : 'Activate') + '</button><button class="secondary danger" type="button" data-delete="' + worker.id + '">Delete</button></div></div><div class="employee-profile-grid"><section class="employee-profile-section"><h4>Basic Info</h4><div class="profile-field-grid"><label>Name <input data-edit="' + worker.id + '" data-field="name" type="text" value="' + escapeHtml(worker.name) + '"></label><label>Position <input data-edit="' + worker.id + '" data-field="position" type="text" value="' + escapeHtml(worker.position) + '"></label><label>Employee code <input data-edit="' + worker.id + '" data-field="employeeCode" type="text" inputmode="numeric" pattern="\\d{4}" maxlength="4" value="' + escapeHtml(worker.employeeCode) + '"></label><label>Mobile Phone Number <input data-edit="' + worker.id + '" data-field="mobilePhone" type="tel" value="' + escapeHtml(worker.mobilePhone || '') + '" placeholder="+15551234567"></label><label>Lead <select data-edit="' + worker.id + '" data-field="isManager"><option value="false" ' + selected(String(worker.isManager), 'false') + '>No</option><option value="true" ' + selected(String(worker.isManager), 'true') + '>Yes</option></select></label></div></section><section class="employee-profile-section"><h4>Scheduling Defaults</h4><div class="profile-field-grid"><label>Skill Rating <input data-edit="' + worker.id + '" data-field="skillRating" type="number" min="1" max="10" step="1" value="' + worker.skillRating + '"></label><label class="check-row"><input data-edit="' + worker.id + '" data-field="noHourLimits" type="checkbox" ' + checked(worker.noHourLimits) + '> No Hour Limits</label><label>Preferred Weekly Hours <input data-edit="' + worker.id + '" data-field="preferredWeeklyHours" type="number" min="0" max="168" step="0.5" value="' + worker.preferredWeeklyHours + '" ' + disabled(worker.noHourLimits) + '></label><label>Maximum Weekly Hours <input data-edit="' + worker.id + '" data-field="maxWeeklyHours" type="number" min="0" max="168" step="0.5" value="' + worker.maxWeeklyHours + '" ' + disabled(worker.noHourLimits) + '></label><label>Default Open Start <input data-worker-time="' + worker.id + '" data-shift="open" data-part="start" type="time" value="' + worker.shiftTimes.open.start + '"></label><label>Default Open End <input data-worker-time="' + worker.id + '" data-shift="open" data-part="end" type="time" value="' + worker.shiftTimes.open.end + '"></label><label>Default Close Start <input data-worker-time="' + worker.id + '" data-shift="close" data-part="start" type="time" value="' + worker.shiftTimes.close.start + '"></label><label>Default Close End <input data-worker-time="' + worker.id + '" data-shift="close" data-part="end" type="time" value="' + worker.shiftTimes.close.end + '"></label></div></section><section class="employee-profile-section full"><h4>Availability</h4><p class="meta">Change multiple days first, then save availability when ready.</p><div class="employee-availability-grid">' + availabilityEditors + '</div><div class="employee-availability-actions"><button class="primary" data-save-availability="' + worker.id + '" type="button">Save Employee Availability</button><button class="secondary" data-cancel-availability="' + worker.id + '" type="button">Cancel</button></div></section><section class="employee-profile-section full"><h4>Notes</h4><label>Notes <textarea data-edit="' + worker.id + '" data-field="notes" rows="2">' + escapeHtml(worker.notes) + '</textarea></label></section></div></article>';
}

function selected(current: string, value: string): string { return current === value ? "selected" : ""; }
function checked(value: boolean): string { return value ? "checked" : ""; }
function disabled(value: boolean): string { return value ? "disabled" : ""; }

async function selectWorkerFromDropdown(): Promise<void> {
  await selectWorker(els.employeeSelector.value);
}

async function selectWorker(id: string): Promise<void> {
  if (id === selectedWorkerId) return;
  if (availabilityDraftDirty) {
    await showDialogMessage("You have unsaved availability changes. Save or cancel before switching employees.");
    els.employeeSelector.value = selectedWorkerId;
    return;
  }
  selectedWorkerId = id;
  resetAvailabilityDraft();
  renderWorkers();
}

function ensureAvailabilityDraft(worker: Worker): void {
  if (availabilityDraftWorkerId === worker.id) return;
  availabilityDraftWorkerId = worker.id;
  availabilityDraft = DAYS.reduce((result, day) => {
    result[day] = worker.availability.includes(day) ? (worker.shiftAvailability[day] || "Both") : "Unavailable";
    return result;
  }, {} as ShiftAvailabilityMap);
  availabilityDraftDirty = false;
}

function resetAvailabilityDraft(): void {
  availabilityDraftWorkerId = "";
  availabilityDraft = {};
  availabilityDraftDirty = false;
}

function updateAvailabilityDraft(input: HTMLSelectElement): void {
  const day = input.dataset.availabilityDraft as DayName;
  if (!DAYS.includes(day)) return;
  availabilityDraft[day] = input.value as ShiftAvailability;
  availabilityDraftDirty = true;
  renderWorkers();
}

async function saveSelectedWorkerAvailability(id: string): Promise<void> {
  try {
    const worker = findWorker(id);
    if (!worker || availabilityDraftWorkerId !== id) return;
    worker.availability = DAYS.filter((day) => availabilityDraft[day] && availabilityDraft[day] !== "Unavailable");
    worker.shiftAvailability = DAYS.reduce((result, day) => {
      result[day] = worker.availability.includes(day) ? (availabilityDraft[day] || "Both") : "Unavailable";
      return result;
    }, {} as ShiftAvailabilityMap);
    availabilityDraftDirty = false;
    state.schedule = null;
    await saveStateAndRender();
    await showDialogMessage("Employee availability saved.");
    selectedWorkerId = "";
    resetAvailabilityDraft();
    renderWorkers();
  } catch (error) {
    showError("Employee availability could not be saved.", error);
  }
}

async function cancelSelectedWorkerAvailability(id: string): Promise<void> {
  const worker = findWorker(id);
  if (!worker) return;
  if (!await confirmDialog("Are you sure?", "Yes, cancel changes", "No, keep editing")) return;
  resetAvailabilityDraft();
  selectedWorkerId = "";
  renderWorkers();
}

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
  if (!await confirmDialog("Delete " + worker.name + "? This removes the employee profile and future schedules will no longer use this employee. Saved schedule history will stay saved.")) return;
  state.workers = state.workers.filter((item) => item.id !== id);
  if (selectedWorkerId === id) {
    selectedWorkerId = "";
    resetAvailabilityDraft();
  }
  state.schedule = null;
  await saveStateAndRender();
}

async function editWorker(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): Promise<void> {
  const worker = findWorker(input.dataset.edit || "");
  if (!worker) return;
  switch (input.dataset.field) {
    case "name": worker.name = input.value.trim() || worker.name; break;
    case "employeeCode":
      if (!/^\d{4}$/.test(input.value)) { await showDialogMessage("Employee code must contain exactly 4 digits."); renderWorkers(); return; }
      if (state.workers.some((item) => item.id !== worker.id && item.employeeCode === input.value)) { await showDialogMessage("That employee code is already assigned."); renderWorkers(); return; }
      worker.employeeCode = input.value;
      break;
    case "mobilePhone": worker.mobilePhone = input.value.trim(); break;
    case "position": worker.position = input.value || "Crew"; worker.role = worker.isManager ? "Lead" : "Crew"; break;
    case "isManager": worker.isManager = input.value === "true"; worker.role = worker.isManager ? "Lead" : "Crew"; break;
    case "skillRating": worker.skillRating = Math.min(10, Math.max(1, Math.round(Number(input.value) || 5))); break;
    case "noHourLimits": worker.noHourLimits = input instanceof HTMLInputElement ? input.checked : worker.noHourLimits; break;
    case "maxWeeklyHours": worker.maxWeeklyHours = Number(input.value) || 0; break;
    case "preferredWeeklyHours": worker.preferredWeeklyHours = Number(input.value) || 0; break;
    case "notes": worker.notes = input.value; break;
    default: return;
  }
  state.schedule = null;
  await saveStateAndRender();
}

async function editWorkerShiftAvailability(input: HTMLSelectElement): Promise<void> {
  const worker = findWorker(input.dataset.editShiftWorker || "");
  const day = input.dataset.editShiftDay as DayName;
  if (!worker) return;
  const value = input.value as ShiftAvailability;
  worker.shiftAvailability[day] = value;
  worker.availability = toggleAvailability(worker.availability, day, value !== "Unavailable");
  state.schedule = null;
  await saveStateAndRender();
}

async function editWorkerDefaultTime(input: HTMLInputElement): Promise<void> {
  const worker = findWorker(input.dataset.workerTime || "");
  if (!worker) return;
  const shift = input.dataset.shift === "close" ? "close" : "open";
  const part = input.dataset.part === "end" ? "end" : "start";
  worker.shiftTimes[shift][part] = input.value;
  await saveStateAndRender();
}

function findWorker(id: string): Worker | undefined { return state.workers.find((worker) => worker.id === id); }
async function rulesChanged(): Promise<void> { syncRulesFromInputs(); state.schedule = null; await saveStateAndRender(); }

function syncRulesFromInputs(): void {
  state.rules.weekStart = mondayWeekStart(els.weekStart.value || nextMonday());
  els.weekStart.value = state.rules.weekStart;
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
    state.scheduleHistory.unshift(createHistoryEntry("Week of " + formatWeek(state.rules.weekStart), state.rules.weekStart, state.schedule));
    await saveStateAndRender();
    const warnings = state.schedule.days.flatMap((day) => day.warnings);
    if (warnings.length) await showDialogMessage("Schedule generated with warnings:\n\n" + warnings.slice(0, 8).join("\n") + (warnings.length > 8 ? "\n..." : ""));
  } catch (error) {
    showError("The schedule could not be generated.", error);
  }
}

function renderSchedule(): void {
  if (!state.schedule) {
    els.scheduleStatus.textContent = "Not generated";
    els.pushScheduleBtn.disabled = true;
    els.scheduleOutput.innerHTML = '<div class="empty-state">Add workers, confirm rules, then generate a schedule.</div>';
    return;
  }
  els.pushScheduleBtn.disabled = false;
  const warningCount = countScheduleWarnings(state);
  els.scheduleStatus.textContent = warningCount ? warningCount + " warning" + (warningCount === 1 ? "" : "s") : "Ready";
  els.scheduleOutput.innerHTML = orderedScheduleDays(state.schedule, state.rules.weekStart).map((day) => '<article class="schedule-day"><div class="schedule-day-head"><div><strong>' + day.day + '</strong><div class="small-muted">' + formatDate(day.date) + '</div></div>' + (day.warnings.length ? '<span class="tag bad">' + day.warnings.length + ' issue' + (day.warnings.length === 1 ? '' : 's') + '</span>' : '<span class="tag good">Covered</span>') + '</div><div class="shift-list">' + renderShift(day.day, day.shifts.open, "Opening") + renderShift(day.day, day.shifts.close, "Closing") + '</div>' + (day.warnings.length ? '<div class="warnings">' + day.warnings.map((warning) => '<div class="warning ' + warningClass(warning) + '">' + escapeHtml(warning) + '</div>').join("") + '</div>' : '') + '</article>').join("");
  bindScheduleEditorEvents();
}

function warningClass(warning: string): string {
  return isMustFixWarning(warning) ? "problem" : "review";
}

function renderShift(day: DayName, shift: ShiftSchedule, label: string): string {
  const assigned = shift.assigned.map((assignment) => renderAssignment(day, shift.name, assignment.assignmentId)).join("");
  const missingCount = Math.max(0, shift.needed - shift.assigned.length);
  const placeholders = Array.from({ length: missingCount }, (_item, index) => renderMissingAssignment(day, shift.name, index)).join("");
  const empty = !assigned && !placeholders ? '<div class="empty-state">No one assigned.</div>' : "";
  return '<div class="shift-box"><div class="shift-title"><span>' + label + '</span><span class="small-muted">Default ' + formatTime(shift.time) + ' | Need ' + shift.needed + '</span></div><div class="assigned-list">' + assigned + placeholders + empty + '</div></div>';
}

function renderMissingAssignment(day: DayName, shift: ShiftName, index: number): string {
  const label = shift === "open" ? "Open" : "Close";
  const workerOptions = state.workers.filter((worker) => worker.active).map((worker) => '<option value="' + worker.id + '">' + escapeHtml(worker.name) + '</option>').join("");
  return '<div class="assignment-editor" data-missing-row="' + day + '-' + shift + '-' + index + '"><label>' + label + '<select data-missing-assignment="true" data-missing-day="' + day + '" data-missing-shift="' + shift + '"><option value="">None</option>' + workerOptions + '</select></label><div class="assignment-summary"><span>Missing worker</span><span>Select to add</span></div></div>';
}

function renderAssignment(day: DayName, shift: ShiftName, assignmentId: string): string {
  const assignment = findAssignment(state.schedule!, assignmentId)!.assignment;
  const workerOptions = state.workers.map((worker) => '<option value="' + worker.id + '" ' + selected(worker.id, assignment.id) + '>' + escapeHtml(worker.name) + '</option>').join("");
  const dayOptions = DAYS.map((item) => '<option value="' + item + '" ' + selected(item, day) + '>' + item + '</option>').join("");
  return '<div class="assignment-editor" data-assignment-row="' + assignment.assignmentId + '"><label>Employee<select data-assignment-field="employee" data-assignment-id="' + assignment.assignmentId + '"><option value="">None</option>' + workerOptions + '</select></label><label>Day<select data-assignment-field="day" data-assignment-id="' + assignment.assignmentId + '">' + dayOptions + '</select></label><label>Shift<select data-assignment-field="shift" data-assignment-id="' + assignment.assignmentId + '"><option value="open" ' + selected(shift, 'open') + '>Open</option><option value="close" ' + selected(shift, 'close') + '>Close</option></select></label><label>Start<input data-assignment-field="start" data-assignment-id="' + assignment.assignmentId + '" type="time" value="' + assignment.start + '"></label><label>End<input data-assignment-field="end" data-assignment-id="' + assignment.assignmentId + '" type="time" value="' + assignment.end + '"></label><div class="assignment-summary"><span>' + escapeHtml(assignment.position) + (assignment.isManager ? ' | Lead' : '') + '</span><span>' + formatDuration(assignment.durationHours) + '</span></div></div>' + (assignment.needsLunch ? '<div class="warning lunch">' + escapeHtml(assignment.name) + ' reaches the configured lunch threshold. Plan lunch break.</div>' : '');
}

function bindScheduleEditorEvents(): void {
  els.scheduleOutput.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-assignment-field]").forEach((input) => input.addEventListener("change", () => void editScheduleAssignment(input)));
  els.scheduleOutput.querySelectorAll<HTMLSelectElement>("[data-missing-assignment]").forEach((input) => input.addEventListener("change", () => void addMissingScheduleAssignment(input)));
  els.scheduleOutput.querySelectorAll<HTMLButtonElement>("[data-assignment-duplicate]").forEach((button) => button.addEventListener("click", () => void duplicateScheduleAssignment(button.dataset.assignmentDuplicate!)));
  els.scheduleOutput.querySelectorAll<HTMLButtonElement>("[data-assignment-remove]").forEach((button) => button.addEventListener("click", () => void removeScheduleAssignment(button.dataset.assignmentRemove!)));
}

async function addMissingScheduleAssignment(input: HTMLSelectElement): Promise<void> {
  if (!state.schedule || !input.value) return;
  const worker = findWorker(input.value);
  const day = input.dataset.missingDay as DayName;
  const shift = input.dataset.missingShift as ShiftName;
  if (!worker || !day || !shift) return;
  addManualAssignment(state.schedule, day, shift, worker, state.rules);
  await saveEditedSchedule();
}

async function editScheduleAssignment(input: HTMLInputElement | HTMLSelectElement): Promise<void> {
  if (!state.schedule) return;
  const location = findAssignment(state.schedule, input.dataset.assignmentId || "");
  if (!location) return;
  const field = input.dataset.assignmentField;
  if (field === "employee") {
    if (!input.value) {
      removeAssignment(state.schedule, location.assignment.assignmentId);
      await saveEditedSchedule();
      return;
    }
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
  refreshScheduleCoverage(state.schedule);
  await saveStateAndRender();
}

async function printSchedule(): Promise<void> {
  if (!state.schedule) { await showDialogMessage("Generate a schedule before printing."); return; }
  try {
    const result = await window.habanerosDesktop.printSchedule(buildPrintHtml(state.schedule, state.rules.weekStart, "Habaneros Scheduler"));
    if (!result.success) await showDialogMessage(result.message);
  } finally {
    await restoreAfterDialog();
  }
}

function buildPrintHtml(schedule: NonNullable<AppState["schedule"]>, weekStart: string, title: string): string {
  const days = orderedScheduleDays(schedule, weekStart);
  const compact = days.every((day) => day.shifts.open.assigned.length <= 4 && day.shifts.close.assigned.length <= 4);
  const css = '@page{size:landscape;margin:.2in}*{box-sizing:border-box}body{font-family:Segoe UI,Arial,sans-serif;color:#182018;margin:0;font-size:9.2pt;line-height:1.12}.print-header{display:flex;align-items:end;justify-content:space-between;border-bottom:2px solid #246b46;padding:0 0 4px;margin:0 0 5px}.print-header h1{font-size:15pt;margin:0}.week{font-size:9pt;font-weight:700;color:#4d5a4e}.week-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;align-items:start}.week-grid.expanded{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.day{border:1px solid #aeb9ac;break-inside:avoid;page-break-inside:avoid;min-width:0}.day-head{background:#e9f1e8;border-bottom:1px solid #aeb9ac;padding:4px 5px;font-size:9.5pt;font-weight:800}.day-date{display:block;color:#536154;font-size:7.5pt;font-weight:600}.shift{padding:3px 5px;break-inside:avoid;page-break-inside:avoid}.shift+.shift{border-top:1px solid #cbd3c9}.shift-head{display:flex;justify-content:space-between;gap:4px;margin-bottom:2px;font-size:8.5pt}.shift-time{color:#59665a;white-space:nowrap}.person{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px;border-top:1px dotted #d4dbd2;padding:2px 0;break-inside:avoid;page-break-inside:avoid;font-size:8pt}.person-name{font-weight:700;overflow-wrap:anywhere}.person-time{white-space:nowrap}.empty{color:#697369;font-style:italic;padding:2px 0;font-size:8pt}.day-warnings{border-top:1px solid #d8dfd5;padding:3px 5px;display:grid;gap:1px}.warning{color:#7d301b;font-size:7.5pt;font-weight:700;break-inside:avoid;page-break-inside:avoid}@media print{html,body{width:100%;height:auto}.day,.shift,.person,.warning{break-inside:avoid;page-break-inside:avoid}}';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(title) + '</title><style>' + css + '</style></head><body><header class="print-header"><h1>' + escapeHtml(title) + '</h1><div class="week">Week of ' + escapeHtml(mondayWeekStart(weekStart)) + '</div></header><main class="week-grid ' + (compact ? 'compact' : 'expanded') + '">' + days.map((day) => '<section class="day"><div class="day-head">' + day.day + '<span class="day-date">' + formatDate(day.date) + '</span></div>' + printShift(day.shifts.open, 'Opening') + printShift(day.shifts.close, 'Closing') + printDayWarnings(day) + '</section>').join('') + '</main></body></html>';
}

function printShift(shift: ShiftSchedule, label: string): string {
  return '<div class="shift"><div class="shift-head"><strong>' + label + '</strong><span class="shift-time">' + formatTime(shift.time) + '</span></div>' + (shift.assigned.length ? shift.assigned.map((worker) => '<div class="person"><span class="person-name">' + escapeHtml(worker.name) + (worker.isManager ? ' (Lead)' : '') + '</span><span class="person-time">' + worker.timeRange + '</span></div>').join('') : '<div class="empty">No one assigned</div>') + '</div>';
}

function printDayWarnings(day: NonNullable<AppState["schedule"]>["days"][number]): string {
  const lunchNames = [...new Set((["open", "close"] as ShiftName[]).flatMap((shift) => day.shifts[shift].assigned.filter((worker) => worker.needsLunch).map((worker) => worker.name)))];
  const warnings = [...new Set(day.warnings)];
  const lines = [
    ...warnings.map((warning) => escapeHtml(warning)),
    ...(lunchNames.length ? ["Lunch: " + lunchNames.map((name) => escapeHtml(name)).join(", ")] : [])
  ];
  return lines.length ? '<div class="day-warnings">' + lines.map((line) => '<div class="warning">' + line + '</div>').join("") + '</div>' : "";
}

function orderedScheduleDays(schedule: NonNullable<AppState["schedule"]>, weekStart: string): DaySchedule[] {
  const normalizedWeekStart = mondayWeekStart(weekStart);
  return WEEK_DAYS.map((day) => {
    const existing = schedule.days.find((item) => item.day === day);
    if (existing) return { ...existing, day, date: getDateForWeekDay(normalizedWeekStart, day), warnings: [...existing.warnings] };
    const emptyShift = (shift: ShiftName): ShiftSchedule => ({ name: shift, needed: 0, time: shift === "open" ? state.rules.openShift : state.rules.closeShift, assigned: [], hasQualified: false, hasManager: false });
    return { day, date: getDateForWeekDay(normalizedWeekStart, day), shifts: { open: emptyShift("open"), close: emptyShift("close") }, warnings: [] };
  });
}

function normalizedScheduleSnapshot(schedule: NonNullable<AppState["schedule"]>, weekStart: string): NonNullable<AppState["schedule"]> {
  return { ...structuredClone(schedule), days: orderedScheduleDays(schedule, weekStart) };
}

function createHistoryEntry(name: string, weekStart: string, schedule: NonNullable<AppState["schedule"]>): ScheduleHistoryEntry {
  const createdAt = new Date().toISOString();
  weekStart = mondayWeekStart(weekStart);
  return { id: createId(), name: name.trim() || "Week of " + formatWeek(weekStart), weekStart, schedule: normalizedScheduleSnapshot(schedule, weekStart), createdAt };
}

function renderScheduleHistory(): void {
  els.scheduleHistoryCount.textContent = state.scheduleHistory.length + " saved";
  els.saveCurrentScheduleBtn.disabled = !state.schedule;
  els.bulkDeleteHistoryBtn.disabled = true;
  if (!state.scheduleHistory.length) {
    els.scheduleHistoryList.innerHTML = '<div class="empty-state">No saved schedules yet.</div>';
    return;
  }
  els.scheduleHistoryList.innerHTML = '<div class="schedule-history-table"><label class="history-table-head"><input id="selectAllScheduleHistory" type="checkbox"><span>Week</span><span>Saved</span><span>Name</span><span>Actions</span></label>' + state.scheduleHistory.map((entry) => '<div class="history-table-row"><input data-history-select="' + entry.id + '" type="checkbox" aria-label="Select ' + escapeHtml(entry.name) + '"><span>Week of ' + formatWeek(entry.weekStart) + '</span><span>' + formatSubmittedAt(entry.createdAt) + '</span><strong>' + escapeHtml(entry.name) + '</strong><div class="card-actions"><button class="secondary" data-history-action="view" data-history-id="' + entry.id + '" type="button">View</button><button class="secondary" data-history-action="print" data-history-id="' + entry.id + '" type="button">Print</button><button class="secondary" data-history-action="rename" data-history-id="' + entry.id + '" type="button">Rename</button><button class="secondary" data-history-action="modify" data-history-id="' + entry.id + '" type="button">Modify</button><button class="secondary danger" data-history-action="delete" data-history-id="' + entry.id + '" type="button">Delete</button></div></div>').join("") + '</div>';
  els.scheduleHistoryList.querySelectorAll<HTMLButtonElement>("[data-history-action]").forEach((button) => button.addEventListener("click", () => void handleScheduleHistoryAction(button)));
  els.scheduleHistoryList.querySelectorAll<HTMLInputElement>("[data-history-select]").forEach((input) => input.addEventListener("change", updateHistoryDeleteButton));
  els.scheduleHistoryList.querySelector<HTMLInputElement>("#selectAllScheduleHistory")?.addEventListener("change", (event) => {
    const checkedValue = (event.currentTarget as HTMLInputElement).checked;
    els.scheduleHistoryList.querySelectorAll<HTMLInputElement>("[data-history-select]").forEach((input) => { input.checked = checkedValue; });
    updateHistoryDeleteButton();
  });
}

async function handleScheduleHistoryAction(button: HTMLButtonElement): Promise<void> {
  const entry = state.scheduleHistory.find((item) => item.id === button.dataset.historyId);
  if (!entry) return;
  const action = button.dataset.historyAction;
  if (action === "print") {
    const result = await window.habanerosDesktop.printSchedule(buildPrintHtml(entry.schedule, entry.weekStart, entry.name));
    if (!result.success) await showDialogMessage(result.message);
    return;
  }
  if (action === "rename") {
    const nextName = window.prompt("Rename saved schedule", entry.name);
    if (nextName?.trim()) entry.name = nextName.trim();
    await saveStateAndRender();
    return;
  }
  if (action === "delete") {
    await deleteScheduleHistoryEntry(entry.id);
    return;
  }
  state.schedule = structuredClone(entry.schedule);
  state.rules.weekStart = mondayWeekStart(entry.weekStart);
  normalizeSchedule(state.schedule, state.rules.mealBreakHours);
  if (action === "modify") {
    historyEditSourceId = entry.id;
    els.historyEditName.value = entry.name + " - Modified";
    els.historyEditWeek.value = entry.weekStart;
    els.scheduleHistoryEditor.hidden = false;
  } else {
    historyEditSourceId = null;
    els.scheduleHistoryEditor.hidden = true;
  }
  render();
  if (action === "view") showSection("schedule");
}

function selectedScheduleHistoryIds(): string[] {
  return Array.from(els.scheduleHistoryList.querySelectorAll<HTMLInputElement>("[data-history-select]:checked")).map((input) => input.dataset.historySelect || "").filter(Boolean);
}

function updateHistoryDeleteButton(): void {
  els.bulkDeleteHistoryBtn.disabled = selectedScheduleHistoryIds().length === 0;
}

async function deleteScheduleHistoryEntry(id: string): Promise<void> {
  if (!await confirmDialog("Are you sure you want to delete this saved schedule? This cannot be undone.")) return;
  try {
    state.scheduleHistory = state.scheduleHistory.filter((entry) => entry.id !== id);
    await saveStateAndRender();
    showToast("Saved schedule deleted.", "good", 7000);
  } catch (error) {
    showError("The saved schedule could not be deleted.", error);
  }
}

async function bulkDeleteScheduleHistory(): Promise<void> {
  const ids = selectedScheduleHistoryIds();
  if (!ids.length) return;
  if (!await confirmDialog("Are you sure you want to delete the selected schedule history items? This cannot be undone.")) return;
  try {
    const selectedIds = new Set(ids);
    state.scheduleHistory = state.scheduleHistory.filter((entry) => !selectedIds.has(entry.id));
    await saveStateAndRender();
    showToast("Selected schedule history items deleted.", "good", 7000);
  } catch (error) {
    showError("The selected schedule history items could not be deleted.", error);
  }
}

async function saveCurrentScheduleToHistory(): Promise<void> {
  if (!state.schedule) return;
  state.scheduleHistory.unshift(createHistoryEntry("Week of " + formatWeek(state.rules.weekStart), state.rules.weekStart, state.schedule));
  await saveStateAndRender();
}

async function pushScheduleToEmployeeDomain(): Promise<void> {
  if (!state.schedule) { await showDialogMessage("Generate a schedule before pushing it to the employee website."); return; }
  try {
    const { session, workspace } = await requirePublishedScheduleAccount();
    const weekStart = mondayWeekStart(state.rules.weekStart);
    await publishScheduleToEmployeeDomain(cloudConfig, session, workspace.id, weekStart, normalizedScheduleSnapshot(state.schedule, weekStart));
    await refreshPublishedSchedules(false);
    showToast("Schedule pushed to employee website.", "good", 9000);
  } catch (error) {
    showError("Schedule could not be pushed to the employee website.", error);
  }
}

async function refreshPublishedSchedules(showSuccess = true): Promise<void> {
  try {
    const { session, workspace } = await requirePublishedScheduleAccount();
    publishedSchedules = await listPublishedSchedules(cloudConfig, session, workspace.id);
    renderPublishedSchedules();
    if (showSuccess) showToast("Published schedules refreshed.", "good", 5000);
  } catch (error) {
    publishedSchedules = [];
    renderPublishedSchedules("Published schedules could not be loaded.");
    console.warn("Published schedules could not be loaded.", error);
    if (showSuccess) showError("Published schedules could not be loaded.", error);
  }
}

function renderPublishedSchedules(message = ""): void {
  els.publishedScheduleCount.textContent = publishedSchedules.length + " published";
  els.clearAllPublishedSchedulesBtn.disabled = publishedSchedules.length === 0;
  if (message) {
    els.publishedSchedulesList.innerHTML = '<div class="empty-state">' + escapeHtml(message) + '</div>';
    return;
  }
  if (!publishedSchedules.length) {
    els.publishedSchedulesList.innerHTML = '<div class="empty-state">No schedules are currently published to the employee website.</div>';
    return;
  }
  els.publishedSchedulesList.innerHTML = publishedSchedules.map((entry) => '<article class="history-row"><div><strong>Week of ' + formatWeek(entry.weekStart) + '</strong><div class="meta">Published ' + formatSubmittedAt(entry.publishedAt) + '</div></div><div class="history-details"><span>Updated: ' + formatSubmittedAt(entry.updatedAt) + '</span><span>Visible on employee website</span></div><button class="secondary danger" data-published-clear="' + entry.weekStart + '" type="button">Clear from Employee Domain</button></article>').join("");
  els.publishedSchedulesList.querySelectorAll<HTMLButtonElement>("[data-published-clear]").forEach((button) => button.addEventListener("click", () => void clearEmployeeDomainSchedule(button.dataset.publishedClear || "")));
}

async function clearRelativePublishedSchedule(dayOffset: number): Promise<void> {
  await clearEmployeeDomainSchedule(addDays(mondayWeekStart(state.rules.weekStart || nextMonday()), dayOffset));
}

async function clearEmployeeDomainSchedule(weekStart: string): Promise<void> {
  if (!weekStart) return;
  weekStart = mondayWeekStart(weekStart);
  if (!await confirmDialog("Are you sure you want to remove this schedule from the employee website?")) return;
  try {
    const { session, workspace } = await requirePublishedScheduleAccount();
    await clearPublishedSchedule(cloudConfig, session, workspace.id, weekStart);
    publishedSchedules = publishedSchedules.filter((entry) => entry.weekStart !== weekStart);
    renderPublishedSchedules();
    showToast("Schedule removed from employee website.", "good", 9000);
  } catch (error) {
    showError("Schedule could not be removed from the employee website.", error);
  }
}

async function clearAllEmployeeDomainSchedules(): Promise<void> {
  if (!publishedSchedules.length) return;
  if (!await confirmDialog("Are you sure you want to remove this schedule from the employee website?")) return;
  try {
    const { session, workspace } = await requirePublishedScheduleAccount();
    await clearAllPublishedSchedules(cloudConfig, session, workspace.id);
    publishedSchedules = [];
    renderPublishedSchedules();
    showToast("Schedule removed from employee website.", "good", 9000);
  } catch (error) {
    showError("Published schedules could not be removed from the employee website.", error);
  }
}

async function requirePublishedScheduleAccount(): Promise<{ session: SupabaseAuthSession; workspace: WorkspaceSummary }> {
  if (!authSession || !activeWorkspace) throw new Error("Log in before publishing schedules.");
  if (!cloudConfig.supabaseUrl || !cloudConfig.anonKey) throw new Error("Supabase is not configured.");
  authSession = await refreshAuthSession(cloudConfig, authSession);
  storeAuthSession(authSession);
  return { session: authSession, workspace: activeWorkspace };
}

async function saveHistoryModifications(): Promise<void> {
  if (!historyEditSourceId || !state.schedule) return;
  const source = state.scheduleHistory.find((entry) => entry.id === historyEditSourceId);
  if (!source) return;
  const weekStart = mondayWeekStart(els.historyEditWeek.value || source.weekStart);
  const schedule = normalizedScheduleSnapshot(state.schedule, weekStart);
  state.scheduleHistory.unshift(createHistoryEntry(els.historyEditName.value || source.name + " - Modified", weekStart, schedule));
  historyEditSourceId = null;
  els.scheduleHistoryEditor.hidden = true;
  await saveStateAndRender();
}

async function exportData(format: ExportFormat): Promise<void> {
  try {
    syncRulesFromInputs();
    const result = await window.habanerosDesktop.exportData({ format, state, settings });
    await showDialogMessage(result.message);
  } catch (error) {
    showError("Export failed.", error);
  } finally {
    await restoreAfterDialog();
  }
}

async function importData(): Promise<void> {
  try {
    if (!await confirmDialog("Importing may replace current app data. Make sure you have exported a backup before continuing.")) return;
    const imported = await window.habanerosDesktop.importData();
    if (imported.canceled) return;
    const result = imported.fileName?.toLowerCase().endsWith(".csv") ? importCsv(imported.content || "") : importJson(imported.content || "");
    settings = await window.habanerosDesktop.saveSettings(settings);
    await saveStateAndRender();
    await showDialogMessage("Import complete.\n\nImported: " + result.imported + "\nSkipped: " + result.skipped + (result.messages.length ? "\n\n" + result.messages.join("\n") : ""));
  } catch (error) {
    showError("Import failed.", error);
  } finally {
    await restoreAfterDialog();
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
  if ("settings" in parsed && parsed.settings) settings = normalizeSettings({ ...settings, ...parsed.settings });
  if (importedState.rules) state.rules = { ...state.rules, ...importedState.rules };
  if (importedState.schedule) {
    state.schedule = importedState.schedule;
    normalizeSchedule(state.schedule, state.rules.mealBreakHours);
  }
  if (Array.isArray(importedState.scheduleHistory)) {
    const existingIds = new Set(state.scheduleHistory.map((entry) => entry.id));
    state.scheduleHistory.push(...importedState.scheduleHistory.filter((entry) => !existingIds.has(entry.id)));
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
    const worker = normalizeWorker({ id: createId(), employeeCode: get("employee code"), mobilePhone: get("mobile phone") || get("mobile phone number") || get("phone") || get("phone number"), name, position: get("position") || "Crew", role: isLead ? "Lead" : "Crew", isManager: isLead, skillRating: Number(get("skill rating")) || 5, noHourLimits: yes(get("no hour limits")), maxWeeklyHours: Number(get("max weekly hours")) || 45, preferredWeeklyHours: Number(get("preferred weekly hours")) || 40, maxDays: 7, active: !no(get("active")), notes: get("notes"), availability: splitDays(get("available days")), shiftAvailability: splitShiftAvailability(get("shift availability")), shiftTimes: { open: { start: get("default open start"), end: get("default open end") }, close: { start: get("default close start"), end: get("default close end") } } }, state.rules);
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
function splitShiftAvailability(value: string): ShiftAvailabilityMap { const result: ShiftAvailabilityMap = {}; value.split(/[;|]/).forEach((item) => { const [dayText, shiftText] = item.split(":").map((part) => part.trim()); const day = DAYS.find((candidate) => candidate.toLowerCase() === dayText?.toLowerCase()); const shift = ["Open", "Close", "Both", "Unavailable"].find((candidate) => candidate.toLowerCase() === shiftText?.toLowerCase()) as ShiftAvailability | undefined; if (day && shift) result[day] = shift; }); return result; }

function renderCloudConfig(): void {
  els.supabaseUrl.value = cloudConfig.supabaseUrl;
  els.supabaseAnonKey.value = cloudConfig.anonKey;
  els.cloudStatus.textContent = cloudConfig.supabaseUrl && cloudConfig.anonKey ? "Configured" : "Not configured";
  renderDashboard();
}

function readCloudConfigForm(): CloudConfig {
  return { supabaseUrl: els.supabaseUrl.value.trim().replace(/\/$/, ""), anonKey: els.supabaseAnonKey.value.trim() };
}

async function saveCloudConfig(event: Event): Promise<void> {
  event.preventDefault();
  try {
    cloudConfig = await window.habanerosDesktop.saveCloudConfig(readCloudConfigForm());
    state = await window.habanerosDesktop.loadState();
    settings = await window.habanerosDesktop.loadSettings();
    normalizeLoadedData();
    renderCloudConfig();
    renderStaffingInputs();
    render();
    await showDialogMessage("Supabase settings saved.");
  } catch (error) { showError("Supabase settings could not be saved.", error); }
}

async function testCloudConfig(): Promise<void> {
  try {
    const config = readCloudConfigForm();
    const result = await window.habanerosDesktop.testCloudConfig(config);
    els.cloudStatus.textContent = "Connected";
    await showDialogMessage(result.message);
  } catch (error) { els.cloudStatus.textContent = "Connection failed"; showError("Supabase connection failed.", error); }
}

async function syncCloudEmployees(): Promise<void> {
  try {
    cloudConfig = await window.habanerosDesktop.saveCloudConfig(readCloudConfigForm());
    const missingCodes = state.workers.filter((worker) => !/^\d{4}$/.test(worker.employeeCode));
    if (missingCodes.length) { await showDialogMessage("Add a 4-digit code for every employee before syncing. Missing: " + missingCodes.map((worker) => worker.name).join(", ")); return; }
    const result = await window.habanerosDesktop.syncCloudEmployees(state.workers);
    els.cloudStatus.textContent = "Employees synced";
    await showDialogMessage(result.message);
  } catch (error) { showError("Employees could not be synced.", error); }
}

async function refreshSubmissions(): Promise<void> {
  try {
    submissions = await window.habanerosDesktop.listAvailabilitySubmissions(null);
    renderSubmissions();
    renderHistoryFilters();
    renderHistory();
    renderDashboard();
    renderNeedsAttention();
  } catch (error) { showError("Availability submissions could not be loaded. The local scheduler is still available.", error); }
}

function renderSubmissions(): void {
  const pending = submissions.filter((submission) => submission.status === "pending");
  els.submissionCount.textContent = pending.length + " pending";
  els.applyAllBtn.disabled = pending.length === 0;
  if (!pending.length) { els.submissionsList.innerHTML = '<div class="empty-state">No pending availability submissions.</div>'; return; }
  els.submissionsList.innerHTML = pending.map((submission) => '<article class="submission-row"><div><strong>' + escapeHtml(submission.employeeName) + '</strong><div class="meta">Week of ' + formatWeek(submission.weekStart) + '</div><div class="status-line">Submitted ' + formatSubmittedAt(submission.submittedAt) + '</div></div><div class="submission-days">' + DAYS.map((day) => '<label class="worker-availability-day"><span>' + day + '</span><select data-submission-shift="' + submission.id + '" data-submission-shift-day="' + day + '"><option value="Open" ' + selected(submission.shiftAvailability[day] || 'Unavailable', 'Open') + '>Available for Open</option><option value="Close" ' + selected(submission.shiftAvailability[day] || 'Unavailable', 'Close') + '>Available for Close</option><option value="Both" ' + selected(submission.shiftAvailability[day] || 'Unavailable', 'Both') + '>Available for Both</option><option value="Unavailable" ' + selected(submission.shiftAvailability[day] || 'Unavailable', 'Unavailable') + '>Not Available on ' + day + '</option></select></label>').join("") + '</div><div class="submission-actions"><button class="primary" data-submission-action="apply" data-submission-id="' + submission.id + '" type="button">Apply</button><button class="secondary" data-submission-action="reviewed" data-submission-id="' + submission.id + '" type="button">Mark Reviewed</button><button class="secondary danger" data-submission-action="rejected" data-submission-id="' + submission.id + '" type="button">Reject</button></div><label class="submission-notes">Manager Notes <textarea data-submission-notes="' + submission.id + '" rows="2" maxlength="1000" placeholder="Optional notes">' + escapeHtml(submission.managerNotes) + '</textarea></label></article>').join("");
  els.submissionsList.querySelectorAll<HTMLSelectElement>("[data-submission-shift]").forEach((input) => input.addEventListener("change", () => editSubmissionShift(input)));
  els.submissionsList.querySelectorAll<HTMLTextAreaElement>("[data-submission-notes]").forEach((input) => input.addEventListener("input", () => editSubmissionNotes(input)));
  els.submissionsList.querySelectorAll<HTMLButtonElement>("[data-submission-action]").forEach((button) => button.addEventListener("click", () => void handleSubmission(button)));
}

function editSubmissionShift(input: HTMLSelectElement): void {
  const submission = submissions.find((item) => item.id === input.dataset.submissionShift);
  const day = input.dataset.submissionShiftDay as DayName;
  if (!submission) return;
  const value = input.value as ShiftAvailability;
  submission.shiftAvailability[day] = value;
  submission.availableDays = toggleAvailability(submission.availableDays, day, value !== "Unavailable");
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
      if (!worker) { await showDialogMessage("This submission is not linked to a local employee. Sync employees and try again."); return; }
      worker.availability = [...submission.availableDays];
      worker.shiftAvailability = { ...submission.shiftAvailability };
      await saveState();
    }
    const status: SubmissionStatus = action === "apply" ? "applied" : action;
    await window.habanerosDesktop.updateAvailabilitySubmission({ id: submission.id, availableDays: submission.availableDays, shiftAvailability: submission.shiftAvailability, status, managerNotes: submission.managerNotes });
    submission.status = status;
    submission.actionAt = new Date().toISOString();
    renderWorkers();
    renderSubmissions();
    renderHistoryFilters();
    renderHistory();
    renderDashboard();
    renderNeedsAttention();
  } catch (error) { showError("The submission could not be updated.", error); }
}

async function applyAllSubmissions(): Promise<void> {
  const pending = submissions.filter((submission) => submission.status === "pending");
  if (!pending.length) return;
  const missing = pending.filter((submission) => !findWorker(submission.localWorkerId));
  if (missing.length) { await showDialogMessage("These submissions are not linked to local employees: " + missing.map((item) => item.employeeName).join(", ") + ". Sync employees and try again."); return; }
  if (!await confirmDialog("Apply all " + pending.length + " pending availability submissions?")) return;
  try {
    for (const submission of pending) {
      await window.habanerosDesktop.updateAvailabilitySubmission({ id: submission.id, availableDays: submission.availableDays, shiftAvailability: submission.shiftAvailability, status: "applied", managerNotes: submission.managerNotes });
    }
    for (const submission of pending) {
      const worker = findWorker(submission.localWorkerId)!;
      worker.availability = [...submission.availableDays];
      worker.shiftAvailability = { ...submission.shiftAvailability };
      submission.status = "applied";
      submission.actionAt = new Date().toISOString();
    }
    await saveState();
    renderWorkers();
    renderSubmissions();
    renderHistoryFilters();
    renderHistory();
    renderDashboard();
    renderNeedsAttention();
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
  if (!await confirmDialog("This will permanently delete this reviewed availability history record. Employee profiles and schedules will not be deleted.")) return;
  try {
    await window.habanerosDesktop.deleteAvailabilitySubmission(id);
    submissions = submissions.filter((submission) => submission.id !== id);
    renderHistoryFilters();
    renderHistory();
    renderDashboard();
    renderNeedsAttention();
  } catch (error) { showError("The history record could not be deleted.", error); }
}

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatWeek(value: string): string {
  const date = parseLocalDate(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

async function clearData(): Promise<void> {
  if (!await confirmDialog("This will reset all employee availability to Not Available. Employee profiles and schedule history will stay saved.")) return;
  state.workers.forEach((worker) => {
    worker.availability = [];
    worker.shiftAvailability = DAYS.reduce((result, day) => ({ ...result, [day]: "Unavailable" as ShiftAvailability }), {} as ShiftAvailabilityMap);
  });
  state.schedule = null;
  await saveStateAndRender();
}

function renderDeadlineSettings(): void {
  settings = normalizeSettings(settings);
  els.smsRemindersEnabled.checked = settings.availabilityDeadline.smsRemindersEnabled;
  els.deadlineDay.value = settings.availabilityDeadline.deadlineDay;
  els.deadlineTime.value = settings.availabilityDeadline.deadlineTime;
  els.firstReminderTime.value = settings.availabilityDeadline.firstReminderTime;
  els.secondReminderTime.value = settings.availabilityDeadline.secondReminderTime;
  els.firstReminderMessage.value = settings.availabilityDeadline.firstReminderMessage;
  els.secondReminderMessage.value = settings.availabilityDeadline.secondReminderMessage;
  els.sendTestSmsBtn.disabled = !settings.availabilityDeadline.smsRemindersEnabled;
  updateDeadlinePreview();
}

async function saveDeadlineSettings(event: Event): Promise<void> {
  event.preventDefault();
  try {
    settings = normalizeSettings({
      ...settings,
      availabilityDeadline: {
        smsRemindersEnabled: els.smsRemindersEnabled.checked,
        deadlineDay: (DAYS.includes(els.deadlineDay.value as DayName) ? els.deadlineDay.value : "Tuesday") as DayName,
        deadlineTime: els.deadlineTime.value || "23:59",
        firstReminderTime: els.firstReminderTime.value || "12:00",
        secondReminderTime: els.secondReminderTime.value || "20:00",
        firstReminderMessage: els.firstReminderMessage.value.trim(),
        secondReminderMessage: els.secondReminderMessage.value.trim()
      }
    });
    settings = await window.habanerosDesktop.saveSettings(settings);
    await saveManagerCloudSnapshot().catch((error) => console.warn("Deadline settings were saved locally, but the cloud reminder snapshot was not updated.", error));
    renderDeadlineSettings();
    renderDashboard();
    renderNeedsAttention();
    await showDialogMessage("Availability deadline settings saved.");
  } catch (error) {
    showError("Availability deadline settings could not be saved.", error);
  }
}

function updateDeadlinePreview(): void {
  const previewSettings = normalizeSettings({
    ...settings,
    availabilityDeadline: {
      smsRemindersEnabled: els.smsRemindersEnabled.checked,
      deadlineDay: (DAYS.includes(els.deadlineDay.value as DayName) ? els.deadlineDay.value : "Tuesday") as DayName,
      deadlineTime: els.deadlineTime.value || "23:59",
      firstReminderTime: els.firstReminderTime.value || "12:00",
      secondReminderTime: els.secondReminderTime.value || "20:00",
      firstReminderMessage: els.firstReminderMessage.value,
      secondReminderMessage: els.secondReminderMessage.value
    }
  });
  const status = calculateAvailabilityStatus(state.workers, submissions, previewSettings, state.rules.weekStart);
  const deadlineDate = status.deadlineAt ? status.deadlineAt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) + " at " + formatTime(previewSettings.availabilityDeadline.deadlineTime) : formatDeadlineSummary(previewSettings);
  els.sendTestSmsBtn.disabled = !previewSettings.availabilityDeadline.smsRemindersEnabled;
  els.deadlinePreview.innerHTML = '<strong>SMS reminders:</strong> ' + (previewSettings.availabilityDeadline.smsRemindersEnabled ? 'Enabled' : 'Disabled') + '<br><strong>Deadline:</strong> ' + escapeHtml(deadlineDate) + '<br><strong>Reminder #1:</strong> ' + escapeHtml(previewSettings.availabilityDeadline.deadlineDay + " at " + formatTime(previewSettings.availabilityDeadline.firstReminderTime)) + '<br><strong>Reminder #2:</strong> ' + escapeHtml(previewSettings.availabilityDeadline.deadlineDay + " at " + formatTime(previewSettings.availabilityDeadline.secondReminderTime)) + '<br><strong>Status:</strong> Submitted: ' + status.submitted + ' | Waiting: ' + status.waiting + ' | Missing: ' + status.missing + '<br><strong>Reminder #1 Text:</strong> ' + escapeHtml(buildReminderMessage(previewSettings.availabilityDeadline.firstReminderMessage, previewSettings)) + '<br><strong>Reminder #2 Text:</strong> ' + escapeHtml(buildReminderMessage(previewSettings.availabilityDeadline.secondReminderMessage, previewSettings));
}

async function checkReminderStatus(): Promise<void> {
  await invokeReminderFunction("dryRun");
}

async function sendTestSms(): Promise<void> {
  if (!settings.availabilityDeadline.smsRemindersEnabled) { await showDialogMessage("SMS reminders are disabled. Turn on Enable SMS reminders before sending a test SMS."); return; }
  if (!els.testSmsPhone.value.trim()) { await showDialogMessage("Enter a test phone number before sending a test SMS."); return; }
  if (!await confirmDialog("Send one test SMS to " + els.testSmsPhone.value.trim() + "? This will not text employees.")) return;
  await invokeReminderFunction("test", els.testSmsPhone.value.trim());
}

async function invokeReminderFunction(mode: "dryRun" | "test", testPhoneNumber = ""): Promise<void> {
  try {
    const config = readCloudConfigForm();
    if (!config.supabaseUrl || !config.anonKey) { await showDialogMessage("Save Supabase settings before checking SMS reminders."); return; }
    els.reminderStatus.textContent = mode === "test" ? "Sending test SMS..." : "Checking reminder status...";
    const response = await fetch(config.supabaseUrl + "/functions/v1/send-availability-reminders", {
      method: "POST",
      headers: { apikey: config.anonKey, Authorization: "Bearer " + config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ mode, testPhoneNumber })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || result.message || "Reminder function failed.");
    renderReminderFunctionResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Please try again.";
    els.reminderStatus.textContent = "Reminder check failed: " + message;
    showError("SMS reminder check failed.", error);
  }
}

async function saveManagerCloudSnapshot(): Promise<void> {
  if (authSession && activeWorkspace) {
    await saveAuthenticatedWorkspaceSnapshot();
    return;
  }
  const config = readCloudConfigForm();
  if (!config.supabaseUrl || !config.anonKey) return;
  await fetch(config.supabaseUrl + "/rest/v1/rpc/manager_save_app_state", {
    method: "POST",
    headers: { apikey: config.anonKey, Authorization: "Bearer " + config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: "habaneros-manager", p_state_data: { state, settings, cloudConfig: config } })
  }).then(async (response) => {
    if (!response.ok) throw new Error((await response.text()) || "Cloud settings snapshot could not be saved.");
  });
}

function queueAuthenticatedWorkspaceSnapshot(): void {
  if (!authSession || !activeWorkspace || !cloudConfig.supabaseUrl || !cloudConfig.anonKey) return;
  setAccountSyncStatus("Saving account data", "warn");
  workspaceSaveChain = workspaceSaveChain
    .then(() => saveAuthenticatedWorkspaceSnapshot())
    .catch((error) => {
      setAccountSyncStatus("Account save failed", "bad");
      console.warn("Authenticated workspace snapshot could not be saved.", error);
    });
}

async function saveAuthenticatedWorkspaceSnapshot(): Promise<void> {
  if (!authSession || !activeWorkspace) return;
  authSession = await refreshAuthSession(cloudConfig, authSession);
  storeAuthSession(authSession);
  await saveWorkspaceSnapshot(cloudConfig, authSession, activeWorkspace, { state, settings, cloudConfig });
  setAccountSyncStatus("Account saved", "good");
}

function renderReminderFunctionResult(result: Record<string, unknown>): void {
  const errors = Array.isArray(result.errors) ? result.errors.length : 0;
  els.reminderStatus.innerHTML = '<strong>Last reminder check:</strong> ' + escapeHtml(new Date().toLocaleString()) +
    '<br><strong>SMS reminders:</strong> ' + escapeHtml(result.smsRemindersEnabled === false ? "Disabled" : "Enabled") +
    '<br><strong>Reminder type:</strong> ' + escapeHtml(String(result.reminderType || "not due")) +
    '<br><strong>Target week:</strong> ' + escapeHtml(String(result.targetWeek || "not available")) +
    '<br><strong>Employees checked:</strong> ' + escapeHtml(String(result.employeesChecked ?? 0)) +
    '<br><strong>Messages sent:</strong> ' + escapeHtml(String(result.messagesSent ?? 0)) +
    '<br><strong>Employees still waiting:</strong> ' + escapeHtml(String(result.employeesSkipped ?? 0)) +
    '<br><strong>SMS errors:</strong> ' + escapeHtml(String(errors)) +
    (result.message ? '<br><strong>Message:</strong> ' + escapeHtml(String(result.message)) : '');
}

async function updateTheme(): Promise<void> {
  try {
    settings = { ...settings, darkMode: els.darkModeToggle.checked };
    applyTheme(settings);
    settings = await window.habanerosDesktop.saveSettings(settings);
    queueAuthenticatedWorkspaceSnapshot();
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
    setSaveStatus("Saving...", "warn");
    state = await window.habanerosDesktop.saveState(state);
    await window.habanerosDesktop.setDirty(false);
    setSaveStatus("Saved", "good");
    queueAuthenticatedWorkspaceSnapshot();
  } finally {
    ensureWorkerFormInteractive();
  }
}

function setSaveStatus(message: string, level: "good" | "warn" | "bad" = "good"): void {
  els.saveStatus.textContent = message;
  els.saveStatus.className = "count-pill status-" + level;
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
  void showDialogMessage(message + "\n\n" + (error instanceof Error ? error.message : "Please try again."));
}

async function showDialogMessage(message: string): Promise<void> {
  try {
    await window.habanerosDesktop.showMessage(message);
  } finally {
    cleanupAfterDialog();
  }
}

async function confirmDialog(message: string, confirmLabel?: string, cancelLabel?: string): Promise<boolean> {
  try {
    return await window.habanerosDesktop.showConfirmation(message, { confirmLabel, cancelLabel });
  } finally {
    cleanupAfterDialog();
  }
}

async function restoreAfterDialog(): Promise<void> {
  try {
    await window.habanerosDesktop.restoreFocus();
  } catch (error) {
    console.error("The main window could not restore focus after a dialog.", error);
  } finally {
    cleanupAfterDialog();
  }
}
