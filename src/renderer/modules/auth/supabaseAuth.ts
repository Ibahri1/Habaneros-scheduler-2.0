import { AppSettings, AppState, CloudConfig } from "../../../shared/types";

const AUTH_SESSION_KEY = "habaneros-auth-session";

export interface SupabaseAuthUser {
  id: string;
  email: string;
}

export interface SupabaseAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: SupabaseAuthUser;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface WorkspaceCloudSnapshot {
  state?: AppState;
  settings?: AppSettings;
  cloudConfig?: CloudConfig;
}

interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: { id?: string; email?: string };
  error_description?: string;
  msg?: string;
  message?: string;
}

interface WorkspaceRow {
  workspace_id: string;
  name: string;
  slug: string;
  role: string;
}

interface SnapshotRow {
  state_data: WorkspaceCloudSnapshot;
  updated_at: string;
}

export function loadStoredAuthSession(): SupabaseAuthSession | null {
  const value = localStorage.getItem(AUTH_SESSION_KEY);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as SupabaseAuthSession;
    return parsed.accessToken && parsed.refreshToken && parsed.user?.email ? parsed : null;
  } catch {
    return null;
  }
}

export function storeAuthSession(session: SupabaseAuthSession): void {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

export function hasStoredAuthSession(): boolean {
  return Boolean(loadStoredAuthSession());
}

export async function signInWithPassword(config: CloudConfig, email: string, password: string): Promise<SupabaseAuthSession> {
  const response = await authFetch<AuthResponse>(config, "/auth/v1/token?grant_type=password", { email, password });
  return sessionFromResponse(response);
}

export async function createAccount(config: CloudConfig, email: string, password: string): Promise<SupabaseAuthSession> {
  const response = await authFetch<AuthResponse>(config, "/auth/v1/signup", { email, password });
  return sessionFromResponse(response);
}

export async function sendPasswordReset(config: CloudConfig, email: string): Promise<void> {
  await authFetch<unknown>(config, "/auth/v1/recover", { email });
}

export async function refreshAuthSession(config: CloudConfig, session: SupabaseAuthSession): Promise<SupabaseAuthSession> {
  if (Date.now() < session.expiresAt - 60_000) return session;
  const response = await authFetch<AuthResponse>(config, "/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refreshToken });
  return sessionFromResponse(response);
}

export async function signOut(config: CloudConfig, session: SupabaseAuthSession): Promise<void> {
  await fetch(cleanUrl(config) + "/auth/v1/logout", {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: "Bearer " + session.accessToken
    }
  }).catch(() => undefined);
  clearAuthSession();
}

export async function getOrCreateDefaultWorkspace(config: CloudConfig, session: SupabaseAuthSession): Promise<WorkspaceSummary> {
  const rows = await rpc<WorkspaceRow[]>(config, session, "auth_get_or_create_default_workspace", { p_name: "Habaneros" });
  const row = rows[0];
  if (!row) throw new Error("No workspace was returned for this account.");
  return { id: row.workspace_id, name: row.name, slug: row.slug, role: row.role };
}

export async function loadWorkspaceSnapshot(config: CloudConfig, session: SupabaseAuthSession, workspace: WorkspaceSummary): Promise<WorkspaceCloudSnapshot | null> {
  const rows = await rpc<SnapshotRow[]>(config, session, "auth_load_workspace_app_state", { p_workspace_id: workspace.id });
  return rows[0]?.state_data || null;
}

export async function saveWorkspaceSnapshot(config: CloudConfig, session: SupabaseAuthSession, workspace: WorkspaceSummary, snapshot: WorkspaceCloudSnapshot): Promise<void> {
  await rpc<unknown>(config, session, "auth_save_workspace_app_state", { p_workspace_id: workspace.id, p_state_data: snapshot });
}

async function authFetch<T>(config: CloudConfig, path: string, body: Record<string, unknown>): Promise<T> {
  if (!config.supabaseUrl || !config.anonKey) throw new Error("Supabase URL and public anon key are required.");
  const response = await fetch(cleanUrl(config) + path, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: "Bearer " + config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return parseResponse<T>(response);
}

async function rpc<T>(config: CloudConfig, session: SupabaseAuthSession, functionName: string, body: Record<string, unknown>): Promise<T> {
  if (!config.supabaseUrl || !config.anonKey) throw new Error("Supabase URL and public anon key are required.");
  const response = await fetch(cleanUrl(config) + "/rest/v1/rpc/" + functionName, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: "Bearer " + session.accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const parsed = text ? JSON.parse(text) as AuthResponse : {};
  if (!response.ok) {
    throw new Error(parsed.error_description || parsed.msg || parsed.message || "Supabase request failed.");
  }
  return parsed as T;
}

function sessionFromResponse(response: AuthResponse): SupabaseAuthSession {
  if (!response.access_token || !response.refresh_token || !response.user?.id || !response.user.email) {
    throw new Error(response.message || "Supabase did not return a complete login session.");
  }
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: response.expires_at ? response.expires_at * 1000 : Date.now() + Math.max(1, response.expires_in || 3600) * 1000,
    user: { id: response.user.id, email: response.user.email }
  };
}

function cleanUrl(config: CloudConfig): string {
  return config.supabaseUrl.trim().replace(/\/$/, "");
}
