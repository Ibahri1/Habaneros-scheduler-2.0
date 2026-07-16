import { contextBridge, ipcRenderer } from "electron";
import { AppSettings, AppState, AvailabilitySubmission, CloudConfig, CloudResult, DayName, ExportPayload, ShiftAvailabilityMap, SubmissionStatus, Worker } from "../shared/types";

const api = {
  loadState: (): Promise<AppState> => ipcRenderer.invoke("scheduler:load"),
  saveState: (state: AppState): Promise<AppState> => ipcRenderer.invoke("scheduler:save", state),
  loadSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke("settings:save", settings),
  setDirty: (isDirty: boolean): Promise<boolean> => ipcRenderer.invoke("app:setDirty", isDirty),
  restoreFocus: (): Promise<void> => ipcRenderer.invoke("app:restoreFocus"),
  showMessage: (message: string): Promise<void> => ipcRenderer.invoke("app:showMessage", message),
  showConfirmation: (message: string, options?: { confirmLabel?: string; cancelLabel?: string }): Promise<boolean> => ipcRenderer.invoke("app:showConfirmation", { message, ...options }),
  confirmClose: (): Promise<boolean> => ipcRenderer.invoke("app:confirmClose"),
  printSchedule: (html: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke("schedule:print", html),
  exportData: (payload: ExportPayload): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke("data:export", payload),
  importData: (): Promise<{ canceled: boolean; fileName?: string; content?: string }> => ipcRenderer.invoke("data:import"),
  loadCloudConfig: (): Promise<CloudConfig> => ipcRenderer.invoke("cloud:config:load"),
  saveCloudConfig: (config: CloudConfig): Promise<CloudConfig> => ipcRenderer.invoke("cloud:config:save", config),
  testCloudConfig: (config: CloudConfig): Promise<CloudResult> => ipcRenderer.invoke("cloud:test", config),
  syncCloudEmployees: (workers: Worker[]): Promise<CloudResult> => ipcRenderer.invoke("cloud:employees:sync", workers),
  listAvailabilitySubmissions: (status: SubmissionStatus | null): Promise<AvailabilitySubmission[]> => ipcRenderer.invoke("cloud:submissions:list", status),
  updateAvailabilitySubmission: (input: { id: string; availableDays: DayName[]; shiftAvailability: ShiftAvailabilityMap; status: SubmissionStatus; managerNotes: string }): Promise<CloudResult> => ipcRenderer.invoke("cloud:submissions:update", input),
  deleteAvailabilitySubmission: (id: string): Promise<CloudResult> => ipcRenderer.invoke("cloud:submissions:delete", { id })
};

contextBridge.exposeInMainWorld("habanerosDesktop", api);
export type HabanerosDesktopApi = typeof api;
