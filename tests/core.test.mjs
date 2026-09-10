import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import "../src/core.js";
const C = globalThis.LectureCore;
const seed = JSON.parse(
  await readFile(new URL("../src/content.json", import.meta.url), "utf8"),
);
const indexOfType = (type) => seed.slides.findIndex((s) => s.type === type);
test("portable export preserves edited content, scripts and an isolated storage identity", async () => {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );
  const edited = C.clone(seed);
  edited.slides[0].title = "</script><b>בדיקה</b>";
  edited.theme = "wine";
  const output = C.portableHTML(
    html.replace(/^<!doctype html>\s*/i, ""),
    edited,
    "portable-test",
  );
  const payload = output.match(
    /<script id="deck-data" type="application\/json">([\s\S]*?)<\/script>/,
  )[1];
  const document = C.validate(JSON.parse(payload));
  assert.equal(document.documentId, "portable-test");
  assert.equal(document.slides[0].title, edited.slides[0].title);
  assert.equal(document.theme, "wine");
  assert.ok(output.includes('data-theme="wine"'));
  assert.notEqual(document.documentId, seed.documentId);
  for (const id of ["core-script", "app-script"]) {
    const script = output.match(
      new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'),
    )[1];
    assert.doesNotThrow(() => new vm.Script(script));
  }
});
test("content import/export roundtrip preserves Hebrew and choices", () => {
  assert.deepEqual(C.validate(JSON.parse(C.safeJSON(seed))), seed);
});
test("optional slide fields may be omitted and come back empty", () => {
  const partial = C.clone(seed);
  delete partial.slides[0].accent;
  delete partial.slides[0].caption;
  delete partial.slides[0].note;
  const document = C.validate(partial);
  assert.equal(document.slides[0].accent, "");
  assert.equal(document.slides[0].caption, "");
  assert.equal(document.slides[0].note, "");
});
test("look presets fall back when absent and are rejected when wrong", () => {
  const partial = C.clone(seed);
  delete partial.transition;
  delete partial.slides[0].motion;
  delete partial.slides[0].backdrop;
  const document = C.validate(partial);
  assert.equal(document.transition, Object.keys(C.TRANSITIONS)[0]);
  assert.equal(document.slides[0].motion, Object.keys(C.MOTIONS)[0]);
  assert.equal(document.slides[0].backdrop, Object.keys(C.BACKDROPS)[0]);
  for (const modify of [
    (d) => (d.transition = "swirl"),
    (d) => (d.slides[0].motion = "explode"),
    (d) => (d.slides[0].backdrop = "lava"),
    (d) => (d.slides[0].motion = 7),
  ]) {
    const bad = C.clone(seed);
    modify(bad);
    assert.throws(() => C.validate(bad));
  }
});
test("pictures accept only raster data URIs, and may be empty", () => {
  const withPicture = (value) => {
    const document = C.clone(seed);
    document.slides.push({ ...C.blankSlide("image"), picture: value });
    return document;
  };
  const tiny =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8Xw8AAoMBgDTD2qgAAAAASUVORK5CYII=";
  assert.equal(C.validate(withPicture(tiny)).slides.at(-1).picture, tiny);
  assert.equal(C.validate(withPicture("")).slides.at(-1).picture, "");
  for (const bad of [
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "javascript:alert(1)",
    "https://example.com/photo.png",
    "data:image/png;base64,not base64!",
    "data:image/png;base64," + "A".repeat(C.LIMITS.image),
    42,
  ])
    assert.throws(() => C.validate(withPicture(bad)));
});
test("every slide type reports the beats its content implies", () => {
  const document = C.clone(seed);
  document.slides = Object.keys(C.SLIDE_TYPES).map((type) =>
    C.blankSlide(type),
  );
  const valid = C.validate(document);
  const beatsOf = (type) =>
    C.beats(valid, valid.slides.findIndex((s) => s.type === type));
  assert.equal(beatsOf("statement"), 1);
  assert.equal(beatsOf("demo"), 1);
  assert.equal(beatsOf("image"), 1);
  assert.equal(beatsOf("number"), 1);
  assert.equal(beatsOf("tokens"), 2);
  assert.equal(beatsOf("reveal"), 3);
  assert.equal(beatsOf("split"), 2);
  assert.equal(beatsOf("experiment"), 1 + valid.examples[0].steps.length);
});
test("reject malformed imports, duplicate IDs, oversized fields and unsupported versions", () => {
  for (const modify of [
    (d) => (d.version = 1),
    (d) => (d.slides = []),
    (d) => (d.examples = []),
    (d) => d.slides.push(C.clone(d.slides[0])),
    (d) => d.examples.push(C.clone(d.examples[0])),
    (d) => (d.selectedExampleId = "missing"),
    (d) => (d.slides[0].title = "x".repeat(41)),
    (d) => (d.slides[0].title = "   "),
    (d) => (d.slides[0].type = "unknown"),
    (d) => (d.slides[0].note = "x".repeat(501)),
    (d) => (d.slides[indexOfType("reveal")].items.length = 1),
    (d) => (d.slides[indexOfType("tokens")].chunks[0].text = "x".repeat(13)),
    (d) => (d.slides[indexOfType("demo")].tool = ""),
    (d) => (d.theme = "invalid"),
    (d) => (d.examples[0].steps = []),
    (d) => (d.examples[0].steps[0] = null),
  ]) {
    const bad = C.clone(seed);
    modify(bad);
    assert.throws(() => C.validate(bad));
    assert.equal(seed.slides.length, 11);
  }
});
test("navigation walks every beat of every slide and stops at both ends", () => {
  const total = seed.slides.reduce((sum, _, i) => sum + C.beats(seed, i), 0);
  const visited = new Set();
  let s = C.initialState();
  for (let i = 0; i < total + 10; i++) {
    visited.add(`${s.slide}:${s.step}`);
    s = C.transition(s, "next", seed);
  }
  const last = seed.slides.length - 1;
  assert.equal(visited.size, total);
  assert.deepEqual(s, { slide: last, step: C.beats(seed, last) - 1 });
  for (let i = 0; i < total + 10; i++) s = C.transition(s, "prev", seed);
  assert.deepEqual(s, C.initialState());
});
test("stepping back from a slide lands on the previous slide's last beat", () => {
  const reveal = indexOfType("reveal");
  const s = C.transition({ slide: reveal + 1, step: 0 }, "prev", seed);
  assert.deepEqual(s, {
    slide: reveal,
    step: seed.slides[reveal].items.length - 1,
  });
});
test("mode changes and replay reset stale progress inside the experiment", () => {
  const slide = indexOfType("experiment");
  const s = { slide, step: seed.examples[0].steps.length };
  assert.deepEqual(C.transition(s, "chat", seed), { slide, step: 0 });
  assert.deepEqual(C.transition(s, "agent", seed), { slide, step: 1 });
  assert.deepEqual(C.transition(s, "reset", seed), { slide, step: 0 });
});
test("new slides and list items are valid content on their own", () => {
  const document = C.clone(seed);
  for (const type of Object.keys(C.SLIDE_TYPES))
    document.slides.push(C.blankSlide(type));
  for (const type of ["reveal", "split", "tokens"]) {
    const list = C.SLIDE_TYPES[type].list;
    document.slides.push({
      ...C.blankSlide(type),
      [list.key]: Array.from({ length: list.min }, () => C.blankItem(type)),
    });
  }
  assert.doesNotThrow(() => C.validate(document));
});
test("embedded content cannot terminate its script tag", () => {
  const d = C.clone(seed);
  d.slides[0].title = "</script><script>alert(1)</script>";
  const serialized = C.safeJSON(C.validate(d));
  assert.ok(!serialized.includes("<"));
  assert.equal(JSON.parse(serialized).slides[0].title, d.slides[0].title);
});
test("built standalone output has no external runtime assets or unresolved markers", async () => {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );
  assert.ok(!/<script[^>]*\ssrc=/i.test(html));
  assert.ok(!/<link[^>]*href="https?:/i.test(html));
  assert.ok(!/url\(['"]?https?:/i.test(html));
  assert.ok(!html.includes("__DECK_JSON__"));
  assert.ok(!html.includes("/*__CSS__*/"));
  assert.ok(html.includes('dir="rtl"'));
  assert.ok(html.includes("prefers-reduced-motion"));
});
