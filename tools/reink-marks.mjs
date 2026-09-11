/* One-off preparation, deliberately not part of `npm run build`.

   A tool mark is drawn for one kind of stage. The white variant is the right
   asset on charcoal and an invisible one on `pearl` — and once a slide's
   palette can be changed by the presenter at any time, "remember to swap the
   file" is not a rule that holds. `assets/tool-marks.json` carries a black
   variant for some marks but not for the icons cropped by hand, so this
   redraws the ones already in the document instead: every mark that is a
   single flat ink is re-inked to the colour its own slide asks for, alpha and
   anti-aliasing preserved, which is exact for a monochrome mark and refused
   for anything else.

   usage: node tools/reink-marks.mjs [--write] */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const write = process.argv.includes("--write");
const doc = JSON.parse(readFileSync("src/content.json", "utf8"));
const core = readFileSync("src/core.js", "utf8");
// The palette table is the authority on tone and ink; read it, do not restate it.
const tones = {};
for (const [, key, body] of core.matchAll(/^\s{4}(\w+): \{\n([\s\S]*?)^\s{4}\},$/gm)) {
  const tone = body.match(/tone: "(\w+)"/)?.[1];
  const text = body.match(/text: "(#[0-9a-f]{6})"/i)?.[1];
  if (tone && text) tones[key] = { tone, text };
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
await page.setContent("<body></body>");

let changed = 0;
for (const slide of doc.slides) {
  const palette = tones[slide.palette];
  if (!palette) continue;
  /* Every place a mark can hide in a slide. A free image object was the only
     one this knew about, and a glyph on a split side went straight back to
     being invisible the first time that slide turned light. */
  const marks = [
    ...(slide.objects ?? [])
      .filter((o) => o.type === "image")
      .map((o) => ({ id: o.id, get: () => o.picture, set: (v) => (o.picture = v) })),
    ...(slide.sides ?? []).map((side, i) => ({
      id: `sides.${i}.icon`,
      get: () => side.icon,
      set: (v) => (side.icon = v),
    })),
  ];
  for (const object of marks) {
    if (typeof object.get() !== "string" || !object.get()) continue;
    const result = await page.evaluate(
      async ([src, ink]) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = image.data;
        /* Flat ink means every opaque pixel is the same colour. A photograph or
           a multi-colour brand mark fails this and is left alone — re-inking
           one would not be a variant, it would be vandalism. */
        let first = null;
        let solid = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] < 250) continue;
          solid++;
          if (!first) first = [px[i], px[i + 1], px[i + 2]];
          else if (Math.abs(px[i] - first[0]) > 6 || Math.abs(px[i + 1] - first[1]) > 6 || Math.abs(px[i + 2] - first[2]) > 6)
            return { flat: false };
        }
        if (!first || solid < 64) return { flat: false };
        const was = `#${first.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
        const to = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
        /* Re-encoding drifts a channel by a unit or two, so an exact compare
           would re-ink the same mark on every run and churn the document for
           nothing. Close enough is already the right colour. */
        if (first.every((v, i) => Math.abs(v - to[i]) <= 4)) return { flat: true, same: true, was };
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] === 0) continue;
          px[i] = to[0];
          px[i + 1] = to[1];
          px[i + 2] = to[2];
        }
        ctx.putImageData(image, 0, 0);
        return { flat: true, same: false, was, picture: canvas.toDataURL("image/webp", 0.95) };
      },
      [object.get(), palette.text],
    );
    if (!result.flat) continue;
    if (result.same) continue;
    console.log(`${slide.id} · ${object.id}: ${result.was} -> ${palette.text} (${slide.palette}, ${palette.tone})`);
    if (write) object.set(result.picture);
    changed++;
  }
}
await browser.close();
if (write && changed) writeFileSync("src/content.json", JSON.stringify(doc, null, 2) + "\n");
console.log(`${changed} mark(s) ${write ? "re-inked" : "would be re-inked"}`);
