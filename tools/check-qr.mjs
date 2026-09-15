/* A QR code that looks right and decodes to nothing is worthless, and nobody
   finds out until a room full of people points their phones at it. This reads
   every stored code back with an independent decoder and fails unless it
   returns exactly the URL it was made from. The decoder is fetched at check
   time rather than vendored: the deck itself keeps no dependencies.

   Usage: node tools/check-qr.mjs
*/
import { readFile } from "node:fs/promises";
import { chromium, browserOptions } from "./browser-runtime.mjs";

const DECODER = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";

const codes = JSON.parse(await readFile("assets/qr-codes.json", "utf8"));
const browser = await chromium.launch(browserOptions);
const page = await browser.newPage();
await page.goto("about:blank");
await page.addScriptTag({ content: await (await fetch(DECODER)).text() });

let bad = 0;
for (const [id, code] of Object.entries(codes)) {
  const read = await page.evaluate(async (picture) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = picture; });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const paint = canvas.getContext("2d");
    paint.drawImage(img, 0, 0);
    const pixels = paint.getImageData(0, 0, canvas.width, canvas.height);
    const found = jsQR(pixels.data, canvas.width, canvas.height);
    return found ? found.data : null;
  }, code.picture);
  const good = read === code.url;
  if (!good) bad++;
  console.log(`${good ? "ok  " : "FAIL"} ${id.padEnd(12)} ${code.url.padEnd(32)} read: ${JSON.stringify(read)}`);
}
await browser.close();
console.log(bad ? `\n${bad} code(s) do not read back` : "\nevery code reads back as its own URL");
process.exit(bad ? 1 : 0);
