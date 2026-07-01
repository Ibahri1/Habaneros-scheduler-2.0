(() => {
  "use strict";
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const config = window.HABANEROS_SUPABASE || {};
  const codeForm = document.getElementById("codeForm");
  const availabilityForm = document.getElementById("availabilityForm");
  const loginPanel = document.getElementById("loginPanel");
  const availabilityPanel = document.getElementById("availabilityPanel");
  const codeInput = document.getElementById("employeeCode");
  const weekStart = document.getElementById("weekStart");
  const message = document.getElementById("message");
  let verifiedCode = "";

  document.getElementById("days").innerHTML = DAYS.map((day) => '<label class="day"><input type="checkbox" name="day" value="' + day + '"> ' + day + '</label>').join("");
  weekStart.value = nextMonday();
  weekStart.min = nextMonday();

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
      loginPanel.hidden = true;
      availabilityPanel.hidden = false;
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
      showMessage("Your availability was submitted successfully.", true);
    } catch (error) { showMessage(error.message || "Submission failed. Please try again."); }
    finally { setBusy(false); }
  });

  document.getElementById("startOver").addEventListener("click", () => {
    verifiedCode = ""; codeInput.value = ""; availabilityForm.reset(); weekStart.value = nextMonday();
    availabilityPanel.hidden = true; loginPanel.hidden = false; showMessage(""); codeInput.focus();
  });

  async function rpc(name, body) {
    if (!config.url || !config.anonKey || config.url.includes("YOUR-PROJECT")) throw new Error("The availability form has not been configured yet.");
    const response = await fetch(config.url.replace(/\/$/, "") + "/rest/v1/rpc/" + name, { method: "POST", headers: { apikey: config.anonKey, Authorization: "Bearer " + config.anonKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const text = await response.text();
    if (!response.ok) throw new Error(response.status >= 500 ? "The service is temporarily unavailable." : "Please check your information and try again.");
    return text ? JSON.parse(text) : null;
  }

  function nextMonday() { const date = new Date(); const add = (8 - (date.getDay() || 7)) % 7 || 7; date.setDate(date.getDate() + add); return date.toISOString().slice(0, 10); }
  function showMessage(text, success = false) { message.textContent = text; message.className = success ? "success" : ""; }
  function setBusy(busy) { document.querySelectorAll("button").forEach((button) => { button.disabled = busy; }); }
})();
