import http from "node:http";
import { readFile } from "node:fs/promises";
const port = Number(process.env.PORT || 4173);
const file = new URL("../dist/index.html", import.meta.url);
const server = http.createServer(async (req, res) => {
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
