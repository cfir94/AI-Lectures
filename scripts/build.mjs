import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "../src/core.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFile(path.resolve(root, file), "utf8");
/* One stage, more than one talk. The sources are shared; the document is an
   argument, so a second lecture is a second content file and a second file in
   `dist`, never an edit to the first one. Called with nothing it still builds
   the original lecture exactly as it did. */
const [, , contentArg, outputArg] = process.argv;
const contentFile = contentArg || "src/content.json";
const outputFile = outputArg || "dist/index.html";
const [shell, css, core, app, data] = await Promise.all(
  ["src/shell.html", "src/styles.css", "src/core.js", "src/app.js", contentFile].map(read),
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
await mkdir(path.dirname(path.resolve(root, outputFile)), { recursive: true });
await writeFile(path.resolve(root, outputFile), output);
console.log(
  `Built ${outputFile} from ${contentFile} — ${(Buffer.byteLength(output) / 1024).toFixed(1)} KB, self-contained, no external dependencies.`,
);
