import { CloudConfig } from "../../shared/types";

export async function callSupabaseRpc<T>(config: CloudConfig, functionName: string, body: Record<string, unknown>): Promise<T> {
  if (!config.supabaseUrl || !config.anonKey) throw new Error("Supabase URL and anon key are required.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(config.supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/" + functionName, {
      method: "POST",
      headers: { apikey: config.anonKey, Authorization: "Bearer " + config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      let message = "Supabase request failed (" + response.status + ").";
      try { message = (JSON.parse(text) as { message?: string }).message || message; } catch { /* Keep the status message. */ }
      throw new Error(message);
    }
    return (text ? JSON.parse(text) : null) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Supabase did not respond. Check your internet connection.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
