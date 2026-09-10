import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import "../src/core.js";
const C = globalThis.LectureCore;
const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8Xw8AAoMBgDTD2qgAAAAASUVORK5CYII=";
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
  assert.deepEqual(
    C.validate(JSON.parse(C.safeJSON(seed))),
    C.validate(seed),
  );
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
  delete partial.slides[0].transition;
  const document = C.validate(partial);
  assert.equal(document.transition, Object.keys(C.TRANSITIONS)[0]);
  assert.equal(document.slides[0].motion, Object.keys(C.MOTIONS)[0]);
  assert.equal(document.slides[0].backdrop, Object.keys(C.BACKDROPS)[0]);
  assert.equal(
    document.slides[0].transition,
    Object.keys(C.TRANSITIONS)[0],
  );
  for (const modify of [
    (d) => (d.transition = "swirl"),
    (d) => (d.slides[0].motion = "explode"),
    (d) => (d.slides[0].backdrop = "lava"),
    (d) => (d.slides[0].transition = "spin"),
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
    "data:image/png;base64,AAAA",
    "data:image/png;base64,iVBORw0KGgo!",
    "data:image/png;base64,not base64!",
    "data:image/png;base64," + "A".repeat(C.LIMITS.image),
    42,
  ])
    assert.throws(() => C.validate(withPicture(bad)));
});
test("free objects validate on every slide and reject unsafe values", () => {
  const document = C.clone(seed);
  document.slides.push(C.blankSlide("canvas"));
  for (const slide of document.slides) {
    const text = C.blankObject("text");
    text.text = "כותרת צבעונית";
    text.style = "spectrum";
    const image = C.blankObject("image");
    const shape = C.blankObject("shape");
    shape.shape = "arrow";
    const visual = C.blankObject("visual");
    visual.style = "spectrum";
    slide.objects = [text, image, shape, visual];
  }
  const valid = C.validate(document);
  assert.ok(
    valid.slides.every(
      (slide) =>
        slide.objects.map((object) => object.type).join() ===
        "text,image,shape,visual",
    ),
  );
  assert.equal(valid.slides[0].objects[0].style, "spectrum");
  assert.equal(valid.slides[0].objects[0].snap, "on");
  assert.equal(valid.slides[0].objects[0].entrance, "fade");
  assert.equal(valid.slides[0].objects[0].exit, "fade");
  const legacyObject = C.clone(document);
  delete legacyObject.slides[0].objects[0].snap;
  delete legacyObject.slides[0].objects[0].entrance;
  delete legacyObject.slides[0].objects[0].exit;
  assert.deepEqual(
    (({ snap, entrance, exit }) => ({ snap, entrance, exit }))(
      C.validate(legacyObject).slides[0].objects[0],
    ),
    { snap: "on", entrance: "fade", exit: "fade" },
  );
  for (const modify of [
    (object) => (object.type = "video"),
    (object) => (object.x = "101"),
    (object) => (object.width = "0"),
    (object) => {
      object.x = "60";
      object.width = "50";
    },
    (object) => {
      object.y = "70";
      object.height = "40";
    },
    (object) => (object.opacity = "NaN"),
    (object) => (object.color = "red"),
    (object) => (object.style = "constructor"),
    (object) => (object.snap = "sometimes"),
    (object) => (object.entrance = "explode"),
    (object) => (object.exit = "vanish"),
  ]) {
    const bad = C.clone(document);
    modify(bad.slides[0].objects[0]);
    assert.throws(() => C.validate(bad));
  }
  const duplicate = C.clone(document);
  duplicate.slides[0].objects[1].id = duplicate.slides[0].objects[0].id;
  assert.throws(() => C.validate(duplicate));
  const duplicateAcrossSlides = C.clone(document);
  duplicateAcrossSlides.slides[1].objects[0].id =
    duplicateAcrossSlides.slides[0].objects[0].id;
  assert.throws(() => C.validate(duplicateAcrossSlides));
  const badVisual = C.clone(document);
  badVisual.slides[0].objects[3].visual = "laser";
  assert.throws(() => C.validate(badVisual));
  const fractional = C.clone(document);
  fractional.slides[0].objects[0].x = "0.04";
  fractional.slides[0].objects[0].width = "99.96";
  const normalized = C.validate(fractional).slides[0].objects[0];
  assert.equal(normalized.x, "0");
  assert.equal(normalized.width, "100");
  assert.equal(Number(normalized.x) + Number(normalized.width), 100);
});
test("a star field arrives as a backdrop, not as a component", () => {
  assert.ok(Object.hasOwn(C.BACKDROPS, "stars"));
  assert.ok(!Object.hasOwn(C.VISUALS, "stars"));
  const document = C.clone(seed);
  const stars = C.blankObject("visual");
  stars.visual = "stars";
  const keeper = C.blankObject("shape");
  document.slides[0].objects = [stars, keeper];
  document.slides[0].backdrop = "plain";
  const valid = C.validate(document);
  assert.equal(valid.slides[0].backdrop, "stars");
  assert.deepEqual(
    valid.slides[0].objects.map((object) => object.id),
    [keeper.id],
  );
  // Slides that never held one are left alone.
  assert.equal(valid.slides[1].backdrop, seed.slides[1].backdrop);
});

