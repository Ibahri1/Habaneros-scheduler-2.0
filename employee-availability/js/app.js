import { rpc } from "./supabase.js";
import { formatDate, formatWeek, toIsoDate, upcomingSundays } from "./weeks.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const codeForm = document.getElementById("codeForm");
const availabilityForm = document.getElementById("availabilityForm");
const loginPanel = document.getElementById("loginPanel");
const availabilityPanel = document.getElementById("availabilityPanel");
const successPanel = document.getElementById("successPanel");
const codeInput = document.getElementById("employeeCode");
const weekStart = document.getElementById("weekStart");
const message = document.getElementById("message");
let verifiedCode = "";

document.getElementById("days").innerHTML = DAYS.map((day) => '<label class="day"><input type="checkbox" name="day" value="' + day + '"> ' + day + '</label>').join("");
populateWeeks();

codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = codeInput.value.trim();
  if (!/^\d{4}$/.test(code)) return showMessage("Enter your 4-digit employee code.");
  try {
    setBusy(true);
    const rows = await rpc("employee_phone_lookup", { p_employee_code: code });
    if (!Array.isArray(rows) || !rows[0]) return showMessage("That employee code was not recognized. Please try again.");
    verifiedCode = code;
    document.getElementById("employeeName").textContent = rows[0].employee_name;
    showPanel(availabilityPanel);
    showMessage("");
  } catch (error) { showMessage(error.message || "Unable to connect. Please try again."); }
  finally { setBusy(false); }
});

availabilityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const availableDays = [...document.querySelectorAll("input[name='day']:checked")].map((input) => input.value);
  try {
    setBusy(true);
    await rpc("submit_employee_availability", { p_employee_code: verifiedCode, p_week_start: weekStart.value, p_available_days: availableDays });
    document.getElementById("successWeek").textContent = "Week of " + formatWeek(weekStart.value);
    showPanel(successPanel);
    showMessage("");
  } catch (error) { showMessage(error.message || "Submission failed. Please try again."); }
  finally { setBusy(false); }
});

document.getElementById("startOver").addEventListener("click", resetLogin);
document.getElementById("submitAnother").addEventListener("click", () => {
  availabilityForm.reset();
  populateWeeks();
  showPanel(availabilityPanel);
  showMessage("");
});

function resetLogin() {
  verifiedCode = "";
  codeInput.value = "";
  availabilityForm.reset();
  populateWeeks();
  showPanel(loginPanel);
  showMessage("");
  codeInput.focus();
}

function populateWeeks() {
  weekStart.innerHTML = upcomingSundays().map((date) => '<option value="' + toIsoDate(date) + '">Week of ' + formatDate(date) + '</option>').join("");
}

function showPanel(panel) { [loginPanel, availabilityPanel, successPanel].forEach((item) => { item.hidden = item !== panel; }); }
function showMessage(text) { message.textContent = text; }
function setBusy(busy) { document.querySelectorAll("button").forEach((button) => { button.disabled = busy; }); }
