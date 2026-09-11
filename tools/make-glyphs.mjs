/* One-off preparation, deliberately not part of `npm run build`.

   Some slides need a plain concept mark — a speech bubble for a chatbot, a
   little machine head for an agent — rather than a company's logo. Those are
   not in the logo folder and never will be, so they are drawn here: stroked
   paths, one flat ink, redrawn in a headless browser onto a canvas and written
   out as transparent WebP, the same format the editor's own upload produces.
   SVG never reaches the document.

   usage: node tools/make-glyphs.mjs <manifest.json> [height] */
import { writeFile } from "node:fs/promises";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const [manifestPath, heightArg] = process.argv.slice(2);
if (!manifestPath) {
  console.error("usage: node tools/make-glyphs.mjs <manifest.json> [height]");
  process.exit(1);
}
const height = Number(heightArg) || 240;

/* Drawn on a 24x24 grid, stroked and rounded, so the two read as one family.
   The ink is white: a mark that has to live on a light slide is re-inked by
   tools/reink-marks.mjs once it is placed, which is the one rule for this. */
const GLYPHS = {
  chatbot: `
    <path d="M4 6.5a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9.8L5.6 19.6A.6.6 0 0 1 4.6 19v-3H4.5"/>
    <path d="M4 6.5v9.6"/>`,
  agent: `
    <path d="M12 2.6v2.6"/>
    <circle cx="12" cy="2" r="1.1"/>
    <rect x="4" y="5.6" width="16" height="12.4" rx="3.2"/>
    <path d="M2.2 10.4v2.8M21.8 10.4v2.8"/>
    <circle cx="9.2" cy="11.6" r="1.35" fill="currentColor" stroke="none"/>
    <circle cx="14.8" cy="11.6" r="1.35" fill="currentColor" stroke="none"/>`,
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
await page.setContent("<body></body>");

const manifest = {};
for (const [name, body] of Object.entries(GLYPHS)) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" ` +
    `stroke="#ffffff" color="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
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
      return { width, height: h, picture: canvas.toDataURL("image/webp", 0.95) };
    },
    [uri, height],
  );
  manifest[name] = drawn;
  console.log(`${name}: ${drawn.width}x${drawn.height}, ${Math.round(drawn.picture.length / 1024)} KB`);
}
await browser.close();
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${manifestPath}`);
