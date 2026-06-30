import fs from 'node:fs';
import { spawn } from 'node:child_process';

const copy = () => {
  const child = spawn(process.execPath, ['scripts/copy-assets.mjs'], { stdio: 'inherit', shell: false });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error('Asset copy failed with exit code', code);
  });
};

copy();
for (const file of ['src/renderer/index.html', 'src/renderer/styles/app.css']) {
  fs.watchFile(file, { interval: 500 }, copy);
}

process.stdin.resume();
