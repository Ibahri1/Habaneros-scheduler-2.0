import path from "node:path";
import { app } from "electron";

export function getDataDirectory(): string {
  return app.getPath("userData");
}

export function getDataFilePath(): string {
  return path.join(getDataDirectory(), "habaneros-scheduler-data.json");
}

export function getWindowSettingsPath(): string {
  return path.join(getDataDirectory(), "window-settings.json");
}

export function closeDatabase(): void {
  // JSON storage does not keep open handles. This keeps the shutdown contract stable
  // for a future SQLite-backed repository.
}
