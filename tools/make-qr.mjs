/* The QR codes the room scans during the talk. A code for a URL is fixed by the
   standard, so these are generated rather than collected: run this tool and the
   codes come back identical, which is what makes them reproducible.

   Two things are not optional. A code needs a quiet zone — four modules of
   clear ground on every side — or a phone camera will not lock onto it, and the
   generator is asked for none so the margin is added here at a known width.
   And a generated code is never trusted on sight: `tools/check-qr.mjs` reads
   every one of them back with an independent decoder and fails on any that does
   not return its own URL. Run that after this.

   Usage: node tools/make-qr.mjs            (writes assets/qr-codes.json)
*/
import { writeFile } from "node:fs/promises";
import { chromium, browserOptions } from "./browser-runtime.mjs";

export const CODES = [
  { id: "chatgpt", url: "https://chatgpt.com/", label: "ChatGPT" },
  { id: "claude", url: "https://claude.ai/", label: "Claude" },
  { id: "gemini", url: "https://gemini.google.com/", label: "Gemini" },
  { id: "notebooklm", url: "https://notebooklm.google.com/", label: "NotebookLM" },
  { id: "manus", url: "https://manus.im/", label: "Manus" },
];

/* `pearl`\u2019s surface: the five slides that carry a code all use it. */
const GROUND = "#fafbfd";

const SOURCE = (url) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=600x600&ecc=H&margin=0&qzone=0&format=png&data=${encodeURIComponent(url)}`;

async function main() {
  const browser = await chromium.launch(browserOptions);
  const page = await browser.newPage();
  await page.goto("about:blank");
  const out = {};
  for (const code of CODES) {
    const response = await fetch(SOURCE(code.url));
    if (!response.ok) throw new Error(`${code.id}: ${response.status}`);
    const raw = Buffer.from(await response.arrayBuffer()).toString("base64");
    const picture = await page.evaluate(async ({ b64, ground }) => {
      const img = new Image();
      await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = "data:image/png;base64," + b64; });
      const read = document.createElement("canvas");
      read.width = img.naturalWidth;
      read.height = img.naturalHeight;
      const from = read.getContext("2d");
      from.drawImage(img, 0, 0);
      const pixels = from.getImageData(0, 0, read.width, read.height).data;
      const dark = (x, y) => pixels[(y * read.width + x) * 4] < 128;
      /* The generator's PNG is a picture of the code; what is wanted is the
         code. The top-left finder opens with seven dark modules, so its run
         along the first row gives the module size, and from there every module
         can be read at its own centre. Repainting from that grid costs a tenth
         of the bytes, lands every edge on a whole pixel, and makes the result
         independent of how the generator chose to draw it. */
      let run = 0;
      while (run < read.width && dark(run, 0)) run++;
      const module = run / 7;
      const count = Math.round(read.width / module);
      const grid = [];
      for (let r = 0; r < count; r++) {
        const row = [];
        for (let c = 0; c < count; c++)
          row.push(dark(Math.floor((c + 0.5) * module), Math.floor((r + 0.5) * module)));
        grid.push(row);
      }
      const scale = 10;
      const quiet = 4; // the standard's clear ground, without which nothing locks on
      const size = (count + quiet * 2) * scale;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const paint = canvas.getContext("2d");
      paint.imageSmoothingEnabled = false;
      /* The quiet zone is painted in the slide's own ground rather than pure
         white, or the code sits on a visible square. Every slide that carries
         one is `pearl`, whose surface this is; the ink keeps far more contrast
         than a scanner needs. */
      paint.fillStyle = ground;
      paint.fillRect(0, 0, size, size);
      paint.fillStyle = "#12121a";
      for (let r = 0; r < count; r++)
        for (let c = 0; c < count; c++)
          if (grid[r][c])
            paint.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      return { picture: canvas.toDataURL("image/png"), modules: count, size };
    }, { b64: raw, ground: GROUND });
    out[code.id] = {
      url: code.url, label: code.label,
      modules: picture.modules, size: picture.size, picture: picture.picture,
    };
    console.log(
      `${code.id.padEnd(12)} ${code.url.padEnd(32)} ${picture.modules}×${picture.modules} modules  ${picture.size}px  ${(picture.picture.length / 1024).toFixed(1)} KB`,
    );
  }
  await browser.close();
  await writeFile("assets/qr-codes.json", JSON.stringify(out, null, 2) + "\n");
  console.log("\nwrote assets/qr-codes.json — now run node tools/check-qr.mjs");
}
main();
