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
    renderedSceneKey = null;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) deck = C.validate(JSON.parse(stored));
  } catch {
    canSave = false;
  }
  const icons = {
    next: '<path d="m14 6-6 6 6 6"/>',
    prev: '<path d="m10 6 6 6-6 6"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L20 8a3.5 3.5 0 0 0-5-5L4 14Z"/>',
    palette:
      '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="8" r=".6"/><circle cx="6.5" cy="12" r=".6"/><circle cx="14" cy="7" r=".6"/><path d="M19 15h-5a2 2 0 0 0-2 2v4"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    keyboard:
      '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h1m4 0h1m4 0h1M6 12h1m4 0h1m4 0h1M7 15h10"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    replay: '<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
    goal: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".7"/>',
    plan: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h3"/>',
    tools:
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 14v7M14 17.5h7"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    shield:
      '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 11 3 3 5-5"/>',
    result: '<path d="M5 3h10l4 4v14H5Zm9 0v5h5M8 12h8m-8 4h6"/>',
    chat: '<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9l-5 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M7 9h10m-10 4h6"/>',
    agent:
      '<circle cx="12" cy="12" r="3"/><circle cx="4" cy="4" r="1.5"/><circle cx="20" cy="4" r="1.5"/><circle cx="20" cy="20" r="1.5"/><circle cx="4" cy="20" r="1.5"/><path d="m6 6 4 4m4 4 4 4m0-12-4 4m-4 4-4 4"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 4V3H3v13h1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
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
  function intro() {
    const size = Math.min(
      10.5,
      390 / (deck.intro.title.length + deck.intro.accent.length + 4),
    );
    return `<section class="slide intro-slide" aria-label="שקף 1: מצ׳אטבוט לסוכן" style="--headline-size:${size}cqw">${atmosphere()}<div class="scene intro-scene"><h1>${esc(deck.intro.title)} <span>${esc(deck.intro.accent)}</span></h1><p class="scene-caption">${esc(deck.intro.subtitle)}</p></div><div class="scene-controls intro-controls"><button class="quiet-button" data-action="next">מתחילים ${icon("next")}</button><button class="icon-button" data-action="replay" aria-label="הפעלה חוזרת של הפתיחה">${icon("replay")}</button></div></section>`;
  }
  function experiment() {
    const e = C.selected(deck),
      agent = state.mode === "agent",
      step = e.steps[state.step],
      complete = agent && state.step === e.steps.length - 1;
    const heading = agent ? step.label : deck.experiment.title;
    const size = Math.min(13, 195 / (heading.length + 2));
    return `<section class="slide experiment-slide ${agent ? "agent-scene" : "chat-scene"} ${complete ? "complete-scene" : ""}" aria-label="שקף 2: מתשובה לביצוע" style="--scene-size:${size}cqw;--phase:${Math.max(0, state.step)}">${atmosphere()}<div class="scene experiment-scene"><p class="scene-context">${esc(e.task)}</p><div class="scene-message"><h2 class="scene-word">${esc(heading)}</h2><p class="scene-caption">${esc(agent ? step.artifact : e.answer)}</p></div></div><span class="simulation-note">המחשה</span><div class="scene-controls experiment-controls"><div class="mode-switch" role="group" aria-label="מצב ההדגמה"><button data-action="chat" aria-pressed="${!agent}">צ׳אטבוט</button><button data-action="agent" aria-pressed="${agent}">סוכן</button></div><select id="audience-select" aria-label="בחירת דוגמה">${exampleOptions()}</select><button class="quiet-button" data-action="${complete ? "reset" : "next"}">${complete ? "שוב" : agent ? "השלב הבא" : "נעבור לסוכן"}${icon(complete ? "replay" : "next")}</button><span class="step-counter" aria-label="התקדמות">${agent ? `${state.step + 1} / ${e.steps.length}` : ""}</span></div></section>`;
  }
  function exampleOptions() {
    return deck.examples
      .map(
        (e) =>
          `<option value="${esc(e.id)}" ${e.id === deck.selectedExampleId ? "selected" : ""}>${esc(e.name)}</option>`,
      )
      .join("");
  }
  function render() {
    const actionFocus = document.activeElement?.dataset.action;
    document.documentElement.dataset.theme = deck.theme;
    $("#slide-root").innerHTML = state.slide === 0 ? intro() : experiment();
    if (renderedSlide === state.slide)
      $("#slide-root .slide").classList.add("no-entry");
    renderedSlide = state.slide;
    const sceneKey = `${state.slide}:${state.mode}:${state.step}`;
    if (renderedSceneKey === sceneKey)
      $("#slide-root .slide").classList.add("no-motion");
    renderedSceneKey = sceneKey;
    const live = $("#slide-announcement");
    live.textContent =
      state.slide === 0
        ? "שקף 1: " + deck.intro.title + " " + deck.intro.accent
        : state.mode === "chat"
          ? "שקף 2: תשובת הצ׳אטבוט"
          : "שלב " +
            (state.step + 1) +
            ": " +
            C.selected(deck).steps[state.step].label;
    $("#position").textContent = state.slide === 0 ? "01 / 02" : "02 / 02";
    $$(".slide-dots button").forEach((b) => {
      if (+b.dataset.slide === state.slide)
        b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    $("#prev").disabled = state.slide === 0;
    $("#next").disabled =
      state.slide === 1 &&
      state.mode === "agent" &&
      state.step === C.selected(deck).steps.length - 1;
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
    state = C.transition(state, action, C.selected(deck).steps.length);
    render();
    wake();
  }
  function changeExample(id) {
    if (!deck.examples.some((e) => e.id === id)) return;
    deck.selectedExampleId = id;
    state = { ...state, mode: "chat", step: -1 };
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
  const field = (label, path, value, max, multi = false) =>
    `<label class="field"><span class="field-head"><span>${label}</span><small>${value.length} / ${max}</small></span>${multi ? `<textarea rows="2"` : '<input type="text"'} data-field="${path}" maxlength="${max}" required ${multi ? `>${esc(value)}</textarea>` : `value="${esc(value)}">`}</label>`;
  function renderEditor() {
    const e = C.selected(deck);
    $("#editor-fields").innerHTML =
      `<details><summary>שקף הפתיחה</summary>${field("כותרת", "intro.title", deck.intro.title, 40)}${field("שורת הדגשה", "intro.accent", deck.intro.accent, 40)}${field("משפט פתיחה", "intro.subtitle", deck.intro.subtitle, 100, true)}</details>
      <details><summary>כותרת הניסוי</summary>${field("הכותרת במצב צ׳אטבוט", "experiment.title", deck.experiment.title, 40)}${field("הערת מעבר למרצה — לא מוקרנת", "experiment.subtitle", deck.experiment.subtitle, 100, true)}</details>
      <details open><summary>דוגמאות לקהלים</summary><label class="field"><span class="field-head">הדוגמה לעריכה</span><select id="editor-example">${exampleOptions()}</select></label><button class="duplicate-button" id="duplicate" ${deck.examples.length >= 20 ? "disabled" : ""}>${icon("copy")}שכפול לקהל אחר</button><p class="editor-note">שכפל דוגמה ושנה את התוכן. הפריסה נשארת קבועה.</p>${field("שם הדוגמה / הקהל", "example.name", e.name, 40)}${field("המטרה", "example.task", e.task, 110, true)}${field("תשובת הצ׳אטבוט", "example.answer", e.answer, 180, true)}</details>
      <details open><summary>מסלול הסוכן</summary><p class="editor-note">בין 2 ל־6 שלבים. על הבמה יופיעו רק שם הפעולה והתוצר. ההסבר המפורט נשאר כאן.</p>${e.steps.map((s, i) => `<section class="step-editor"><div class="step-editor-header"><span>שלב ${i + 1}</span><button class="icon-button" data-remove-step="${i}" aria-label="הסרת שלב ${i + 1}" ${e.steps.length <= 2 ? "disabled" : ""}>${icon("trash")}</button></div>${field("שם השלב", `steps.${i}.label`, s.label, 18)}${field("הערת מרצה — לא מוקרנת", `steps.${i}.detail`, s.detail, 120, true)}${field("שם התוצר", `steps.${i}.artifact`, s.artifact, 40)}</section>`).join("")}<button class="duplicate-button" id="add-step" ${e.steps.length >= 6 ? "disabled" : ""}>${icon("plus")}הוספת שלב</button></details>`;
  }
  function updateField(input) {
    input.closest(".field").querySelector("small").textContent =
      `${input.value.length} / ${input.maxLength}`;
    if (!input.value.trim()) {
      input.setCustomValidity("יש למלא טקסט קצר.");
      $("#save-status").textContent = "השדה הריק עדיין לא נשמר.";
      return;
    }
    input.setCustomValidity("");
    const path = input.dataset.field.split(".");
    if (path[0] === "example") C.selected(deck)[path[1]] = input.value;
    else if (path[0] === "steps")
      C.selected(deck).steps[+path[1]][path[2]] = input.value;
    else deck[path[0]][path[1]] = input.value;
    save();
    render();
    if (input.dataset.field === "example.name") {
      const option = $$("#editor-example option").find(
        (o) => o.value === deck.selectedExampleId,
      );
      if (option) option.textContent = input.value;
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
      if (file.size > 500000)
        throw new Error("הקובץ גדול מדי. גודל התוכן המרבי הוא 500KB.");
      const candidate = C.validate(JSON.parse(await file.text()));
      deck = candidate;
      state = C.initialState();
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
    if (b) act(b.dataset.action);
  });
  $("#slide-root").addEventListener("change", (event) => {
    if (event.target.id === "audience-select")
      changeExample(event.target.value);
  });
  $$(".slide-dots button").forEach((b) =>
    b.addEventListener("click", () => {
      state = { slide: +b.dataset.slide, mode: "chat", step: -1 };
      render();
      wake();
    }),
  );
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
    if (!button || !validEditor()) return;
    const e = C.selected(deck);
    if (button.id === "duplicate" && deck.examples.length < 20) {
      const copy = C.clone(e);
      copy.id = `example-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      copy.name = `${e.name.slice(0, 29)} — עותק`;
      deck.examples.push(copy);
      changeExample(copy.id);
      renderEditor();
      const name = $('[data-field="example.name"]');
      name.focus();
      name.select();
      return;
    }
    if (button.id === "add-step" && e.steps.length < 6)
      e.steps.push({
        label: "שלב חדש",
        detail: "כאן מתארים בקצרה את הפעולה הבאה.",
        artifact: "תוצר חדש",
      });
    else if (button.hasAttribute("data-remove-step") && e.steps.length > 2)
      e.steps.splice(+button.dataset.removeStep, 1);
    else return;
    state = { ...state, mode: "chat", step: -1 };
    save();
    render();
    renderEditor();
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
