/* One-off preparation, deliberately not part of `npm run build`.
   A diagram is HTML rather than a drawing file, so it is set in the same font
   the stage uses and its Hebrew comes out right; the browser then photographs
   it into the WebP data URI the document can hold. SVG must never reach the
   document, and a diagram typed by hand into the schema would be unreadable.

   usage: node tools/make-diagrams.mjs <out.json> [scale] */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./browser-runtime.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const [out, scaleArg] = process.argv.slice(2);
if (!out) {
  console.error("usage: node tools/make-diagrams.mjs <out.json> [scale]");
  process.exit(1);
}
const scale = Number(scaleArg) || 1;
const source = path.join(here, "diagrams");
const browser = await chromium.launch();
const manifest = {};
for (const file of (await readdir(source)).filter((f) => f.endsWith(".html"))) {
  /* The sheet declares its own width; a default 1280 viewport would squeeze the
     columns and crop them out of the shot. */
  const page = await browser.newPage({
    deviceScaleFactor: scale,
    viewport: { width: 2560, height: 1600 },
  });
  await page.setContent(await readFile(path.join(source, file), "utf8"));
  await page.waitForTimeout(150);
  const shot = page.locator("#shot");
  const box = await shot.boundingBox();
  /* omitBackground keeps the sheet transparent, so the diagram sits on the
     slide's own surface instead of on a white rectangle. */
  const png = await shot.screenshot({ omitBackground: true, type: "png" });
  const picture = await page.evaluate(
    async ([data]) => {
      const img = new Image();
      img.src = data;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      return canvas.toDataURL("image/webp", 0.92);
    },
    [`data:image/png;base64,${png.toString("base64")}`],
  );
  if (!picture.startsWith("data:image/webp;base64,"))
    throw new Error(`${file}: the browser did not produce a WebP`);
  const name = file.replace(/\.html$/, "");
  manifest[name] = {
    width: Math.round(box.width * scale),
    height: Math.round(box.height * scale),
    picture,
  };
  console.log(
    `${name.padEnd(22)} ${manifest[name].width}x${manifest[name].height}  ${(picture.length / 1024).toFixed(1)} KB`,
  );
  await page.close();
}
await writeFile(out, JSON.stringify(manifest, null, 2));
await browser.close();
