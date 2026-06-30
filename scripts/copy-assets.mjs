import fs from 'node:fs/promises';
import path from 'node:path';
const files = [
  ['src/renderer/index.html', 'dist/renderer/index.html'],
  ['src/renderer/styles/app.css', 'dist/renderer/styles/app.css']
];
for (const [from, to] of files) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}
