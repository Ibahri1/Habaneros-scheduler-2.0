import { BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { CloudConfigRepository, SchedulerRepository } from "../database/repository";
import { appSettingsSchema, appStateSchema, cloudConfigSchema, submissionDeleteSchema, submissionStatusSchema, submissionUpdateSchema } from "../../shared/validation";
import { CloudConfig, ExportPayload, Worker } from "../../shared/types";
import { AvailabilityService } from "../cloud/availabilityService";

const repository = new SchedulerRepository();
const cloudConfigRepository = new CloudConfigRepository();
const availabilityService = new AvailabilityService();
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
  ipcMain.handle("app:restoreFocus", (event) => focusWindow(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle("app:showMessage", async (event, input: unknown) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const message = dialogMessage(input);
    try {
      const options = { type: "info" as const, buttons: ["OK"], defaultId: 0, cancelId: 0, title: "Habaneros Scheduler", message };
      if (ownerWindow) await dialog.showMessageBox(ownerWindow, options); else await dialog.showMessageBox(options);
    } finally {
      focusWindow(ownerWindow);
    }
  });
  ipcMain.handle("app:showConfirmation", async (event, input: unknown) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const message = dialogMessage(input);
    try {
      const options = { type: "question" as const, buttons: ["Cancel", "Confirm"], defaultId: 0, cancelId: 0, title: "Habaneros Scheduler", message };
      const result = ownerWindow ? await dialog.showMessageBox(ownerWindow, options) : await dialog.showMessageBox(options);
      return result.response === 1;
    } finally {
      focusWindow(ownerWindow);
    }
  });
  ipcMain.handle("app:confirmClose", async () => {
    if (!dirtyState) return true;
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const options = { type: "warning" as const, buttons: ["Stay", "Close without saving"], defaultId: 0, cancelId: 0, title: "Unsaved changes", message: "You have unsaved scheduling changes.", detail: "Close the app without saving?" };
    const result = focusedWindow ? await dialog.showMessageBox(focusedWindow, options) : await dialog.showMessageBox(options);
    const canClose = result.response === 1;
    if (!canClose) focusWindow(focusedWindow);
    return canClose;
  });
  ipcMain.handle("schedule:print", async (_event, html: string) => printSchedule(html));
  ipcMain.handle("data:export", async (_event, payload: ExportPayload) => exportData(payload));
  ipcMain.handle("data:import", async () => importData());
  ipcMain.handle("cloud:config:load", () => cloudConfigRepository.load());
  ipcMain.handle("cloud:config:save", (_event, input) => cloudConfigRepository.save(cloudConfigSchema.parse(input) as CloudConfig));
  ipcMain.handle("cloud:test", async (_event, input) => {
    const config = cloudConfigSchema.parse(input) as CloudConfig;
    await availabilityService.test(config);
    return { success: true, message: "Connected to Supabase." };
  });
  ipcMain.handle("cloud:employees:sync", async (_event, workers: Worker[]) => {
    const parsed = appStateSchema.shape.workers.parse(workers) as Worker[];
    const count = await availabilityService.syncEmployees(cloudConfigRepository.load(), parsed);
    return { success: true, message: count + " employee" + (count === 1 ? "" : "s") + " synced." };
  });
  ipcMain.handle("cloud:submissions:list", (_event, status) => availabilityService.list(cloudConfigRepository.load(), status === null ? null : submissionStatusSchema.parse(status)));
  ipcMain.handle("cloud:submissions:update", async (_event, input) => {
    const update = submissionUpdateSchema.parse(input);
    await availabilityService.update(cloudConfigRepository.load(), update.id, update.availableDays, update.status, update.managerNotes);
    return { success: true, message: "Submission updated." };
  });
  ipcMain.handle("cloud:submissions:delete", async (_event, input) => {
    const deletion = submissionDeleteSchema.parse(input);
    await availabilityService.delete(cloudConfigRepository.load(), deletion.id);
    return { success: true, message: "Submission permanently deleted." };
  });
}

async function printSchedule(html: string): Promise<{ success: boolean; message: string }> {
  if (!html.trim()) return { success: false, message: "Generate a schedule before printing." };
  const ownerWindow = BrowserWindow.getFocusedWindow();
  const printWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  try {
    await printWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    await new Promise<void>((resolve, reject) => {
      printWindow.webContents.print({ printBackground: true, landscape: true, margins: { marginType: "none" } }, (success, failureReason) => success ? resolve() : reject(new Error(failureReason || "Printing was canceled.")));
    });
    return { success: true, message: "Print job sent." };
  } catch (error) {
    console.error(error);
    return { success: false, message: error instanceof Error ? error.message : "Unable to print schedule." };
  } finally {
    printWindow.close();
    focusWindow(ownerWindow);
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

function focusWindow(window: BrowserWindow | null): void {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  window.webContents.focus();
}

function dialogMessage(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) return "An unexpected message was requested.";
  return input.slice(0, 4000);
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
  const rows = [["Name", "Employee Code", "Position", "Lead", "No Hour Limits", "Can Open", "Can Close", "Active", "Max Weekly Hours", "Preferred Weekly Hours", "Available Days", "Notes"]];
  for (const worker of payload.state.workers) {
    rows.push([worker.name, worker.employeeCode, worker.position, worker.isManager ? "Yes" : "No", worker.noHourLimits ? "Yes" : "No", worker.canOpen ? "Yes" : "No", worker.canClose ? "Yes" : "No", worker.active ? "Yes" : "No", String(worker.maxWeeklyHours), String(worker.preferredWeeklyHours), worker.availability.join(";"), worker.notes]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string): string {
  return '"' + String(value).replaceAll('"', '""') + '"';
}
