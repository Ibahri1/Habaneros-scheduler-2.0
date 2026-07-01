export async function rpc(name, body) {
  const config = window.HABANEROS_SUPABASE || {};
  if (!config.url || !config.anonKey || config.url.includes("YOUR-PROJECT")) throw new Error("The availability form has not been configured yet.");
  const response = await fetch(config.url.replace(/\/$/, "") + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { apikey: config.anonKey, Authorization: "Bearer " + config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) {
    let message = "The availability service returned an error.";
    try { message = JSON.parse(text).message || message; } catch { if (text) message = text; }
    throw new Error(message);
  }
  return text ? JSON.parse(text) : null;
}
