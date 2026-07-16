import fs from "node:fs";
import path from "node:path";
import { appStateSchema, appSettingsSchema, cloudConfigSchema } from "../../shared/validation";
import { AppSettings, AppState, CloudConfig } from "../../shared/types";
import { defaultAppState, defaultSettings, normalizeWorker } from "../../shared/defaults";
import { nextMonday } from "../../shared/time";
import { normalizeSettings } from "../../shared/availabilityDeadline";
import { getCloudSettingsPath, getDataDirectory, getDataFilePath } from "./database";

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
    const settings = appSettingsSchema.parse(normalizeSettings(parsed.settings)) as AppSettings;
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
    const settings = appSettingsSchema.parse(normalizeSettings(input)) as AppSettings;
    writeDataFile({ ...data, settings });
    return settings;
  }
}

export class CloudConfigRepository {
  load(): CloudConfig {
    ensureDataDirectory();
    const file = getCloudSettingsPath();
    if (!fs.existsSync(file)) return { supabaseUrl: "", anonKey: "" };
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      const config = cloudConfigSchema.parse(raw) as CloudConfig;
      if (Object.keys(raw).some((key) => key !== "supabaseUrl" && key !== "anonKey")) this.save(config);
      return config;
    } catch {
      return { supabaseUrl: "", anonKey: "" };
    }
  }

  save(input: CloudConfig): CloudConfig {
    ensureDataDirectory();
    const config = cloudConfigSchema.parse(input) as CloudConfig;
    const file = getCloudSettingsPath();
    const tempFile = file + ".tmp";
    fs.writeFileSync(tempFile, JSON.stringify(config, null, 2), "utf8");
    fs.renameSync(tempFile, file);
    return config;
  }
}
