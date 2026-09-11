import http from "node:http";
import { readFile, stat, realpath } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../src/core.js";
const port = Number(process.env.PORT || 4173);
const file = new URL("../dist/index.html", import.meta.url);
const directory = fileURLToPath(new URL("../dist/", import.meta.url));
const types = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg" };
const server = http.createServer(async (req, res) => {
  // Local presenter videos are intentionally outside Git and the HTML bundle.
  // Serve only validated descendants of videos/, including seekable byte ranges.
  let requestPath;
  try { requestPath = decodeURIComponent((req.url || "").split("?")[0]); }
  catch { res.writeHead(400).end(); return; }
  if (requestPath.startsWith("/videos/")) {
    const relative = requestPath.slice(1);
    if (globalThis.LectureCore.videoEmbed(relative)?.kind !== "file" || !["GET", "HEAD"].includes(req.method)) {
      res.writeHead(404).end(); return;
    }
    try {
      const videoRoot = await realpath(path.join(directory, "videos"));
      const filename = await realpath(path.join(directory, relative));
      const child = path.relative(videoRoot, filename);
      if (child.startsWith("..") || path.isAbsolute(child)) { res.writeHead(404).end(); return; }
      const info = await stat(filename);
      if (!info.isFile()) { res.writeHead(404).end(); return; }
      let start = 0, end = info.size - 1;
      if (req.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!range || (!range[1] && !range[2])) { res.writeHead(416, {"Content-Range": `bytes */${info.size}`}).end(); return; }
        if (!range[1]) start = Math.max(0, info.size - Number(range[2]));
        else { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
          res.writeHead(416, {"Content-Range": `bytes */${info.size}`}).end(); return;
        }
      }
      res.writeHead(req.headers.range ? 206 : 200, {
        "Content-Type": types[path.extname(filename).slice(1).toLowerCase()],
        "Accept-Ranges": "bytes", "Content-Length": end - start + 1,
        ...(req.headers.range ? {"Content-Range": `bytes ${start}-${end}/${info.size}`} : {}),
      });
      if (req.method === "HEAD") res.end();
      else createReadStream(filename, {start, end}).on("error", () => res.destroy()).pipe(res);
    } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
    return;
  }
  if (!["/", "/index.html"].includes((req.url || "").split("?")[0])) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    const html = await readFile(file);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(html);
  } catch {
    res.writeHead(503);
    res.end("Run npm run build first.");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Local: http://127.0.0.1:${port}`),
);
