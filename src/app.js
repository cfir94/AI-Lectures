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
    selectedObjectId = null,
    editingObjectTextId = null,
    activeObjectPointer = null,
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
    else if (kind === "picture")
      inner = slide.backdropPicture
        ? `<img class="backdrop-image" src="${esc(slide.backdropPicture)}" alt=""><span class="backdrop-scrim"></span>`
        : '<p class="image-placeholder">בחרו תמונת רקע בעורך.</p>';
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
  const shapeMarkup = (object) => {
    const common = `fill="${esc(object.color)}" stroke="${esc(object.stroke)}" stroke-width="${esc(object.strokeWidth)}" vector-effect="non-scaling-stroke"`;
    if (object.shape === "circle")
      return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="50" rx="47" ry="47" ${common}/></svg>`;
    if (object.shape === "line")
      return `<svg viewBox="0 0 100 100" aria-hidden="true"><line x1="4" y1="50" x2="96" y2="50" stroke="${esc(object.color)}" stroke-width="${Math.max(2, Number(object.strokeWidth))}" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
    if (object.shape === "arrow")
      return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M5 50h78M66 26l24 24-24 24" fill="none" stroke="${esc(object.color)}" stroke-width="${Math.max(2, Number(object.strokeWidth))}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
    if (object.shape === "star")
      return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="m50 4 11 31 33 1-26 20 10 33-28-19-28 19 10-33L6 36l33-1Z" ${common}/></svg>`;
    if (object.shape === "blob")
      return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M82 22c13 17 9 45-7 61-16 15-43 17-59 2C1 70 4 40 19 21 34 3 68 4 82 22Z" ${common}/></svg>`;
    if (object.shape === "ring")
      return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="50" rx="43" ry="43" fill="none" stroke="${esc(object.color)}" stroke-width="${Math.max(3, Number(object.strokeWidth))}" vector-effect="non-scaling-stroke"/></svg>`;
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="2" y="2" width="96" height="96" rx="8" ${common}/></svg>`;
  };
  const visualMarkup = (object) => {
    const style = `--visual-colour:${esc(object.color)};--visual-secondary:${esc(object.secondary)}`;
    const labels = [object.label1, object.label2, object.label3];
    if (object.visual === "glass")
      return `<div class="visual-component visual-glass" style="${style}" role="img" aria-label="משטח זכוכית נוזלית"><i></i><span>${esc(labels.filter(Boolean).join(" · "))}</span></div>`;
    if (object.visual === "stars") {
      const random = seeded(object.id);
      const stars = Array.from({ length: 54 }, () =>
        `<i style="--sx:${(random() * 100).toFixed(1)}%;--sy:${(random() * 100).toFixed(1)}%;--ss:${(0.7 + random() * 2.1).toFixed(1)}px;--sd:${(-random() * 8).toFixed(1)}s"></i>`,
      ).join("");
      return `<div class="visual-component visual-stars" style="${style}" role="img" aria-label="שדה כוכבים מונפש">${stars}<span>${esc(object.label1)}</span></div>`;
    }
    return `<div class="visual-component visual-accordion" style="${style}" aria-label="כרטיס אקורדיון אינטראקטיבי">${labels.map((label) => `<p><span>${esc(label)}</span></p>`).join("")}</div>`;
  };
  const objectMarkup = (object, index) => {
    const selected = selectedObjectId === object.id;
    const editingText =
      selected &&
      editingObjectTextId === object.id &&
      object.type === "text" &&
      $("#editor")?.open;
    const style = `left:${object.x}%;top:${object.y}%;width:${object.width}%;height:${object.height}%;--object-rotation:${object.rotation}deg;--object-opacity:${Number(object.opacity) / 100};z-index:${index + 1}`;
    let body = "";
    if (object.type === "text")
      body = `<p class="object-text text-${object.style} ${editingText ? "is-editing" : ""}" data-editable-text="true" style="--object-size:${object.fontSize};--object-weight:${object.weight};--object-align:${object.align};--object-colour:${esc(object.color)}" ${editingText ? 'contenteditable="true" spellcheck="true" data-object-text-editor="true" aria-label="עריכת הטקסט על הבמה"' : 'aria-label="טקסט חופשי — לחיצה כפולה לעריכה"'}>${esc(object.text)}</p>`;
    else if (object.type === "image")
      body = object.picture
        ? `<img class="object-image" src="${esc(object.picture)}" alt="${esc(object.alt)}" style="object-fit:${object.fit};border-radius:${object.radius}%">`
        : '<span class="object-placeholder">תמונה</span>';
    else if (object.type === "visual") body = visualMarkup(object);
    else body = shapeMarkup(object);
    const handles =
      selected
        ? '<i class="object-handle resize-se" data-object-handle="resize" aria-hidden="true"></i>'
        : "";
    return `<div class="free-object free-object-${object.type} object-enter-${object.entrance} object-exit-${object.exit} ${selected ? "selected" : ""}" data-object-id="${esc(object.id)}" style="${style}">${body}${handles}</div>`;
  };
  const freeObjects = (slide) =>
    slide.objects?.length
      ? `<div class="free-object-layer">${slide.objects.map(objectMarkup).join("")}</div>`
      : "";
  const optionMarkup = (options, selected) =>
    Object.entries(options)
      .map(
        ([value, name]) =>
          `<option value="${value}" ${value === selected ? "selected" : ""}>${esc(name)}</option>`,
      )
      .join("");
  const currentObject = () =>
    deck.slides[state.slide]?.objects.find(
      (object) => object.id === selectedObjectId,
    );
  function renderObjectToolbar() {
    const toolbar = $("#object-toolbar");
    const object = currentObject();
    if (!$("#editor").open || !object) {
      toolbar.hidden = true;
      toolbar.innerHTML = "";
      return;
    }
    const colour =
      object.type === "text" || object.type === "shape" || object.type === "visual"
        ? `<label class="stage-colour"><span>${object.type === "text" ? "צבע טקסט" : object.type === "visual" ? "צבע רכיב" : "צבע צורה"}</span><input type="color" value="${esc(object.color)}" data-toolbar-colour aria-label="בחירת צבע"></label>`
        : "";
    const textTools =
      object.type === "text"
        ? `<button data-toolbar-edit-text aria-pressed="${editingObjectTextId === object.id}">${editingObjectTextId === object.id ? "סיום טקסט" : "עריכת טקסט"}</button><label class="stage-text-style"><span>מראה הטקסט</span><select data-toolbar-text-style>${optionMarkup(C.TEXT_STYLES, object.style)}</select></label>`
        : "";
    toolbar.innerHTML = `${textTools}${colour}<label class="stage-motion"><span>כניסה</span><select data-toolbar-object-prop="entrance">${optionMarkup(C.OBJECT_ENTRANCES, object.entrance)}</select></label><label class="stage-motion"><span>יציאה</span><select data-toolbar-object-prop="exit">${optionMarkup(C.OBJECT_EXITS, object.exit)}</select></label><button data-toolbar-snap aria-pressed="${object.snap === "on"}">${object.snap === "on" ? "גריד פעיל" : "בלי הצמדה"}</button>`;
    toolbar.hidden = false;
  }
  function previewObjectMotion(id, phase, preset) {
    requestAnimationFrame(() => {
      const element = $(`.free-object[data-object-id="${CSS.escape(id)}"]`);
      if (!element || preset === "none" || reducedMotion() || !element.animate)
        return;
      const rotation = "rotate(var(--object-rotation, 0deg))";
      const opacity = "var(--object-opacity, 1)";
      const entrance = {
        fade: [{ opacity: 0 }, { opacity }],
        rise: [
          { opacity: 0, transform: `${rotation} translateY(28px)` },
          { opacity, transform: rotation },
        ],
        zoom: [
          { opacity: 0, transform: `${rotation} scale(0.78)` },
          { opacity, transform: rotation },
        ],
        wipe: [
          { opacity: 0, clipPath: "inset(0 100% 0 0)" },
          { opacity, clipPath: "inset(0)" },
        ],
        pop: [
          { opacity: 0, transform: `${rotation} scale(0.72)` },
          { opacity, transform: `${rotation} scale(1.05)`, offset: 0.72 },
          { opacity, transform: rotation },
        ],
      };
      const exit = {
        fade: [{ opacity }, { opacity: 0 }],
        fall: [
          { opacity, transform: rotation },
          { opacity: 0, transform: `${rotation} translateY(34px)` },
        ],
        shrink: [
          { opacity, transform: rotation },
          { opacity: 0, transform: `${rotation} scale(0.72)` },
        ],
        wipe: [
          { opacity, clipPath: "inset(0)" },
          { opacity: 0, clipPath: "inset(0 0 0 100%)" },
        ],
      };
      const frames = (phase === "entrance" ? entrance : exit)[preset];
      if (!frames) return;
      element.animate(frames, {
        duration: phase === "entrance" ? 720 : 520,
        easing:
          phase === "entrance"
            ? "cubic-bezier(0.22, 0.7, 0.3, 1)"
            : "cubic-bezier(0.4, 0, 1, 1)",
      });
    });
  }
  const frame = (slide, index, classes, style, body) =>
    `<section class="slide ${classes} motion-${slide.motion}" aria-label="שקף ${index + 1}" style="${style}">${backdrop(slide)}${body}${freeObjects(slide)}</section>`;
  const isBound = (slide, key) =>
    slide.objects?.some((object) => object.bind === key);
  const visibleText = (slide, key) => (isBound(slide, key) ? "" : slide[key]);
  const caption = (slide, value, key = "caption") =>
    value && !isBound(slide, key)
      ? `<p class="scene-caption" ${key ? `data-slide-text="${esc(key)}"` : ""}>${esc(value)}</p>`
      : "";
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
    const title = visibleText(slide, "title");
    const accent = visibleText(slide, "accent");
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
      `<div class="scene statement-scene"><h1 data-slide-text="title">${headline(slide, title)}${accent ? ` <span data-slide-text="accent">${headline(slide, accent)}</span>` : ""}</h1>${caption(slide, slide.caption)}</div>${opening}`,
    );
  }
  function demoSlide(slide, index) {
    const title = visibleText(slide, "title");
    const tool = visibleText(slide, "tool");
    const size = Math.min(9.5, 340 / (slide.title.length + 2));
    const copy = slide.prompt
      ? `<div class="scene-controls demo-controls"><button class="quiet-button" data-action="copy-prompt">${icon("copy")}העתקת הפרומפט</button></div>`
      : "";
    return frame(
      slide,
      index,
      "demo-slide",
      `--headline-size:${size}cqw`,
      `<div class="scene statement-scene">${tool ? `<span class="demo-tool" data-slide-text="tool">${esc(tool)}</span>` : ""}<h1 data-slide-text="title">${headline(slide, title)}</h1>${caption(slide, slide.caption)}</div>${copy}`,
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
      `<div class="scene reveal-scene">${visibleText(slide, "title") ? `<p class="scene-eyebrow" data-slide-text="title">${esc(slide.title)}</p>` : ""}<ol class="reveal-list">${words}</ol>${caption(slide, slide.items[step].caption, "")}</div>`,
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
      `<div class="scene tokens-scene">${visibleText(slide, "title") ? `<p class="scene-eyebrow" data-slide-text="title">${esc(slide.title)}</p>` : ""}${body}${step === 1 ? caption(slide, slide.caption) : ""}</div>`,
    );
  }
  function imageSlide(slide, index) {
    const media = slide.picture
      ? `<img class="slide-image" src="${esc(slide.picture)}" alt="${esc(slide.alt || slide.title || "תמונה בשקף")}" style="object-fit:${slide.fit}">`
      : `<p class="image-placeholder">עדיין אין תמונה כאן. אפשר להעלות אותה בעורך.</p>`;
    const imageTitle = visibleText(slide, "title");
    const imageCaption = visibleText(slide, "caption");
    const overlay =
      imageTitle || imageCaption
        ? `<div class="scene image-scene"><div class="image-text">${imageTitle ? `<h1 data-slide-text="title">${headline(slide, imageTitle)}</h1>` : ""}${caption(slide, imageCaption)}</div></div>`
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
      `<div class="scene number-scene">${visibleText(slide, "title") ? `<p class="scene-eyebrow" data-slide-text="title">${esc(slide.title)}</p>` : ""}<p class="big-number"><span data-count="${esc(slide.value)}">${esc(slide.value)}</span>${visibleText(slide, "unit") ? `<em data-slide-text="unit">${esc(slide.unit)}</em>` : ""}</p>${caption(slide, slide.caption)}</div>`,
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
      `<div class="scene split-scene">${visibleText(slide, "title") ? `<p class="scene-eyebrow" data-slide-text="title">${esc(slide.title)}</p>` : ""}<ol class="split-list">${sides}</ol></div>`,
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
      `<div class="scene timer-scene">${visibleText(slide, "title") ? `<p class="scene-eyebrow" data-slide-text="title">${esc(slide.title)}</p>` : ""}<p class="timer-readout" data-timer dir="ltr">${clockText(left)}</p>${caption(slide, slide.caption)}</div><div class="scene-controls timer-controls"><button class="quiet-button" data-action="timer-toggle">${icon(state.running ? "pause" : "play")}${state.running ? "עצירה" : left === 0 ? "שוב" : "התחלה"}</button><button class="quiet-button" data-action="timer-reset">${icon("replay")}איפוס</button></div>`,
    );
  }
  function canvasSlide(slide, index) {
    return frame(
      slide,
      index,
      "canvas-slide",
      "",
      '<div class="scene canvas-scene"><p class="canvas-empty">הוסיפו אובייקטים דרך העורך.</p></div>',
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
    canvas: canvasSlide,
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
    root.dataset.transition = slide.transition;
    const html = SCENES[slide.type](slide, state.slide, state.step);
    const sameSlide = renderedSlide === state.slide;
    const direction = state.slide < renderedSlide ? -1 : 1;
    root.querySelectorAll(".slide.leaving").forEach((el) => el.remove());
    const previous = root.lastElementChild;
    const hasObjectExits =
      previous?.querySelector(".free-object:not(.object-exit-none)") ?? null;
    const exitsOnly =
      previous && !sameSlide && slide.transition === "cut" && hasObjectExits;
    const slideExitTime = { cut: 0, fade: 340, push: 440, zoom: 400 }[
      slide.transition
    ];
    const outgoingTime = Math.max(slideExitTime, hasObjectExits ? 520 : 0);
    if (
      previous &&
      !sameSlide &&
      !reducedMotion() &&
      (slide.transition !== "cut" || exitsOnly)
    ) {
      previous.classList.add("leaving");
      if (hasObjectExits)
        previous.style.setProperty("--slide-exit-duration", "0.52s");
      if (exitsOnly) previous.classList.add("object-exits-only");
      const drop = () => previous.remove();
      // animationend bubbles, so only the slide's own exit may retire it.
      if (!hasObjectExits)
        previous.addEventListener("animationend", (event) => {
          if (event.target === previous) drop();
        });
      setTimeout(drop, outgoingTime + 80);
      root.insertAdjacentHTML("beforeend", html);
      root.lastElementChild.classList.add("entering");
      root.lastElementChild.style.setProperty(
        "--enter-delay",
        `${(outgoingTime + 40) / 1000}s`,
      );
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
    if (actionFocus)
      $(`[data-action="${actionFocus}"]`)?.focus({ preventScroll: true });
    renderObjectToolbar();
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
  const withinDocumentLimit = () =>
    C.serializedBytes(deck) <= C.LIMITS.importBytes;
  const documentLimitMessage = () =>
    notify(
      `המצגת גדולה מדי. כדי לשמור אותה בדפדפן ובקובץ נייד, הגודל המרבי הוא ${C.LIMITS.importBytes / 1000000}MB.`,
    );
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
  function setStageEditing(active) {
    document.body.classList.toggle("editor-stage-mode", active);
    $("#editor-stage-toggle").textContent = active ? "חזרה לעורך" : "עריכת במה";
    $("#editor-stage-toggle").setAttribute("aria-pressed", String(active));
  }
  function openDialog(id) {
    wake();
    if (id === "editor") {
      renderEditor();
      document.body.classList.add("editing");
      setStageEditing(false);
      $(`#${id}`).show();
    } else $(`#${id}`).showModal();
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
    if (dialog.id === "editor") {
      document.body.classList.remove("editing");
      setStageEditing(false);
      editingObjectTextId = null;
      render();
    }
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
    transition: "מעבר לשקף הזה",
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
  const objectName = (object) =>
    object.type === "text"
      ? object.text.slice(0, 28)
      : object.type === "image"
        ? "תמונה חופשית"
        : object.type === "visual"
          ? C.VISUALS[object.visual]
        : C.SHAPES[object.shape];
  const objectInput = (label, slideIndex, object, key, min, max, step = 1) =>
    `<label class="object-field"><span>${label}</span><input type="number" value="${esc(object[key])}" min="${min}" max="${max}" step="${step}" data-object-slide="${slideIndex}" data-object-id="${esc(object.id)}" data-object-prop="${key}"></label>`;
  const OBJECT_SWATCHES = [
    "#f6f7f8",
    "#202526",
    "#b5d8fb",
    "#ff8fab",
    "#ffd166",
    "#7fe3b0",
    "#b9a3ff",
  ];
  const objectColour = (label, slideIndex, object, key) =>
    `<div class="object-field colour-field"><span>${label}</span><label class="colour-picker"><input type="color" value="${esc(object[key])}" data-object-slide="${slideIndex}" data-object-id="${esc(object.id)}" data-object-prop="${key}" aria-label="${esc(label)}"><output>${esc(object[key])}</output></label><div class="colour-swatches" aria-label="צבעים מהירים">${OBJECT_SWATCHES.map((colour) => `<button type="button" style="--swatch:${colour}" data-object-colour="${slideIndex}:${esc(object.id)}:${key}:${colour}" aria-label="${colour}"></button>`).join("")}</div></div>`;
  const objectPicker = (label, slideIndex, object, key, options) =>
    `<label class="object-field"><span>${label}</span><select data-object-slide="${slideIndex}" data-object-id="${esc(object.id)}" data-object-prop="${key}">${Object.entries(options)
      .map(
        ([value, name]) =>
          `<option value="${value}" ${value === object[key] ? "selected" : ""}>${esc(name)}</option>`,
      )
      .join("")}</select></label>`;
  function objectEditor(object, slideIndex, objectIndex) {
    const common = `<div class="object-animation-grid">${objectPicker("כניסה", slideIndex, object, "entrance", C.OBJECT_ENTRANCES)}${objectPicker("יציאה", slideIndex, object, "exit", C.OBJECT_EXITS)}${objectPicker("הצמדה", slideIndex, object, "snap", C.SNAP_MODES)}</div><div class="object-transform-grid">${objectInput("X באחוזים", slideIndex, object, "x", 0, 100, 0.1)}${objectInput("Y באחוזים", slideIndex, object, "y", 0, 100, 0.1)}${objectInput("רוחב", slideIndex, object, "width", 2, 100, 0.1)}${objectInput("גובה", slideIndex, object, "height", 2, 100, 0.1)}${objectInput("סיבוב", slideIndex, object, "rotation", -180, 180)}${objectInput("שקיפות", slideIndex, object, "opacity", 0, 100)}</div>`;
    let specific = "";
    if (object.type === "text")
      specific = `<label class="field"><span class="field-head"><span>תוכן הטקסט</span><small>${object.text.length} / 500</small></span><textarea rows="3" maxlength="500" required data-object-slide="${slideIndex}" data-object-id="${esc(object.id)}" data-object-prop="text">${esc(object.text)}</textarea></label><div class="object-transform-grid">${objectInput("גודל גופן", slideIndex, object, "fontSize", 8, 300)}${objectPicker("משקל", slideIndex, object, "weight", { 300: "דק", 400: "רגיל", 600: "מודגש", 800: "כבד" })}${objectPicker("יישור", slideIndex, object, "align", C.ALIGNS)}${objectPicker("מראה הטקסט", slideIndex, object, "style", C.TEXT_STYLES)}</div>${objectColour("צבע הטקסט", slideIndex, object, "color")}`;
    else if (object.type === "image")
      specific = `${pictureField("קובץ התמונה", `slides.${slideIndex}.objects.${objectIndex}.picture`, object.picture)}${field("תיאור לקורא מסך", `slides.${slideIndex}.objects.${objectIndex}.alt`, object.alt, 120, false, false)}<div class="object-transform-grid">${objectPicker("התאמה למסגרת", slideIndex, object, "fit", C.FITS)}${objectInput("עיגול פינות", slideIndex, object, "radius", 0, 50)}</div>`;
    else if (object.type === "visual")
      specific = `<div class="object-transform-grid">${objectPicker("רכיב", slideIndex, object, "visual", C.VISUALS)}</div>${objectColour("צבע ראשי", slideIndex, object, "color")}${objectColour("צבע רקע", slideIndex, object, "secondary")}${["label1", "label2", "label3"].map((key, labelIndex) => field(`טקסט ${labelIndex + 1}`, `slides.${slideIndex}.objects.${objectIndex}.${key}`, object[key], 40, false, false)).join("")}`;
    else
      specific = `<div class="object-transform-grid">${objectPicker("צורה", slideIndex, object, "shape", C.SHAPES)}${objectColour("מילוי", slideIndex, object, "color")}${objectColour("קו", slideIndex, object, "stroke")}${objectInput("עובי קו", slideIndex, object, "strokeWidth", 0, 20)}</div>`;
    return `<section class="object-editor ${selectedObjectId === object.id ? "selected" : ""}" data-object-card="${esc(object.id)}"><div class="object-editor-header"><button class="object-select" data-select-object="${slideIndex}:${esc(object.id)}"><span>${esc(objectName(object))}</span><small>${esc(C.OBJECT_TYPES[object.type])}</small></button><div class="object-editor-actions"><button class="icon-button" data-object-layer="${slideIndex}:${esc(object.id)}:1" aria-label="העברה קדימה">${icon("up")}</button><button class="icon-button" data-object-layer="${slideIndex}:${esc(object.id)}:-1" aria-label="העברה אחורה">${icon("down")}</button><button class="icon-button" data-duplicate-object="${slideIndex}:${esc(object.id)}" aria-label="שכפול אובייקט">${icon("copy")}</button><button class="icon-button" data-remove-object="${slideIndex}:${esc(object.id)}" aria-label="מחיקת אובייקט">${icon("trash")}</button></div></div>${specific}${common}</section>`;
  }
  function objectTools(slide, index) {
    return `<section class="objects-panel"><div class="objects-panel-head"><div><strong>אובייקטים חופשיים</strong><small>אפשר לגרור ולשנות גודל ישירות על הבמה כשהעורך פתוח.</small></div><span>${slide.objects.length} / ${C.LIMITS.objects}</span></div><div class="object-add-row"><button data-add-object="${index}:text" ${slide.objects.length >= C.LIMITS.objects ? "disabled" : ""}>${icon("plus")}טקסט</button><button data-add-object="${index}:image" ${slide.objects.length >= C.LIMITS.objects ? "disabled" : ""}>${icon("image")}תמונה</button><button data-add-object="${index}:shape" ${slide.objects.length >= C.LIMITS.objects ? "disabled" : ""}>${icon("plus")}צורה</button><button data-add-object="${index}:visual" ${slide.objects.length >= C.LIMITS.objects ? "disabled" : ""}>${icon("agent")}רכיב חזותי</button></div>${slide.objects.map((object, objectIndex) => objectEditor(object, index, objectIndex)).join("")}</section>`;
  }
  const PROJECTABLE_FIELDS = new Set([
    "title",
    "accent",
    "caption",
    "tool",
    "unit",
  ]);
  const TEXT_BOX_LAYOUTS = {
    title: ["15", "18", "70", "24", "72", "400"],
    accent: ["20", "35", "60", "18", "68", "600"],
    caption: ["20", "68", "60", "14", "30", "400"],
    tool: ["35", "12", "30", "10", "24", "600"],
    unit: ["62", "55", "22", "13", "42", "400"],
  };
  function convertSlideText(slideIndex, key) {
    const slide = deck.slides[slideIndex];
    const layout = TEXT_BOX_LAYOUTS[key];
    if (
      !slide ||
      !layout ||
      !slide[key] ||
      slide.objects.length >= C.LIMITS.objects
    )
      return null;
    const existing = slide.objects.find((object) => object.bind === key);
    if (existing) return existing;
    const object = C.blankObject("text");
    const [x, y, width, height, fontSize, weight] = layout;
    Object.assign(object, {
      bind: key,
      text: slide[key],
      x,
      y,
      width,
      height,
      fontSize,
      weight,
      color: getComputedStyle(document.documentElement)
        .getPropertyValue(key === "accent" ? "--accent" : "--text")
        .trim(),
      style: key === "accent" ? "spectrum" : "solid",
    });
    slide.objects.push(object);
    selectedObjectId = object.id;
    state = C.goTo(deck, slideIndex);
    afterStructureChange();
    return object;
  }
  function projectableTextTools(slide, index, specs) {
    if (slide.type === "experiment") return "";
    const keys = Object.keys(specs).filter(
      (key) => PROJECTABLE_FIELDS.has(key) && slide[key],
    );
    if (!keys.length) return "";
    return `<section class="projectable-text"><strong>טקסט על הבמה</strong><small>הופך טקסט קיים לתיבה שאפשר לערוך, לגרור ולצבוע ישירות.</small><div>${keys
      .map((key) => {
        const bound = slide.objects.some((object) => object.bind === key);
        return `<button data-${bound ? "unbind" : "convert"}-text="${index}:${key}">${bound ? "החזרה לתבנית" : "הפיכה לתיבה"} · ${esc(FIELD_LABELS[key])}</button>`;
      })
      .join("")}</div></section>`;
  }
  const LOOK_KEYS = new Set([
    "motion",
    "backdrop",
    "backdropPicture",
    "transition",
  ]);
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
      ${projectableTextTools(slide, index, content)}
      ${type.list ? listEditor(slide, index, type.list) : ""}
      ${objectTools(slide, index)}
      <div class="look-row">${fieldsFor(slide, { motion: look.motion, backdrop: look.backdrop, transition: look.transition }, `slides.${index}`)}</div>
      ${slide.backdrop === "picture" ? pictureField("תמונת הרקע", `slides.${index}.backdropPicture`, slide.backdropPicture) : ""}
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
      `<div class="slide-add"><label class="field"><span class="field-head"><span>הוספת שקף חדש בסוף המצגת</span></span><select id="new-slide-type">${Object.entries(
        C.SLIDE_TYPES,
      )
        .map(([key, t]) => `<option value="${key}">${esc(t.label)}</option>`)
        .join("")}</select></label><button class="duplicate-button" id="add-slide" ${deck.slides.length >= C.LIMITS.slides ? "disabled" : ""}>${icon("plus")}הוספה</button></div>` +
      deck.slides
        .map((slide, i) => slideEditor(slide, i, open.has(slide.id)))
        .join("") +

      examplesEditor(open.has("examples"));
  }
  function setPath(path, value) {
    const p = path.split(".");
    if (p[0] === "slides") {
      const slide = deck.slides[+p[1]];
      if (p.length === 3) slide[p[2]] = value;
      else if (p.length === 5) slide[p[2]][+p[3]][p[4]] = value;
      else if (p.length === 6) slide[p[2]][+p[3]][p[4]][+p[5]] = value;
    } else if (p[0] === "example") C.selected(deck)[p[1]] = value;
    else if (p[0] === "steps") C.selected(deck).steps[+p[1]][p[2]] = value;
  }
  function getPath(path) {
    const p = path.split(".");
    if (p[0] === "slides") {
      const slide = deck.slides[+p[1]];
      if (p.length === 3) return slide[p[2]];
      if (p.length === 5) return slide[p[2]][+p[3]][p[4]];
    }
    if (p[0] === "example") return C.selected(deck)[p[1]];
    if (p[0] === "steps") return C.selected(deck).steps[+p[1]][p[2]];
  }
  const objectById = (slideIndex, id) =>
    deck.slides[slideIndex]?.objects.find((object) => object.id === id);
  const normalizeObjectNumber = (key, value) => {
    const ranges = {
      x: [0, 100],
      y: [0, 100],
      width: [2, 100],
      height: [2, 100],
      rotation: [-180, 180],
      opacity: [0, 100],
      fontSize: [8, 300],
      radius: [0, 50],
      strokeWidth: [0, 20],
    };
    if (!ranges[key]) return value;
    const [min, max] = ranges[key];
    return String(Math.min(max, Math.max(min, Number(value) || 0)));
  };
  function updateObjectField(input) {
    const slideIndex = +input.dataset.objectSlide;
    const object = objectById(slideIndex, input.dataset.objectId);
    if (!object) return;
    const key = input.dataset.objectProp;
    const previous = object[key];
    let value = normalizeObjectNumber(key, input.value);
    if (key === "x") value = neat(Math.min(Number(value), 100 - Number(object.width)));
    else if (key === "y")
      value = neat(Math.min(Number(value), 100 - Number(object.height)));
    else if (key === "width")
      value = neat(Math.min(Number(value), 100 - Number(object.x)));
    else if (key === "height")
      value = neat(Math.min(Number(value), 100 - Number(object.y)));
    object[key] = value;
    if (key === "text" && object.bind) deck.slides[slideIndex][object.bind] = value;
    if (key === "color" && object.type === "text") object.style = "solid";
    if (!withinDocumentLimit()) {
      object[key] = previous;
      input.value = previous;
      documentLimitMessage();
      return;
    }
    if (input.type === "number") input.value = value;
    if (key === "text") {
      input.closest(".field").querySelector("small").textContent =
        `${value.length} / 500`;
    }
    if (key === "color") {
      const output = input.closest(".colour-picker")?.querySelector("output");
      if (output) output.textContent = value;
      const style = input
        .closest(".object-editor")
        ?.querySelector('select[data-object-prop="style"]');
      if (style && object.type === "text") style.value = "solid";
    }
    selectedObjectId = object.id;
    if (slideIndex !== state.slide) state = C.goTo(deck, slideIndex);
    save();
    render();
    if (key === "entrance" || key === "exit")
      previewObjectMotion(object.id, key, value);
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
    if (path[0] === "slides" && path.length === 3) {
      const bound = deck.slides[+path[1]].objects.find(
        (object) => object.bind === path[2],
      );
      if (bound) bound.text = input.value;
    }
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
      const previous = getPath(path);
      setPath(path, data);
      if (!withinDocumentLimit()) {
        setPath(path, previous);
        throw new Error(
          `אין מספיק מקום לעוד תמונה. הגודל המרבי של מצגת ניידת הוא ${C.LIMITS.importBytes / 1000000}MB.`,
        );
      }
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
    try {
      const exportId = `portable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      download(
        C.portableHTML(initialHTML, deck, exportId),
        "מצ׳אטבוט-לסוכן.html",
        "text/html;charset=utf-8",
      );
      notify("העותק כולל את התוכן הנוכחי ונפתח גם בלי אינטרנט.");
    } catch (err) {
      notify(err.message);
    }
  }
  async function checkImportedPictures(document) {
    const values = new Set();
    for (const slide of document.slides) {
      if (slide.backdropPicture) values.add(slide.backdropPicture);
      if (slide.picture) values.add(slide.picture);
      for (const object of slide.objects)
        if (object.type === "image" && object.picture) values.add(object.picture);
    }
    try {
      for (const value of values) {
        const bitmap = await createImageBitmap(await (await fetch(value)).blob());
        bitmap.close();
      }
    } catch {
      throw new Error("אחת התמונות בקובץ פגומה. התוכן שלך נשמר ללא שינוי.");
    }
  }
  async function importJSON(file) {
    if (!file) return;
    try {
      if (file.size > C.LIMITS.importBytes)
        throw new Error(
          `הקובץ גדול מדי. גודל התוכן המרבי הוא ${C.LIMITS.importBytes / 1000000}MB.`,
        );
      const candidate = C.validate(JSON.parse(await file.text()));
      await checkImportedPictures(candidate);
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
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const neat = (value) => String(Math.round(value * 10) / 10);
  const gridGuides = () => Array.from({ length: 21 }, (_, index) => index * 5);
  function objectGuides(axis, ignoredId) {
    const guides = gridGuides();
    for (const object of deck.slides[state.slide].objects) {
      if (object.id === ignoredId) continue;
      const start = Number(object[axis]);
      const size = Number(object[axis === "x" ? "width" : "height"]);
      guides.push(start, start + size / 2, start + size);
    }
    return guides;
  }
  function nearestSnap(points, guides, threshold = 1.15) {
    let best = null;
    for (const point of points)
      for (const guide of guides) {
        const delta = guide - point;
        if (
          Math.abs(delta) <= threshold &&
          (!best || Math.abs(delta) < Math.abs(best.delta))
        )
          best = { delta, guide };
      }
    return best;
  }
  function showSnapGrid(active, x = null, y = null) {
    const grid = $("#stage-grid");
    grid.hidden = !active;
    grid.classList.toggle("has-x-guide", x !== null);
    grid.classList.toggle("has-y-guide", y !== null);
    if (x !== null) grid.style.setProperty("--snap-x", `${x}%`);
    if (y !== null) grid.style.setProperty("--snap-y", `${y}%`);
  }
  function applyObjectPosition(object) {
    const el = $(`.free-object[data-object-id="${CSS.escape(object.id)}"]`);
    if (!el) return;
    el.style.left = `${object.x}%`;
    el.style.top = `${object.y}%`;
    el.style.width = `${object.width}%`;
    el.style.height = `${object.height}%`;
  }
  function startObjectPointer(event) {
    if (!$("#editor").open || event.button !== 0) return;
    if (
      editingObjectTextId &&
      !event.target.closest('[data-object-text-editor="true"]')
    ) {
      finishTextEditing();
      return;
    }
    const hit = event.target.closest(".free-object");
    if (!hit) return;
    if (event.target.closest('[contenteditable="true"]')) return;
    event.preventDefault();
    const id = hit.dataset.objectId;
    const object = objectById(state.slide, id);
    if (!object) return;
    const mode = event.target.closest("[data-object-handle]") ? "resize" : "move";
    if (selectedObjectId !== id) {
      selectedObjectId = id;
      hit.classList.add("selected");
      $$(".free-object.selected").forEach((object) => {
        if (object !== hit) object.classList.remove("selected");
      });
      renderObjectToolbar();
      renderEditor();
    }
    activeObjectPointer = {
      id,
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      x: Number(object.x),
      y: Number(object.y),
      width: Number(object.width),
      height: Number(object.height),
    };
    $("#stage").setPointerCapture?.(event.pointerId);
    document.body.classList.add("object-dragging");
    showSnapGrid(object.snap === "on");
  }
  function moveObjectPointer(event) {
    if (!activeObjectPointer || event.pointerId !== activeObjectPointer.pointerId)
      return;
    const object = objectById(state.slide, activeObjectPointer.id);
    const rect = $("#stage").getBoundingClientRect();
    if (!object || !rect.width || !rect.height) return;
    const dx = ((event.clientX - activeObjectPointer.startX) / rect.width) * 100;
    const dy = ((event.clientY - activeObjectPointer.startY) / rect.height) * 100;
    let xGuide = null,
      yGuide = null;
    if (activeObjectPointer.mode === "resize") {
      let width = clamp(
        activeObjectPointer.width + dx,
        2,
        100 - Number(object.x),
      );
      let height = clamp(
        activeObjectPointer.height + dy,
        2,
        100 - Number(object.y),
      );
      if (object.snap === "on") {
        const xSnap = nearestSnap(
          [Number(object.x) + width],
          objectGuides("x", object.id),
        );
        const ySnap = nearestSnap(
          [Number(object.y) + height],
          objectGuides("y", object.id),
        );
        if (xSnap) {
          width += xSnap.delta;
          xGuide = xSnap.guide;
        }
        if (ySnap) {
          height += ySnap.delta;
          yGuide = ySnap.guide;
        }
      }
      object.width = neat(clamp(width, 2, 100 - Number(object.x)));
      object.height = neat(clamp(height, 2, 100 - Number(object.y)));
    } else {
      let x = clamp(
        activeObjectPointer.x + dx,
        0,
        100 - Number(object.width),
      );
      let y = clamp(
        activeObjectPointer.y + dy,
        0,
        100 - Number(object.height),
      );
      if (object.snap === "on") {
        const xSnap = nearestSnap(
          [x, x + Number(object.width) / 2, x + Number(object.width)],
          objectGuides("x", object.id),
        );
        const ySnap = nearestSnap(
          [y, y + Number(object.height) / 2, y + Number(object.height)],
          objectGuides("y", object.id),
        );
        if (xSnap) {
          x += xSnap.delta;
          xGuide = xSnap.guide;
        }
        if (ySnap) {
          y += ySnap.delta;
          yGuide = ySnap.guide;
        }
      }
      object.x = neat(clamp(x, 0, 100 - Number(object.width)));
      object.y = neat(clamp(y, 0, 100 - Number(object.height)));
    }
    showSnapGrid(object.snap === "on", xGuide, yGuide);
    applyObjectPosition(object);
  }
  function endObjectPointer(event) {
    if (!activeObjectPointer || event.pointerId !== activeObjectPointer.pointerId)
      return;
    activeObjectPointer = null;
    document.body.classList.remove("object-dragging");
    showSnapGrid(false);
    save();
    renderEditor();
  }
  $("#slide-root").addEventListener("pointerdown", startObjectPointer);
  document.addEventListener("pointermove", moveObjectPointer);
  document.addEventListener("pointerup", endObjectPointer);
  document.addEventListener("pointercancel", endObjectPointer);
  function beginTextEditing(id) {
    const object = objectById(state.slide, id);
    if (!object || object.type !== "text") return;
    selectedObjectId = id;
    editingObjectTextId = id;
    render();
    requestAnimationFrame(() => {
      const editor = $('[data-object-text-editor="true"]');
      if (!editor) return;
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }
  function finishTextEditing() {
    if (!editingObjectTextId) return;
    editingObjectTextId = null;
    save();
    render();
  }
  $("#slide-root").addEventListener("dblclick", (event) => {
    const text = event.target.closest(".object-text");
    if (!$("#editor").open) return;
    if (text) {
      event.preventDefault();
      beginTextEditing(text.closest(".free-object").dataset.objectId);
      return;
    }
    const structured = event.target.closest("[data-slide-text]");
    if (!structured) return;
    event.preventDefault();
    const object = convertSlideText(state.slide, structured.dataset.slideText);
    if (object) beginTextEditing(object.id);
  });
  $("#slide-root").addEventListener("focusout", (event) => {
    if (
      event.target.matches('[data-object-text-editor="true"]') &&
      !event.relatedTarget?.matches?.('[data-object-text-editor="true"]') &&
      !event.relatedTarget?.closest?.("#object-toolbar")
    )
      finishTextEditing();
  });
  document.addEventListener("pointerdown", (event) => {
    if (
      editingObjectTextId &&
      !event.target.closest("#slide-root, #object-toolbar")
    )
      finishTextEditing();
  });
  $("#slide-root").addEventListener("input", (event) => {
    if (!event.target.matches('[data-object-text-editor="true"]')) return;
    const object = currentObject();
    if (!object || object.type !== "text") return;
    let value = event.target.textContent.replace(/\r/g, "");
    if (value.length > 500) {
      value = value.slice(0, 500);
      event.target.textContent = value;
      const range = document.createRange();
      range.selectNodeContents(event.target);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    object.text = value;
    if (object.bind) deck.slides[state.slide][object.bind] = value;
    const panel = $(`[data-object-card="${CSS.escape(object.id)}"]`);
    const field = panel?.querySelector('textarea[data-object-prop="text"]');
    if (field) {
      field.value = value;
      panel.querySelector(".field-head small").textContent =
        `${value.length} / 500`;
      panel.querySelector(".object-select span").textContent = value.slice(0, 28);
    }
    save();
  });
  $("#slide-root").addEventListener("keydown", (event) => {
    if (!event.target.matches('[data-object-text-editor="true"]')) return;
    if (event.key === "Escape" || (event.ctrlKey && event.key === "Enter")) {
      event.preventDefault();
      event.stopPropagation();
      finishTextEditing();
    }
  });
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
  $("#object-toolbar").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    const object = currentObject();
    if (!button || !object) return;
    if (button.dataset.toolbarEditText !== undefined) {
      if (editingObjectTextId === object.id) finishTextEditing();
      else beginTextEditing(object.id);
    } else if (button.dataset.toolbarSnap !== undefined) {
      object.snap = object.snap === "on" ? "off" : "on";
      save();
      render();
      renderEditor();
    }
  });
  $("#object-toolbar").addEventListener("change", (event) => {
    const object = currentObject();
    if (!object) return;
    let motionPreview = null;
    if (event.target.matches("[data-toolbar-colour]")) {
      object.color = event.target.value;
      if (object.type === "text") object.style = "solid";
    } else if (
      event.target.matches("[data-toolbar-text-style]") &&
      object.type === "text"
    )
      object.style = event.target.value;
    else if (event.target.matches("[data-toolbar-object-prop]")) {
      const key = event.target.dataset.toolbarObjectProp;
      object[key] = event.target.value;
      motionPreview = [key, event.target.value];
    }
    else return;
    save();
    render();
    renderEditor();
    if (motionPreview)
      previewObjectMotion(object.id, motionPreview[0], motionPreview[1]);
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
  $("#editor-fields").addEventListener("input", (e) => {
    // Selects also fire input; they are handled on change, where the value is final.
    if (e.target.matches("input[data-field], textarea[data-field]"))
      updateField(e.target);
    else if (
      e.target.matches(
        "input[data-object-prop], textarea[data-object-prop]",
      )
    )
      updateObjectField(e.target);
  });
  $("#editor-fields").addEventListener("change", (e) => {
    if (e.target.matches("select[data-object-prop]")) {
      updateObjectField(e.target);
      renderEditor();
      return;
    }
    if (e.target.matches("select[data-field]")) {
      setPath(e.target.dataset.field, e.target.value);
      if (e.target.dataset.field.endsWith(".transition")) {
        save();
        $("#slide-root").dataset.transition = e.target.value;
        return;
      }
      // Replay the entrance so the presenter sees the preset they just picked.
      renderedSlide = -1;
      renderedSceneKey = null;
      save();
      render();
      // Choosing the picture backdrop reveals its upload field.
      if (e.target.dataset.field.endsWith(".backdrop")) renderEditor();
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
    if (data.selectObject) {
      const [slideIndex, id] = data.selectObject.split(":");
      editingObjectTextId = null;
      selectedObjectId = id;
      state = C.goTo(deck, +slideIndex);
      render();
      renderEditor();
    } else if (data.addObject) {
      const [slideIndex, type] = data.addObject.split(":");
      const slide = deck.slides[+slideIndex];
      if (slide.objects.length >= C.LIMITS.objects) return;
      const added = C.blankObject(type);
      const rootStyle = getComputedStyle(document.documentElement);
      if (type === "text")
        added.color = rootStyle.getPropertyValue("--text").trim();
      else if (type === "shape") {
        added.color = rootStyle.getPropertyValue("--accent").trim();
        added.stroke = rootStyle.getPropertyValue("--text").trim();
      }
      slide.objects.push(added);
      selectedObjectId = added.id;
      state = C.goTo(deck, +slideIndex);
      afterStructureChange();
    } else if (data.removeObject) {
      const [slideIndex, id] = data.removeObject.split(":");
      const slide = deck.slides[+slideIndex];
      const position = slide.objects.findIndex((object) => object.id === id);
      if (position < 0) return;
      slide.objects.splice(position, 1);
      if (selectedObjectId === id) selectedObjectId = null;
      if (editingObjectTextId === id) editingObjectTextId = null;
      state = C.goTo(deck, +slideIndex);
      afterStructureChange();
    } else if (data.duplicateObject) {
      const [slideIndex, id] = data.duplicateObject.split(":");
      const slide = deck.slides[+slideIndex];
      if (slide.objects.length >= C.LIMITS.objects) return;
      const source = objectById(+slideIndex, id);
      if (!source) return;
      const copy = C.clone(source);
      copy.id = C.newId("object");
      if (copy.type === "text") copy.bind = "";
      copy.x = String(Math.min(100 - Number(copy.width), Number(copy.x) + 3));
      copy.y = String(Math.min(100 - Number(copy.height), Number(copy.y) + 3));
      slide.objects.push(copy);
      if (!withinDocumentLimit()) {
        slide.objects.pop();
        documentLimitMessage();
        return;
      }
      selectedObjectId = copy.id;
      state = C.goTo(deck, +slideIndex);
      afterStructureChange();
    } else if (data.objectLayer) {
      const [slideIndex, id, direction] = data.objectLayer.split(":");
      const slide = deck.slides[+slideIndex];
      const position = slide.objects.findIndex((object) => object.id === id);
      const target = position + Number(direction);
      if (position < 0 || target < 0 || target >= slide.objects.length) return;
      const [moved] = slide.objects.splice(position, 1);
      slide.objects.splice(target, 0, moved);
      selectedObjectId = id;
      state = C.goTo(deck, +slideIndex);
      afterStructureChange();
    } else if (data.objectColour) {
      const [slideIndex, id, key, colour] = data.objectColour.split(":");
      const object = objectById(+slideIndex, id);
      if (!object) return;
      object[key] = colour;
      if (object.type === "text" && key === "color") object.style = "solid";
      selectedObjectId = id;
      state = C.goTo(deck, +slideIndex);
      save();
      render();
      renderEditor();
    } else if (data.convertText) {
      const [slideIndex, key] = data.convertText.split(":");
      const object = convertSlideText(+slideIndex, key);
      if (object) beginTextEditing(object.id);
    } else if (data.unbindText) {
      const [slideIndex, key] = data.unbindText.split(":");
      const slide = deck.slides[+slideIndex];
      const position = slide.objects.findIndex((object) => object.bind === key);
      if (position < 0) return;
      const [removed] = slide.objects.splice(position, 1);
      if (selectedObjectId === removed.id) selectedObjectId = null;
      if (editingObjectTextId === removed.id) editingObjectTextId = null;
      state = C.goTo(deck, +slideIndex);
      afterStructureChange();
    } else if (data.pickPicture) {
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
  $("#editor-stage-toggle").addEventListener("click", () => {
    if (!validEditor()) return;
    setStageEditing(!document.body.classList.contains("editor-stage-mode"));
  });
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
  function nudgeSelectedObject(key) {
    const object = currentObject();
    if (!object) return false;
    const axis = key === "ArrowLeft" || key === "ArrowRight" ? "x" : "y";
    const direction = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
    const size = Number(object[axis === "x" ? "width" : "height"]);
    const current = Number(object[axis]);
    const value =
      object.snap === "on"
        ? direction > 0
          ? Math.ceil((current + 0.1) / 5) * 5
          : Math.floor((current - 0.1) / 5) * 5
        : current + direction;
    object[axis] = neat(clamp(value, 0, 100 - size));
    save();
    render();
    renderEditor();
    return true;
  }
  document.addEventListener("keydown", (e) => {
    const openDialogs = $$("dialog[open]");
    const openDialog = openDialogs.at(-1);
    if (e.key === "Escape" && openDialog) {
      e.preventDefault();
      closeDialog(openDialog);
      return;
    }
    if (
      $("#editor").open &&
      !editingObjectTextId &&
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) &&
      !e.target.closest("input,textarea,select,[contenteditable=\"true\"]") &&
      nudgeSelectedObject(e.key)
    ) {
      e.preventDefault();
      return;
    }
    if (
      e.ctrlKey ||
      e.altKey ||
      e.metaKey ||
      e.repeat ||
      openDialog ||
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
