import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "../src/core.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFile(path.join(root, file), "utf8");
const [shell, css, core, app, data] = await Promise.all(
  [
    "src/shell.html",
    "src/styles.css",
    "src/core.js",
    "src/app.js",
    "src/content.json",
  ].map(read),
);
/* The revision is the content's own fingerprint, so it changes exactly when the
   lecture changes and never because someone forgot to bump a number. */
const { createHash } = await import("node:crypto");
const parsed = JSON.parse(data);
delete parsed.revision;
parsed.revision = createHash("sha256")
  .update(JSON.stringify(parsed))
  .digest("hex")
  .slice(0, 12);
const content = globalThis.LectureCore.validate(parsed);
const output = shell
  .replace("/*__CSS__*/", () => css)
  .replace("__DECK_JSON__", () => globalThis.LectureCore.safeJSON(content))
  .replace("/*__CORE__*/", () => core)
  .replace("/*__APP__*/", () => app);
if (output.includes("/*__") || output.includes("__DECK_JSON__"))
  throw new Error("Unresolved build marker");
await mkdir(path.join(root, "dist"), { recursive: true });
await writeFile(path.join(root, "dist/index.html"), output);
console.log(
  `Built dist/index.html — ${(Buffer.byteLength(output) / 1024).toFixed(1)} KB, self-contained, no external dependencies.`,
);
