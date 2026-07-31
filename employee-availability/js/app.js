import { rpc } from "./supabase.js";
import { addDays, followingMondayWeekStart, formatDate, formatWeek, mondayWeekStart, parseLocalDate, toIsoDate } from "./weeks.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const LANGUAGE_KEY = "habaneros-availability-language";
const TRANSLATIONS = {
  en: {
    locale: undefined,
    title: "Employee Availability",
    availabilityTab: "Submit Availability",
    scheduleTab: "View Schedule",
    myScheduleTab: "My Scheduled Days",
    logout: "Log Out",
    scheduleWeek: "Schedule week",
    lastWeek: "Last week",
    currentWeek: "Current week",
    nextWeek: "Next week",
    noSchedulePosted: "No schedule has been posted for this week yet.",
    notScheduled: "You are not scheduled for any shifts this week.",
    myScheduledDaysTitle: "My Scheduled Days This Week",
    calendarSubscription: "Calendar Subscription",
    subscribeCalendar: "Subscribe to My Schedule Calendar",
    privateCalendarLink: "Private subscription link",
    copyLink: "Copy Link",
    openCalendarLink: "Open Calendar Link",
    downloadMyShifts: "Download My Shifts Calendar File",
    calendarWarning: "This link is private. Anyone with this link can see your scheduled shifts.",
    calendarLinkMissing: "Calendar link is not available yet. Ask your lead to sync employees.",
    calendarLinkCopied: "Calendar link copied.",
    scheduleLoadFailed: "Schedule could not be loaded. Please try again.",
    openShift: "Open",
    closeShift: "Close",
    weekOfSchedule: "Week of",
    employeeCode: "Employee Code",
    employeeCodeHint: "Enter your 4-digit employee code",
    continue: "Continue",
    welcome: "Welcome",
    weekOf: "Week of",
    submittingFor: "Submitting availability for:",
    daysAvailable: "Days you are available",
    chooseAvailability: "Choose availability",
    submitAvailability: "Submit Availability",
    useDifferentCode: "Use a different code",
    successTitle: "Availability Submitted Successfully",
    successReceived: "Your lead has received your availability for:",
    thankYou: "Thank you.",
    submitAnother: "Submit Another Week",
    availableOpen: "Available for Open",
    availableClose: "Available for Close",
    availableBoth: "Available for Both",
    invalidCodeFormat: "Enter your 4-digit employee code.",
    invalidCode: "That employee code was not recognized. Please try again.",
    inactiveAccount: "This employee account is no longer active.",
    connectionError: "Unable to connect. Please try again.",
    submissionFailed: "Submission failed. Please try again.",
    notConfigured: "The availability form has not been configured yet.",
    serviceError: "The availability service returned an error.",
    duplicateSubmission: "You have already submitted availability for this week.",
    onlyNextWeek: "Availability can only be submitted for next week.",
    chooseEveryDay: "Choose availability for every day.",
    invalidShiftAvailability: "Invalid shift availability.",
    daysMismatch: "Available days do not match shift availability.",
    days: {
      Monday: "Monday",
      Tuesday: "Tuesday",
      Wednesday: "Wednesday",
      Thursday: "Thursday",
      Friday: "Friday",
      Saturday: "Saturday",
      Sunday: "Sunday"
    },
    notAvailable: {
      Monday: "Not Available on Monday",
      Tuesday: "Not Available on Tuesday",
      Wednesday: "Not Available on Wednesday",
      Thursday: "Not Available on Thursday",
      Friday: "Not Available on Friday",
      Saturday: "Not Available on Saturday",
      Sunday: "Not Available on Sunday"
    }
  },
  es: {
    locale: "es-US",
    title: "Disponibilidad del Empleado",
    availabilityTab: "Enviar Disponibilidad",
    scheduleTab: "Ver Horario",
    scheduleWeek: "Semana del horario",
    lastWeek: "Semana pasada",
    currentWeek: "Semana actual",
    nextWeek: "Próxima semana",
    noSchedulePosted: "Todavía no se ha publicado el horario para esta semana.",
    scheduleLoadFailed: "No se pudo cargar el horario. Inténtalo de nuevo.",
    openShift: "Abrir",
    closeShift: "Cerrar",
    weekOfSchedule: "Semana de",
    employeeCode: "Código del Empleado",
    employeeCodeHint: "Ingresa tu código de empleado de 4 dígitos",
    continue: "Continuar",
    welcome: "Bienvenido",
    weekOf: "Semana de",
    submittingFor: "Enviando disponibilidad para:",
    daysAvailable: "Días que estás disponible",
    chooseAvailability: "Selecciona tu disponibilidad",
    submitAvailability: "Enviar Disponibilidad",
    useDifferentCode: "Usar otro código",
    successTitle: "Disponibilidad Enviada Correctamente",
    successReceived: "Tu líder recibió tu disponibilidad para:",
    thankYou: "Gracias.",
    submitAnother: "Enviar Otra Semana",
    availableOpen: "Disponible para Abrir",
    availableClose: "Disponible para Cerrar",
    availableBoth: "Disponible para Abrir y Cerrar",
    invalidCodeFormat: "Ingresa tu código de empleado de 4 dígitos.",
    invalidCode: "Ese código de empleado no fue reconocido. Inténtalo de nuevo.",
    connectionError: "No se pudo conectar. Inténtalo de nuevo.",
    submissionFailed: "No se pudo enviar la disponibilidad. Inténtalo de nuevo.",
    notConfigured: "El formulario de disponibilidad todavía no está configurado.",
    serviceError: "El servicio de disponibilidad devolvió un error.",
    duplicateSubmission: "Ya enviaste disponibilidad para esta semana.",
    onlyNextWeek: "La disponibilidad solo se puede enviar para la proxima semana.",
    chooseEveryDay: "Selecciona disponibilidad para cada día.",
    invalidShiftAvailability: "La disponibilidad seleccionada no es válida.",
    daysMismatch: "Los días disponibles no coinciden con la disponibilidad por turno.",
    days: {
      Monday: "Lunes",
      Tuesday: "Martes",
      Wednesday: "Miércoles",
      Thursday: "Jueves",
      Friday: "Viernes",
      Saturday: "Sábado",
      Sunday: "Domingo"
    },
    notAvailable: {
      Monday: "No disponible el Lunes",
      Tuesday: "No disponible el Martes",
      Wednesday: "No disponible el Miércoles",
      Thursday: "No disponible el Jueves",
      Friday: "No disponible el Viernes",
      Saturday: "No disponible el Sábado",
      Sunday: "No disponible el Domingo"
    }
  }
};
const codeForm = document.getElementById("codeForm");
const availabilityForm = document.getElementById("availabilityForm");
const loginPanel = document.getElementById("loginPanel");
const availabilityPanel = document.getElementById("availabilityPanel");
const successPanel = document.getElementById("successPanel");
const schedulePanel = document.getElementById("schedulePanel");
const mySchedulePanel = document.getElementById("mySchedulePanel");
const codeInput = document.getElementById("employeeCode");
const weekStart = document.getElementById("weekStart");
const weekStartLabel = document.getElementById("weekStartLabel");
const scheduleWeek = document.getElementById("scheduleWeek");
const myScheduleWeek = document.getElementById("myScheduleWeek");
const postedSchedule = document.getElementById("postedSchedule");
const mySchedule = document.getElementById("mySchedule");
const calendarSubscriptionPanel = document.getElementById("calendarSubscriptionPanel");
const calendarLink = document.getElementById("calendarLink");
const message = document.getElementById("message");
const daysContainer = document.getElementById("days");
const languageButtons = document.querySelectorAll("[data-language]");
const employeeNav = document.getElementById("employeeNav");
const availabilityTab = document.getElementById("availabilityTab");
const scheduleTab = document.getElementById("scheduleTab");
const myScheduleTab = document.getElementById("myScheduleTab");
const logoutButton = document.getElementById("logoutButton");
const showCalendarSubscription = document.getElementById("showCalendarSubscription");
const copyCalendarLink = document.getElementById("copyCalendarLink");
const openCalendarLink = document.getElementById("openCalendarLink");
const downloadMyShiftsIcs = document.getElementById("downloadMyShiftsIcs");
let verifiedCode = "";
let verifiedEmployee = null;
let myScheduleRows = [];
let currentLanguage = localStorage.getItem(LANGUAGE_KEY) === "es" ? "es" : "en";
let activeSiteSection = "availability";

