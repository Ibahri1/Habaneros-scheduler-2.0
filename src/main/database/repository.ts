import fs from "node:fs";
import path from "node:path";
import { appStateSchema, appSettingsSchema } from "../../shared/validation";
import { AppSettings, AppState } from "../../shared/types";
import { defaultAppState, defaultSettings, normalizeWorker } from "../../shared/defaults";
import { nextMonday } from "../../shared/time";
import { getDataDirectory, getDataFilePath } from "./database";

interface DataFile {
  state: AppState;
  settings: AppSettings;
  savedAt: string;
}

function ensureDataDirectory(): void {
  fs.mkdirSync(getDataDirectory(), { recursive: true });
}

function defaultDataFile(): DataFile {
  const state = defaultAppState();
  state.rules.weekStart = nextMonday();
  return { state, settings: defaultSettings(), savedAt: new Date().toISOString() };
}

function readDataFile(): DataFile {
  ensureDataDirectory();
  const file = getDataFilePath();
  if (!fs.existsSync(file)) return defaultDataFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<DataFile>;
    const fallback = defaultDataFile();
    const rawState = { ...fallback.state, ...(parsed.state || {}) } as AppState;
    rawState.rules = { ...fallback.state.rules, ...(rawState.rules || {}) };
    if (!rawState.rules.weekStart) rawState.rules.weekStart = nextMonday();
    rawState.workers = (rawState.workers || []).map((worker) => normalizeWorker(worker, rawState.rules));
    const state = appStateSchema.parse(rawState) as AppState;
    const settings = appSettingsSchema.parse({ ...fallback.settings, ...(parsed.settings || {}) }) as AppSettings;
    return { state, settings, savedAt: parsed.savedAt || fallback.savedAt };
  } catch (error) {
    const backupPath = path.join(getDataDirectory(), "habaneros-scheduler-data.invalid-" + Date.now() + ".json");
    fs.copyFileSync(file, backupPath);
    return defaultDataFile();
  }
}

function writeDataFile(data: DataFile): void {
  ensureDataDirectory();
  const file = getDataFilePath();
  const tempFile = file + ".tmp";
  const payload = JSON.stringify({ ...data, savedAt: new Date().toISOString() }, null, 2);
  fs.writeFileSync(tempFile, payload, "utf8");
  fs.renameSync(tempFile, file);
}

export class SchedulerRepository {
  loadState(): AppState {
    return readDataFile().state;
  }

  saveState(input: AppState): AppState {
    const data = readDataFile();
    const normalizedInput = { ...input, workers: input.workers.map((worker) => normalizeWorker(worker, input.rules)) };
    const state = appStateSchema.parse(normalizedInput) as AppState;
    writeDataFile({ ...data, state });
    return this.loadState();
  }

  loadSettings(): AppSettings {
    return readDataFile().settings;
  }

  saveSettings(input: AppSettings): AppSettings {
    const data = readDataFile();
    const settings = appSettingsSchema.parse(input) as AppSettings;
    writeDataFile({ ...data, settings });
    return settings;
  }
}
