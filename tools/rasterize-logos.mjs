/* One-off preparation, deliberately not part of `npm run build`.
   A logo folder arrives as a mix of PNG and SVG. SVG must never reach the
   document — it can carry script, and the schema rejects it — so every mark is
   redrawn in a headless browser onto a canvas at one shared height and comes
   out as a transparent WebP data URI, the same format the editor's own upload
   produces. The result is a manifest ready to embed.

   usage: node tools/rasterize-logos.mjs <source-dir> <manifest.json> [height] */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const [source, manifestPath, heightArg] = process.argv.slice(2);
if (!source || !manifestPath) {
  console.error("usage: node tools/rasterize-logos.mjs <source-dir> <manifest.json> [height]");
  process.exit(1);
}
const height = Number(heightArg) || 180;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<body></body>");

/* A folder can hold the same name as both an SVG and a PNG and mean two
   different drawings — a square mark in one, a full wordmark in the other. The
   source format stays in the name so neither silently overwrites the other. */
const slug = (name) =>
  `${name
    .replace(/\.[^.]+$/, "")
    .replace(/\s*-\s*zonalogo\.com$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${/\.svg$/i.test(name) ? "svg" : "png"}`;

const manifest = {};
for (const file of (await readdir(source)).filter((f) => /\.(svg|png)$/i.test(f))) {
  const data = await readFile(path.join(source, file));
  const uri = `data:image/${/\.svg$/i.test(file) ? "svg+xml" : "png"};base64,${data.toString("base64")}`;
  const drawn = await page.evaluate(
    async ([src, h]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const width = Math.max(1, Math.round((img.naturalWidth / img.naturalHeight) * h));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, width, h);
      return { width, picture: canvas.toDataURL("image/webp", 0.9) };
    },
    [uri, height],
  );
  if (!drawn.picture.startsWith("data:image/webp;base64,"))
    throw new Error(`${file}: the browser did not produce a WebP`);
  manifest[slug(file)] = { width: drawn.width, height, picture: drawn.picture };
  console.log(
    `${slug(file).padEnd(38)} ${String(drawn.width).padStart(4)}x${height}  ${(drawn.picture.length / 1024).toFixed(1)} KB`,
  );
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\n${Object.keys(manifest).length} marks → ${manifestPath}`);
await browser.close();