renderLanguage();

languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentLanguage = button.dataset.language === "es" ? "es" : "en";
    localStorage.setItem(LANGUAGE_KEY, currentLanguage);
    renderLanguage();
  });
});

codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = codeInput.value.trim();
  if (!/^\d{4}$/.test(code)) return showMessage(t("invalidCodeFormat"));
  try {
    setBusy(true);
    const rows = await rpc("employee_phone_lookup", { p_employee_code: code });
    if (!Array.isArray(rows) || !rows[0]) return showMessage(t("invalidCode"));
    verifiedCode = code;
    verifiedEmployee = { id: rows[0].employee_id || "", localWorkerId: rows[0].local_worker_id || "", name: rows[0].employee_name || "Employee", calendarToken: rows[0].calendar_token || "" };
    employeeNav.hidden = false;
    document.getElementById("employeeName").textContent = verifiedEmployee.name;
    activeSiteSection = "availability";
    updateSiteTabs();
    showPanel(availabilityPanel);
    showMessage("");
  } catch (error) { showMessage(localizeError(error.message) || t("connectionError")); }
  finally { setBusy(false); }
});

availabilityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAvailabilityWeek();
  if (!isValidNextWeekStart(weekStart.value)) return showMessage(t("onlyNextWeek"));
  const shiftAvailability = Object.fromEntries(DAYS.map((day) => [day, document.querySelector("[data-shift-day='" + day + "']").value]));
  const availableDays = DAYS.filter((day) => shiftAvailability[day] !== "Unavailable");
  try {
    setBusy(true);
    await rpc("submit_employee_availability", { p_employee_code: verifiedCode, p_week_start: weekStart.value, p_available_days: availableDays, p_shift_availability: shiftAvailability });
    document.getElementById("successWeek").textContent = t("weekOf") + " " + formatWeek(weekStart.value, currentLocale());
    showPanel(successPanel);
    showMessage("");
  } catch (error) { showMessage(localizeError(error.message) || t("submissionFailed")); }
  finally { setBusy(false); }
});