test("shapes and components carry a fill style with a safe default", () => {
  const document = C.clone(seed);
  const shape = C.blankObject("shape");
  const outlined = C.blankObject("shape");
  outlined.style = "outline";
  const visual = C.blankObject("visual");
  delete shape.style;
  delete visual.style;
  document.slides[0].objects = [shape, outlined, visual];
  const valid = C.validate(document);
  assert.deepEqual(
    valid.slides[0].objects.map((object) => object.style),
    ["solid", "outline", "solid"],
  );
  const wrong = C.clone(document);
  wrong.slides[0].objects[0].style = "chrome";
  assert.throws(() => C.validate(wrong));
  // A component has no outline state, so it may not claim one.
  const noOutline = C.clone(document);
  noOutline.slides[0].objects[2].style = "outline";
  assert.throws(() => C.validate(noOutline));
});

test("a picture carries a crop, defaulted and bounded", () => {
  const document = C.clone(seed);
  const image = C.blankObject("image");
  image.picture = tinyPng;
  const legacy = C.blankObject("image");
  legacy.picture = tinyPng;
  delete legacy.zoom;
  delete legacy.focusX;
  delete legacy.focusY;
  document.slides[0].objects = [image, legacy];
  const valid = C.validate(document);
  assert.deepEqual(
    valid.slides[0].objects.map((o) => [o.zoom, o.focusX, o.focusY]),
    [
      ["100", "50", "50"],
      ["100", "50", "50"],
    ],
  );
  const cropped = C.clone(document);
  Object.assign(cropped.slides[0].objects[0], {
    zoom: "240",
    focusX: "12.5",
    focusY: "0",
  });
  const out = C.validate(cropped).slides[0].objects[0];
  assert.deepEqual([out.zoom, out.focusX, out.focusY], ["240", "12.5", "0"]);
  for (const [key, value] of [
    ["zoom", "99"],
    ["zoom", "401"],
    ["focusX", "-1"],
    ["focusY", "101"],
  ]) {
    const bad = C.clone(document);
    bad.slides[0].objects[0][key] = value;
    assert.throws(() => C.validate(bad));
  }
});

test("undo walks back through the document and redo returns", () => {
  const history = C.createHistory();
  history.reset("A");
  assert.equal(history.canUndo(), false);
  assert.ok(history.record("B"));
  assert.ok(history.record("C"));
  assert.equal(history.undo(), "B");
  assert.equal(history.undo(), "A");
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), "B");
  assert.equal(history.canRedo(), true);
  // A fresh change replaces the redo branch.
  history.record("D");
  assert.equal(history.canRedo(), false);
  assert.equal(history.undo(), "B");
});

test("one typing burst is one undo step, and the stack has a ceiling", () => {
  const history = C.createHistory(3);
  history.reset("start");
  history.record("t1", "text:a");
  history.record("t2", "text:a");
  history.record("t3", "text:a");
  assert.equal(history.depth(), 1);
  assert.equal(history.undo(), "start");
  // A different target, and a step of its own again.
  history.redo();
  history.record("other", "text:b");
  assert.equal(history.depth(), 2);
  assert.equal(history.record("other"), false);
  const deep = C.createHistory(3);
  deep.reset("0");
  for (const step of ["1", "2", "3", "4", "5"]) deep.record(step);
  assert.equal(deep.depth(), 3);
});

