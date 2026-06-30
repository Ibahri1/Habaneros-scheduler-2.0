import { contextBridge, ipcRenderer } from "electron";
import { AppSettings, AppState, ExportPayload } from "../shared/types";

const api = {
  loadState: (): Promise<AppState> => ipcRenderer.invoke("scheduler:load"),
  saveState: (state: AppState): Promise<AppState> => ipcRenderer.invoke("scheduler:save", state),
  loadSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke("settings:save", settings),
  setDirty: (isDirty: boolean): Promise<boolean> => ipcRenderer.invoke("app:setDirty", isDirty),
  confirmClose: (): Promise<boolean> => ipcRenderer.invoke("app:confirmClose"),
  printSchedule: (html: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke("schedule:print", html),
  exportData: (payload: ExportPayload): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke("data:export", payload),
  importData: (): Promise<{ canceled: boolean; fileName?: string; content?: string }> => ipcRenderer.invoke("data:import")
};

contextBridge.exposeInMainWorld("habanerosDesktop", api);
export type HabanerosDesktopApi = typeof api;