document.getElementById("startOver").addEventListener("click", resetLogin);
document.getElementById("submitAnother").addEventListener("click", () => {
  availabilityForm.reset();
  setAvailabilityWeek();
  showPanel(availabilityPanel);
  showMessage("");
});
availabilityTab.addEventListener("click", () => showSiteSection("availability"));
scheduleTab.addEventListener("click", () => {
  showSiteSection("schedule");
  loadPublishedSchedule();
});
myScheduleTab.addEventListener("click", () => {
  showSiteSection("mySchedule");
  loadMySchedule();
});
logoutButton.addEventListener("click", resetLogin);
scheduleWeek.addEventListener("change", loadPublishedSchedule);
myScheduleWeek.addEventListener("change", loadMySchedule);
showCalendarSubscription.addEventListener("click", () => {
  calendarSubscriptionPanel.hidden = !calendarSubscriptionPanel.hidden;
  updateCalendarSubscriptionLink();
});
copyCalendarLink.addEventListener("click", async () => {
  const link = updateCalendarSubscriptionLink();
  if (!link) return showMessage(t("calendarLinkMissing"));
  await copyText(link);
  showMessage(t("calendarLinkCopied"));
});
openCalendarLink.addEventListener("click", () => {
  const link = updateCalendarSubscriptionLink();
  if (!link) return showMessage(t("calendarLinkMissing"));
  window.open(link, "_blank", "noopener");
});
downloadMyShiftsIcs.addEventListener("click", downloadSelectedWeekCalendarFile);

function resetLogin() {
  verifiedCode = "";
  verifiedEmployee = null;
  myScheduleRows = [];
  codeInput.value = "";
  availabilityForm.reset();
  setAvailabilityWeek();
  employeeNav.hidden = true;
  activeSiteSection = "availability";
  schedulePanel.hidden = true;
  mySchedulePanel.hidden = true;
  calendarSubscriptionPanel.hidden = true;
  calendarLink.value = "";
  showPanel(loginPanel);
  updateSiteTabs();
  showMessage("");
  codeInput.focus();
}

function setAvailabilityWeek() {
  const targetWeek = followingMondayWeekStart();
  weekStart.value = targetWeek;
  weekStartLabel.textContent = t("weekOf") + " " + formatWeek(targetWeek, currentLocale());
}

