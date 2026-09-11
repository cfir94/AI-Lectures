/* One-off preparation, deliberately not part of `npm run build`.

   `npm test` checks the schema and the navigation rules. It cannot see the
   stage, and every bug the presenter has actually reported lived there: a
   white mark on a white slide, a headline painted by a gradient that never
   reached it, a slide floating in a frame the colour of a different palette.
   This walks the built deck in a real browser and fails on that class.

   usage: node tools/stage-audit.mjs [path-to-dist/index.html] */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const target = process.argv[2] ?? "dist/index.html";
const url = target.startsWith("http") ? target : `file://${process.cwd()}/${target}`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const noise = [];
page.on("pageerror", (e) => noise.push(`console: ${e}`));
page.on("console", (m) => m.type() === "error" && noise.push(`console: ${m.text()}`));
await page.goto(url);
await page.waitForTimeout(1200);

const problems = [];
const seen = new Set();
let total = 0;
for (let step = 0; step < 200; step++) {
  const report = await page.evaluate(() => {
    const slide = document.querySelector(".slide:not(.leaving)");
    if (!slide) return null;
    const name = slide.getAttribute("aria-label");
    const bg = getComputedStyle(slide).backgroundColor;
    const channels = bg.match(/\d+/g).map(Number);
    const relative = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const luminance = (m) => 0.2126 * relative(m[0]) + 0.7152 * relative(m[1]) + 0.0722 * relative(m[2]);
    const ground = luminance(channels);
    const faint = [];
    slide.querySelectorAll("h1, .scene-caption, .object-text, .scene-eyebrow, .headline-accent").forEach((el) => {
      if (!el.textContent.trim()) return;
      const style = getComputedStyle(el);
      const painted = style.webkitTextFillColor === "rgba(0, 0, 0, 0)" || style.color === "rgba(0, 0, 0, 0)";
      if (painted) {
        /* Transparent fill means a gradient is meant to paint the glyphs. If the
           element has no background image, nothing paints them at all. */
        if (style.backgroundImage === "none")
          faint.push(`"${el.textContent.trim().slice(0, 24)}" has a transparent fill and no gradient behind it`);
        return;
      }
      const ink = luminance(style.color.match(/\d+/g).map(Number));
      const ratio = (Math.max(ground, ink) + 0.05) / (Math.min(ground, ink) + 0.05);
      if (ratio < 2.2) faint.push(`"${el.textContent.trim().slice(0, 24)}" at ${ratio.toFixed(2)}:1`);
    });
    /* A free object clips what does not fit, so a headline one line too long
       loses its last line with no error anywhere. */
    const clipped = [...slide.querySelectorAll(".free-object")]
      .map((o) => {
        const t = o.querySelector(".object-text");
        if (!t) return null;
        const box = o.getBoundingClientRect();
        if (t.scrollHeight <= box.height + 2) return null;
        return `${o.dataset.objectId} needs ${Math.round(t.scrollHeight)}px in a ${Math.round(box.height)}px box`;
      })
      .filter(Boolean);
    const broken = [...slide.querySelectorAll("img")]
      .filter((i) => !i.complete || !i.naturalWidth || !i.getBoundingClientRect().width)
      .map((i) => i.className || "(object image)");
    const frame = getComputedStyle(document.querySelector(".theater")).backgroundColor;
    return { name, bg, frame, faint, broken, clipped, tone: slide.dataset.tone ?? "-" };
  });
  if (!report) break;
  if (!seen.has(report.name)) {
    seen.add(report.name);
    total++;
    report.faint.forEach((f) => problems.push(`${report.name}: unreadable — ${f}`));
    report.broken.forEach((c) => problems.push(`${report.name}: image not painted — ${c}`));
    report.clipped.forEach((c) => problems.push(`${report.name}: text clipped — ${c}`));
    /* The ground crossfades to the new palette, so a channel or two of
       difference is that animation still running, not a slide floating in the
       wrong colour. Anything a human could see is far larger than this. */
    const channels = (c) => (c.match(/\d+/g) ?? []).map(Number);
    const frame = channels(report.frame);
    const bg = channels(report.bg);
    const apart = frame.length === bg.length
      ? Math.max(...frame.map((v, i) => Math.abs(v - bg[i])))
      : 255;
    if (apart > 8)
      problems.push(`${report.name}: frame ${report.frame} does not match the slide ${report.bg}`);
  }
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(620);
}
/* The stage was clean while the editor threw on every slide and rendered an
   empty panel — the presenter could present and could not edit, and nothing
   here noticed. Opening the two panels costs a second and covers that. */
for (const [name, label, expect] of [
  ["slides", "שקפים", "details[data-open-key]"],
  ["design", "עיצוב", "[data-palette-choice]"],
  ["motion", "תנועה", "#motion-fields [data-field]"],
]) {
  try {
    await page.mouse.move(800, page.viewportSize().height - 40);
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: label }).click();
    await page.waitForTimeout(700);
    const found = await page.locator(expect).count();
    if (!found) problems.push(`the ${name} panel opened empty (no ${expect})`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  } catch (error) {
    problems.push(`the ${name} panel could not be opened: ${error.message.split("\n")[0]}`);
  }
}

await browser.close();

console.log(`walked ${total} shown slide(s), and opened the editor`);
for (const line of [...problems, ...noise]) console.log(`  ${line}`);
if (problems.length || noise.length) {
  console.log(`\n${problems.length + noise.length} problem(s)`);
  process.exit(1);
}
console.log("stage is clean");
