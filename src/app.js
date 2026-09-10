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
  const embedded = C.validate(JSON.parse($("#deck-data").textContent));
  const storageKey = `lecture-stage:${embedded.documentId}`;
  let deck = C.clone(embedded),
    state = C.initialState(),
    canSave = true,
    idleTimer,
    toastTimer,
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
  const atmosphere = () =>
    '<div class="atmosphere" aria-hidden="true"><div class="light-arc arc-one"></div><div class="light-arc arc-two"></div></div>';
  const frame = (index, classes, style, body) =>
    `<section class="slide ${classes}" aria-label="שקף ${index + 1}" style="${style}">${atmosphere()}${body}</section>`;
  const caption = (value) =>
    value ? `<p class="scene-caption">${esc(value)}</p>` : "";

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
      index,
      "statement-slide",
      `--headline-size:${size}cqw`,
      `<div class="scene statement-scene"><h1>${esc(slide.title)}${slide.accent ? ` <span>${esc(slide.accent)}</span>` : ""}</h1>${caption(slide.caption)}</div>${opening}`,
    );
  }
  function demoSlide(slide, index) {
    const size = Math.min(9.5, 340 / (slide.title.length + 2));
    const copy = slide.prompt
      ? `<div class="scene-controls demo-controls"><button class="quiet-button" data-action="copy-prompt">${icon("copy")}העתקת הפרומפט</button></div>`
      : "";
    return frame(
      index,
      "demo-slide",
      `--headline-size:${size}cqw`,
      `<div class="scene statement-scene"><span class="demo-tool">${esc(slide.tool)}</span><h1>${esc(slide.title)}</h1>${caption(slide.caption)}</div>${copy}`,
    );
  }
  function revealSlide(slide, index, step) {
    const words = slide.items
      .map(
        (item, i) =>
          `<li data-state="${i < step ? "past" : i === step ? "now" : "next"}">${esc(item.word)}</li>`,
      )
      .join("");
    const size = Math.min(
      9,
      210 / Math.max(...slide.items.map((i) => i.word.length)),
    );
    return frame(
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
      index,
      "tokens-slide",
      "",
      `<div class="scene tokens-scene"><p class="scene-eyebrow">${esc(slide.title)}</p>${body}${step === 1 ? caption(slide.caption) : ""}</div>`,
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
  function render() {
    const actionFocus = document.activeElement?.dataset.action;
    const slide = deck.slides[state.slide];
    document.documentElement.dataset.theme = deck.theme;
    $("#slide-root").innerHTML = SCENES[slide.type](
      slide,
      state.slide,
      state.step,
    );
    if (renderedSlide === state.slide)
      $("#slide-root .slide").classList.add("no-entry");
    renderedSlide = state.slide;
    const sceneKey = `${state.slide}:${state.step}`;
    if (renderedSceneKey === sceneKey)
      $("#slide-root .slide").classList.add("no-motion");
    renderedSceneKey = sceneKey;
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
  const fieldsFor = (source, specs, prefix) =>
    Object.entries(specs)
      .map(([key, spec]) =>
        field(
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
  function slideEditor(slide, index, open) {
    const type = C.SLIDE_TYPES[slide.type];
    const last = deck.slides.length - 1;
    return `<details data-open-key="${esc(slide.id)}" ${open ? "open" : ""}><summary><span class="slide-editor-name">${index + 1}. ${esc(slideName(slide))}</span><small>${esc(type.label)}</small></summary>
      <div class="slide-editor-tools"><button class="icon-button" data-move="${index}:-1" aria-label="העברת השקף למעלה" ${index === 0 ? "disabled" : ""}>${icon("up")}</button><button class="icon-button" data-move="${index}:1" aria-label="העברת השקף למטה" ${index === last ? "disabled" : ""}>${icon("down")}</button><button class="icon-button" data-remove-slide="${index}" aria-label="מחיקת השקף" ${last === 0 ? "disabled" : ""}>${icon("trash")}</button></div>
      <p class="editor-note">${esc(type.hint)}</p>
      ${fieldsFor(slide, type.fields, `slides.${index}`)}
      ${type.list ? listEditor(slide, index, type.list) : ""}
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
      if (file.size > 500000)
        throw new Error("הקובץ גדול מדי. גודל התוכן המרבי הוא 500KB.");
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
    if (b.dataset.action === "copy-prompt") copyPrompt(deck.slides[state.slide]);
    else act(b.dataset.action);
  });
  $("#slide-root").addEventListener("change", (event) => {
    if (event.target.id === "audience-select")
      changeExample(event.target.value);
  });
  $("#slide-dots").addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (!b) return;
    state = C.goTo(deck, +b.dataset.slide);
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
  $$("[data-theme-choice]").forEach((b) =>
    b.addEventListener("click", () => {
      deck.theme = b.dataset.themeChoice;
      save();
      render();
    }),
  );
  $("#editor-fields").addEventListener("input", (e) => {
    if (e.target.matches("[data-field]")) updateField(e.target);
  });
  $("#editor-fields").addEventListener("change", (e) => {
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
    if (data.move) {
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
      deck.slides.push(C.blankSlide($("#new-slide-type").value));
      state = C.goTo(deck, deck.slides.length - 1);
      afterStructureChange();
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
