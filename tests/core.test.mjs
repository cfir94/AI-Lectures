import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import "../src/core.js";
const C = globalThis.LectureCore;
const seed = JSON.parse(
  await readFile(new URL("../src/content.json", import.meta.url), "utf8"),
);
test("portable export preserves edited content, scripts and an isolated storage identity", async () => {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );
  const edited = C.clone(seed);
  edited.intro.title = "</script><b>בדיקה</b>";
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
  assert.equal(document.intro.title, edited.intro.title);
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
test("reject malformed imports, duplicate IDs, oversized fields and unsupported versions", () => {
  for (const modify of [
    (d) => (d.version = 2),
    (d) => (d.examples = []),
    (d) => d.examples.push(C.clone(d.examples[0])),
    (d) => (d.selectedExampleId = "missing"),
    (d) => (d.intro.title = "x".repeat(41)),
    (d) => (d.examples[0].steps = []),
    (d) => (d.theme = "invalid"),
    (d) => (d.examples[0].steps[0] = null),
    (d) => (d.intro.title = "   "),
  ]) {
    const bad = C.clone(seed);
    modify(bad);
    assert.throws(() => C.validate(bad));
    assert.equal(seed.examples.length, 1);
  }
});
test("navigation walks chat and all agent steps without exceeding final slide", () => {
  let s = C.initialState();
  const count = seed.examples[0].steps.length;
  s = C.transition(s, "next", count);
  assert.deepEqual(s, { slide: 1, mode: "chat", step: -1 });
  s = C.transition(s, "next", count);
  assert.deepEqual(s, { slide: 1, mode: "agent", step: 0 });
  for (let i = 0; i < 20; i++) s = C.transition(s, "next", count);
  assert.equal(s.step, 3);
  for (let i = 0; i < 20; i++) s = C.transition(s, "prev", count);
  assert.deepEqual(s, C.initialState());
});
test("mode changes and replay reset stale progress", () => {
  const s = { slide: 1, mode: "agent", step: 3 };
  assert.deepEqual(C.transition(s, "chat", 4), {
    slide: 1,
    mode: "chat",
    step: -1,
  });
  assert.deepEqual(C.transition(s, "agent", 4), {
    slide: 1,
    mode: "agent",
    step: 0,
  });
  assert.deepEqual(C.transition(s, "reset", 4), {
    slide: 1,
    mode: "chat",
    step: -1,
  });
});
test("embedded content cannot terminate its script tag", () => {
  const d = C.clone(seed);
  d.intro.title = "</script><script>alert(1)</script>";
  const serialized = C.safeJSON(C.validate(d));
  assert.ok(!serialized.includes("<"));
  assert.equal(JSON.parse(serialized).intro.title, d.intro.title);
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