test("structured slide text can bind to one movable text object", () => {
  const document = C.clone(seed);
  const object = C.blankObject("text");
  object.bind = "title";
  object.text = document.slides[0].title;
  document.slides[0].objects = [object];
  assert.equal(C.validate(document).slides[0].objects[0].bind, "title");

  const mismatch = C.clone(document);
  mismatch.slides[0].objects[0].text = "טקסט אחר";
  assert.throws(() => C.validate(mismatch));

  const unsupported = C.clone(document);
  unsupported.slides[0].objects[0].bind = "motion";
  unsupported.slides[0].objects[0].text = unsupported.slides[0].motion;
  assert.throws(() => C.validate(unsupported));

  const duplicateBinding = C.clone(document);
  const copy = C.clone(duplicateBinding.slides[0].objects[0]);
  copy.id = C.newId("object");
  duplicateBinding.slides[0].objects.push(copy);
  assert.throws(() => C.validate(duplicateBinding));
});
test("the full portable document stays within the shared size budget", () => {
  const oversized = C.clone(seed);
  const bytes = Buffer.alloc(920000);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  const picture = `data:image/png;base64,${bytes.toString("base64")}`;
  assert.ok(picture.length < C.LIMITS.image);
  oversized.slides[0].backdropPicture = picture;
  oversized.slides[1].backdropPicture = picture;
  assert.ok(C.serializedBytes(oversized) > C.LIMITS.importBytes);
  assert.throws(() => C.validate(oversized));
});
test("every listed theme validates, and inherited keys do not", () => {
  for (const theme of Object.keys(C.THEMES)) {
    const document = C.clone(seed);
    document.theme = theme;
    assert.equal(C.validate(document).theme, theme);
  }
  for (const bad of ["constructor", "toString", "__proto__", "invalid"]) {
    const document = C.clone(seed);
    document.theme = bad;
    assert.throws(() => C.validate(document));
  }
});
test("a timer only accepts a whole number of minutes", () => {
  const withMinutes = (value) => {
    const document = C.clone(seed);
    document.slides.push({ ...C.blankSlide("timer"), minutes: value });
    return document;
  };
  assert.equal(C.validate(withMinutes("45")).slides.at(-1).minutes, "45");
  for (const bad of ["", "  ", "10 דקות", "7.5", "-3", "1234"])
    assert.throws(() => C.validate(withMinutes(bad)));
});
test("a bound text object may not outgrow the slide field it writes into", () => {
  const slide = C.validate(seed).slides[0];
  assert.equal(C.textLimit(slide, { bind: "title" }), C.SLIDE_TYPES.statement.fields.title.max);
  assert.equal(C.textLimit(slide, { bind: "" }), C.OBJECT_TEXT_MAX);
  assert.ok(C.OBJECT_TEXT_MAX > C.SLIDE_TYPES.statement.fields.title.max);

  // The pair has to stay in step, and both have to fit the shorter limit.
  const document = C.clone(seed);
  const object = C.blankObject("text");
  object.bind = "title";
  const overlong = "א".repeat(C.SLIDE_TYPES.statement.fields.title.max + 1);
  object.text = overlong;
  document.slides[0].title = overlong;
  document.slides[0].objects = [object];
  assert.throws(() => C.validate(document));
});
test("every projected string resolves to a spec, and reads and writes back", () => {
  const document = C.validate(seed);
  const reveal = document.slides[indexOfType("reveal")];
  assert.equal(C.fieldSpec(reveal, "title"), C.SLIDE_TYPES.reveal.fields.title);
  assert.equal(
    C.fieldSpec(reveal, "items.0.word").max,
    C.SLIDE_TYPES.reveal.list.fields.word.max,
  );
  assert.equal(C.readPath(reveal, "items.1.word"), reveal.items[1].word);
  C.writePath(reveal, "items.1.word", "חדש.");
  assert.equal(reveal.items[1].word, "חדש.");
  assert.doesNotThrow(() => C.validate(document));
  for (const bad of ["nope", "items.0.nope", "items.nope.word", "objects.0.text"])
    assert.equal(C.fieldSpec(reveal, bad), null);
});
test("the slide-wide text style is a choice with a safe default", () => {
  const document = C.clone(seed);
  delete document.slides[0].textStyle;
  assert.equal(C.validate(document).slides[0].textStyle, Object.keys(C.TEXT_STYLES)[0]);
  for (const style of Object.keys(C.TEXT_STYLES)) {
    const good = C.clone(seed);
    good.slides[0].textStyle = style;
    assert.equal(C.validate(good).slides[0].textStyle, style);
  }
  const bad = C.clone(seed);
  bad.slides[0].textStyle = "rainbow";
  assert.throws(() => C.validate(bad));
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
  assert.equal(beatsOf("timer"), 1);
  assert.equal(beatsOf("canvas"), 1);
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
  assert.ok(html.includes("data-slide-text"));
  assert.ok(html.includes("data-toolbar-object-prop"));
  assert.ok(html.includes("data-toolbar-step-value"));
  assert.ok(html.includes("layers-panel"));
  assert.ok(html.includes("--slide-exit-duration"));
});
