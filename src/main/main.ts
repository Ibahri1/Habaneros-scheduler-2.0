import path from "node:path";
import { app, BrowserWindow, dialog, nativeTheme } from "electron";
import { closeDatabase, getDataFilePath } from "./database/database";
import { registerSchedulerIpc } from "./ipc/schedulerIpc";
import { windowStore } from "./settings/windowStore";
let mainWindow: BrowserWindow | null = null;
let forceClose = false;
function createMainWindow(): void {
  const bounds = windowStore.get("windowBounds");
  mainWindow = new BrowserWindow({ title: "Habaneros Scheduler", width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y, minWidth: 1040, minHeight: 700, show: false, icon: path.join(__dirname, "../../build/icon.ico"), webPreferences: { preload: path.join(__dirname, "../preload/preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", async (event) => { if (forceClose || !mainWindow) return; event.preventDefault(); const canClose = await mainWindow.webContents.executeJavaScript("window.habanerosDesktop.confirmClose()", true).catch(() => true); if (canClose) { forceClose = true; mainWindow.close(); } });
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.on("resize", saveWindowBounds);
  mainWindow.on("move", saveWindowBounds);
  mainWindow.webContents.on("render-process-gone", (_event, details) => { dialog.showErrorBox("Application error", "The scheduler window stopped unexpectedly: " + details.reason); });
  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}
function saveWindowBounds(): void { if (!mainWindow) return; windowStore.set("windowBounds", mainWindow.getBounds()); }
app.setName("Habaneros Scheduler");
app.whenReady().then(() => { nativeTheme.themeSource = "system"; registerSchedulerIpc(); createMainWindow(); console.log("Data file: " + getDataFilePath()); app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); }); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { forceClose = true; closeDatabase(); });
