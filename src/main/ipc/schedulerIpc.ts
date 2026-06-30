import { BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { SchedulerRepository } from "../database/repository";
import { appSettingsSchema, appStateSchema } from "../../shared/validation";
import { ExportPayload } from "../../shared/types";

const repository = new SchedulerRepository();
let dirtyState = false;

export function registerSchedulerIpc(): void {
  ipcMain.handle("scheduler:load", () => repository.loadState());
  ipcMain.handle("scheduler:save", (_event, state) => {
    const parsed = appStateSchema.parse(state);
    dirtyState = false;
    return repository.saveState(parsed as never);
  });
  ipcMain.handle("settings:load", () => repository.loadSettings());
  ipcMain.handle("settings:save", (_event, settings) => {
    const parsed = appSettingsSchema.parse(settings);
    return repository.saveSettings(parsed as never);
  });
  ipcMain.handle("app:setDirty", (_event, isDirty: boolean) => {
    dirtyState = Boolean(isDirty);
    return dirtyState;
  });
  ipcMain.handle("app:confirmClose", async () => {
    if (!dirtyState) return true;
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const options = { type: "warning" as const, buttons: ["Stay", "Close without saving"], defaultId: 0, cancelId: 0, title: "Unsaved changes", message: "You have unsaved scheduling changes.", detail: "Close the app without saving?" };
    const result = focusedWindow ? await dialog.showMessageBox(focusedWindow, options) : await dialog.showMessageBox(options);
    return result.response === 1;
  });
  ipcMain.handle("schedule:print", async (_event, html: string) => printSchedule(html));
  ipcMain.handle("data:export", async (_event, payload: ExportPayload) => exportData(payload));
  ipcMain.handle("data:import", async () => importData());
}

async function printSchedule(html: string): Promise<{ success: boolean; message: string }> {
  if (!html.trim()) return { success: false, message: "Generate a schedule before printing." };
  const printWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  try {
    await printWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    await new Promise<void>((resolve, reject) => {
      printWindow.webContents.print({ printBackground: true }, (success, failureReason) => success ? resolve() : reject(new Error(failureReason || "Printing was canceled.")));
    });
    return { success: true, message: "Print job sent." };
  } catch (error) {
    console.error(error);
    return { success: false, message: error instanceof Error ? error.message : "Unable to print schedule." };
  } finally {
    printWindow.close();
  }
}

async function exportData(payload: ExportPayload): Promise<{ success: boolean; message: string }> {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  const extension = payload.format === "csv" ? "csv" : "json";
  const options = { title: "Export Habaneros Scheduler Data", defaultPath: "habaneros-scheduler-export." + extension, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] };
  const result = focusedWindow ? await dialog.showSaveDialog(focusedWindow, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { success: false, message: "Export canceled." };
  const content = payload.format === "csv" ? toCsv(payload) : JSON.stringify({ state: payload.state, settings: payload.settings, exportedAt: new Date().toISOString() }, null, 2);
  await fs.writeFile(result.filePath, content, "utf8");
  return { success: true, message: "Exported to " + result.filePath };
}

async function importData(): Promise<{ canceled: boolean; fileName?: string; content?: string }> {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  const options = { title: "Import Habaneros Scheduler Data", properties: ["openFile" as const], filters: [{ name: "Supported files", extensions: ["json", "csv"] }, { name: "JSON", extensions: ["json"] }, { name: "CSV", extensions: ["csv"] }] };
  const result = focusedWindow ? await dialog.showOpenDialog(focusedWindow, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const fileName = result.filePaths[0];
  const content = await fs.readFile(fileName, "utf8");
  return { canceled: false, fileName: path.basename(fileName), content };
}

function toCsv(payload: ExportPayload): string {
  const rows = [["Name", "Position", "Manager", "Can Open", "Can Close", "Active", "Max Weekly Hours", "Preferred Weekly Hours", "Available Days", "Notes"]];
  for (const worker of payload.state.workers) {
    rows.push([worker.name, worker.position, worker.isManager ? "Yes" : "No", worker.canOpen ? "Yes" : "No", worker.canClose ? "Yes" : "No", worker.active ? "Yes" : "No", String(worker.maxWeeklyHours), String(worker.preferredWeeklyHours), worker.availability.join(";"), worker.notes]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string): string {
  return '"' + String(value).replaceAll('"', '""') + '"';
}
