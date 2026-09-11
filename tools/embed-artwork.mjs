/* One-off preparation, deliberately not part of `npm run build`.

   The presenter supplies artwork at 2560x1440. The editor's upload path shrinks
   to 1920 and encodes at WebP 0.82, which is right for a photograph a presenter
   drops in mid-talk — but the first pass through this deck put full-frame
   artwork in at 1440x810 and 11-44 KB, and on a projector that reads as mush.
   This re-encodes named artwork at the size it is actually displayed at, then
   writes it into `src/content.json` at the path that owns it.

   Every job names its own width and quality because the right number depends on
   what the image is: a full-bleed backdrop earns more pixels than a poster that
   sits behind a play button. Sizes are capped at the source — upscaling a
   drawing only makes a bigger blurry drawing.

   usage: node tools/embed-artwork.mjs <jobs.json> [--dry] */
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const [jobsPath, ...flags] = process.argv.slice(2);
if (!jobsPath) {
  console.error("usage: node tools/embed-artwork.mjs <jobs.json> [--dry]");
  process.exit(1);
}
const dry = flags.includes("--dry");
const jobs = JSON.parse(await readFile(jobsPath, "utf8"));
const deckPath = new URL("../src/content.json", import.meta.url);
const deck = JSON.parse(await readFile(deckPath, "utf8"));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<body></body>");

const mime = (file) =>
  /\.png$/i.test(file) ? "png" : /\.webp$/i.test(file) ? "webp" : /\.svg$/i.test(file) ? "svg+xml" : "jpeg";

/* The field may sit on the slide itself or on one of its free objects. The
   caller names it as "slide-id/field" or "slide-id/object-id/field", so one
   table covers both without a second kind of job. */
function target(path) {
  const parts = path.split("/");
  const slide = deck.slides.find((s) => s.id === parts[0]);
  if (!slide) throw new Error(`no slide ${parts[0]}`);
  if (parts.length === 2) return [slide, parts[1]];
  const object = (slide.objects ?? []).find((o) => o.id === parts[1]);
  if (!object) throw new Error(`no object ${parts[1]} on ${parts[0]}`);
  return [object, parts[2]];
}

let before = 0;
let after = 0;
for (const job of jobs) {
  const [holder, field] = target(job.at);
  const source = await readFile(job.file);
  const uri = `data:image/${mime(job.file)};base64,${source.toString("base64")}`;
  const drawn = await page.evaluate(
    async ([src, width, quality, vector]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      /* Never upscale a raster — it only makes a bigger blurry drawing. An SVG
         has no native resolution to respect, so it is drawn at whatever size
         is asked for. */
      const w = vector ? width : Math.min(width, img.naturalWidth);
      const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      return { w, h, picture: canvas.toDataURL("image/webp", quality) };
    },
    [uri, job.width, job.quality ?? 0.85, /\.svg$/i.test(job.file)],
  );
  if (!drawn.picture.startsWith("data:image/webp;base64,"))
    throw new Error(`${job.file}: the browser did not produce a WebP`);
  const was = (holder[field] ?? "").length;
  before += was;
  after += drawn.picture.length;
  console.log(
    `${job.at.padEnd(46)} ${String(drawn.w).padStart(4)}x${String(drawn.h).padEnd(4)} ` +
      `${(was / 1024).toFixed(0).padStart(4)}KB -> ${(drawn.picture.length / 1024).toFixed(0).padStart(4)}KB`,
  );
  if (!dry) holder[field] = drawn.picture;
}
console.log(
  `\n${jobs.length} images  ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB` +
    (dry ? "  (dry run, nothing written)" : ""),
);
if (!dry) await writeFile(deckPath, `${JSON.stringify(deck, null, 2)}\n`);
await browser.close();
