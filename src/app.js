(() => {
  "use strict";
  const C = window.LectureCore;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const esc = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const initialHTML = document.documentElement.outerHTML;
  const timers = new Map();
  const embedded = C.validate(JSON.parse($("#deck-data").textContent));
  const storageKey = `lecture-stage:${embedded.documentId}`;
  let deck = C.clone(embedded),
    state = C.initialState(),
    canSave = true,
    idleTimer,
    toastTimer,
    countFrame,
    timerTick,
    notesOpen = false,
    pendingOpenId = null,
    pendingPicturePath = null,
    renderedSlide = -1,
    renderedSceneKey = null,
    renderedDots = "";
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) deck = C.validate(JSON.parse(stored));
  } catch {
    canSave = false;
  }
  const icons = {
    next: '<path d="m14 6-6 6 6 6"/>',
    prev: '<path d="m10 6 6 6-6 6"/>',
    up: '<path d="m6 14 6-6 6 6"/>',
    down: '<path d="m6 10 6 6 6-6"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L20 8a3.5 3.5 0 0 0-5-5L4 14Z"/>',
    palette:
      '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="8" r=".6"/><circle cx="6.5" cy="12" r=".6"/><circle cx="14" cy="7" r=".6"/><path d="M19 15h-5a2 2 0 0 0-2 2v4"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    keyboard:
      '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h1m4 0h1m4 0h1M6 12h1m4 0h1m4 0h1M7 15h10"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    replay: '<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
    chat: '<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9l-5 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M7 9h10m-10 4h6"/>',
    agent:
      '<circle cx="12" cy="12" r="3"/><circle cx="4" cy="4" r="1.5"/><circle cx="20" cy="4" r="1.5"/><circle cx="20" cy="20" r="1.5"/><circle cx="4" cy="20" r="1.5"/><path d="m6 6 4 4m4 4 4 4m0-12-4 4m-4 4-4 4"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 4V3H3v13h1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    play: '<path d="M7 5.5v13l11-6.5Z"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    note: '<path d="M5 3h14v18l-4-3-3 3-3-3-4 3Z"/><path d="M9 8h6m-6 4h4"/>',
    image:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  };
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.agent}</svg>`;
  $$("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
  $("#prev").innerHTML = icon("prev");
  $("#next").innerHTML = icon("next");

  // Keynote scenes: one focal point, with presenter controls kept off the canvas.
  const reducedMotion = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  // Particle positions must survive a re-render, so they come from the slide id.
  function seeded(id) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++)
      h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return () => {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }
  function backdrop(slide) {
    const kind = slide.backdrop;
    if (kind === "plain") return "";
    let inner = "";
    if (kind === "arcs")
      inner =
        '<div class="light-arc arc-one"></div><div class="light-arc arc-two"></div>';
    else if (kind === "grid") inner = '<div class="grid-plane"></div>';
    else if (kind === "aurora")
      inner = [0, 1, 2]
        .map((i) => `<div class="aurora-blob" style="--blob:${i}"></div>`)
        .join("");
    else if (kind === "rings")
      inner = [0, 1, 2, 3]
        .map((i) => `<div class="ring" style="--ring:${i}"></div>`)
        .join("");
    else if (kind === "beams") inner = '<div class="beam-field"></div>';
    else if (kind === "halo") inner = '<div class="halo"></div>';
    else if (kind === "waves")
      inner = [0, 1, 2]
        .map((i) => `<div class="wave" style="--wave:${i}"></div>`)
        .join("");
    else if (kind === "particles") {
      const random = seeded(slide.id);
      inner = Array.from({ length: 28 }, () => {
        const round = (n) => n.toFixed(2);
        return `<i style="--x:${round(random() * 100)}%;--y:${round(random() * 100)}%;--s:${round(1 + random() * 2.4)}px;--delay:${round(random() * -7)}s;--drift:${round(6 + random() * 6)}s"></i>`;
      }).join("");
    }
    return `<div class="atmosphere backdrop-${kind}" aria-hidden="true">${inner}</div>`;
  }
  const frame = (slide, index, classes, style, body) =>
    `<section class="slide ${classes} motion-${slide.motion}" aria-label="שקף ${index + 1}" style="${style}">${backdrop(slide)}${body}</section>`;
  const caption = (value) =>
    value ? `<p class="scene-caption">${esc(value)}</p>` : "";
  // "cascade" needs each word on its own, so it gets its own markup path.
  const headline = (slide, value) =>
    slide.motion === "cascade"
      ? value
          .split(" ")
          .map(
            (word, i) =>
              `<span class="cascade-word" style="--w:${i}">${esc(word)}</span>`,
          )
          .join(" ")
      : esc(value);

  function statementSlide(slide, index) {
    const size = Math.min(
      10.5,
      390 / (slide.title.length + slide.accent.length + 4),
    );
    const opening =
      index === 0
        ? `<div class="scene-controls intro-controls"><button class="quiet-button" data-action="next">מתחילים ${icon("next")}</button><button class="icon-button" data-action="replay" aria-label="הפעלה חוזרת של הפתיחה">${icon("replay")}</button></div>`
        : "";
    return frame(
      slide,
      index,
      "statement-slide",
      `--headline-size:${size}cqw`,
      `<div class="scene statement-scene"><h1>${headline(slide, slide.title)}${slide.accent ? ` <span>${headline(slide, slide.accent)}</span>` : ""}</h1>${caption(slide.caption)}</div>${opening}`,
    );
  }
  function demoSlide(slide, index) {
    const size = Math.min(9.5, 340 / (slide.title.length + 2));
    const copy = slide.prompt
      ? `<div class="scene-controls demo-controls"><button class="quiet-button" data-action="copy-prompt">${icon("copy")}העתקת הפרומפט</button></div>`
      : "";
    return frame(
      slide,
      index,
      "demo-slide",
      `--headline-size:${size}cqw`,
      `<div class="scene statement-scene"><span class="demo-tool">${esc(slide.tool)}</span><h1>${headline(slide, slide.title)}</h1>${caption(slide.caption)}</div>${copy}`,
    );
  }
  function revealSlide(slide, index, step) {
    const words = slide.items
      .map(
        (item, i) =>
          `<li data-state="${i < step ? "past" : i === step ? "now" : "next"}" style="--w:${i}">${esc(item.word)}</li>`,
      )
      .join("");
    const size = Math.min(
      9,
      210 / Math.max(...slide.items.map((i) => i.word.length)),
    );
    return frame(
      slide,
      index,
      "reveal-slide",
      `--headline-size:${size}cqw`,
      `<div class="scene reveal-scene">${slide.title ? `<p class="scene-eyebrow">${esc(slide.title)}</p>` : ""}<ol class="reveal-list">${words}</ol>${caption(slide.items[step].caption)}</div>`,
    );
  }
  function tokensSlide(slide, index, step) {
    const body =
      step === 0
        ? `<p class="token-sentence">${esc(slide.chunks.map((c) => c.text).join(""))}</p>`
        : `<p class="token-chunks">${slide.chunks.map((c, i) => `<span class="token" style="--token:${i}">${esc(c.text)}</span>`).join("")}</p>`;
    return frame(
      slide,
      index,
      "tokens-slide",
      "",
      `<div class="scene tokens-scene"><p class="scene-eyebrow">${esc(slide.title)}</p>${body}${step === 1 ? caption(slide.caption) : ""}</div>`,
    );
  }
  function imageSlide(slide, index) {
    const media = slide.picture
      ? `<img class="slide-image" src="${esc(slide.picture)}" alt="${esc(slide.alt || slide.title || "תמונה בשקף")}" style="object-fit:${slide.fit}">`
      : `<p class="image-placeholder">עדיין אין תמונה כאן. אפשר להעלות אותה בעורך.</p>`;
    const overlay =
      slide.title || slide.caption
        ? `<div class="scene image-scene"><div class="image-text">${slide.title ? `<h1>${headline(slide, slide.title)}</h1>` : ""}${caption(slide.caption)}</div></div>`
        : "";
    const size = Math.min(7.5, 300 / ((slide.title || "xx").length + 2));
    return frame(
      slide,
      index,
      `image-slide fit-${slide.fit} ${overlay ? "has-text" : ""}`,
      `--headline-size:${size}cqw`,
      `<figure class="image-frame">${media}</figure>${overlay}`,
    );
  }
  function numberSlide(slide, index) {
    const size = Math.min(30, 128 / slide.value.length);
    return frame(
      slide,
      index,
      "number-slide",
      `--number-size:${size}cqw`,
      `<div class="scene number-scene">${slide.title ? `<p class="scene-eyebrow">${esc(slide.title)}</p>` : ""}<p class="big-number"><span data-count="${esc(slide.value)}">${esc(slide.value)}</span>${slide.unit ? `<em>${esc(slide.unit)}</em>` : ""}</p>${caption(slide.caption)}</div>`,
    );
  }
  function splitSlide(slide, index, step) {
    const sides = slide.sides
      .map(
        (side, i) =>
          `<li data-state="${i < step ? "past" : i === step ? "now" : "next"}" style="--w:${i}"><span class="split-heading">${headline(slide, side.heading)}</span>${side.line ? `<span class="split-line">${esc(side.line)}</span>` : ""}</li>`,
      )
      .join("");
    return frame(
      slide,
      index,
      "split-slide",
      `--sides:${slide.sides.length}`,
      `<div class="scene split-scene">${slide.title ? `<p class="scene-eyebrow">${esc(slide.title)}</p>` : ""}<ol class="split-list">${sides}</ol></div>`,
    );
  }
  const clockText = (seconds) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const totalOf = (slide) => Math.max(1, Number(slide.minutes)) * 60;
  function timerState(slide) {
    let state = timers.get(slide.id);
    if (!state || state.total !== totalOf(slide)) {
      state = { total: totalOf(slide), left: totalOf(slide), running: false };
      timers.set(slide.id, state);
    }
    return state;
  }
  const secondsLeft = (state) =>
    state.running
      ? Math.max(0, Math.round((state.endsAt - Date.now()) / 1000))
      : state.left;
  function timerSlide(slide, index) {
    const state = timerState(slide);
    const left = secondsLeft(state);
    return frame(
      slide,
      index,
      `timer-slide ${state.running ? "running" : ""} ${left === 0 ? "elapsed" : ""}`,
      "",
      `<div class="scene timer-scene">${slide.title ? `<p class="scene-eyebrow">${esc(slide.title)}</p>` : ""}<p class="timer-readout" data-timer dir="ltr">${clockText(left)}</p>${caption(slide.caption)}</div><div class="scene-controls timer-controls"><button class="quiet-button" data-action="timer-toggle">${icon(state.running ? "pause" : "play")}${state.running ? "עצירה" : left === 0 ? "שוב" : "התחלה"}</button><button class="quiet-button" data-action="timer-reset">${icon("replay")}איפוס</button></div>`,
    );
  }
  function experimentSlide(slide, index, step) {
    const e = C.selected(deck),
      agent = step > 0,
      current = agent ? e.steps[step - 1] : null,
      complete = agent && step === e.steps.length;
    const heading = agent ? current.label : slide.title;
    const size = Math.min(13, 195 / (heading.length + 2));
    return frame(
      slide,
      index,
      `experiment-slide ${agent ? "agent-scene" : "chat-scene"} ${complete ? "complete-scene" : ""}`,
      `--scene-size:${size}cqw;--phase:${Math.max(0, step - 1)}`,
      `<div class="scene experiment-scene"><p class="scene-context">${esc(e.task)}</p><div class="scene-message"><h2 class="scene-word">${esc(heading)}</h2><p class="scene-caption">${esc(agent ? current.artifact : e.answer)}</p></div></div><span class="simulation-note">המחשה</span><div class="scene-controls experiment-controls"><div class="mode-switch" role="group" aria-label="מצב ההדגמה"><button data-action="chat" aria-pressed="${!agent}">צ׳אטבוט</button><button data-action="agent" aria-pressed="${agent}">סוכן</button></div><select id="audience-select" aria-label="בחירת דוגמה">${exampleOptions()}</select><button class="quiet-button" data-action="${complete ? "reset" : "next"}">${complete ? "שוב" : agent ? "השלב הבא" : "נעבור לסוכן"}${icon(complete ? "replay" : "next")}</button><span class="step-counter" aria-label="התקדמות">${agent ? `${step} / ${e.steps.length}` : ""}</span></div>`,
    );
  }
  const SCENES = {
    statement: statementSlide,
    demo: demoSlide,
    reveal: revealSlide,
    tokens: tokensSlide,
    image: imageSlide,
    number: numberSlide,
    split: splitSlide,
    timer: timerSlide,
    experiment: experimentSlide,
  };
  function exampleOptions() {
    return deck.examples
      .map(
        (e) =>
          `<option value="${esc(e.id)}" ${e.id === deck.selectedExampleId ? "selected" : ""}>${esc(e.name)}</option>`,
      )
      .join("");
  }
  const slideName = (slide) =>
    slide.title || C.SLIDE_TYPES[slide.type].label;
  function announce(slide, step) {
    const place = `שקף ${state.slide + 1} מתוך ${deck.slides.length}`;
    if (slide.type === "reveal")
      return `${place}: ${slideName(slide)} — ${slide.items[step].word}`;
    if (slide.type === "split")
      return `${place}: ${slideName(slide)} — ${slide.sides[step].heading}`;
    if (slide.type === "number")
      return `${place}: ${slide.value} ${slide.unit}`.trim();
    if (slide.type === "experiment") {
      const e = C.selected(deck);
      return step === 0
        ? `${place}: תשובת הצ׳אטבוט`
        : `${place}: שלב ${step} — ${e.steps[step - 1].label}`;
    }
    return `${place}: ${slideName(slide)}`;
  }
  function renderDots() {
    const key = deck.slides.map((s) => s.id).join("|");
    if (key !== renderedDots) {
      renderedDots = key;
      $("#slide-dots").innerHTML = deck.slides
        .map(
          (s, i) =>
            `<button data-slide="${i}" aria-label="שקף ${i + 1}: ${esc(slideName(s))}"></button>`,
        )
        .join("");
    }
    $$("#slide-dots button").forEach((b) => {
      if (+b.dataset.slide === state.slide)
        b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
  }
  // A number slide climbs to its value once, and never past the current render.
  function countUp(current) {
    cancelAnimationFrame(countFrame);
    const el = current.querySelector("[data-count]");
    if (!el || !/^\d{1,9}$/.test(el.dataset.count) || reducedMotion()) return;
    const target = Number(el.dataset.count);
    const started = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / 900);
      el.textContent = String(
        Math.round(target * (1 - Math.pow(1 - progress, 3))),
      );
      if (progress < 1) countFrame = requestAnimationFrame(tick);
    };
    countFrame = requestAnimationFrame(tick);
  }
  // The countdown survives a re-render: its state lives outside the deck.
  function runTimer(current, slide) {
    clearInterval(timerTick);
    if (slide.type !== "timer") return;
    const state = timers.get(slide.id);
    if (!state || !state.running) return;
    const readout = current.querySelector("[data-timer]");
    timerTick = setInterval(() => {
      const left = secondsLeft(state);
      readout.textContent = clockText(left);
      if (left === 0) {
        state.running = false;
        state.left = 0;
        clearInterval(timerTick);
        render();
      }
    }, 250);
  }
  function toggleTimer() {
    const current = timerState(deck.slides[state.slide]);
    if (current.running) {
      current.left = secondsLeft(current);
      current.running = false;
    } else {
      if (current.left === 0) current.left = current.total;
      current.endsAt = Date.now() + current.left * 1000;
      current.running = true;
    }
  }
  function render() {
    const actionFocus = document.activeElement?.dataset.action;
    const slide = deck.slides[state.slide];
    const root = $("#slide-root");
    document.documentElement.dataset.theme = deck.theme;
    root.dataset.transition = deck.transition;
    const html = SCENES[slide.type](slide, state.slide, state.step);
    const sameSlide = renderedSlide === state.slide;
    const direction = state.slide < renderedSlide ? -1 : 1;
    root.querySelectorAll(".slide.leaving").forEach((el) => el.remove());
    const previous = root.lastElementChild;
    if (previous && !sameSlide && deck.transition !== "cut" && !reducedMotion()) {
      previous.classList.add("leaving");
      const drop = () => previous.remove();
      // animationend bubbles, so only the slide's own exit may retire it.
      previous.addEventListener("animationend", (event) => {
        if (event.target === previous) drop();
      });
      setTimeout(drop, 900);
      root.insertAdjacentHTML("beforeend", html);
      root.lastElementChild.classList.add("entering");
    } else root.innerHTML = html;
    const current = root.lastElementChild;
    current.style.setProperty("--dir", direction);
    // A step inside the same slide keeps the stage still; only beats animate.
    if (sameSlide) current.classList.remove(`motion-${slide.motion}`);
    renderedSlide = state.slide;
    const sceneKey = `${state.slide}:${state.step}`;
    if (renderedSceneKey === sceneKey) current.classList.add("no-motion");
    renderedSceneKey = sceneKey;
    countUp(current);
    runTimer(current, slide);
    $("#notes").hidden = !notesOpen;
    $("#notes").textContent = slide.note || "אין הערת מרצה לשקף הזה.";
    $("#slide-announcement").textContent = announce(slide, state.step);
    const pad = (n) => String(n).padStart(2, "0");
    $("#position").textContent = `${pad(state.slide + 1)} / ${pad(deck.slides.length)}`;
    renderDots();
    $("#prev").disabled = state.slide === 0 && state.step === 0;
    $("#next").disabled =
      state.slide === deck.slides.length - 1 &&
      state.step === C.beats(deck, state.slide) - 1;
    $$("[data-theme-choice]").forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.themeChoice === deck.theme),
      ),
    );
    $$("[data-transition-choice]").forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.transitionChoice === deck.transition),
      ),
    );
    if (actionFocus)
      $(`[data-action="${actionFocus}"]`)?.focus({ preventScroll: true });
  }
  function notify(message) {
    clearTimeout(toastTimer);
    $("#toast").textContent = message;
    $("#toast").classList.add("visible");
    toastTimer = setTimeout(
      () => $("#toast").classList.remove("visible"),
      4500,
    );
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(C.validate(deck)));
      canSave = true;
    } catch {
      canSave = false;
    }
    $("#save-status").textContent = canSave
      ? "נשמר במכשיר הזה · אפשר להוריד עותק לגיבוי"
      : "השמירה במכשיר אינה זמינה. יש להוריד עותק לפני הסגירה.";
  }
  function act(action) {
    if (action === "replay") {
      renderedSlide = -1;
      renderedSceneKey = null;
      render();
      return;
    }
    document.body.classList.remove("blacked-out");
    state = C.transition(state, action, deck);
    render();
    wake();
  }
  async function copyPrompt(slide) {
    const done = (ok) =>
      notify(
        ok
          ? "הפרומפט הועתק. אפשר להדביק בכלי."
          : "ההעתקה נחסמה בדפדפן. אפשר להעתיק את הפרומפט מתוך העורך.",
      );
    try {
      await navigator.clipboard.writeText(slide.prompt);
      done(true);
    } catch {
      // Clipboard access is blocked on file:// in some browsers; fall back to a selection copy.
      const area = document.createElement("textarea");
      area.value = slide.prompt;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;opacity:0";
      document.body.append(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      area.remove();
      done(ok);
    }
  }
  function changeExample(id) {
    if (!deck.examples.some((e) => e.id === id)) return;
    deck.selectedExampleId = id;
    state = { ...state, step: 0 };
    save();
    render();
  }
  function wake() {
    document.body.classList.remove("controls-idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!$("dialog[open]")) document.body.classList.add("controls-idle");
    }, 4500);
  }
  function openDialog(id) {
    wake();
    if (id === "editor") renderEditor();
    $(`#${id}`).showModal();
  }
  function validEditor() {
    const invalid = $$("#editor-fields input, #editor-fields textarea").find(
      (e) => !e.checkValidity(),
    );
    if (!invalid) return true;
    invalid.closest("details").open = true;
    invalid.reportValidity();
    notify("יש למלא את השדה לפני שממשיכים.");
    return false;
  }
  function closeDialog(dialog) {
    if (dialog.id === "editor" && !validEditor()) return;
    dialog.close();
    wake();
  }
  const FIELD_LABELS = {
    title: "כותרת",
    accent: "מילה מודגשת",
    caption: "משפט מתחת",
    tool: "הכלי שפותחים",
    prompt: "הפרומפט — לא מוקרן, מועתק בלחיצה",
    word: "מילה",
    text: "חתיכה",
    value: "המספר",
    unit: "יחידה",
    picture: "התמונה",
    fit: "איך היא יושבת",
    alt: "תיאור לקורא מסך",
    heading: "הכותרת בצד",
    line: "שורה מתחת",
    motion: "תנועת הכניסה",
    backdrop: "רקע הבמה",
    name: "שם הדוגמה / הקהל",
    task: "המטרה",
    answer: "תשובת הצ׳אטבוט",
    label: "שם השלב",
    detail: "הערת מרצה — לא מוקרנת",
    artifact: "שם התוצר",
  };
  const MULTILINE = new Set([
    "caption",
    "prompt",
    "note",
    "task",
    "answer",
    "detail",
  ]);
  const field = (label, path, value, max, multi = false, required = true) =>
    `<label class="field"><span class="field-head"><span>${label}</span><small>${value.length} / ${max}</small></span>${multi ? `<textarea rows="2"` : '<input type="text"'} data-field="${path}" maxlength="${max}" ${required ? "required" : ""} ${multi ? `>${esc(value)}</textarea>` : `value="${esc(value)}">`}</label>`;
  const picker = (label, path, value, options, extra = "") =>
    `<label class="field"><span class="field-head"><span>${label}</span></span><select data-field="${path}" ${extra}>${Object.entries(
      options,
    )
      .map(
        ([key, name]) =>
          `<option value="${key}" ${key === value ? "selected" : ""}>${esc(name)}</option>`,
      )
      .join("")}</select></label>`;
  const weight = (value) => `${Math.round((value.length * 0.75) / 1024)} KB`;
  const pictureField = (label, path, value) =>
    `<div class="field picture-field"><span class="field-head"><span>${label}</span><small>${value ? weight(value) : "אין תמונה"}</small></span>${
      value
        ? `<img class="picture-thumb" src="${esc(value)}" alt="">`
        : '<div class="picture-thumb empty"></div>'
    }<div class="picture-actions"><button class="duplicate-button" data-pick-picture="${path}">${icon("image")}${value ? "החלפת התמונה" : "בחירת תמונה"}</button>${
      value
        ? `<button class="icon-button" data-clear-picture="${path}" aria-label="הסרת התמונה">${icon("trash")}</button>`
        : ""
    }</div></div>`;
  const fieldsFor = (source, specs, prefix) =>
    Object.entries(specs)
      .map(([key, spec]) =>
        spec.picture
          ? pictureField(
              FIELD_LABELS[key] || key,
              `${prefix}.${key}`,
              source[key],
            )
          : spec.choice
          ? picker(
              FIELD_LABELS[key] || key,
              `${prefix}.${key}`,
              source[key],
              spec.choice,
            )
          : field(
              FIELD_LABELS[key] || key,
              `${prefix}.${key}`,
              source[key],
              spec.max,
              MULTILINE.has(key),
              spec.required,
            ),
      )
      .join("");
  function listEditor(slide, index, list) {
    const items = slide[list.key];
    return `${items
      .map(
        (item, j) =>
          `<section class="step-editor"><div class="step-editor-header"><span>${esc(list.label)} ${j + 1}</span><button class="icon-button" data-remove-item="${index}:${j}" aria-label="הסרת ${esc(list.label)} ${j + 1}" ${items.length <= list.min ? "disabled" : ""}>${icon("trash")}</button></div>${fieldsFor(item, list.fields, `slides.${index}.${list.key}.${j}`)}</section>`,
      )
      .join("")}<button class="duplicate-button" data-add-item="${index}" ${items.length >= list.max ? "disabled" : ""}>${icon("plus")}הוספת ${esc(list.label)}</button>`;
  }
  const LOOK_KEYS = new Set(["motion", "backdrop"]);
  const splitSpecs = (specs) => {
    const content = {},
      look = {};
    for (const [key, spec] of Object.entries(specs))
      (LOOK_KEYS.has(key) ? look : content)[key] = spec;
    return { content, look };
  };
  function slideEditor(slide, index, open) {
    const type = C.SLIDE_TYPES[slide.type];
    const last = deck.slides.length - 1;
    const { content, look } = splitSpecs(type.fields);
    return `<details data-open-key="${esc(slide.id)}" ${open ? "open" : ""}><summary><span class="slide-editor-name">${index + 1}. ${esc(slideName(slide))}</span><small>${esc(type.label)}</small></summary>
      <div class="slide-editor-tools"><button class="icon-button" data-move="${index}:-1" aria-label="העברת השקף למעלה" ${index === 0 ? "disabled" : ""}>${icon("up")}</button><button class="icon-button" data-move="${index}:1" aria-label="העברת השקף למטה" ${index === last ? "disabled" : ""}>${icon("down")}</button><button class="icon-button" data-remove-slide="${index}" aria-label="מחיקת השקף" ${last === 0 ? "disabled" : ""}>${icon("trash")}</button></div>
      <p class="editor-note">${esc(type.hint)}</p>
      ${fieldsFor(slide, content, `slides.${index}`)}
      ${type.list ? listEditor(slide, index, type.list) : ""}
      <div class="look-row">${fieldsFor(slide, look, `slides.${index}`)}</div>
      ${field("הערת מרצה — לא מוקרנת", `slides.${index}.note`, slide.note, C.LIMITS.note, true, false)}</details>`;
  }
  function examplesEditor(open) {
    const e = C.selected(deck);
    return `<details data-open-key="examples" ${open ? "open" : ""}><summary><span>דוגמאות לקהלים</span><small>הניסוי</small></summary>
      <label class="field"><span class="field-head">הדוגמה לעריכה</span><select id="editor-example">${exampleOptions()}</select></label>
      <button class="duplicate-button" id="duplicate" ${deck.examples.length >= C.LIMITS.examples ? "disabled" : ""}>${icon("copy")}שכפול לקהל אחר</button>
      <p class="editor-note">שכפל דוגמה ושנה את התוכן. הפריסה נשארת קבועה. בין 2 ל־${C.LIMITS.steps} שלבים; על הבמה יופיעו רק שם הפעולה והתוצר.</p>
      ${fieldsFor(e, { name: { max: 40, required: true }, task: { max: 110, required: true }, answer: { max: 180, required: true } }, "example")}
      ${e.steps
        .map(
          (s, i) =>
            `<section class="step-editor"><div class="step-editor-header"><span>שלב ${i + 1}</span><button class="icon-button" data-remove-step="${i}" aria-label="הסרת שלב ${i + 1}" ${e.steps.length <= 2 ? "disabled" : ""}>${icon("trash")}</button></div>${fieldsFor(s, { label: { max: 18, required: true }, detail: { max: 120, required: true }, artifact: { max: 40, required: true } }, `steps.${i}`)}</section>`,
        )
        .join("")}
      <button class="duplicate-button" id="add-step" ${e.steps.length >= C.LIMITS.steps ? "disabled" : ""}>${icon("plus")}הוספת שלב</button></details>`;
  }
  function renderEditor() {
    const previouslyOpen = $$("#editor-fields details[open]").map(
      (d) => d.dataset.openKey,
    );
    const open = previouslyOpen.length
      ? new Set(previouslyOpen)
      : new Set([deck.slides[state.slide].id]);
    if (pendingOpenId) open.add(pendingOpenId);
    $("#editor-fields").innerHTML =
      deck.slides
        .map((slide, i) => slideEditor(slide, i, open.has(slide.id)))
        .join("") +
      `<div class="slide-add"><label class="field"><span class="field-head"><span>שקף חדש</span></span><select id="new-slide-type">${Object.entries(
        C.SLIDE_TYPES,
      )
        .map(([key, t]) => `<option value="${key}">${esc(t.label)}</option>`)
        .join("")}</select></label><button class="duplicate-button" id="add-slide" ${deck.slides.length >= C.LIMITS.slides ? "disabled" : ""}>${icon("plus")}הוספה בסוף המצגת</button></div>` +
      examplesEditor(open.has("examples"));
  }
  function setPath(path, value) {
    const p = path.split(".");
    if (p[0] === "slides") {
      const slide = deck.slides[+p[1]];
      if (p.length === 3) slide[p[2]] = value;
      else slide[p[2]][+p[3]][p[4]] = value;
    } else if (p[0] === "example") C.selected(deck)[p[1]] = value;
    else if (p[0] === "steps") C.selected(deck).steps[+p[1]][p[2]] = value;
  }
  function updateField(input) {
    input.closest(".field").querySelector("small").textContent =
      `${input.value.length} / ${input.maxLength}`;
    if (input.required && !input.value.trim()) {
      input.setCustomValidity("יש למלא טקסט קצר.");
      $("#save-status").textContent = "השדה הריק עדיין לא נשמר.";
      return;
    }
    input.setCustomValidity("");
    const path = input.dataset.field.split(".");
    setPath(input.dataset.field, input.value);
    save();
    render();
    if (path[0] === "slides" && path[2] === "title") {
      const label = $(
        `[data-open-key="${CSS.escape(deck.slides[+path[1]].id)}"] .slide-editor-name`,
      );
      if (label)
        label.textContent = `${+path[1] + 1}. ${slideName(deck.slides[+path[1]])}`;
    } else if (input.dataset.field === "example.name") {
      const option = $$("#editor-example option").find(
        (o) => o.value === deck.selectedExampleId,
      );
      if (option) option.textContent = input.value;
    }
  }
  function afterStructureChange() {
    state = C.goTo(deck, Math.min(state.slide, deck.slides.length - 1));
    renderedDots = "";
    save();
    render();
    renderEditor();
  }
  // Pictures are stored inline as data URIs so the standalone file keeps working
  // offline; that only stays reasonable if we shrink them on the way in.
  async function loadPicture(file, path) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      let data = canvas.toDataURL("image/webp", 0.82);
      if (!data.startsWith("data:image/webp"))
        data = canvas.toDataURL("image/jpeg", 0.85);
      if (data.length > C.LIMITS.image)
        throw new Error("התמונה גדולה מדי גם אחרי הכיווץ. כדאי לנסות תמונה קטנה יותר.");
      setPath(path, data);
      renderedSlide = -1;
      save();
      render();
      renderEditor();
      notify(`התמונה נוספה, ${weight(data)}.`);
    } catch (err) {
      notify(
        err.message ||
          "לא הצלחתי לקרוא את הקובץ. אפשר לנסות תמונה בפורמט אחר.",
      );
    }
  }
  function download(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function exportHTML() {
    if (!validEditor()) return;
    const exportId = `portable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    download(
      C.portableHTML(initialHTML, deck, exportId),
      "מצ׳אטבוט-לסוכן.html",
      "text/html;charset=utf-8",
    );
    notify("העותק כולל את התוכן הנוכחי ונפתח גם בלי אינטרנט.");
  }
  async function importJSON(file) {
    if (!file) return;
    try {
      if (file.size > C.LIMITS.importBytes)
        throw new Error(
          `הקובץ גדול מדי. גודל התוכן המרבי הוא ${C.LIMITS.importBytes / 1000000}MB.`,
        );
      const candidate = C.validate(JSON.parse(await file.text()));
      deck = candidate;
      state = C.initialState();
      renderedDots = "";
      save();
      render();
      renderEditor();
      notify("התוכן יובא בהצלחה.");
    } catch (err) {
      notify(
        err instanceof SyntaxError
          ? "זה אינו קובץ JSON תקין. התוכן שלך נשמר ללא שינוי."
          : err.message,
      );
    } finally {
      $("#import-file").value = "";
    }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($("#theater").requestFullscreen)
        await $("#theater").requestFullscreen();
      else notify("מסך מלא אינו זמין כאן. אפשר לפתוח בדפדפן ולהשתמש ב־F11.");
    } catch {
      notify("הדפדפן לא אפשר מסך מלא. אפשר להשתמש ב־F11.");
    }
  }
  $("#slide-root").addEventListener("click", (event) => {
    const b = event.target.closest("[data-action]");
    if (!b) return;
    const action = b.dataset.action;
    if (action === "copy-prompt") copyPrompt(deck.slides[state.slide]);
    else if (action === "timer-toggle" || action === "timer-reset") {
      // Blur first: render restores focus by data-action, so a later blur is lost.
      b.blur();
      if (action === "timer-reset") timers.delete(deck.slides[state.slide].id);
      else toggleTimer();
      render();
    } else act(action);
  });
  $("#slide-root").addEventListener("change", (event) => {
    if (event.target.id === "audience-select")
      changeExample(event.target.value);
  });
  $("#slide-dots").addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (!b) return;
    state = C.goTo(deck, +b.dataset.slide);
    // Hand the keyboard back to the deck; otherwise space re-fires this dot.
    b.blur();
    render();
    wake();
  });
  $("#prev").addEventListener("click", () => act("prev"));
  $("#next").addEventListener("click", () => act("next"));
  $("#edit").addEventListener("click", () => openDialog("editor"));
  $("#appearance").addEventListener("click", () => openDialog("themes"));
  $("#help").addEventListener("click", () => openDialog("shortcuts"));
  $("#fullscreen").addEventListener("click", fullscreen);
  $$("[data-close]").forEach((b) =>
    b.addEventListener("click", () => closeDialog($(`#${b.dataset.close}`))),
  );
  $$("dialog").forEach((d) => {
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeDialog(d);
    });
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          closeDialog(d);
      }
    });
  });
  $("#theme-options").innerHTML = Object.entries(C.THEMES)
    .map(
      ([key, theme]) =>
        `<button data-theme-choice="${key}"><span class="theme-preview" style="background:${theme.swatch[0]};color:${theme.swatch[1]}"><i>Aa</i><b>✳</b></span><span>${esc(theme.name)}</span><small>${esc(theme.hint)}</small></button>`,
    )
    .join("");
  $$("[data-theme-choice]").forEach((b) =>
    b.addEventListener("click", () => {
      deck.theme = b.dataset.themeChoice;
      save();
      render();
    }),
  );
  $("#transition-options").innerHTML = Object.entries(C.TRANSITIONS)
    .map(
      ([key, name]) =>
        `<button data-transition-choice="${key}">${esc(name)}</button>`,
    )
    .join("");
  $$("[data-transition-choice]").forEach((b) =>
    b.addEventListener("click", () => {
      deck.transition = b.dataset.transitionChoice;
      renderedSlide = -1;
      save();
      render();
    }),
  );
  $("#editor-fields").addEventListener("input", (e) => {
    // Selects also fire input; they are handled on change, where the value is final.
    if (e.target.matches("input[data-field], textarea[data-field]"))
      updateField(e.target);
  });
  $("#editor-fields").addEventListener("change", (e) => {
    if (e.target.matches("select[data-field]")) {
      setPath(e.target.dataset.field, e.target.value);
      // Replay the entrance so the presenter sees the preset they just picked.
      renderedSlide = -1;
      renderedSceneKey = null;
      save();
      render();
      return;
    }
    if (e.target.id === "editor-example") {
      if (!validEditor()) {
        e.target.value = deck.selectedExampleId;
        return;
      }
      changeExample(e.target.value);
      renderEditor();
    }
  });
  $("#editor-fields").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.tagName !== "BUTTON" || !validEditor()) return;
    const data = button.dataset;
    if (data.pickPicture) {
      pendingPicturePath = data.pickPicture;
      $("#picture-file").click();
    } else if (data.clearPicture) {
      setPath(data.clearPicture, "");
      renderedSlide = -1;
      save();
      render();
      renderEditor();
    } else if (data.move) {
      const [index, direction] = data.move.split(":").map(Number);
      const target = index + direction;
      if (target < 0 || target >= deck.slides.length) return;
      const [moved] = deck.slides.splice(index, 1);
      deck.slides.splice(target, 0, moved);
      state = C.goTo(deck, target);
      afterStructureChange();
    } else if (data.removeSlide !== undefined) {
      if (deck.slides.length <= 1) return;
      deck.slides.splice(+data.removeSlide, 1);
      afterStructureChange();
    } else if (button.id === "add-slide") {
      if (deck.slides.length >= C.LIMITS.slides) return;
      const added = C.blankSlide($("#new-slide-type").value);
      deck.slides.push(added);
      state = C.goTo(deck, deck.slides.length - 1);
      pendingOpenId = added.id;
      afterStructureChange();
      pendingOpenId = null;
      $(`[data-open-key="${CSS.escape(added.id)}"]`)?.scrollIntoView({
        block: "center",
      });
    } else if (data.addItem !== undefined) {
      const slide = deck.slides[+data.addItem];
      const list = C.SLIDE_TYPES[slide.type].list;
      if (slide[list.key].length >= list.max) return;
      slide[list.key].push(C.blankItem(slide.type));
      afterStructureChange();
    } else if (data.removeItem !== undefined) {
      const [index, position] = data.removeItem.split(":").map(Number);
      const slide = deck.slides[index];
      const list = C.SLIDE_TYPES[slide.type].list;
      if (slide[list.key].length <= list.min) return;
      slide[list.key].splice(position, 1);
      afterStructureChange();
    } else if (button.id === "duplicate") {
      if (deck.examples.length >= C.LIMITS.examples) return;
      const copy = C.clone(C.selected(deck));
      copy.id = C.newId("example");
      copy.name = `${copy.name.slice(0, 29)} — עותק`;
      deck.examples.push(copy);
      changeExample(copy.id);
      renderEditor();
      const name = $('[data-field="example.name"]');
      name.focus();
      name.select();
    } else if (button.id === "add-step") {
      const e = C.selected(deck);
      if (e.steps.length >= C.LIMITS.steps) return;
      e.steps.push({
        label: "שלב חדש",
        detail: "כאן מתארים בקצרה את הפעולה הבאה.",
        artifact: "תוצר חדש",
      });
      afterStructureChange();
    } else if (data.removeStep !== undefined) {
      const e = C.selected(deck);
      if (e.steps.length <= 2) return;
      e.steps.splice(+data.removeStep, 1);
      afterStructureChange();
    }
  });
  $("#export-html").addEventListener("click", exportHTML);
  $("#export-json").addEventListener("click", () => {
    if (validEditor())
      download(
        JSON.stringify(C.validate(deck), null, 2),
        "lecture-content.json",
        "application/json;charset=utf-8",
      );
  });
  $("#import-json").addEventListener("click", () => {
    if (validEditor()) $("#import-file").click();
  });
  $("#import-file").addEventListener("change", (e) =>
    importJSON(e.target.files[0]),
  );
  $("#picture-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file && pendingPicturePath) loadPicture(file, pendingPicturePath);
    pendingPicturePath = null;
    e.target.value = "";
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.ctrlKey ||
      e.altKey ||
      e.metaKey ||
      e.repeat ||
      $("dialog[open]") ||
      e.target.closest('input,textarea,select,[contenteditable="true"]')
    )
      return;
    if (e.key === " " && e.target.closest("button")) return;
    if ([" ", "PageDown", "ArrowLeft"].includes(e.key)) {
      e.preventDefault();
      act("next");
    } else if (["PageUp", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      act("prev");
    } else if (e.key.toLowerCase() === "f") {
      e.preventDefault();
      fullscreen();
    } else if (e.key.toLowerCase() === "n") {
      e.preventDefault();
      notesOpen = !notesOpen;
      render();
    } else if (e.key.toLowerCase() === "b") {
      e.preventDefault();
      document.body.classList.toggle("blacked-out");
    }
  });
  document.addEventListener("pointermove", wake, { passive: true });
  document.addEventListener("pointerdown", wake, { passive: true });
  document.addEventListener("focusin", wake);
  document.addEventListener("fullscreenchange", () => {
    $("#fullscreen").setAttribute(
      "aria-label",
      document.fullscreenElement ? "יציאה ממסך מלא" : "מסך מלא",
    );
    wake();
  });
  render();
  save();
  document.body.classList.add("controls-idle");
  if (!canSave)
    notify("השמירה המקומית אינה זמינה. אפשר לערוך ולהוריד עותק דרך העורך.");
})();
