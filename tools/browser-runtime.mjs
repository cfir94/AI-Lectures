/* Preparation and QA only. Uses an installed Playwright without adding a
   dependency to the standalone deck or its build. */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const roots = [process.env.LECTURE_NODE_MODULES,
  process.env.USERPROFILE && join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"),
  "/opt/node22/lib/node_modules"].filter(Boolean);
let runtime;
for (const root of roots) {
  try { runtime = require(join(root, "playwright")); break; } catch {}
}
if (!runtime) throw new Error("Set LECTURE_NODE_MODULES to the directory containing Playwright.");
export const chromium = runtime.chromium;
export const browserOptions = process.env.LECTURE_BROWSER
  ? {executablePath: process.env.LECTURE_BROWSER}
  : existsSync("/opt/pw-browsers/chromium") ? {executablePath: "/opt/pw-browsers/chromium"}
  : process.platform === "win32" ? {channel: "chrome"} : {};
