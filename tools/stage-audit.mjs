/* One-off preparation, deliberately not part of `npm run build`.

   `npm test` checks the schema and the navigation rules. It cannot see the
   stage, and every bug the presenter has actually reported lived there: a
   white mark on a white slide, a headline painted by a gradient that never
   reached it, a slide floating in a frame the colour of a different palette.
   This walks the built deck in a real browser and fails on that class.

   usage: node tools/stage-audit.mjs [path-to-dist/index.html] */
import { chromium, browserOptions } from "./browser-runtime.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const target = process.argv[2] ?? "dist/index.html";
const url = target.startsWith("http") ? target : pathToFileURL(resolve(target)).href;
const browser = await chromium.launch(browserOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const noise = [];
page.on("pageerror", (e) => noise.push(`console: ${e}`));
/* A video file lives beside the deck, never in the repository, so a checkout
   has none: the browser logs the failed request and the slide falls back to
   its stored poster, which is the designed behaviour rather than a defect. */
const expectedMiss = (text) => /ERR_FILE_NOT_FOUND/.test(text);
page.on(
  "console",
  (m) =>
    m.type() === "error" &&
    !expectedMiss(m.text()) &&
    noise.push(`console: ${m.text()}`),
);
await page.goto(url);
await page.waitForTimeout(1200);

const problems = [];
let lastBackdrop = null;
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
    /* The same sentence must never be painted twice on one slide. A free text
       box carries a `bind` to the field it replaces, and the scene renders that
       field as the empty string while the bind holds — so if the bind is ever
       lost, both copies paint, overlapping into an illegible tangle. That is
       invisible to every other check here, because each copy on its own is
       perfectly formed. */
    const strings = [...slide.querySelectorAll("h1, .scene-caption, .scene-eyebrow, .object-text")]
      .map((el) => el.textContent.replace(/\s+/g, " ").trim())
      .filter((t) => t.length >= 6);
    const doubled = [...new Set(strings.filter((t, i) => strings.indexOf(t) !== i))];
    const frame = getComputedStyle(document.querySelector(".theater")).backgroundColor;
    /* A backdrop shared with the slide before is carried over as the same
       DOM node so it does not restart. Carrying the node is not enough on its
       own: moving an element restarts its CSS animations, so the clock is
       read here and compared with the previous slide's. */
    const atmosphere = slide.querySelector(":scope > .atmosphere");
    const running = atmosphere ? atmosphere.getAnimations({ subtree: true }) : [];
    const backdrop = {
      kind: [...(atmosphere?.classList ?? [])].find((c) => c.startsWith("backdrop-") && c !== "backdrop-retained") ?? "-",
      retained: !!atmosphere?.classList.contains("backdrop-retained"),
      clock: running.length ? Math.max(...running.map((x) => Number(x.currentTime) || 0)) : null,
    };
    return { name, bg, frame, faint, broken, clipped, doubled, backdrop, tone: slide.dataset.tone ?? "-" };
  });
  if (!report) break;
  if (!seen.has(report.name)) {
    seen.add(report.name);
    total++;
    report.faint.forEach((f) => problems.push(`${report.name}: unreadable — ${f}`));
    report.broken.forEach((c) => problems.push(`${report.name}: image not painted — ${c}`));
    report.clipped.forEach((c) => problems.push(`${report.name}: text clipped — ${c}`));
    report.doubled.forEach((t) =>
      problems.push(`${report.name}: painted twice — "${t.slice(0, 34)}" renders in the scene and in a free object at once`),
    );
    /* A carried backdrop that went back to the start of its own animation is
       the background visibly reloading on a slide that was meant to inherit
       it untouched. */
    if (
      report.backdrop.retained &&
      lastBackdrop &&
      lastBackdrop.kind === report.backdrop.kind &&
      report.backdrop.clock !== null &&
      lastBackdrop.clock !== null &&
      report.backdrop.clock + 40 < lastBackdrop.clock
    )
      problems.push(
        `${report.name}: the ${report.backdrop.kind} backdrop restarted (clock ${Math.round(lastBackdrop.clock)}ms → ${Math.round(report.backdrop.clock)}ms) although it is shared with the slide before it`,
      );
    lastBackdrop = report.backdrop;
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
  // Interactive choices deliberately cannot be skipped by a navigation key.
  if (await page.locator('#next:disabled').count()) break;
  const agentControl = page.locator('.agent-controls [data-action="agent-choose"], .agent-controls [data-action="agent-run"], .agent-controls [data-action="agent-next"]');
  if (await agentControl.count()) await agentControl.first().click();
  else await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(1250);
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
