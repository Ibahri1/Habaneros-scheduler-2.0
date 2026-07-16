import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist/renderer");
const port = Number(process.env.PORT) || 4173;
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png" };

http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
  const filePath = path.resolve(root, requestPath === "/" ? "index.html" : "." + requestPath);
  if (!filePath.startsWith(root + path.sep) && filePath !== path.join(root, "index.html")) { response.writeHead(403).end("Forbidden"); return; }
  fs.readFile(filePath, (error, content) => {
    if (error) { response.writeHead(404).end("Not found"); return; }
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(content);
  });
}).listen(port, "127.0.0.1", () => console.log(`Habaneros Scheduler web version: http://127.0.0.1:${port}`));