function isValidNextWeekStart(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && value === followingMondayWeekStart();
}

function populateScheduleWeeks() {
  const weeks = scheduleWeeks();
  const options = weeks.map((item) => '<option value="' + item.value + '" ' + selected(item.label, "currentWeek") + '>' + t(item.label) + " - " + t("weekOfSchedule") + " " + formatDate(item.date, currentLocale()) + '</option>').join("");
  scheduleWeek.innerHTML = options;
  myScheduleWeek.innerHTML = options;
}

function renderLanguage() {
  const selectedValues = Object.fromEntries(DAYS.map((day) => {
    const select = document.querySelector("[data-shift-day='" + day + "']");
    return [day, select ? select.value : ""];
  }));
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll("[data-i18n]").forEach((item) => { item.textContent = t(item.dataset.i18n); });
  languageButtons.forEach((button) => {
    const active = button.dataset.language === currentLanguage;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderDays(selectedValues);
  setAvailabilityWeek();
  populateScheduleWeeks();
  if (activeSiteSection === "schedule") loadPublishedSchedule();
  if (activeSiteSection === "mySchedule") loadMySchedule();
}

function renderDays(selectedValues = {}) {
  daysContainer.innerHTML = DAYS.map((day) => {
    const value = selectedValues[day] || "";
    return '<label class="day-row"><strong>' + tDay(day) + '</strong><select data-shift-day="' + day + '" required><option value="" ' + selected(value, "") + '>' + t("chooseAvailability") + '</option><option value="Open" ' + selected(value, "Open") + '>' + t("availableOpen") + '</option><option value="Close" ' + selected(value, "Close") + '>' + t("availableClose") + '</option><option value="Both" ' + selected(value, "Both") + '>' + t("availableBoth") + '</option><option value="Unavailable" ' + selected(value, "Unavailable") + '>' + tNotAvailable(day) + '</option></select></label>';
  }).join("");
}

function showPanel(panel) {
  if (activeSiteSection !== "availability") return;
  [loginPanel, availabilityPanel, successPanel].forEach((item) => { item.hidden = item !== panel; });
}
function showSiteSection(section) {
  if (!verifiedEmployee) {
    activeSiteSection = "availability";
    employeeNav.hidden = true;
    schedulePanel.hidden = true;
    mySchedulePanel.hidden = true;
    showPanel(loginPanel);
    return;
  }
  activeSiteSection = section;
  updateSiteTabs();
  schedulePanel.hidden = section !== "schedule";
  mySchedulePanel.hidden = section !== "mySchedule";
  document.querySelectorAll("[data-availability-section]").forEach((item) => { item.hidden = section !== "availability" || item === loginPanel; });
  if (section === "availability") {
    showPanel(availabilityPanel);
  } else {
    calendarSubscriptionPanel.hidden = true;
    if (section === "mySchedule") updateCalendarSubscriptionLink();
    showMessage("");
  }
}
function updateSiteTabs() {
  availabilityTab.classList.toggle("active", activeSiteSection === "availability");
  scheduleTab.classList.toggle("active", activeSiteSection === "schedule");
  myScheduleTab.classList.toggle("active", activeSiteSection === "mySchedule");
}
function showMessage(text) { message.textContent = text; }
function setBusy(busy) { document.querySelectorAll("button").forEach((button) => { button.disabled = busy; }); }
function selected(current, option) { return current === option ? "selected" : ""; }
function currentLocale() { return TRANSLATIONS[currentLanguage].locale; }
function t(key) { return TRANSLATIONS[currentLanguage][key] || TRANSLATIONS.en[key] || key; }
function tDay(day) { return TRANSLATIONS[currentLanguage].days[day] || day; }
function tNotAvailable(day) { return TRANSLATIONS[currentLanguage].notAvailable[day] || TRANSLATIONS.en.notAvailable[day]; }
function localizeError(message) {
  if (!message) return "";
  const normalized = String(message).trim();
  const knownMessages = {
    "The availability form has not been configured yet.": "notConfigured",
    "The availability service returned an error.": "serviceError",
    "This employee account is no longer active.": "inactiveAccount",
    "Invalid employee login.": "invalidCode",
    "You have already submitted availability for this week.": "duplicateSubmission",
    "Availability can only be submitted for next week.": "onlyNextWeek",
    "Choose availability for every day.": "chooseEveryDay",
    "Invalid shift availability": "invalidShiftAvailability",
    "Invalid shift availability.": "invalidShiftAvailability",
    "Available days do not match shift availability.": "daysMismatch"
  };
  return knownMessages[normalized] ? t(knownMessages[normalized]) : normalized;
}

async function loadPublishedSchedule() {
  try {
    if (!verifiedEmployee) return showSiteSection("availability");
    const week = scheduleWeek.value || scheduleWeeks()[1].value;
    if (!week) return;
    postedSchedule.innerHTML = '<div class="schedule-empty">Loading schedule...</div>';
    const config = window.HABANEROS_SUPABASE || {};
    const rows = await rpc("get_employee_published_schedule", { p_employee_code: verifiedCode, p_week_start: week, p_workspace_slug: config.workspaceSlug || "" });
    if (!Array.isArray(rows) || !rows[0]?.schedule_json) {
      postedSchedule.innerHTML = '<div class="schedule-empty">' + t("noSchedulePosted") + '</div>';
      return;
    }
    renderPostedSchedule(rows[0].schedule_json, rows[0].week_start || week);
  } catch (error) {
    postedSchedule.innerHTML = '<div class="schedule-empty">' + (localizeError(error.message) || t("scheduleLoadFailed")) + '</div>';
  }
}

async function loadMySchedule() {
  try {
    if (!verifiedEmployee) return showSiteSection("availability");
    const week = myScheduleWeek.value || scheduleWeeks()[1].value;
    if (!week) return;
    mySchedule.innerHTML = '<div class="schedule-empty">Loading schedule...</div>';
    const config = window.HABANEROS_SUPABASE || {};
    const rows = await rpc("get_employee_published_schedule", { p_employee_code: verifiedCode, p_week_start: week, p_workspace_slug: config.workspaceSlug || "" });
    if (!Array.isArray(rows) || !rows[0]?.schedule_json) {
      mySchedule.innerHTML = '<div class="schedule-empty">' + t("noSchedulePosted") + '</div>';
      return;
    }
    renderMySchedule(rows[0].schedule_json, rows[0].week_start || week);
  } catch (error) {
    mySchedule.innerHTML = '<div class="schedule-empty">' + (localizeError(error.message) || t("scheduleLoadFailed")) + '</div>';
  }
}

function renderPostedSchedule(schedule, week) {
  const days = orderedPostedScheduleDays(schedule, week);
  postedSchedule.innerHTML = '<div class="posted-week"><strong>' + t("weekOfSchedule") + " " + formatWeek(mondayWeekStart(week), currentLocale()) + '</strong></div>' + days.map((day) => '<article class="posted-day"><h2>' + escapeHtml(tDay(day.day) || day.day) + '</h2><p>' + escapeHtml(formatWeek(day.date, currentLocale())) + '</p>' + renderPostedShift(day.shifts?.open, t("openShift")) + renderPostedShift(day.shifts?.close, t("closeShift")) + '</article>').join("");
}

function renderPostedShift(shift, label) {
  const assigned = Array.isArray(shift?.assigned) ? shift.assigned : [];
  return '<section class="posted-shift"><h3>' + escapeHtml(label) + '</h3>' + (assigned.length ? assigned.map((worker) => '<div class="posted-worker"><strong>' + escapeHtml(worker.name || "Employee") + '</strong><span>' + escapeHtml(worker.start || "") + ' - ' + escapeHtml(worker.end || "") + '</span>' + (worker.position ? '<em>' + escapeHtml(worker.position) + '</em>' : '') + '</div>').join("") : '<p class="hint">' + t("noSchedulePosted") + '</p>') + '</section>';
}

function renderMySchedule(schedule, week) {
  const days = orderedPostedScheduleDays(schedule, week);
  const workerId = verifiedEmployee?.localWorkerId || "";
  const rows = [];
  days.forEach((day) => {
    [["open", t("openShift")], ["close", t("closeShift")]].forEach(([shiftKey, label]) => {
      const assigned = Array.isArray(day.shifts?.[shiftKey]?.assigned) ? day.shifts[shiftKey].assigned : [];
      assigned.filter((worker) => worker.id === workerId).forEach((worker) => {
        rows.push({ day, label, worker });
      });
    });
  });
  myScheduleRows = rows.map((row) => ({ ...row, week }));
  mySchedule.innerHTML = '<div class="posted-week"><strong>' + t("weekOfSchedule") + " " + formatWeek(mondayWeekStart(week), currentLocale()) + '</strong></div>' + (rows.length ? rows.map(({ day, label, worker }) => '<article class="posted-day"><h2>' + escapeHtml(tDay(day.day) || day.day) + '</h2><p>' + escapeHtml(formatWeek(day.date, currentLocale())) + '</p><section class="posted-shift"><h3>' + escapeHtml(label) + '</h3><div class="posted-worker"><strong>' + escapeHtml(worker.name || verifiedEmployee.name || "Employee") + '</strong><span>' + escapeHtml(worker.start || "") + ' - ' + escapeHtml(worker.end || "") + '</span>' + (worker.position ? '<em>' + escapeHtml(worker.position) + '</em>' : '') + '</div></section></article>').join("") : '<div class="schedule-empty">' + t("notScheduled") + '</div>');
}

function updateCalendarSubscriptionLink() {
  const token = verifiedEmployee?.calendarToken || "";
  const config = window.HABANEROS_SUPABASE || {};
  const link = token && config.url ? config.url.replace(/\/$/, "") + "/functions/v1/employee-calendar-feed?token=" + encodeURIComponent(token) : "";
  calendarLink.value = link;
  return link;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  window.prompt("Copy this link:", value);
}

function downloadSelectedWeekCalendarFile() {
  const ics = buildMyScheduleIcs(myScheduleRows);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "habaneros-my-shifts.ics";
  link.click();
  URL.revokeObjectURL(url);
}

function buildMyScheduleIcs(rows) {
  const stamp = icsStamp(new Date());
  const events = rows.map(({ day, label, worker, week }) => {
    const start = localDateTime(day.date, worker.start || "08:00");
    const end = localDateTime(day.date, worker.end || "08:00", start);
    const uid = "habaneros-download-" + (verifiedEmployee?.localWorkerId || "employee") + "-" + day.date + "-" + (worker.start || "") + "-" + (worker.end || "") + "@habaneros-scheduler";
    const description = ["Position: " + (worker.position || label), "Week of " + formatWeek(mondayWeekStart(week), currentLocale()), "Published from Habaneros Scheduler"].join("\\n");
    return ["BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + stamp, "SUMMARY:Habaneros Shift", "LOCATION:Habaneros Mexican Food", "DESCRIPTION:" + icsText(description), "DTSTART;TZID=America/Los_Angeles:" + start.text, "DTEND;TZID=America/Los_Angeles:" + end.text, "END:VEVENT"].join("\r\n");
  }).join("\r\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Habaneros Scheduler//Employee Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Habaneros Work Schedule", "X-WR-TIMEZONE:America/Los_Angeles", events, "END:VCALENDAR"].filter(Boolean).join("\r\n");
}

function localDateTime(dateValue, timeValue, previous) {
  const date = parseLocalDate(dateValue);
  const [hours, minutes] = String(timeValue || "00:00").split(":").map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  if (previous && date <= previous.date) date.setDate(date.getDate() + 1);
  return { date, text: date.getFullYear() + String(date.getMonth() + 1).padStart(2, "0") + String(date.getDate()).padStart(2, "0") + "T" + String(date.getHours()).padStart(2, "0") + String(date.getMinutes()).padStart(2, "0") + "00" };
}

function icsStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function scheduleWeeks(today = new Date()) {
  const current = parseLocalDate(mondayWeekStart(today));
  const last = addDays(current, -7);
  const next = addDays(current, 7);
  return [
    { label: "lastWeek", date: last, value: toIsoDate(last) },
    { label: "currentWeek", date: current, value: toIsoDate(current) },
    { label: "nextWeek", date: next, value: toIsoDate(next) }
  ];
}

function orderedPostedScheduleDays(schedule, week) {
  const weekStart = mondayWeekStart(week);
  return DAYS.map((day, index) => {
    const existing = (schedule.days || []).find((item) => item.day === day) || { day, shifts: { open: { assigned: [] }, close: { assigned: [] } } };
    return { ...existing, day, date: toIsoDate(addDays(parseLocalDate(weekStart), index)) };
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
