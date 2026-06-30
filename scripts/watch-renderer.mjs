import fs from "node:fs";
import { spawn } from "node:child_process";

const watchedFiles = [
  "src/renderer/app.ts",
  "src/renderer/global.d.ts",
  "src/renderer/modules/availability/availability.ts",
  "src/renderer/modules/employees/employees.ts",
  "src/renderer/modules/reports/reports.ts",
  "src/renderer/modules/scheduling/scheduler.ts",
  "src/renderer/modules/settings/settings.ts",
  "src/renderer/shared/dom.ts",
  "src/renderer/shared/ids.ts",
  "src/shared/defaults.ts",
  "src/shared/time.ts",
  "src/shared/types.ts"
];

let running = false;
let queued = false;

function build() {
  if (running) {
    queued = true;
    return;
  }

  running = true;
  const child = spawn(process.execPath, ["scripts/build-renderer.mjs"], { stdio: "inherit", shell: false });
  child.on("exit", () => {
    running = false;
    if (queued) {
      queued = false;
      build();
    }
  });
}

build();
for (const file of watchedFiles) {
  fs.watchFile(file, { interval: 500 }, build);
}

process.stdin.resume();
