import fs from 'node:fs/promises';
import path from 'node:path';
const files = [
  ['src/renderer/index.html', 'dist/renderer/index.html'],
  ['src/renderer/styles/app.css', 'dist/renderer/styles/app.css'],
  ['src/renderer/styles/login.css', 'dist/renderer/styles/login.css'],
  ['src/renderer/styles/cloud.css', 'dist/renderer/styles/cloud.css'],
  ['src/renderer/styles/schedule-editor.css', 'dist/renderer/styles/schedule-editor.css'],
  ['src/renderer/assets/habaneros-logo.png', 'dist/renderer/assets/habaneros-logo.png']
];
for (const [from, to] of files) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await copyWithRetry(from, to);
}

async function copyWithRetry(from, to, attempts = 8) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await fs.copyFile(from, to);
      return;
    } catch (error) {
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(error?.code) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
}
