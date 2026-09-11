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
  const languageSessions = new Map();
  // A video only starts once the presenter asks for it.
  const playing = new Set();
  /* A file the presenter just picked can be played straight away from memory,
     before they have moved anything into place. It is a convenience for this
     session only — what the document stores is the path. */
  const pickedVideos = new Map();
  const embedded = C.validate(JSON.parse($("#deck-data").textContent));
  const storageKey = `lecture-stage:${embedded.documentId}`;
  const history = C.createHistory();
  /* Changes coalesce into one undo step while they belong to the same editing
     session. Without the counter, two visits to the same box would be one
     step, and undo would walk back further than the presenter expects. */
  let editSession = 0;
  const newEditSession = () => ++editSession;
  let deck = C.clone(embedded),
    state = C.initialState(embedded),
    canSave = true,
    idleTimer,
    toastTimer,
    countFrame,
    timerTick,
    notesOpen = false,
    pendingOpenId = null,
    pendingPicturePath = null,
    pendingVideoPath = null,
    selectedObjectId = null,
    editing = false,
    jumpOpen = false,
    editingObjectTextId = null,
    editingSlideText = null,
    layersOpen = false,
    cropping = false,
    presenting = false,
    activeObjectPointer = null,
    renderedSlide = -1,
    renderedSceneKey = null,
    previewingSlideMotion = false,
    previewingSlideTransition = false,
    renderedDots = "";
  /* A copy saved in this browser wins, because it is the presenter's own work
     and losing it would be unforgivable. But it also used to hide every later
     publication with no way to tell: the deck on screen could be months behind
     the one at the link, and looked identical. When the published revision has
     moved on since the stored copy was taken, the stored copy is still what
     loads — and the presenter is told, and can take the new one. */
  let supersededBy = null;
  let startupProblem = "";
  let stored = null;
  try {
    stored = localStorage.getItem(storageKey);
  } catch {
    /* Reading is refused outright — private mode, blocked site data. Nothing
       was saved here and nothing can be. */
    canSave = false;
    startupProblem = "הדפדפן חוסם שמירה מקומית. ההרצאה נטענה מהקישור, ושינויים לא יישמרו כאן.";
  }
  if (stored) {
    try {
      const saved = C.validate(JSON.parse(stored));
      deck = saved;
      if (embedded.revision && embedded.revision !== saved.revision)
        supersededBy = embedded;
    } catch {
      /* The stored copy exists but no longer validates. That is a defect in
         this app or a corrupted write — not a storage failure, and calling it
         one sends the presenter looking in the wrong place. The embedded
         document loads instead, and the broken copy is left untouched so it can
         still be recovered. */
      startupProblem =
        "העותק ששמור במכשיר אינו תקין ולכן לא נטען. ההרצאה נטענה מהקישור. אל תשמרו מעליו עד שנבדוק.";
    }
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
    motion: '<path d="M3 12h9"/><path d="m8 8 4 4-4 4"/><path d="M16 5v14"/><path d="M20 8v8"/>',
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
    check: '<path d="m5 12 4 4L19 6"/>',
    shape: '<rect x="3" y="3" width="9" height="9" rx="1.5"/><circle cx="16.5" cy="16.5" r="4.5"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    crop: '<path d="M6 2v16h16M2 6h16v16"/>',
    eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.4 3.9M6.3 7.9A17 17 0 0 0 2 12s3.6 6 10 6a9.8 9.8 0 0 0 3.4-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    open: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
    present:
      '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M12 17v4m-4 0h8"/><path d="m10 8 5 2.5L10 13Z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
    undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h9a5.5 5.5 0 0 1 0 11h-2"/>',
    redo: '<path d="m15 7 5 5-5 5"/><path d="M20 12h-9a5.5 5.5 0 0 0 0 11h2"/>',
    minus: '<path d="M5 12h14"/>',
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
  /* "Colourful" is the presenter's own colour swept through a gradient. Text
     gets it from CSS; a shape paints an SVG gradient and a visual component a
     CSS one, so both ends of the sweep are computed here as real colours. */
  function hsl(hex) {
    const n = Number.parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255,
      g = ((n >> 8) & 255) / 255,
      b = (n & 255) / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    const l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    const h = !d
      ? 0
      : max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s * 100, l * 100];
  }
  const shifted = (hex, dl, dh) => {
    const [h, s, l] = hsl(hex);
    return `hsl(${Math.round((((h + dh) % 360) + 360) % 360)} ${Math.round(
      Math.min(100, Math.max(6, s + 10)),
    )}% ${Math.round(Math.min(96, Math.max(6, l + dl)))}%)`;
  };
  const spectrumStops = (hex) => [
    shifted(hex, 11, -36),
    hex,
    shifted(hex, -5, 46),
  ];
  const spectrumGradient = (hex) => {
    const [a, b, c] = spectrumStops(hex);
    return `linear-gradient(125deg, ${a}, ${b} 48%, ${c})`;
  };
  /* One row per backdrop, keyed exactly like the table in core. Adding a look
     is a row here plus a CSS block — never a new branch on the render path. */
  const spread = (slide, count, build) => {
    const random = seeded(slide.id);
    const round = (n) => n.toFixed(2);
    return Array.from({ length: count }, () => build(random, round)).join("");
  };
  const BACKDROP_PARTS = {
    plain: () => "",
    arcs: () =>
      '<div class="light-arc arc-one"></div><div class="light-arc arc-two"></div>',
    /* The arc family keeps its own class off `.light-arc` on purpose: that one
       is stripped by `.no-motion` because its animation is a one-shot arrival,
       and these are ambient loops that must not stop when only a beat changed. */
    orbit: () =>
      [0, 1, 2].map((i) => `<div class="drift-arc" style="--arc:${i}"></div>`).join(""),
    ribbons: () =>
      [0, 1, 2, 3].map((i) => `<div class="ribbon" style="--ribbon:${i}"></div>`).join(""),
    comet: () =>
      [0, 1].map((i) => `<div class="comet-arc" style="--comet:${i}"></div>`).join(""),
    corner: () =>
      [0, 1, 2].map((i) => `<div class="corner-arc" style="--corner:${i}"></div>`).join(""),
    grid: () => '<div class="grid-plane"></div>',
    aurora: () =>
      [0, 1, 2].map((i) => `<div class="aurora-blob" style="--blob:${i}"></div>`).join(""),
    rings: () =>
      [0, 1, 2, 3].map((i) => `<div class="ring" style="--ring:${i}"></div>`).join(""),
    beams: () => '<div class="beam-field"></div>',
    halo: () => '<div class="halo"></div>',
    /* Nodes joined to their nearest neighbours, drawn once from the slide's own
       seed so a re-render rebuilds the same constellation. The middle of the
       frame is left empty on purpose: this is light behind the words, never a
       diagram competing with them. */
    neural: (slide) => {
      const random = seeded(slide.id);
      const nodes = [];
      for (let tries = 0; tries < 320 && nodes.length < 18; tries++) {
        const x = random() * 160;
        const y = random() * 90;
        const dx = (x - 80) / 80;
        const dy = (y - 45) / 45;
        if (Math.hypot(dx, dy) < 0.66) continue; // the headline owns the middle
        if (nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 15)) continue;
        nodes.push({ x, y, r: 0.32 + random() * 0.34, delay: random() * -9 });
      }
      const edges = [];
      nodes.forEach((a, i) =>
        nodes.slice(i + 1).forEach((b) => {
          const span = Math.hypot(a.x - b.x, a.y - b.y);
          if (span < 27) edges.push({ a, b, span, delay: random() * -14 });
        }),
      );
      const round = (n) => n.toFixed(2);
      const line = ({ a, b, span, delay }) =>
        `<line x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}" style="--span:${round(span)};--delay:${round(delay)}s"/>`;
      const dot = ({ x, y, r, delay }) =>
        `<circle cx="${round(x)}" cy="${round(y)}" r="${round(r)}" style="--delay:${round(delay)}s"/>`;
      return `<svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="neural-edges">${edges
        .map(line)
        .join("")}</g><g class="neural-nodes">${nodes.map(dot).join("")}</g></svg>`;
    },
    mesh: () =>
      [0, 1, 2, 3].map((i) => `<div class="mesh-blob" style="--mesh:${i}"></div>`).join(""),
    waves: () =>
      [0, 1, 2].map((i) => `<div class="wave" style="--wave:${i}"></div>`).join(""),
    particles: (slide) =>
      spread(
        slide,
        28,
        (random, round) =>
          `<i style="--x:${round(random() * 100)}%;--y:${round(random() * 100)}%;--s:${round(1 + random() * 2.4)}px;--delay:${round(random() * -7)}s;--drift:${round(6 + random() * 6)}s"></i>`,
      ),
    stars: (slide) =>
      spread(
        slide,
        74,
        (random, round) =>
          `<i style="--x:${round(random() * 100)}%;--y:${round(random() * 92)}%;--s:${round(0.8 + random() * 2.2)}px;--delay:${round(random() * -9)}s;--twinkle:${round(3.4 + random() * 4.6)}s"></i>`,
      ),
    picture: (slide) =>
      slide.backdropPicture
        ? `<img class="backdrop-image" src="${esc(slide.backdropPicture)}" alt=""><span class="backdrop-scrim"></span>`
        : '<p class="image-placeholder">בחרו תמונת רקע בעורך.</p>',
  };
  function backdrop(slide) {
    const kind = slide.backdrop;
    if (kind === "plain") return "";
    const inner = BACKDROP_PARTS[kind]?.(slide) ?? "";
    return `<div class="atmosphere backdrop-${kind}" aria-hidden="true">${inner}</div>`;
  }
  const sameBackdrop = (a, b) =>
    !!a &&
    !!b &&
    a.backdrop === b.backdrop &&
    (a.backdropPicture || "") === (b.backdropPicture || "");
  function carryBackdrop(previous, incoming) {
    const held = previous.querySelector(":scope > .atmosphere");
    const fresh = incoming.querySelector(":scope > .atmosphere");
    if (!held || !fresh) return;
    held.classList.add("backdrop-retained");
    fresh.replaceWith(held);
  }
  // An imported ID is any string, so it is scrubbed before it becomes a
  // gradient reference rather than trusted inside url(#…).
  const paintId = (object, index) =>
    `fill-${index}-${object.id.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const shapeMarkup = (object, index) => {
    const auto = object.color === "auto";
    /* A spectrum is computed from a real hex, so a colour that follows the
       slide cannot have one built for it; it stays the slide's own colour. */
    const spectrum = object.style === "spectrum" && !auto;
    const outline = object.style === "outline";
    const id = paintId(object, index);
    const paint = spectrum ? `url(#${id})` : resolveColour(object.color);
    const defs = spectrum
      ? `<defs><linearGradient id="${esc(id)}" x1="0" y1="0" x2="1" y2="1">${spectrumStops(
          object.color,
        )
          .map(
            (stop, i) =>
              `<stop offset="${i / 2}" stop-color="${esc(stop)}"/>`,
          )
          .join("")}</linearGradient></defs>`
      : "";
    // Outline draws the shape in its own colour and needs a line to draw with.
    const strokePaint = outline ? paint : resolveColour(object.stroke);
    const width = outline
      ? Math.max(2, Number(object.strokeWidth))
      : Number(object.strokeWidth);
    const common = `fill="${outline ? "none" : esc(paint)}" stroke="${esc(strokePaint)}" stroke-width="${width}" vector-effect="non-scaling-stroke"`;
    const svg = (body) =>
      `<svg viewBox="0 0 100 100" aria-hidden="true">${defs}${body}</svg>`;
    if (object.shape === "circle")
      return svg(`<ellipse cx="50" cy="50" rx="47" ry="47" ${common}/>`);
    /* A field of dots and a hairline: the two quietest marks on the stage. The
       dots are laid out on a fixed 6x4 lattice rather than at random, so the
       shape reads as deliberate texture and stays identical between renders. */
    if (object.shape === "dots") {
      const cells = [];
      for (let row = 0; row < 4; row++)
        for (let column = 0; column < 6; column++)
          cells.push(
            `<circle cx="${8 + column * 16.8}" cy="${11 + row * 26}" r="${Math.max(1.2, Number(object.strokeWidth) * 0.9)}" fill="${esc(paint)}"/>`,
          );
      return svg(cells.join(""));
    }
    if (object.shape === "rule")
      return svg(
        `<line x1="0" y1="50" x2="100" y2="50" stroke="${esc(paint)}" stroke-width="${Math.max(0.6, Number(object.strokeWidth) * 0.5)}" vector-effect="non-scaling-stroke"/>`,
      );
    if (object.shape === "line")
      return svg(
        `<line x1="4" y1="50" x2="96" y2="50" stroke="${esc(paint)}" stroke-width="${Math.max(2, Number(object.strokeWidth))}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`,
      );
    if (object.shape === "arrow")
      return svg(
        `<path d="M5 50h78M66 26l24 24-24 24" fill="none" stroke="${esc(paint)}" stroke-width="${Math.max(2, Number(object.strokeWidth))}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`,
      );
    if (object.shape === "star")
      return svg(
        `<path d="m50 4 11 31 33 1-26 20 10 33-28-19-28 19 10-33L6 36l33-1Z" ${common}/>`,
      );
    if (object.shape === "blob")
      return svg(
        `<path d="M82 22c13 17 9 45-7 61-16 15-43 17-59 2C1 70 4 40 19 21 34 3 68 4 82 22Z" ${common}/>`,
      );
    if (object.shape === "ring")
      return svg(
        `<ellipse cx="50" cy="50" rx="43" ry="43" fill="none" stroke="${esc(paint)}" stroke-width="${Math.max(3, Number(object.strokeWidth))}" vector-effect="non-scaling-stroke"/>`,
      );
    return svg(`<rect x="2" y="2" width="96" height="96" rx="8" ${common}/>`);
  };
  const VISUAL_PARTS = {
    accordion: (labels) =>
      labels.map((label) => `<p><span>${esc(label)}</span></p>`).join(""),
    glass: (labels) =>
      `<i></i><span>${esc(labels.filter(Boolean).join(" · "))}</span>`,
    // A single breathing body: the model, the idea, the thing being talked about.
    orb: (labels) =>
      `<i class="orb-core"></i><i class="orb-sweep"></i><span>${esc(labels[0])}</span>`,
    // Levels that keep moving: weights, probabilities, attention.
    bars: (labels) =>
      `<div class="bars-row">${Array.from({ length: 7 }, (_, i) => `<i style="--bar:${i}"></i>`).join("")}</div><span>${esc(labels[0])}</span>`,
    // A tool window without a screenshot of one.
    window: (labels) =>
      `<header><i></i><i></i><i></i><b>${esc(labels[0])}</b></header><div class="window-body"><p>${esc(labels[1])}</p><p class="muted">${esc(labels[2])}</p></div>`,
    cloud: (labels) => `<i class="cloud-orbit"></i><i class="cloud-orbit inner"></i>${labels.map((label, i) => `<p class="cloud-line cloud-line-${i}">${esc(label)}</p>`).join("")}`,
    calculation: (labels) => `<p class="calculation-input" dir="auto">${esc(labels[0])}</p><i class="calculation-line"></i><p class="calculation-result" dir="auto">${esc(labels[1])}</p><small>${esc(labels[2])}</small>`,
    retrieval: (labels) => `<div class="source-stack" aria-hidden="true"><i></i><i></i><i></i></div><p class="retrieval-query">${esc(labels[0])}</p><div class="retrieved-sheet"><i aria-hidden="true"></i><p>${esc(labels[1])}</p><small>${esc(labels[2])}</small></div>`,
    generation: (labels) => `<p class="generation-context">${esc(labels[0])}</p><p class="generation-choice">${esc(labels[1])}<i aria-hidden="true"></i></p><p class="generation-alternatives">${esc(labels[2])}</p>`,
    document: (labels) => `<div class="document-sheet"><span class="document-fold" aria-hidden="true"></span><p>${esc(labels[0])}</p><div class="document-lines" aria-hidden="true"><i></i><i></i><i></i></div><b>${esc(labels[1])}</b><small>${esc(labels[2])}</small></div>`,
    connection: (labels) => `<div class="connection-end">${esc(labels[0])}</div><div class="connection-wire" aria-hidden="true"><i></i></div><div class="connection-end">${esc(labels[1])}</div><p>${esc(labels[2])}</p>`,
  };
  VISUAL_PARTS.approval = VISUAL_PARTS.glass;
  const visualBody = (visual, labels, prefix) => {
    const markers = ["\uE000", "\uE001", "\uE002"];
    return (VISUAL_PARTS[visual] || VISUAL_PARTS.accordion)(markers.map((marker, i) => labels[i] ? marker : ""))
      .replace(/[\uE000-\uE002]/g, marker => {
        const i = markers.indexOf(marker);
        return `<span data-slide-text="${prefix}.label${i + 1}">${esc(labels[i])}</span>`;
      });
  };
  const visualMarkup = (object, index) => {
    const spectrum = object.style === "spectrum" ? " is-spectrum" : "";
    const style = `--visual-colour:${esc(resolveColour(object.color))};--visual-secondary:${esc(resolveColour(object.secondary))};--visual-gradient:${esc(object.color === "auto" ? "var(--spectrum)" : spectrumGradient(object.color))}`;
    const labels = [object.label1, object.label2, object.label3];
    const body = visualBody(object.visual, labels, `objects.${index}`);
    return `<div class="visual-component visual-${object.visual}${spectrum}" style="${style}" role="group" aria-label="${esc(C.VISUALS[object.visual] ?? "רכיב חזותי")}">${body}</div>`;
  };
  const objectMarkup = (object, index, slide) => {
    const selected = selectedObjectId === object.id;
    const editingText =
      selected &&
      editingObjectTextId === object.id &&
      object.type === "text" &&
      editing;
    const style = `left:${object.x}%;top:${object.y}%;width:${object.width}%;height:${object.height}%;--object-rotation:${object.rotation}deg;--object-opacity:${Number(object.opacity) / 100};z-index:${index + 1}`;
    let body = "";
    if (object.type === "text") {
      /* Word by word is the object's own entrance (or exit), so the split
         follows that choice rather than the slide's — a presenter who set one
         box to arrive word by word gets it on that box alone. While the box is
         being edited it stays one plain string: splitting it into per-word
         spans under a caret is how an editor loses the caret. */
      const cascadeText =
        !editingText &&
        (object.entrance === "cascade" || object.exit === "cascade");
      /* `dir="auto"` because the stage is RTL and some of what goes on it is
         not: an English quotation opens with a neutral quote mark, so the
         paragraph direction decides where that mark lands, and in an RTL
         paragraph it lands at the wrong end with the full stop beside it. The
         browser reads the first strong character and gets it right for Hebrew
         and for English without either being declared anywhere. */
      /* A bound text object holds the same string as its slide field, so it
         has to emphasise the same way the structured field does — otherwise
         `*word*` reads as prose in one place and as markup in the other. While
         the box is contenteditable it stays plain text: the presenter edits the
         string they typed, not the markup it renders to. */
      body = `<p dir="auto" class="object-text text-${object.style} ${object.color === "auto" ? "auto-colour" : ""} ${editingText ? "is-editing" : ""}" data-editable-text="true" style="--object-size:${object.fontSize};--object-weight:${object.weight};--object-align:${object.align};--object-colour:${esc(resolveColour(object.color))}" ${editingText ? 'contenteditable="true" spellcheck="true" data-object-text-editor="true" aria-label="עריכת הטקסט על הבמה"' : 'aria-label="טקסט חופשי — לחיצה כפולה לעריכה"'}>${editingText ? esc(object.text) : cascadeText ? cascadeWords(rich(object.text), "object-cascade-word", 0, 12) : rich(object.text)}</p>`;
    } else if (object.type === "image")
      body = object.picture
        ? `<span class="object-crop" style="border-radius:${object.radius}%"><img class="object-image" draggable="false" src="${esc(object.picture)}" alt="${esc(object.alt)}" style="object-fit:${object.fit};object-position:${object.focusX}% ${object.focusY}%;transform:scale(${Number(object.zoom) / 100})"></span>`
        : '<span class="object-placeholder">תמונה</span>';
    else if (object.type === "visual") body = visualMarkup(object, index);
    else body = shapeMarkup(object, index);
    const handles =
      '<i class="object-handle resize-se" data-object-handle="resize" aria-hidden="true"></i>';
    const link = C.safeLink(object.link);
    // While editing, a link must not swallow the click that selects the box.
    const linked =
      link && !editing
        ? `<a class="object-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(object.type === "image" ? object.alt || "פתיחת הקישור" : object.text)}"></a>`
        : link
          ? `<span class="object-link-badge" title="${esc(link)}" aria-hidden="true">${icon("open")}</span>`
          : "";
    return `<div class="free-object free-object-${object.type} object-enter-${object.entrance} object-exit-${object.exit} ${selected ? "selected" : ""} ${link ? "is-linked" : ""}" data-object-id="${esc(object.id)}" style="${style}">${body}${linked}${handles}</div>`;
  };
  const freeObjects = (slide) =>
    slide.objects?.length
      ? `<div class="free-object-layer">${slide.objects
          .map((object, index) => objectMarkup(object, index, slide))
          .join("")}</div>`
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
  /* Everything an object can be changed into lives here, on the object itself.
     The side panel is for the deck; a presenter who double-clicks a box on the
     stage expects the box's own controls to be within reach. */
  const toolbarSelect = (label, key, options, value, showLabel = false) =>
    `<label class="stage-motion" title="${esc(label)}">${showLabel ? `<span>${esc(label)}</span>` : ""}<select data-toolbar-object-prop="${key}" aria-label="${esc(label)}">${optionMarkup(options, value)}</select></label>`;
  const toolbarColour = (label, key, value) =>
    `<label class="stage-colour" title="${esc(label)}"><span>${esc(label)}</span><input type="color" value="${esc(value)}" data-toolbar-colour="${key}" aria-label="${esc(label)}"></label>`;
  const stepper = (label, key, value, min, max) =>
    `<div class="stage-stepper" role="group" aria-label="${esc(label)}"><button class="icon-only" data-toolbar-step="${key}:-1" title="הקטנה" aria-label="הקטנת ${esc(label)}">${icon("minus")}</button><input type="number" min="${min}" max="${max}" step="1" value="${esc(value)}" data-toolbar-step-value="${key}" aria-label="${esc(label)}" title="${esc(label)}"><button class="icon-only" data-toolbar-step="${key}:1" title="הגדלה" aria-label="הגדלת ${esc(label)}">${icon("plus")}</button></div>`;
  const STEP_RANGES = { fontSize: [8, 300], zoom: [100, 400] };
  function renderObjectToolbar() {
    const toolbar = $("#object-toolbar");
    const object = currentObject();
    if (!editing || presenting || !object) {
      toolbar.hidden = true;
      toolbar.innerHTML = "";
      toolbar.dataset.toolbarObject = "";
      return;
    }
    /* Never rebuild a control that is being held. A colour picker dragged
       through a hundred shades fires a hundred updates, and replacing the
       input on the first of them ends the gesture. Buttons that change what
       the toolbar says blur themselves first, so they still refresh. */
    if (
      toolbar.dataset.toolbarObject === object.id &&
      toolbar.contains(document.activeElement)
    )
      return;
    const slide = deck.slides[state.slide];
    const index = slide.objects.indexOf(object);
    const editingThis = editingObjectTextId === object.id;
    let specific = "";
    if (object.type === "text")
      specific =
        `<button data-toolbar-edit-text aria-pressed="${editingThis}">${editingThis ? "סיום טקסט" : "עריכת טקסט"}</button>` +
        stepper("גודל הטקסט", "fontSize", object.fontSize, 8, 300) +
        toolbarSelect("משקל", "weight", C.TEXT_WEIGHTS, object.weight) +
        toolbarSelect("יישור", "align", C.ALIGNS, object.align) +
        toolbarSelect("מראה", "style", C.TEXT_STYLES, object.style) +
        toolbarColour("צבע", "color", object.color);
    else if (object.type === "shape")
      specific =
        toolbarSelect("צורה", "shape", C.SHAPES, object.shape) +
        toolbarSelect("מראה", "style", C.FILL_STYLES, object.style) +
        toolbarColour("צבע", "color", object.color) +
        toolbarColour("קו", "stroke", object.stroke);
    else if (object.type === "visual")
      specific =
        toolbarSelect("רכיב", "visual", C.VISUALS, object.visual) +
        toolbarSelect("מראה", "style", C.VISUAL_STYLES, object.style) +
        toolbarColour("צבע", "color", object.color) +
        toolbarColour("רקע", "secondary", object.secondary);
    else
      specific =
        toolbarSelect("התאמה", "fit", C.FITS, object.fit) +
        `<button data-toolbar-crop aria-pressed="${cropping}" title="חיתוך: גרירת התמונה בתוך המסגרת">${icon("crop")}חיתוך</button>` +
        (cropping
          ? stepper("הגדלת התמונה", "zoom", object.zoom, 100, 400) +
            `<button data-toolbar-crop-reset title="איפוס החיתוך">${icon("replay")}איפוס</button>`
          : "") +
        `<button data-toolbar-picture="${index}">${icon("image")}${object.picture ? "החלפת תמונה" : "בחירת תמונה"}</button>`;
    toolbar.innerHTML =
      `<span class="drag-grip" data-drag-grip title="גרירת הסרגל" aria-hidden="true"></span><span class="tool-cluster">${specific}</span><span class="stage-tools-divider"></span><span class="tool-cluster">` +
      toolbarSelect(
        "כניסה",
        "entrance",
        C.OBJECT_ENTRANCES,
        object.entrance,
        true,
      ) +
      toolbarSelect("יציאה", "exit", C.OBJECT_EXITS, object.exit, true) +
      `</span><span class="stage-tools-divider"></span><span class="tool-cluster"><button class="icon-only" data-toolbar-layer="1" title="העברה קדימה" aria-label="העברה קדימה" ${index >= slide.objects.length - 1 ? "disabled" : ""}>${icon("up")}</button><button class="icon-only" data-toolbar-layer="-1" title="העברה אחורה" aria-label="העברה אחורה" ${index <= 0 ? "disabled" : ""}>${icon("down")}</button><button class="icon-only" data-toolbar-duplicate title="שכפול האובייקט" aria-label="שכפול האובייקט" ${slide.objects.length >= C.LIMITS.objects ? "disabled" : ""}>${icon("copy")}</button><button data-toolbar-snap aria-pressed="${object.snap === "on"}" title="הצמדה לגריד">${object.snap === "on" ? "גריד" : "חופשי"}</button><button class="icon-only danger" data-toolbar-delete title="מחיקת האובייקט · Delete" aria-label="מחיקת האובייקט">${icon("trash")}</button></span>`;
    toolbar.dataset.toolbarObject = object.id;
    toolbar.hidden = false;
    placeFloater(toolbar);
    avoidSelection(toolbar);
  }
  /* A text box being edited must survive a change of look: rebuilding the stage
     would replace the node the caret sits in. Everything the presenter can
     change from the toolbar is written straight onto the element instead. */
  function applyObjectLook(object) {
    if (object.type !== "text") return false;
    const box = $(`.free-object[data-object-id="${CSS.escape(object.id)}"]`);
    const el = box?.querySelector(".object-text");
    if (!el) return false;
    box.className = `free-object free-object-text object-enter-${object.entrance} object-exit-${object.exit}${selectedObjectId === object.id ? " selected" : ""}`;
    el.style.setProperty("--object-size", object.fontSize);
    el.style.setProperty("--object-weight", object.weight);
    el.style.setProperty("--object-align", object.align);
    el.style.setProperty("--object-colour", resolveColour(object.color));
    el.classList.remove(...Object.keys(C.TEXT_STYLES).map((key) => `text-${key}`));
    el.classList.add(`text-${object.style}`);
    return true;
  }
  function applyObjectCrop(object) {
    const image = $(
      `.free-object[data-object-id="${CSS.escape(object.id)}"] .object-image`,
    );
    if (!image) return false;
    image.style.objectPosition = `${object.focusX}% ${object.focusY}%`;
    image.style.transform = `scale(${Number(object.zoom) / 100})`;
    return true;
  }
  let renderFrame = null;
  function renderSoon() {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = null;
      render();
    });
  }
  function stepValue(object, key, direction) {
    const [min, max] = STEP_RANGES[key];
    const current = Number(object[key]);
    const step = Math.max(2, Math.round(current * 0.08));
    return String(clamp(current + step * direction, min, max));
  }
  function moveObjectLayer(slideIndex, id, direction) {
    const slide = deck.slides[slideIndex];
    const position = slide.objects.findIndex((object) => object.id === id);
    const target = position + direction;
    if (position < 0 || target < 0 || target >= slide.objects.length) return;
    const [moved] = slide.objects.splice(position, 1);
    slide.objects.splice(target, 0, moved);
    selectedObjectId = id;
    state = C.goTo(deck, slideIndex);
    afterStructureChange();
  }
  function duplicateObject(slideIndex, id) {
    const slide = deck.slides[slideIndex];
    if (slide.objects.length >= C.LIMITS.objects) return;
    const source = objectById(slideIndex, id);
    if (!source) return;
    const copy = C.clone(source);
    copy.id = C.newId("object");
    // A copy is a second box, so it cannot keep writing into the slide field.
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
    state = C.goTo(deck, slideIndex);
    afterStructureChange();
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
        dissolve: [
          {
            opacity: 0,
            filter: "blur(14px)",
            transform: `${rotation} scale(1.015)`,
          },
          { opacity, filter: "blur(0)", transform: rotation },
        ],
        blur: [
          { opacity: 0, filter: "blur(14px)" },
          { opacity, filter: "blur(0)" },
        ],
        rise: [
          { opacity: 0, transform: `${rotation} translateY(28px)` },
          { opacity, transform: rotation },
        ],
        zoom: [
          { opacity: 0, transform: `${rotation} scale(0.78)` },
          { opacity, transform: rotation },
        ],
        recede: [
          { opacity: 0, transform: `${rotation} scale(1.08)` },
          { opacity, transform: rotation },
        ],
        push: [
          { opacity: 0, transform: `${rotation} translateX(-7cqw)` },
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
        dissolve: [
          { opacity, filter: "blur(0)", transform: rotation },
          {
            opacity: 0,
            filter: "blur(14px)",
            transform: `${rotation} scale(1.015)`,
          },
        ],
        blur: [
          { opacity, filter: "blur(0)" },
          { opacity: 0, filter: "blur(14px)" },
        ],
        fall: [
          { opacity, transform: rotation },
          { opacity: 0, transform: `${rotation} translateY(34px)` },
        ],
        rise: [
          { opacity, transform: rotation },
          { opacity: 0, transform: `${rotation} translateY(-34px)` },
        ],
        shrink: [
          { opacity, transform: rotation },
          { opacity: 0, transform: `${rotation} scale(0.72)` },
        ],
        zoom: [
          { opacity, transform: rotation },
          { opacity: 0, transform: `${rotation} scale(1.18)` },
        ],
        recede: [
          { opacity, transform: rotation },
          { opacity: 0, transform: `${rotation} scale(0.78)` },
        ],
        push: [
          { opacity, transform: rotation },
          { opacity: 0, transform: `${rotation} translateX(7cqw)` },
        ],
        wipe: [
          { opacity, clipPath: "inset(0)" },
          { opacity: 0, clipPath: "inset(0 0 0 100%)" },
        ],
      };
      if (preset === "cascade") {
        const words = [...element.querySelectorAll(".object-cascade-word")];
        const entering = phase === "entrance";
        words.forEach((word, index) =>
          word.animate(
            entering
              ? [
                  { opacity: 0, transform: "translateY(0.45em)" },
                  { opacity: 1, transform: "translateY(0)" },
                ]
              : [
                  { opacity: 1, transform: "translateY(0)" },
                  { opacity: 0, transform: "translateY(-0.35em)" },
                ],
            {
              duration: entering ? 520 : 380,
              delay: Math.min(index, 12) * (entering ? 60 : 32),
              easing: entering
                ? "cubic-bezier(0.22, 0.7, 0.3, 1)"
                : "cubic-bezier(0.4, 0, 1, 1)",
            },
          ),
        );
        return;
      }
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
  /* An object either carries a colour or follows the slide it sits on. */
  const resolveColour = (value) => (value === "auto" ? "var(--text)" : value);
  const paletteStyle = (slide) => {
    /* Writing nothing is what lets the deck's theme through: the tokens then
       resolve against [data-theme] on the document instead of this element. */
    if (slide.palette === "deck") return "";
    const palette = C.PALETTE_STYLES[slide.palette] || C.PALETTE_STYLES.ice;
    return `--surface:${palette.surface};--stage-gradient:${palette.gradient || "none"};--raised:${palette.raised};--soft:${palette.soft};--line:${palette.line};--text:${palette.text};--muted:${palette.muted};--accent:${palette.accent};--accent-rgb:${palette.rgb};--spectrum:${palette.spectrum};`;
  };
  /* Whether this slide's stage is a light one. Some effects are written for a
     dark room and have to be dialled back on white — and a light slide is also
     where a white tool mark would vanish, so the stage says which it is. */
  const paletteTone = (slide) =>
    slide.palette === "deck" ? "" : (C.PALETTE_STYLES[slide.palette]?.tone ?? "dark");
  /* `corner`, `edge` and `low` hold a third of the frame clear for something to
     sit beside the words. A scene that already lays itself out across the stage
     has nothing to give: the split's two columns were squeezed into the right
     of the frame with a dead field beside them. Declared once, here, rather
     than discovered again the next time a layout meets a wide scene. */
  const SPANS_STAGE = new Set([
    "split",
    "tokens",
    "illustrated",
    "language",
    "experiment",
  ]);
  const frame = (slide, index, classes, style, body) =>
    `<section class="slide ${classes} ${SPANS_STAGE.has(slide.type) ? "spans-stage" : ""} ${slide.objects?.some(object => object.bind === "title") ? "composed-slide" : ""} ${C.isShown(slide) ? "" : "is-skipped"} motion-${slide.motion} slide-text-${slide.textStyle} layout-${slide.layout} scale-${slide.scale}${slide.arrangement ? ` arrange-${slide.arrangement}` : ""}" aria-label="שקף ${index + 1}" data-pace="${slide.pace}"${paletteTone(slide) ? ` data-tone="${paletteTone(slide)}"` : ""} style="${paletteStyle(slide)}--backdrop-strength:${Number(slide.backdropStrength) / 100};${style}">${backdrop(slide)}${body}${freeObjects(slide)}${C.isShown(slide) ? "" : '<span class="skipped-badge">שקף מדולג — לא יופיע בהרצאה</span>'}</section>`;

  const isBound = (slide, key) =>
    slide.objects?.some((object) => object.bind === key);
  const visibleText = (slide, key) => (isBound(slide, key) ? "" : slide[key]);
  /* Emphasis inside a sentence, without opening HTML to the document. The text
     is escaped first and only then are *asterisk pairs* turned into a marked
     span, so nothing a document carries can become markup. The stored string
     keeps its asterisks, and editing in place reads that stored string back —
     the presenter edits what they wrote, not what was rendered. */
  const EMPHASIS = /\*([^*\n]{1,60})\*/g;
  const rich = (value) => esc(value).replace(EMPHASIS, '<b class="emph">$1</b>');
  /* Splitting a sentence into one span per word has to leave the sentence
     itself alone, and the obvious implementation does not. Three things break.
     A free text box is `white-space: pre-wrap`, so it keeps the line breaks the
     presenter typed — splitting on whitespace and rejoining on a single space
     flattens a three-line box into one run-on line, which is exactly what "it
     mangles my text" looks like. A double space or a trailing newline yields an
     empty word, which is markup for a word that is not there. And emphasis
     spanning two words (`*two words*`) loses its asterisk pair the moment each
     word is escaped on its own.

     So split the rendered markup rather than the source string: step over tags
     untouched, keep every run of whitespace exactly as it was, and wrap only
     the runs of visible characters. `<b class="emph">` then simply contains the
     spans it always contained. */
  const cascadeWords = (html, className, from = 0, cap = Infinity) => {
    let index = from;
    return html
      .split(/(<[^>]*>)/)
      .map((chunk) =>
        chunk.startsWith("<")
          ? chunk
          : chunk.replace(
              /\S+/g,
              (word) =>
                `<span class="${className}" style="--w:${Math.min(index++, cap)}">${word}</span>`,
            ),
      )
      .join("");
  };
  /* How many words a string actually produces, which is where the next string
     has to start counting. `"".split(" ")` is `[""]` — one word that is not
     there — so a bound, and therefore empty, headline used to push its accent
     one step late. */
  const wordCount = (value) =>
    value.trim() ? value.trim().split(/\s+/).length : 0;
  const caption = (slide, value, key = "caption") =>
    value && !isBound(slide, key)
      ? `<p class="scene-caption" ${key ? `data-slide-text="${esc(key)}"` : ""}>${rich(value)}</p>`
      : "";
  /* `from` continues the count across a headline split into a title and an
     accent. Without it both halves start at word zero and a sentence that reads
     right to left arrives in two overlapping waves — which is what a presenter
     reports as the words landing on top of each other.

     Emphasis works in a headline for the same reason it works in a caption: the
     dominant word is the one the sentence turns on. `rich` escapes first and
     only then marks the asterisk pair, so the stored string can still be edited
     in place as the plain text the presenter typed. */
  const headline = (slide, value, from = 0) =>
    slide.motion === "cascade" && value.trim()
      ? cascadeWords(rich(value), "cascade-word", from)
      : rich(value);

  function statementSlide(slide, index) {
    const title = visibleText(slide, "title");
    const accent = visibleText(slide, "accent");
    const size = Math.min(
      10.5,
      390 / (slide.title.length + slide.accent.length + 4),
    );
    const opening =
      C.shownPosition(deck, index) === 1
        ? `<div class="scene-controls intro-controls"><button class="quiet-button" data-action="next">מתחילים ${icon("next")}</button><button class="icon-button" data-action="replay" aria-label="הפעלה חוזרת של הפתיחה">${icon("replay")}</button></div>`
        : "";
    return frame(
      slide,
      index,
      "statement-slide",
      `--headline-size:${size}cqw`,
      `<div class="scene statement-scene"><h1><span data-slide-text="title">${headline(slide, title)}</span>${accent ? ` <span class="headline-accent" data-slide-text="accent">${headline(slide, accent, wordCount(title))}</span>` : ""}</h1>${caption(slide, slide.caption)}</div>${opening}`,
    );
  }
  function demoSlide(slide, index) {
    const title = visibleText(slide, "title");
    const accent = visibleText(slide, "accent");
    const tool = visibleText(slide, "tool");
    const size = Math.min(9.5, 340 / (slide.title.length + slide.accent.length + 2));
    const open = C.safeLink(slide.link)
      ? `<a class="quiet-button" href="${esc(C.safeLink(slide.link))}" target="_blank" rel="noopener noreferrer">${icon("open")}פתיחת ${esc(slide.tool || "הכלי")}</a>`
      : "";
    const controls =
      slide.prompt || open
        ? `<div class="scene-controls demo-controls">${open}${slide.prompt ? `<button class="quiet-button" data-action="copy-prompt">${icon("copy")}העתקת הפרומפט</button>` : ""}</div>`
        : "";
    return frame(
      slide,
      index,
      "demo-slide",
      `--headline-size:${size}cqw`,
      `<div class="scene statement-scene">${tool || slide.mark ? `<span class="demo-tool">${slide.mark ? `<img src="${esc(slide.mark)}" alt="" class="demo-mark">` : ""}${tool ? `<span data-slide-text="tool">${esc(tool)}</span>` : ""}</span>` : ""}<h1><span data-slide-text="title">${headline(slide, title)}</span>${accent ? ` <span class="headline-accent" data-slide-text="accent">${headline(slide, accent, wordCount(title))}</span>` : ""}</h1>${caption(slide, slide.caption)}</div>${controls}`,

    );
  }
  function revealSlide(slide, index, step) {
    const words = slide.items
      .map(
        (item, i) =>
          `<li data-state="${i < step ? "past" : i === step ? "now" : "next"}" style="--w:${i}" data-slide-text="items.${i}.word">${esc(item.word)}</li>`,
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
      `<div class="scene reveal-scene">${visibleText(slide, "title") ? `<p class="scene-eyebrow" data-slide-text="title">${esc(slide.title)}</p>` : ""}<ol class="reveal-list">${words}</ol>${caption(slide, slide.items[step].caption, `items.${step}.caption`)}</div>`,
    );
  }
  function illustratedSlide(slide, index, step) {
    const item = slide.items[step];
    const path = `items.${step}`;
    // Insert editable labels after escaping, so text can never become markup.
    // The same asset templates serve free objects and presenter-controlled beats.
    const art = visualBody(item.visual, [item.label1, item.label2, item.label3], path);
    return frame(slide, index, `illustrated-slide composition-${slide.composition}`, "",
      `<div class="scene illustrated-scene"><div class="illustrated-copy">${slide.title ? `<p class="scene-eyebrow" data-slide-text="title">${esc(slide.title)}</p>` : ""}<div class="illustrated-beat"><h1 data-slide-text="${path}.word">${esc(item.word)}</h1>${caption(slide, item.caption, `${path}.caption`)}</div></div><div class="illustrated-art"><div class="illustrated-beat visual-component visual-${item.visual}" style="--visual-colour:var(--accent);--visual-secondary:var(--surface);--visual-gradient:var(--spectrum)">${art}</div></div></div>`);
  }
  function languageSlide(slide, index) {
    const session = languageSessions.get(slide.id) || { selected: slide.mode === "completion" ? 0 : -1, input: null, chosen: "" };
    const selected = Math.min(session.selected, slide.items.length - 1);
    const item = slide.items[selected];
    const clusters = slide.items.map((entry, i) => `<button class="language-seed seed-${i}" data-action="language-open" data-index="${i}" aria-pressed="${selected === i}"><span data-slide-text="items.${i}.word">${esc(entry.word)}</span></button>`).join("");
    const choices = item ? ["first", "second", "third"].map(key => `<button class="language-option" data-action="language-choose" data-key="${key}"><span data-slide-text="items.${selected}.${key}">${esc(item[key])}</span></button>`).join("") : "";
    const input = session.input ?? item?.prompt ?? "";
    const prompt = item ? (slide.mode === "completion" && !editing
      ? `<form class="language-form"><label for="language-input">המשפט שלכם</label><input id="language-input" maxlength="80" dir="auto" value="${esc(input)}" autocomplete="off"><button class="quiet-button" type="submit">הצגת אפשרויות</button></form>`
      : `<p class="language-prompt" data-slide-text="items.${selected}.prompt">${esc(item.prompt)}</p>`) : "";
    return frame(slide, index, `language-slide language-${slide.mode} ${item ? "is-open" : ""}`, "",
      `<div class="scene language-scene"><header><h1 data-slide-text="title">${esc(slide.title)}</h1><p data-slide-text="caption">${esc(slide.caption)}</p></header><div class="language-space"><div class="language-halo" aria-hidden="true"></div><div class="language-seeds">${clusters}</div>${item ? `<div class="language-focus">${prompt}<div class="language-options">${choices}</div><p class="language-result" role="status">${session.chosen ? `${esc(input)} <strong>${esc(session.chosen)}</strong>` : ""}</p><button class="language-reset quiet-button" data-action="language-reset">${slide.mode === "cloud" ? "חזרה לענן" : "איפוס הניסוי"}</button></div>` : ""}</div></div>`);
  }
  function tokensSlide(slide, index, step) {
    const body =
      step === 0
        ? `<p class="token-sentence">${esc(slide.chunks.map((c) => c.text).join(""))}</p>`
        : `<p class="token-chunks">${slide.chunks.map((c, i) => `<span class="token" style="--token:${i}" data-slide-text="chunks.${i}.text">${esc(c.text)}</span>`).join("")}</p>`;
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
        ? `<div class="scene image-scene"><div class="image-text">${imageTitle ? `<h1><span data-slide-text="title">${headline(slide, imageTitle)}</span></h1>` : ""}${caption(slide, imageCaption)}</div></div>`
        : "";
    const size = Math.min(7.5, 300 / ((slide.title || "xx").length + 2));
    const open = C.safeLink(slide.link)
      ? `<div class="scene-controls image-controls"><a class="quiet-button" href="${esc(C.safeLink(slide.link))}" target="_blank" rel="noopener noreferrer">${icon("open")}פתיחת הקישור</a></div>`
      : "";
    return frame(
      slide,
      index,
      `image-slide fit-${slide.fit} ${overlay ? "has-text" : ""}`,
      `--headline-size:${size}cqw`,
      `<figure class="image-frame">${media}</figure>${overlay}${open}`,
    );
  }
  function numberSlide(slide, index) {
    const size = Math.min(30, 128 / slide.value.length);
    return frame(
      slide,
      index,
      "number-slide",
      `--number-size:${size}cqw`,
      `<div class="scene number-scene">${visibleText(slide, "title") ? `<p class="scene-eyebrow" data-slide-text="title">${esc(slide.title)}</p>` : ""}<p class="big-number"><span data-count="${esc(slide.value)}" data-slide-text="value">${esc(slide.value)}</span>${visibleText(slide, "unit") ? `<em data-slide-text="unit">${esc(slide.unit)}</em>` : ""}</p>${caption(slide, slide.caption)}</div>`,
    );
  }
  function splitSlide(slide, index, step) {
    const sides = slide.sides
      .map(
        (side, i) =>
          `<li data-state="${i < step ? "past" : i === step ? "now" : "next"}" style="--w:${i}">${side.icon ? `<img class="split-icon" src="${esc(side.icon)}" alt="">` : ""}<span class="split-heading" data-slide-text="sides.${i}.heading">${headline(slide, side.heading)}</span>${side.line ? `<span class="split-line" data-slide-text="sides.${i}.line">${esc(side.line)}</span>` : ""}</li>`,
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
  /* The slide shows its own poster until the presenter presses play. Nothing is
     requested from YouTube or Drive before that, so the deck still opens — and
     still looks like the deck — with no network at all. */
  function videoSlide(slide, index) {
    const video = C.videoEmbed(slide.url);
    /* An animation standing in for a still should not need a click to become
       the slide. It starts muted and plays once. Someone who asked the system
       for less motion gets the poster and the button instead. */
    const opensItself =
      slide.autoplay === "once" && video?.kind === "file" && !reducedMotion();
    const started = video && (playing.has(slide.id) || opensItself);
    const poster = slide.poster
      ? `<img class="video-still" src="${esc(slide.poster)}" alt="">`
      : '<span class="video-still empty"></span>';
    const offline = navigator.onLine === false && video?.kind === "iframe";
    let media;
    if (started && video.kind === "file")
      media = `<video class="video-embed" src="${esc(pickedVideos.get(slide.id) || video.src)}" ${opensItself && !playing.has(slide.id) ? "muted" : "controls"} autoplay playsinline ${slide.poster ? `poster="${esc(slide.poster)}"` : ""}></video>`;
    else if (started)
      media = `<iframe class="video-embed" src="${esc(video.src)}" title="${esc(slide.title || "סרטון")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    else if (video)
      media = `<button class="video-poster" data-action="play-video" aria-label="הפעלת הסרטון">${poster}<span class="video-play">${icon("play")}</span>${offline ? '<span class="video-warning">אין כרגע חיבור לאינטרנט. הסרטון לא ייטען.</span>' : ""}</button>`;
    else
      media = `<div class="video-poster is-empty">${poster}<p class="image-placeholder">הדביקו קישור מיוטיוב או מגוגל דרייב בעורך.</p></div>`;
    const title = visibleText(slide, "title");
    const size = Math.min(6.5, 260 / ((slide.title || "xx").length + 2));
    return frame(
      slide,
      index,
      `video-slide ${started ? "is-playing" : ""}`,
      `--headline-size:${size}cqw`,
      `<div class="scene video-scene">${title ? `<h1><span data-slide-text="title">${headline(slide, title)}</span></h1>` : ""}<div class="video-frame">${media}</div>${caption(slide, visibleText(slide, "caption"))}</div>`,
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
      `<div class="scene experiment-scene"><p class="scene-context" data-example-text="task">${esc(e.task)}</p><div class="scene-message"><h2 class="scene-word" ${agent ? `data-example-text="steps.${step - 1}.label"` : 'data-slide-text="title"'}>${esc(heading)}</h2><p class="scene-caption" ${agent ? `data-example-text="steps.${step - 1}.artifact"` : 'data-example-text="answer"'}>${esc(agent ? current.artifact : e.answer)}</p></div></div><span class="simulation-note">המחשה</span><div class="scene-controls experiment-controls"><div class="mode-switch" role="group" aria-label="מצב ההדגמה"><button data-action="chat" aria-pressed="${!agent}">צ׳אטבוט</button><button data-action="agent" aria-pressed="${agent}">סוכן</button></div><select id="audience-select" aria-label="בחירת דוגמה">${exampleOptions()}</select><button class="quiet-button" data-action="${complete ? "reset" : "next"}">${complete ? "שוב" : agent ? "השלב הבא" : "נעבור לסוכן"}${icon(complete ? "replay" : "next")}</button><span class="step-counter" aria-label="התקדמות">${agent ? `${step} / ${e.steps.length}` : ""}</span></div>`,
    );
  }
  const SCENES = {
    language: languageSlide,
    illustrated: illustratedSlide,
    video: videoSlide,
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
    if (C.SLIDE_TYPES[slide.type].list?.fields.word)
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
  function renderJumpList() {
    const list = $("#slide-jump");
    if (!jumpOpen) {
      list.hidden = true;
      $("#position").setAttribute("aria-expanded", "false");
      return;
    }
    list.innerHTML = deck.slides
      .map(
        (slide, i) =>
          `<button role="option" aria-selected="${i === state.slide}" data-jump="${i}" class="${C.isShown(slide) ? "" : "is-hidden-slide"}"><span class="jump-number" dir="ltr">${String(i + 1).padStart(2, "0")}</span><span class="jump-name">${esc(slideName(slide))}</span><small>${esc(C.isShown(slide) ? C.SLIDE_TYPES[slide.type].label : "מדולג")}</small></button>`,
      )
      .join("");
    list.hidden = false;
    $("#position").setAttribute("aria-expanded", "true");
    list.querySelector(`[data-jump="${state.slide}"]`)?.scrollIntoView({ block: "nearest" });
  }
  function setJumpOpen(open) {
    jumpOpen = open;
    renderJumpList();
    if (open) wake();
  }
  function renderDots() {
    const key = deck.slides.map((s) => `${s.id}:${s.visibility}`).join("|");
    if (key !== renderedDots) {
      renderedDots = key;
      $("#slide-dots").innerHTML = deck.slides
        .map((s, i) =>
          C.isShown(s)
            ? `<button data-slide="${i}" aria-label="שקף ${C.shownPosition(deck, i)}: ${esc(slideName(s))}"></button>`
            : "",
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
  function removeSelectedObject() {
    const object = currentObject();
    if (!object) return false;
    const slide = deck.slides[state.slide];
    slide.objects.splice(slide.objects.indexOf(object), 1);
    if (editingObjectTextId === object.id) editingObjectTextId = null;
    selectedObjectId = null;
    afterStructureChange();
    notify("האובייקט נמחק.");
    return true;
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
    /* The ground the stage is painted on, and the letterbox around it, follow
       the slide rather than the deck theme. Without this a `pearl` slide is a
       white rectangle floating in whatever colour the theme happens to be —
       which is the navy frame the presenter reported, and the flash of it he
       saw mid-transition. Writing nothing for a "deck" slide keeps the theme
       fallback intact. */
    const ground = `${paletteStyle(slide)}--ground-ms:${slide.transition === "cut" ? 0 : 360}ms;`;
    for (const el of [$(".theater"), $("#stage")]) el.style.cssText = ground;
    root.dataset.transition = slide.transition;
    const html = SCENES[slide.type](slide, state.slide, state.step);
    const sameSlide = renderedSlide === state.slide;
    const motionPreview = previewingSlideMotion;
    const transitionPreview = previewingSlideTransition;
    if (!sameSlide) playing.clear();
    const direction = state.slide < renderedSlide ? -1 : 1;
    root.querySelectorAll(".slide.leaving").forEach((el) => el.remove());
    const previous = root.lastElementChild;
    const previousSlide = deck.slides[renderedSlide];
    const retainBackdrop =
      previous && !transitionPreview && sameBackdrop(previousSlide, slide);
    const hasObjectExits =
      transitionPreview
        ? null
        : (previous?.querySelector(".free-object:not(.object-exit-none)") ??
          null);
    const exitsOnly =
      previous && !sameSlide && hasObjectExits;
    /* Both halves of the timing come from `core`, and both are scaled by the
       pace of the slide they belong to: the outgoing slide's own pace governs
       how long it takes to leave, the incoming one's how long it takes to
       arrive. Keeping a second copy of these numbers here is what made the
       outgoing slide vanish on frame one the moment two transitions were
       added and this table had not heard of them. */
    const rate = (s) => C.PACE_RATE[s?.pace] ?? 1;
    const outRate = rate(previousSlide);
    const slideExitTime = (C.TRANSITION_MS[slide.transition] ?? 360) * outRate;
    const objectExitTime = hasObjectExits ? C.OBJECT_MS * outRate : 0;
    const outgoingTime = Math.max(slideExitTime, objectExitTime);
    if (
      previous &&
      (!sameSlide || transitionPreview) &&
      !motionPreview &&
      !reducedMotion() &&
      (slide.transition !== "cut" || exitsOnly)
    ) {
      /* The class that brought this slide in has to go before it is asked to
         leave: the entrance rule and the exit rule have equal weight, and the
         entrance one wins on order, so an outgoing slide was replaying its own
         arrival — sliding back in from the side before vanishing. Its direction
         is the move happening now, not the one that delivered it. */
      previous.classList.remove("entering");
      previous.style.setProperty("--dir", direction);
      previous.classList.add("leaving");
      if (transitionPreview) previous.classList.add("transition-preview");
      if (hasObjectExits)
        previous.style.setProperty("--slide-exit-duration", `${objectExitTime}ms`);
      if (exitsOnly) previous.classList.add("object-exits-only");
      const drop = () => previous.remove();
      // animationend bubbles, so only the slide's own exit may retire it.
      if (!hasObjectExits)
        previous.addEventListener("animationend", (event) => {
          if (event.target === previous) drop();
        });
      setTimeout(drop, outgoingTime + 80);
      root.insertAdjacentHTML("beforeend", html);
      const incoming = root.lastElementChild;
      if (retainBackdrop) carryBackdrop(previous, incoming);
      incoming.classList.add("entering");
      incoming.style.setProperty(
        "--enter-delay",
        `${(outgoingTime + 40) / 1000}s`,
      );
    } else if (retainBackdrop) {
      root.insertAdjacentHTML("beforeend", html);
      const incoming = root.lastElementChild;
      carryBackdrop(previous, incoming);
      previous.remove();
    } else root.innerHTML = html;
    const current = root.lastElementChild;
    current.style.setProperty("--dir", direction);
    // A transition preview demonstrates the stage change alone. Content
    // motion has its own preview and must not obscure what was selected.
    if (transitionPreview) current.classList.add("no-motion");
    previewingSlideMotion = false;
    previewingSlideTransition = false;
    renderedSlide = state.slide;
    const sceneKey = `${state.slide}:${state.step}`;
    const sameScene = renderedSceneKey === sceneKey;
    /* A beat inside the same slide keeps the stage still; only the beat
       animates, so the motion class goes. A re-render that changed no beat at
       all — a panel opening, a field edited — is held still by `.no-motion`
       instead, and keeps its class: stripping it there left the element unable
       to describe its own slide, and the next thing to read that class found
       nothing. A motion preview is neither: the presenter asked to see this
       slide's entrance replayed where it stands, so the class that names it has
       to survive the very re-render that replays it. */
    if (sameSlide && !sameScene && !motionPreview)
      current.classList.remove(`motion-${slide.motion}`);
    if (sameScene) current.classList.add("no-motion");
    renderedSceneKey = sceneKey;
    countUp(current);
    runTimer(current, slide);
    $("#notes").hidden = !notesOpen;
    $("#notes").textContent = slide.note || "אין הערת מרצה לשקף הזה.";
    $("#slide-announcement").textContent = announce(slide, state.step);
    const pad = (n) => String(n).padStart(2, "0");
    const shown = C.shownCount(deck);
    $("#position").textContent = C.isShown(slide)
      ? `${pad(C.shownPosition(deck, state.slide))} / ${pad(shown)}`
      : `-- / ${pad(shown)}`;
    renderDots();
    renderStageTools();
    renderLayers();
    renderJumpList();
    $("#prev").disabled =
      state.step === 0 && C.nextShown(deck, state.slide, -1) < 0;
    $("#next").disabled =
      state.step === C.beats(deck, state.slide) - 1 &&
      C.nextShown(deck, state.slide, 1) < 0;
    $$("[data-theme-choice]").forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.themeChoice === deck.theme),
      ),
    );
    if (actionFocus)
      $(`[data-action="${actionFocus}"]`)?.focus({ preventScroll: true });
    renderObjectToolbar();
    renderHistoryButtons();
  }
  /* Finishing an edit leaves the words correct in both the DOM and the
     document; the rebuild that follows only restores markup the editing
     stripped. Running it immediately would replace the node between the two
     clicks of a double-click, and the second click would land on nothing —
     which is exactly what "double-click does not work" looked like. */
  let sceneRefresh = null;
  function cancelSceneRefresh() {
    clearTimeout(sceneRefresh);
    sceneRefresh = null;
  }
  function refreshSceneSoon() {
    cancelSceneRefresh();
    sceneRefresh = setTimeout(() => {
      sceneRefresh = null;
      if (editingSlideText || editingObjectTextId || activeObjectPointer)
        return;
      render();
      renderEditor();
    }, 420);
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
  /* A browser gives one origin a few megabytes, and it counts strings as UTF-16
     — so a document of N characters costs 2N bytes, and this deck is mostly
     embedded pictures. "Storage is unavailable" is true but useless when the
     real answer is that the deck plus its saved drafts no longer fit. */
  const megabytes = (text) => (text.length * 2) / 1024 / 1024;
  const isQuota = (error) =>
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED");
  function persist(payload) {
    let reason = "";
    try {
      localStorage.setItem(storageKey, payload);
      canSave = true;
    } catch (error) {
      canSave = false;
      reason = isQuota(error)
        ? `אין מקום בדפדפן. ההרצאה שוקלת ${megabytes(payload).toFixed(1)} מ״ב, והמקום לאתר הזה כמעט תמיד 5 מ״ב — מחיקת טיוטות שמורות תפנה מקום.`
        : "השמירה במכשיר אינה זמינה.";
    }
    $("#save-status").textContent = canSave
      ? "נשמר במכשיר הזה · אפשר להוריד עותק לגיבוי"
      : `${reason} יש להוריד עותק לפני הסגירה.`;
  }
  /* Two very different failures used to share one message. Invalid content is a
     defect in this app, not a storage problem, and saying so is what lets it be
     found instead of quietly eating the presenter's work.
     `token` names the interaction a change belongs to: consecutive changes with
     the same token are one undo step, so a typed sentence comes back as a
     sentence and a dragged colour slider as one colour. */
  function save(token = null) {
    let payload;
    try {
      payload = JSON.stringify(C.validate(deck));
    } catch {
      $("#save-status").textContent =
        "השינוי האחרון אינו תקין ולכן לא נשמר. בטלו אותו כדי להמשיך לשמור.";
      return;
    }
    history.record(payload, token);
    persist(payload);
    renderHistoryButtons();
  }
  function renderHistoryButtons() {
    $("#undo").disabled = !history.canUndo();
    $("#redo").disabled = !history.canRedo();
  }
  // Undo should show what it undid: the first slide whose content differs is
  // where the presenter is put, even if they had walked away from it.
  const changedSlide = (before, after) => {
    const length = Math.max(before.slides.length, after.slides.length);
    for (let i = 0; i < length; i++)
      if (
        JSON.stringify(before.slides[i]) !== JSON.stringify(after.slides[i])
      )
        return Math.min(i, after.slides.length - 1);
    return -1;
  };
  function stepHistory(direction) {
    const payload = direction < 0 ? history.undo() : history.redo();
    if (payload === null) return false;
    let restored;
    try {
      restored = C.validate(JSON.parse(payload));
    } catch {
      return false;
    }
    finishSlideTextEditing({ rerender: false });
    editingObjectTextId = null;
    cancelSceneRefresh();
    const target = changedSlide(deck, restored);
    deck = restored;
    state = C.goTo(
      deck,
      target >= 0 ? target : Math.min(state.slide, deck.slides.length - 1),
    );
    if (!currentObject()) selectedObjectId = null;
    persist(payload);
    renderedDots = "";
    render();
    renderEditor();
    notify(direction < 0 ? "הפעולה בוטלה." : "הפעולה הוחזרה.");
    return true;
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
  /* Both stage panels cover the slide, so they float: dragged by their grip and
     kept where they were left. The position is a UI preference, not content, so
     it lives beside the deck rather than inside it. */
  const floaterKey = "lecture-stage:floaters";
  let floaters = {};
  try {
    floaters = JSON.parse(localStorage.getItem(floaterKey)) || {};
  } catch {
    floaters = {};
  }
  function placeFloater(el) {
    const spot = floaters[el.id];
    if (!spot) return;
    el.style.left = `${spot.x}%`;
    el.style.top = `${spot.y}%`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.marginInline = "0";
    el.classList.remove("at-bottom");
  }
  /* Only where the presenter has not put the panel themselves: a toolbar that
     sits on top of the box being edited hides the words it is editing. */
  function avoidSelection(toolbar) {
    if (floaters[toolbar.id]) return;
    requestAnimationFrame(() => {
      const target = $(
        `.free-object[data-object-id="${CSS.escape(selectedObjectId ?? "")}"]`,
      );
      toolbar.classList.remove("at-bottom");
      if (!target) return;
      const panel = toolbar.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      if (
        panel.left < box.right &&
        box.left < panel.right &&
        panel.top < box.bottom &&
        box.top < panel.bottom
      )
        toolbar.classList.add("at-bottom");
    });
  }
  function startFloaterDrag(event) {
    const grip = event.target.closest("[data-drag-grip]");
    if (!grip || event.button !== 0) return;
    const el = grip.closest(".stage-tools, .object-toolbar, .layers-panel");
    if (!el) return;
    event.preventDefault();
    const stage = $("#stage").getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const grabX = event.clientX - box.left;
    const grabY = event.clientY - box.top;
    const move = (e) => {
      const x = clamp(e.clientX - grabX - stage.left, 0, stage.width - box.width);
      const y = clamp(e.clientY - grabY - stage.top, 0, stage.height - box.height);
      floaters[el.id] = {
        x: neat((x / stage.width) * 100),
        y: neat((y / stage.height) * 100),
      };
      placeFloater(el);
    };
    const stop = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
      document.body.classList.remove("object-dragging");
      try {
        localStorage.setItem(floaterKey, JSON.stringify(floaters));
      } catch {
        // A full or blocked store only costs the remembered spot.
      }
    };
    document.body.classList.add("object-dragging");
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
  }
  document.addEventListener("pointerdown", startFloaterDrag);
  function renderStageTools() {
    const tools = $("#stage-tools");
    if (!editing || presenting) {
      tools.hidden = true;
      tools.innerHTML = "";
      return;
    }
    const slide = deck.slides[state.slide];
    const full = slide.objects.length >= C.LIMITS.objects;
    const add = Object.entries(C.OBJECT_TYPES)
      .map(
        ([type, name]) =>
          `<button class="icon-only" data-stage-add="${type}" title="הוספת ${esc(name)}" aria-label="הוספת ${esc(name)}" ${full ? "disabled" : ""}>${icon(type)}</button>`,
      )
      .join("");
    const slideActions = `<span class="tool-cluster"><label class="stage-motion" title="סוג השקף שיתווסף"><span>שקף</span><select data-stage-slide-type aria-label="סוג השקף החדש">${optionMarkup(
      Object.fromEntries(
        Object.entries(C.SLIDE_TYPES).map(([key, type]) => [key, type.label]),
      ),
      slide.type,
    )}</select></label><button class="icon-only" data-stage-slide-add title="הוספת שקף אחרי הנוכחי" aria-label="הוספת שקף אחרי הנוכחי" ${deck.slides.length >= C.LIMITS.slides ? "disabled" : ""}>${icon("plus")}</button><button class="icon-only" data-stage-slide-duplicate title="שכפול השקף הנוכחי" aria-label="שכפול השקף הנוכחי" ${deck.slides.length >= C.LIMITS.slides ? "disabled" : ""}>${icon("copy")}</button><button class="icon-only" data-stage-slide-hide aria-pressed="${!C.isShown(slide)}" title="${C.isShown(slide) ? "דילוג על השקף בהרצאה" : "החזרת השקף להרצאה"}" aria-label="דילוג על השקף בהרצאה">${icon(C.isShown(slide) ? "eye" : "eyeOff")}</button><button class="icon-only danger" data-stage-slide-remove title="מחיקת השקף הנוכחי" aria-label="מחיקת השקף הנוכחי" ${deck.slides.length <= 1 ? "disabled" : ""}>${icon("trash")}</button></span>`;
    tools.innerHTML = `<span class="drag-grip" data-drag-grip title="גרירת הסרגל" aria-hidden="true"></span><span class="tool-cluster">${add}</span><span class="stage-tools-divider"></span>${slideActions}<span class="stage-tools-divider"></span><label class="stage-motion"><span>טקסט</span><select data-stage-field="textStyle">${optionMarkup(C.TEXT_STYLES, slide.textStyle)}</select></label><span class="stage-tools-divider"></span><button class="icon-only" data-stage-layers aria-pressed="${layersOpen}" title="שכבות השקף" aria-label="שכבות השקף">${icon("layers")}</button><button class="icon-only" data-stage-open-deck title="כל השקפים" aria-label="כל השקפים">${icon("note")}</button><button data-stage-done title="סיום עריכה">${icon("check")}סיום</button>`;
    tools.hidden = false;
    placeFloater(tools);
  }
  /* Stacking only makes sense if the stack is visible. The panel lists the
     slide's objects from the front of the stage to the back — the order they
     are painted in, reversed — and every row is the object itself: click to
     select it, arrows to move it through the stack, and a bin to remove it. */
  function renderLayers() {
    const panel = $("#layers");
    if (!editing || !layersOpen) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    const slide = deck.slides[state.slide];
    const last = slide.objects.length - 1;
    const rows = slide.objects
      .map((object, index) => ({ object, index }))
      .reverse()
      .map(
        ({ object, index }) =>
          `<li class="${object.id === selectedObjectId ? "selected" : ""}"><button class="layer-pick" data-layer-select="${esc(object.id)}"><span class="layer-icon">${icon(object.type)}</span><span class="layer-name">${esc(objectName(object) || C.OBJECT_TYPES[object.type])}</span></button><span class="layer-actions"><button class="icon-button" data-layer-move="${esc(object.id)}:1" aria-label="קדימה" title="קדימה" ${index === last ? "disabled" : ""}>${icon("up")}</button><button class="icon-button" data-layer-move="${esc(object.id)}:-1" aria-label="אחורה" title="אחורה" ${index === 0 ? "disabled" : ""}>${icon("down")}</button><button class="icon-button danger" data-layer-remove="${esc(object.id)}" aria-label="מחיקה" title="מחיקה">${icon("trash")}</button></span></li>`,
      )
      .join("");
    panel.innerHTML = `<div class="layers-head"><span class="drag-grip" data-drag-grip title="גרירת הפאנל" aria-hidden="true"></span><strong>שכבות</strong><small>${slide.objects.length} / ${C.LIMITS.objects}</small><button class="icon-button" data-layers-close aria-label="סגירת השכבות">${icon("close")}</button></div>${
      slide.objects.length
        ? `<ol class="layer-list">${rows}</ol><p class="layers-note">העליון ברשימה הוא הקדמי על הבמה.</p>`
        : '<p class="layers-note">אין עדיין אובייקטים בשקף הזה. הוסיפו אחד מסרגל השקף.</p>'
    }`;
    panel.hidden = false;
    placeFloater(panel);
  }
  $("#layers").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const data = button.dataset;
    if (data.layersClose !== undefined) {
      layersOpen = false;
      renderLayers();
      renderStageTools();
    } else if (data.layerSelect) {
      cropping = false;
      selectedObjectId = data.layerSelect;
      editingObjectTextId = null;
      render();
      renderEditor();
    } else if (data.layerMove) {
      const [id, direction] = data.layerMove.split(":");
      selectedObjectId = id;
      moveObjectLayer(state.slide, id, Number(direction));
    } else if (data.layerRemove) {
      selectedObjectId = data.layerRemove;
      removeSelectedObject();
    }
  });
  /* Presentation mode is the deck alone: no toolbar, no dots, no editing
     affordances, and a pointer that gets out of the way. Everything the
     presenter drives it with — the keys, the notes, the blackout, the controls
     that belong to a slide — keeps working. */
  async function setPresenting(active) {
    presenting = active;
    document.body.classList.toggle("presenting", active);
    $("#present").setAttribute("aria-pressed", String(active));
    $("#exit-present").hidden = !active;
    if (active) {
      if (editing) setEditing(false);
      $$("dialog[open]").forEach((dialog) => closeDialog(dialog));
      setJumpOpen(false);
      if (!document.fullscreenElement) await fullscreen();
    } else if (document.fullscreenElement) await fullscreen();
    render();
    wake();
  }
  function setEditing(active) {
    editing = active;
    document.body.classList.toggle("editing", active);
    $("#edit").setAttribute("aria-pressed", String(active));
    if (!active) {
      selectedObjectId = null;
      editingObjectTextId = null;
      cropping = false;
      layersOpen = false;
      finishSlideTextEditing({ rerender: false });
    }
    render();
    wake();
  }
  function openDialog(id) {
    wake();
    if (id === "editor") {
      $(`#${id}`).show();
      renderEditor();
    } else {
      if (id === "themes") renderPalettes();
      $(`#${id}`).showModal();
    }
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
    if (dialog.id === "editor") render();
    wake();
  }
  const FIELD_LABELS = {
    backdropStrength: "עוצמת הרקע",
    pace: "קצב האנימציות",
    layout: "מיקום על הבמה",
    scale: "גודל הטקסט",
    arrangement: "סידור",
    backdropPicture: "תמונת הרקע",
    mark: "סמל הכלי",
    icon: "אייקון לצד הזה",
    minutes: "אורך בדקות",
    title: "כותרת",
    accent: "מילה מודגשת",
    caption: "משפט מתחת",
    tool: "הכלי שפותחים",
    prompt: "הפרומפט — לא מוקרן, מועתק בלחיצה",
    word: "מילה",
    visual: "ההמחשה",
    composition: "קומפוזיציה",
    mode: "אופן ההפעלה",
    first: "אפשרות ראשונה",
    second: "אפשרות שנייה",
    third: "אפשרות שלישית",
    label1: "טקסט בהמחשה · ראשון",
    label2: "טקסט בהמחשה · מרכזי",
    label3: "טקסט בהמחשה · משני",
    text: "חתיכה",
    value: "המספר",
    unit: "יחידה",
    picture: "התמונה",
    url: "קישור לסרטון",
    autoplay: "הפעלה",
    link: "קישור — נפתח בלשונית חדשה",
    poster: "תמונת פוסטר — מוצגת עד ההפעלה, וגם בלי רשת",
    fit: "איך היא יושבת",
    alt: "תיאור לקורא מסך",
    heading: "הכותרת בצד",
    line: "שורה מתחת",
    motion: "כניסת התוכן",
    backdrop: "רקע הבמה",
    transition: "מעבר הבמה לשקף הזה",
    textStyle: "מראה הטקסט",
    palette: "פלטת השקף",
    visibility: "הצגה בהרצאה",
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
  // One wording for the link's state, shown when the panel is built and again
  // on every keystroke — a note that lags is worse than no note.
  const videoNote = (value) => {
    const video = C.videoEmbed(value);
    if (!value.trim())
      return {
        text: "בחרו קובץ מהמחשב, או הדביקו קישור מיוטיוב או מגוגל דרייב.",
        bad: false,
      };
    if (!video)
      return {
        text: "לא זוהה. קובץ מקומי הוא נתיב כמו videos/demo.mp4 (mp4, webm, mov), או קישור מיוטיוב או מגוגל דרייב.",
        bad: true,
      };
    return {
      text:
        video.kind === "file"
          ? `קובץ מקומי. שימו אותו בנתיב הזה לצד קובץ המצגת — ואז השקף עובד בלי אינטרנט.`
          : `זוהה ${C.VIDEO_SOURCES[video.source]}. השקף הזה צריך אינטרנט בזמן ההרצאה.`,
      bad: false,
    };
  };
  const videoField = (label, path, value, max) => {
    const note = videoNote(value);
    return `<div class="field video-field"><span class="field-head"><span>${label}</span><small>${value.length} / ${max}</small></span><input type="text" dir="ltr" data-field="${path}" maxlength="${max}" value="${esc(value)}"><div class="picture-actions"><button class="duplicate-button" data-pick-video="${path}">${icon("play")}בחירת קובץ מהמחשב</button></div><small class="field-note ${note.bad ? "bad" : ""}">${esc(note.text)}</small></div>`;
  };
  const linkNote = (value) => {
    const clean = value.trim();
    if (!clean)
      return { text: "אפשר להדביק כתובת של הכלי, למשל https://claude.ai", bad: false };
    return C.safeLink(clean)
      ? { text: "הקישור ייפתח בלשונית חדשה ולא יעזוב את המצגת.", bad: false }
      : { text: "צריכה להיות כתובת שמתחילה ב־https:// ובלי רווחים.", bad: true };
  };
  const linkField = (label, path, value, max) => {
    const note = linkNote(value);
    return `<label class="field video-field"><span class="field-head"><span>${label}</span><small>${value.length} / ${max}</small></span><input type="text" dir="ltr" data-field="${path}" maxlength="${max}" value="${esc(value)}"><small class="field-note ${note.bad ? "bad" : ""}">${esc(note.text)}</small></label>`;
  };
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
  const rangeField = (label, path, value, min, max) =>
    `<label class="field range-field"><span class="field-head"><span>${label}</span><small data-range-readout>${esc(value)}%</small></span><input type="range" data-field="${path}" min="${min}" max="${max}" step="5" value="${esc(value)}"></label>`;
  const fieldsFor = (source, specs, prefix) =>
    Object.entries(specs)
      .map(([key, spec]) =>
        spec.link
          ? linkField(
              FIELD_LABELS[key] || key,
              `${prefix}.${key}`,
              source[key],
              spec.max,
            )
          : spec.video
          ? videoField(
              FIELD_LABELS[key] || key,
              `${prefix}.${key}`,
              source[key],
              spec.max,
            )
          : spec.picture
          ? pictureField(
              FIELD_LABELS[key] || key,
              `${prefix}.${key}`,
              source[key],
            )
          : spec.percent
          ? rangeField(
              FIELD_LABELS[key] || key,
              `${prefix}.${key}`,
              source[key],
              spec.min,
              spec.max,
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
    `<div class="object-field colour-field"><span>${label}</span><label class="colour-picker"><input type="color" value="${esc(object[key] === "auto" ? "#f6f7f8" : object[key])}" data-object-slide="${slideIndex}" data-object-id="${esc(object.id)}" data-object-prop="${key}" aria-label="${esc(label)}"><output>${object[key] === "auto" ? "לפי הערכה" : esc(object[key])}</output></label><div class="colour-swatches" aria-label="צבעים מהירים"><button type="button" class="swatch-auto" aria-pressed="${object[key] === "auto"}" data-object-colour="${slideIndex}:${esc(object.id)}:${key}:auto" title="לפי ערכת הצבעים של השקף" aria-label="לפי ערכת הצבעים של השקף">א</button>${OBJECT_SWATCHES.map((colour) => `<button type="button" style="--swatch:${colour}" data-object-colour="${slideIndex}:${esc(object.id)}:${key}:${colour}" aria-label="${colour}"></button>`).join("")}</div></div>`;
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
    if (object.type === "text") {
      const limit = C.textLimit(deck.slides[slideIndex], object);
      specific = `<label class="field"><span class="field-head"><span>תוכן הטקסט</span><small>${object.text.length} / ${limit}</small></span><textarea rows="3" maxlength="${limit}" required data-object-slide="${slideIndex}" data-object-id="${esc(object.id)}" data-object-prop="text">${esc(object.text)}</textarea></label><div class="object-transform-grid">${objectInput("גודל גופן", slideIndex, object, "fontSize", 8, 300)}${objectPicker("משקל", slideIndex, object, "weight", C.TEXT_WEIGHTS)}${objectPicker("יישור", slideIndex, object, "align", C.ALIGNS)}${objectPicker("מראה הטקסט", slideIndex, object, "style", C.TEXT_STYLES)}</div>${objectColour("צבע הטקסט", slideIndex, object, "color")}${linkField("קישור — נפתח בלשונית חדשה", `slides.${slideIndex}.objects.${objectIndex}.link`, object.link, 300)}`;
    } else if (object.type === "image")
      specific = `${pictureField("קובץ התמונה", `slides.${slideIndex}.objects.${objectIndex}.picture`, object.picture)}${field("תיאור לקורא מסך", `slides.${slideIndex}.objects.${objectIndex}.alt`, object.alt, 120, false, false)}${linkField("קישור — נפתח בלשונית חדשה", `slides.${slideIndex}.objects.${objectIndex}.link`, object.link, 300)}<div class="object-transform-grid">${objectPicker("התאמה למסגרת", slideIndex, object, "fit", C.FITS)}${objectInput("עיגול פינות", slideIndex, object, "radius", 0, 50)}${objectInput("הגדלה לחיתוך", slideIndex, object, "zoom", 100, 400)}${objectInput("מוקד אופקי", slideIndex, object, "focusX", 0, 100)}${objectInput("מוקד אנכי", slideIndex, object, "focusY", 0, 100)}</div>`;
    else if (object.type === "visual")
      specific = `<div class="object-transform-grid">${objectPicker("רכיב", slideIndex, object, "visual", C.VISUALS)}${objectPicker("מראה", slideIndex, object, "style", C.VISUAL_STYLES)}</div>${objectColour("צבע ראשי", slideIndex, object, "color")}${objectColour("צבע רקע", slideIndex, object, "secondary")}${["label1", "label2", "label3"].map((key, labelIndex) => field(`טקסט ${labelIndex + 1}`, `slides.${slideIndex}.objects.${objectIndex}.${key}`, object[key], 40, false, false)).join("")}`;
    else
      specific = `<div class="object-transform-grid">${objectPicker("צורה", slideIndex, object, "shape", C.SHAPES)}${objectPicker("מראה", slideIndex, object, "style", C.FILL_STYLES)}${objectColour("מילוי", slideIndex, object, "color")}${objectColour("קו", slideIndex, object, "stroke")}${objectInput("עובי קו", slideIndex, object, "strokeWidth", 0, 20)}</div>`;
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
  /* Which of a slide's fields belong to the look row rather than its content.
     This is the only list: the row itself is built from whatever lands in
     `look`, because naming the keys twice is how `pace` was added to the schema
     and to the row but not to this set — `look.pace` came back undefined, the
     row threw on it, and the whole slides panel rendered empty. */
  /* The two moves that mean something about a particular object rather than
     about the slide it sits on, so nothing chosen for the slide overwrites
     them. */
  const SIGNATURE_ENTRANCES = new Set(["gather", "curtain"]);
  const LOOK_KEYS = new Set([
    "visibility",
    "palette",
    "textStyle",
    "motion",
    "backdrop",
    "backdropPicture",
    "transition",
    "pace",
    "backdropStrength",
  ]);
  // The picture that goes with `backdrop: picture` gets its own field below.
  const MOTION_KEYS = new Set(["motion", "transition", "pace"]);
  const lookRow = (look) =>
    Object.fromEntries(
      Object.entries(look).filter(
        ([key]) => key !== "backdropPicture" && !MOTION_KEYS.has(key),
      ),
    );
  const motionPanel = (slide, index, look) =>
    `<section class="motion-panel"><div class="motion-panel-head"><strong>תנועה ומעבר</strong><small>מעבר הבמה מחליף את השקף; כניסת התוכן מפעילה את הכותרת והטקסט. הם פועלים בשכבות נפרדות.</small></div><div class="motion-grid">${picker("מעבר הבמה", `slides.${index}.transition`, slide.transition, look.transition.choice)}${picker("כניסת התוכן", `slides.${index}.motion`, slide.motion, look.motion.choice)}${picker("קצב", `slides.${index}.pace`, slide.pace, look.pace.choice)}</div></section>`;
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
      <div class="slide-editor-tools"><button class="icon-button" data-move="${index}:-1" aria-label="העברת השקף למעלה" ${index === 0 ? "disabled" : ""}>${icon("up")}</button><button class="icon-button" data-move="${index}:1" aria-label="העברת השקף למטה" ${index === last ? "disabled" : ""}>${icon("down")}</button><button class="icon-button" data-hide-slide="${index}" aria-pressed="${!C.isShown(slide)}" aria-label="${C.isShown(slide) ? "דילוג על השקף" : "החזרת השקף"}" title="${C.isShown(slide) ? "דילוג על השקף" : "החזרת השקף"}">${icon(C.isShown(slide) ? "eye" : "eyeOff")}</button><button class="icon-button" data-remove-slide="${index}" aria-label="מחיקת השקף" ${last === 0 ? "disabled" : ""}>${icon("trash")}</button></div>
      <p class="editor-note">${esc(type.hint)}</p>
      ${fieldsFor(slide, content, `slides.${index}`)}
      ${projectableTextTools(slide, index, content)}
      ${type.list ? listEditor(slide, index, type.list) : ""}
      ${objectTools(slide, index)}
      <div class="look-row">${fieldsFor(slide, lookRow(look), `slides.${index}`)}</div>
      ${motionPanel(slide, index, look)}
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
    if (!$("#editor").open) return;
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
      zoom: [100, 400],
      focusX: [0, 100],
      focusY: [0, 100],
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
    if (!withinDocumentLimit()) {
      object[key] = previous;
      input.value = previous;
      documentLimitMessage();
      return;
    }
    if (input.type === "number") input.value = value;
    if (key === "text") {
      input.closest(".field").querySelector("small").textContent =
        `${value.length} / ${C.textLimit(deck.slides[slideIndex], object)}`;
    }
    if (key === "color") {
      const output = input.closest(".colour-picker")?.querySelector("output");
      if (output) output.textContent = value;
    }
    selectedObjectId = object.id;
    if (slideIndex !== state.slide) state = C.goTo(deck, slideIndex);
    // A slider dragged through twenty colours is one decision, not twenty.
    save(
      input.tagName === "SELECT"
        ? null
        : `object:${object.id}:${key}:${editSession}`,
    );
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
    const path = input.dataset.field.split(".");
    if (path.at(-1) === "link" || (path[0] === "slides" && path.length === 3)) {
      const spec =
        path.at(-1) === "link"
          ? { link: true }
          : C.fieldSpec(deck.slides[+path[1]], path[2]);
      if (spec?.link) {
        const note = linkNote(input.value);
        const line = input.closest(".field")?.querySelector(".field-note");
        if (line) {
          line.textContent = note.text;
          line.classList.toggle("bad", note.bad);
        }
        if (note.bad) {
          input.setCustomValidity("כתובת צריכה להתחיל ב־https:// ובלי רווחים.");
          $("#save-status").textContent = "הקישור עדיין לא נשמר.";
          return;
        }
      }
      if (spec?.video) {
        const note = videoNote(input.value);
        const line = input.closest(".field")?.querySelector(".field-note");
        if (line) {
          line.textContent = note.text;
          line.classList.toggle("bad", note.bad);
        }
        if (note.bad) {
          input.setCustomValidity(
            "קישור לא מזוהה. אפשר להדביק קישור מיוטיוב או מגוגל דרייב.",
          );
          $("#save-status").textContent = "הקישור עדיין לא נשמר.";
          return;
        }
      }
    }
    input.setCustomValidity("");
    setPath(input.dataset.field, input.value);
    const token = `field:${input.dataset.field}:${editSession}`;
    if (path[0] === "slides" && path.length === 3) {
      const bound = deck.slides[+path[1]].objects.find(
        (object) => object.bind === path[2],
      );
      if (bound) bound.text = input.value;
    }
    save(token);
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
  function addObject(slideIndex, type, at) {
    const slide = deck.slides[slideIndex];
    if (!slide || slide.objects.length >= C.LIMITS.objects) return null;
    const added = C.blankObject(type);
    const rootStyle = getComputedStyle(document.documentElement);
    if (type === "text")
      added.color = rootStyle.getPropertyValue("--text").trim();
    else if (type === "shape") {
      added.color = rootStyle.getPropertyValue("--accent").trim();
      added.stroke = rootStyle.getPropertyValue("--text").trim();
    }
    if (at) {
      added.x = neat(clamp(at.x - Number(added.width) / 2, 0, 100 - Number(added.width)));
      added.y = neat(clamp(at.y - Number(added.height) / 2, 0, 100 - Number(added.height)));
    } else {
      // Landing every object on the same spot hides each one under the last.
      const offset = (slide.objects.length % 6) * 4;
      added.x = neat(Math.min(Number(added.x) + offset, 100 - Number(added.width)));
      added.y = neat(Math.min(Number(added.y) + offset, 100 - Number(added.height)));
    }
    slide.objects.push(added);
    selectedObjectId = added.id;
    state = C.goTo(deck, slideIndex);
    afterStructureChange();
    // A new box still holds its placeholder, so typing should replace it.
    if (type === "text" && editing) beginTextEditing(added.id, true);
    return added;
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
  /* Saved drafts. The browser keeps them, so the panel says so plainly and
     every draft can be taken out as a file — a draft that exists only in one
     browser profile is not a backup. */
  const draftsKey = "lecture-stage:drafts";
  const readDrafts = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(draftsKey));
      return Array.isArray(raw)
        ? raw.filter(
            (draft) =>
              draft &&
              typeof draft.name === "string" &&
              typeof draft.payload === "string",
          )
        : [];
    } catch {
      return [];
    }
  };
  let draftFailure = "";
  const writeDrafts = (list) => {
    const payload = JSON.stringify(list);
    try {
      localStorage.setItem(draftsKey, payload);
      draftFailure = "";
      return true;
    } catch (error) {
      draftFailure = isQuota(error)
        ? `אין מקום בדפדפן: ${list.length} טיוטות שוקלות ${megabytes(payload).toFixed(1)} מ״ב. מחקו טיוטה, או הורידו אותה כקובץ ואז מחקו.`
        : "השמירה במכשיר אינה זמינה.";
      return false;
    }
  };
  const draftStatus = (message) => {
    $("#draft-status").textContent = message;
  };
  const when = (iso) => {
    const date = new Date(iso);
    return Number.isNaN(date.valueOf())
      ? ""
      : `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()} · ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };
  /* Chromium drops a non-ASCII `download` name on a file:// page and saves the
     file as "download", with no extension at all. Everything here is named in
     Hebrew, so the file gets an ASCII name that still says what it is. */
  const fileName = (name, extension) => {
    const ascii = String(name)
      .replace(/[^A-Za-z0-9 _-]+/g, " ")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 50);
    return `${ascii || `lecture-${new Date().toISOString().slice(0, 10)}`}.${extension}`;
  };
  function renderDrafts() {
    const list = readDrafts();
    $("#draft-list").innerHTML = list.length
      ? list
          .map(
            (draft, index) =>
              `<article class="draft-row"><div class="draft-head"><strong>${esc(draft.name)}</strong><small>${esc(when(draft.savedAt))} · ${weight(draft.payload)}</small></div><div class="draft-actions"><button class="duplicate-button" data-draft-load="${index}">פתיחה</button><button class="text-button" data-draft-update="${index}">עדכון לגרסה הנוכחית</button><button class="text-button" data-draft-json="${index}">קובץ תוכן</button><button class="text-button" data-draft-html="${index}">קובץ מצגת</button><button class="icon-button danger" data-draft-remove="${index}" aria-label="מחיקת הטיוטה ${esc(draft.name)}">${icon("trash")}</button></div></article>`,
          )
          .join("")
      : '<p class="editor-note">אין עדיין טיוטות שמורות. שמור את המצב הנוכחי בשם, וכל שינוי מכאן והלאה לא ידרוס אותו.</p>';
  }
  function storeDraft(name, index = -1) {
    let payload;
    try {
      payload = JSON.stringify(C.validate(deck));
    } catch {
      draftStatus("התוכן הנוכחי אינו תקין ולכן לא נשמר. תקנו את השדה המסומן ונסו שוב.");
      return;
    }
    const list = readDrafts();
    const existing =
      index >= 0 ? index : list.findIndex((draft) => draft.name === name);
    const entry = { name, savedAt: new Date().toISOString(), payload };
    if (existing >= 0) list[existing] = entry;
    else if (list.length >= C.LIMITS.drafts) {
      draftStatus(
        `אפשר להחזיק עד ${C.LIMITS.drafts} טיוטות. מחקו אחת כדי לשמור חדשה.`,
      );
      return;
    } else list.push(entry);
    if (!writeDrafts(list)) {
      draftStatus(
        draftFailure ||
          "אין מספיק מקום בדפדפן. הורידו טיוטה כקובץ ומחקו אותה מכאן, ואז נסו שוב.",
      );
      return;
    }
    renderDrafts();
    draftStatus(
      existing >= 0 ? `הטיוטה ״${name}״ עודכנה.` : `הטיוטה ״${name}״ נשמרה.`,
    );
  }
  function loadDraft(index) {
    const draft = readDrafts()[index];
    if (!draft) return;
    let restored;
    try {
      restored = C.validate(JSON.parse(draft.payload));
    } catch {
      draftStatus("הטיוטה הזאת אינה תקינה ולא נפתחה.");
      return;
    }
    finishSlideTextEditing({ rerender: false });
    editingObjectTextId = null;
    selectedObjectId = null;
    cancelSceneRefresh();
    deck = restored;
    state = C.goTo(deck, 0);
    renderedDots = "";
    renderedSlide = -1;
    renderedSceneKey = null;
    // Recorded like any other change, so Ctrl+Z goes back to what was open.
    save();
    render();
    renderEditor();
    draftStatus(`״${draft.name}״ נפתחה. אפשר לבטל בכפתור החזרה.`);
    notify(`נפתחה הטיוטה ״${draft.name}״.`);
  }
  function draftDocument(index) {
    const draft = readDrafts()[index];
    if (!draft) return null;
    try {
      return { draft, document: C.validate(JSON.parse(draft.payload)) };
    } catch {
      draftStatus("הטיוטה הזאת אינה תקינה ולכן לא ניתן להוריד אותה.");
      return null;
    }
  }
  $("#open-drafts").addEventListener("click", () => {
    renderDrafts();
    draftStatus("");
    $("#draft-name").value = "";
    openDialog("drafts");
  });
  $("#draft-save").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#draft-name").value.trim();
    if (!name) return;
    storeDraft(name.slice(0, C.LIMITS.draftName));
    $("#draft-name").value = "";
  });
  $("#draft-list").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const data = button.dataset;
    if (data.draftLoad !== undefined) loadDraft(+data.draftLoad);
    else if (data.draftUpdate !== undefined) {
      const draft = readDrafts()[+data.draftUpdate];
      if (draft) storeDraft(draft.name, +data.draftUpdate);
    } else if (data.draftRemove !== undefined) {
      const list = readDrafts();
      const [removed] = list.splice(+data.draftRemove, 1);
      writeDrafts(list);
      renderDrafts();
      draftStatus(removed ? `הטיוטה ״${removed.name}״ נמחקה.` : "");
    } else if (data.draftJson !== undefined) {
      const found = draftDocument(+data.draftJson);
      if (found)
        download(
          JSON.stringify(found.document, null, 2),
          fileName(found.draft.name, "json"),
          "application/json;charset=utf-8",
          (saved) => draftStatus(`הקובץ ${saved} ירד למחשב.`),
        );
    } else if (data.draftHtml !== undefined) {
      const found = draftDocument(+data.draftHtml);
      if (!found) return;
      try {
        download(
          C.portableHTML(
            initialHTML,
            found.document,
            `portable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          ),
          fileName(found.draft.name, "html"),
          "text/html;charset=utf-8",
          (saved) =>
            draftStatus(`הקובץ ${saved} ירד למחשב, ונפתח בכל דפדפן גם בלי אינטרנט.`),
        );
      } catch (err) {
        draftStatus(err.message);
      }
    }
  });
  function download(text, filename, type, done) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    done?.(filename);
  }
  function exportHTML() {
    if (!validEditor()) return;
    try {
      const exportId = `portable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const name = fileName("chatbot-to-agent", "html");
      download(
        C.portableHTML(initialHTML, deck, exportId),
        name,
        "text/html;charset=utf-8",
      );
      notify(`${name} ירד למחשב. הוא כולל את התוכן הנוכחי ונפתח גם בלי אינטרנט.`);
    } catch (err) {
      notify(err.message);
    }
  }
  async function checkImportedPictures(document) {
    const values = new Set();
    for (const slide of document.slides) {
      if (slide.backdropPicture) values.add(slide.backdropPicture);
      if (slide.picture) values.add(slide.picture);
      if (slide.poster) values.add(slide.poster);
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
      state = C.initialState(deck);
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
    if (!editing || event.button !== 0) return;
    // Leaving one text box must not cost the click that picked the next one.
    if (
      editingObjectTextId &&
      !event.target.closest('[data-object-text-editor="true"]')
    )
      finishTextEditing();
    const hit = event.target.closest(".free-object");
    if (!hit) {
      // Clicking the bare stage lets go of the object, so the toolbar stops
      // pointing at something the presenter is no longer working on.
      if (selectedObjectId && !event.target.closest("[data-slide-text]")) {
        selectedObjectId = null;
        cropping = false;
        $$(".free-object.selected").forEach((el) =>
          el.classList.remove("selected"),
        );
        renderObjectToolbar();
        renderLayers();
        renderEditor();
      }
      return;
    }
    if (event.target.closest('[contenteditable="true"]')) return;
    const id = hit.dataset.objectId;
    const object = objectById(state.slide, id);
    if (!object) return;
    /* While cropping, dragging inside the picture moves the picture within its
       frame rather than moving the frame across the stage. */
    const mode = event.target.closest("[data-object-handle]")
      ? "resize"
      : cropping && object.type === "image" && object.picture
        ? "crop"
        : "move";
    if (selectedObjectId !== id) {
      cropping = false;
      selectedObjectId = id;
      hit.classList.add("selected");
      $$(".free-object.selected").forEach((object) => {
        if (object !== hit) object.classList.remove("selected");
      });
      renderObjectToolbar();
      renderLayers();
      renderEditor();
    }
    activeObjectPointer = {
      id,
      pointerId: event.pointerId,
      mode,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      x: Number(object.x),
      y: Number(object.y),
      width: Number(object.width),
      height: Number(object.height),
      focusX: Number(object.focusX ?? 50),
      focusY: Number(object.focusY ?? 50),
    };
  }
  function moveObjectPointer(event) {
    if (!activeObjectPointer || event.pointerId !== activeObjectPointer.pointerId)
      return;
    const object = objectById(state.slide, activeObjectPointer.id);
    const rect = $("#stage").getBoundingClientRect();
    if (!object || !rect.width || !rect.height) return;
    /* The drag starts on the first real movement. Capturing the pointer on the
       way down would send the click that follows to the stage instead of the
       box, and the browser would never report the double-click on it — and a
       still hand would nudge the object by a pixel it never asked to move. */
    if (!activeObjectPointer.moved) {
      if (
        Math.hypot(
          event.clientX - activeObjectPointer.startX,
          event.clientY - activeObjectPointer.startY,
        ) < 3
      )
        return;
      activeObjectPointer.moved = true;
      $("#stage").setPointerCapture?.(activeObjectPointer.pointerId);
      document.body.classList.add("object-dragging");
      showSnapGrid(object.snap === "on");
    }
    const dx = ((event.clientX - activeObjectPointer.startX) / rect.width) * 100;
    const dy = ((event.clientY - activeObjectPointer.startY) / rect.height) * 100;
    let xGuide = null,
      yGuide = null;
    if (activeObjectPointer.mode === "crop") {
      // The drag is in stage percent; the picture is panned in its own.
      object.focusX = neat(
        clamp(
          activeObjectPointer.focusX - (dx * 100) / Number(object.width),
          0,
          100,
        ),
      );
      object.focusY = neat(
        clamp(
          activeObjectPointer.focusY - (dy * 100) / Number(object.height),
          0,
          100,
        ),
      );
      applyObjectCrop(object);
      return;
    }
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
    const dragged = activeObjectPointer.moved;
    $("#stage").releasePointerCapture?.(activeObjectPointer.pointerId);
    activeObjectPointer = null;
    if (!dragged) return;
    document.body.classList.remove("object-dragging");
    showSnapGrid(false);
    save();
    renderEditor();
  }
  $("#slide-root").addEventListener("pointerdown", startObjectPointer);
  document.addEventListener("pointermove", moveObjectPointer);
  document.addEventListener("pointerup", endObjectPointer);
  document.addEventListener("pointercancel", endObjectPointer);
  const placeCaret = (el, selectEverything) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    if (!selectEverything) range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  function beginTextEditing(id, selectEverything = false) {
    const object = objectById(state.slide, id);
    if (!object || object.type !== "text") return;
    cancelSceneRefresh();
    newEditSession();
    selectedObjectId = id;
    editingObjectTextId = id;
    const openEditor = () => {
      const el = $(
        `.free-object[data-object-id="${CSS.escape(id)}"] .object-text`,
      );
      if (!el) return false;
      el.classList.add("is-editing");
      el.contentEditable = "true";
      el.spellcheck = true;
      el.dataset.objectTextEditor = "true";
      el.setAttribute("aria-label", "עריכת הטקסט על הבמה");
      el.focus();
      placeCaret(el, selectEverything);
      return true;
    };
    // Editing in place keeps the very node the double-click landed on. Only a
    // box that is not on the stage yet needs the stage built first.
    if (openEditor()) renderObjectToolbar();
    else {
      render();
      requestAnimationFrame(openEditor);
    }
  }
  function finishTextEditing() {
    if (!editingObjectTextId) return;
    const el = $('[data-object-text-editor="true"]');
    editingObjectTextId = null;
    if (el) {
      el.contentEditable = "false";
      el.classList.remove("is-editing");
      delete el.dataset.objectTextEditor;
      el.setAttribute("aria-label", "טקסט חופשי — לחיצה כפולה לעריכה");
      if (document.activeElement === el) el.blur();
    }
    save();
    renderObjectToolbar();
  }
  /* Slide text is edited where it sits. Converting it into a movable object is
     a separate, deliberate action — a double-click must never move the words
     the presenter just aimed at. */
  const textTarget = (el) => {
    if (el.dataset.slideText !== undefined)
      return {
        owner: deck.slides[state.slide],
        path: el.dataset.slideText,
        spec: C.fieldSpec(deck.slides[state.slide], el.dataset.slideText),
      };
    const path = el.dataset.exampleText;
    const parts = path.split(".");
    const spec =
      parts.length === 1
        ? C.EXAMPLE_FIELDS[parts[0]]
        : C.EXAMPLE_STEP_FIELDS[parts[2]];
    return { owner: C.selected(deck), path, spec };
  };
  function beginSlideTextEditing(el) {
    const { owner, path, spec } = textTarget(el);
    if (!spec) return;
    cancelSceneRefresh();
    newEditSession();
    finishSlideTextEditing({ rerender: false });
    editingSlideText = { owner, path, spec, el };
    el.textContent = C.readPath(owner, path) ?? "";
    el.contentEditable = "true";
    el.spellcheck = true;
    el.dataset.slideTextEditing = "true";
    el.focus();
    placeCaret(el, false);
  }
  function finishSlideTextEditing({ rerender = true } = {}) {
    if (!editingSlideText) return;
    const { el } = editingSlideText;
    editingSlideText = null;
    el.contentEditable = "false";
    delete el.dataset.slideTextEditing;
    if (document.activeElement === el) el.blur();
    if (!rerender) return;
    refreshSceneSoon();
  }
  $("#slide-root").addEventListener("dblclick", (event) => {
    if (!editing) return;
    const text = event.target.closest(".object-text");
    if (text) {
      event.preventDefault();
      beginTextEditing(text.closest(".free-object").dataset.objectId);
      return;
    }
    const structured = event.target.closest(
      "[data-slide-text], [data-example-text]",
    );
    if (!structured) return;
    event.preventDefault();
    beginSlideTextEditing(structured);
  });
  $("#slide-root").addEventListener("input", (event) => {
    const el = event.target.closest("[data-slide-text-editing='true']");
    if (!el || !editingSlideText || el !== editingSlideText.el) return;
    const { owner, path, spec } = editingSlideText;
    let value = el.textContent.replace(/\r/g, "");
    if (value.length > spec.max) {
      value = value.slice(0, spec.max);
      el.textContent = value;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      notify(`הטקסט הזה מוגבל ל־${spec.max} תווים.`);
    }
    if (spec.required && !value.trim()) return;
    C.writePath(owner, path, value);
    const bound = owner.objects?.find((object) => object.bind === path);
    if (bound) bound.text = value;
    save(`slide-text:${path}:${editSession}`);
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
    if (sceneRefresh) refreshSceneSoon();
    if (
      editingObjectTextId &&
      !event.target.closest("#slide-root, #object-toolbar")
    )
      finishTextEditing();
    if (
      editingSlideText &&
      !event.target.closest("[data-slide-text-editing='true']")
    )
      finishSlideTextEditing();
    if (jumpOpen && !event.target.closest("#slide-jump, #position"))
      setJumpOpen(false);
  });
  $("#slide-root").addEventListener("focusout", (event) => {
    if (
      editingSlideText &&
      event.target === editingSlideText.el &&
      !event.relatedTarget?.closest?.("#object-toolbar")
    )
      finishSlideTextEditing();
  });
  $("#slide-root").addEventListener("input", (event) => {
    if (!event.target.matches('[data-object-text-editor="true"]')) return;
    const object = currentObject();
    if (!object || object.type !== "text") return;
    const limit = C.textLimit(deck.slides[state.slide], object);
    let value = event.target.textContent.replace(/\r/g, "");
    if (value.length > limit) {
      value = value.slice(0, limit);
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
        `${value.length} / ${limit}`;
      panel.querySelector(".object-select span").textContent = value.slice(0, 28);
    }
    save(`object-text:${object.id}:${editSession}`);
  });
  $("#slide-root").addEventListener("keydown", (event) => {
    const leaving =
      event.key === "Escape" || (event.ctrlKey && event.key === "Enter");
    if (event.target.matches("[data-slide-text-editing='true']")) {
      if (event.key === "Enter" && !event.shiftKey) event.preventDefault();
      if (leaving || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        finishSlideTextEditing();
      }
      return;
    }
    if (!event.target.matches('[data-object-text-editor="true"]')) return;
    if (leaving) {
      event.preventDefault();
      event.stopPropagation();
      finishTextEditing();
    }
  });
  $("#slide-root").addEventListener("click", (event) => {
    const b = event.target.closest("[data-action]");
    if (!b) return;
    const action = b.dataset.action;
    if (action.startsWith("language-")) {
      if (editing) return;
      const slide = deck.slides[state.slide];
      if (slide.type !== "language") return;
      const session = languageSessions.get(slide.id) || {selected: slide.mode === "completion" ? 0 : -1, input: null, chosen: ""};
      if (action === "language-reset") languageSessions.delete(slide.id);
      else {
        if (action === "language-open") {
          const index = Number(b.dataset.index);
          if (!Number.isInteger(index) || !slide.items[index]) return;
          Object.assign(session, {selected: index, input: null, chosen: ""});
        } else if (action === "language-choose") {
          if (!["first", "second", "third"].includes(b.dataset.key) || !slide.items[session.selected]) return;
          session.input = $("#language-input")?.value ?? session.input;
          session.chosen = slide.items[session.selected][b.dataset.key];
        }
        languageSessions.set(slide.id, session);
      }
      b.blur();
      render();
    } else if (action === "play-video") {
      playing.add(deck.slides[state.slide].id);
      b.blur();
      render();
    } else if (action === "copy-prompt") copyPrompt(deck.slides[state.slide]);
    else if (action === "timer-toggle" || action === "timer-reset") {
      // Blur first: render restores focus by data-action, so a later blur is lost.
      b.blur();
      if (action === "timer-reset") timers.delete(deck.slides[state.slide].id);
      else toggleTimer();
      render();
    } else act(action);
  });
  $("#slide-root").addEventListener(
    "error",
    (event) => {
      if (!event.target.matches?.(".video-embed")) return;
      const frame = event.target.closest(".video-frame");
      if (frame && !frame.querySelector(".video-warning"))
        frame.insertAdjacentHTML(
          "beforeend",
          '<span class="video-warning">לא הצלחתי לפתוח את קובץ הווידאו. ודאו שהוא יושב בתיקייה שליד קובץ המצגת, באותו שם בדיוק.</span>',
        );
    },
    true,
  );
  $("#slide-root").addEventListener("change", (event) => {
    if (event.target.id === "audience-select")
      changeExample(event.target.value);
  });
  $("#slide-root").addEventListener("submit", (event) => {
    if (!event.target.matches(".language-form")) return;
    event.preventDefault();
    const slide = deck.slides[state.slide];
    if (editing || slide.type !== "language") return;
    const input = $("#language-input").value.trim().slice(0, 80);
    const matches = slide.items.map((item, index) => ({index, score: item.prompt.split(/\s+/).filter(word => word.length > 1 && input.includes(word)).length + (input.includes(item.word) ? 2 : 0)}));
    matches.sort((a,b) => b.score - a.score);
    const prior = languageSessions.get(slide.id)?.selected ?? 0;
    languageSessions.set(slide.id, {selected: matches[0].score ? matches[0].index : Math.max(0, prior), input, chosen: ""});
    event.submitter?.blur();
    render();
    $("#language-input")?.focus({preventScroll:true});
  });
  $("#object-toolbar").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    const object = currentObject();
    if (!button || !object) return;
    const data = button.dataset;
    // The stepper keeps focus so it can be clicked again; everything else
    // changes what the toolbar shows, and a focused control is never rebuilt.
    if (data.toolbarSize === undefined) button.blur();
    if (data.toolbarEditText !== undefined) {
      if (editingObjectTextId === object.id) finishTextEditing();
      else beginTextEditing(object.id);
    } else if (data.toolbarDelete !== undefined) removeSelectedObject();
    else if (data.toolbarStep !== undefined) {
      const [key, direction] = data.toolbarStep.split(":");
      object[key] = stepValue(object, key, Number(direction));
      // Nothing takes focus away between clicks, so a run of them is one step.
      const field = $(`[data-toolbar-step-value="${key}"]`);
      if (field) field.value = object[key];
      // Stepping must not cost the caret or the crop, so nothing is rebuilt.
      if (!applyObjectLook(object) && !applyObjectCrop(object)) renderSoon();
      save(`object:${object.id}:${key}:${editSession}`);
    } else if (data.toolbarCrop !== undefined) {
      cropping = !cropping;
      renderObjectToolbar();
      notify(
        cropping
          ? "גררו את התמונה בתוך המסגרת כדי לבחור מה נראה, והגדילו אותה בכפתורים."
          : "החיתוך ננעל. גרירה מזיזה שוב את התמונה עצמה.",
      );
    } else if (data.toolbarCropReset !== undefined) {
      Object.assign(object, { zoom: "100", focusX: "50", focusY: "50" });
      save();
      render();
      renderEditor();
    } else if (data.toolbarLayer !== undefined)
      moveObjectLayer(state.slide, object.id, Number(data.toolbarLayer));
    else if (data.toolbarDuplicate !== undefined)
      duplicateObject(state.slide, object.id);
    else if (data.toolbarPicture !== undefined) {
      pendingPicturePath = `slides.${state.slide}.objects.${data.toolbarPicture}.picture`;
      $("#picture-file").click();
    } else if (data.toolbarSnap !== undefined) {
      object.snap = object.snap === "on" ? "off" : "on";
      save();
      renderObjectToolbar();
      renderEditor();
    }
  });
  function updateFromToolbar(target, live) {
    const object = currentObject();
    if (!object) return;
    let key = null;
    if (target.matches("[data-toolbar-colour]"))
      key = target.dataset.toolbarColour;
    else if (target.matches("[data-toolbar-step-value]"))
      key = target.dataset.toolbarStepValue;
    else if (target.matches("[data-toolbar-object-prop]"))
      key = target.dataset.toolbarObjectProp;
    if (!key) return;
    object[key] = STEP_RANGES[key]
      ? String(
          clamp(
            Math.round(Number(target.value) || STEP_RANGES[key][0]),
            ...STEP_RANGES[key],
          ),
        )
      : target.value;
    if (!applyObjectLook(object) && !(key === "zoom" && applyObjectCrop(object)))
      renderSoon();
    save(live ? `object:${object.id}:${key}:${editSession}` : null);
    if (!live) renderEditor();
    if (!live && (key === "entrance" || key === "exit"))
      previewObjectMotion(object.id, key, object[key]);
  }
  // A colour picker fires on every move: those are one decision, and the stage
  // follows live. A select fires once, and only then is it a step of its own.
  $("#object-toolbar").addEventListener("input", (event) => {
    // A select fires input and change both; only the change is a decision.
    if (!event.target.matches("select")) updateFromToolbar(event.target, true);
  });
  $("#object-toolbar").addEventListener("change", (event) => {
    if (event.target.matches("select")) updateFromToolbar(event.target, false);
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
  $("#edit").addEventListener("click", (event) => {
    // Same trap as the navigation dots: leaving focus here turns the presenter's
    // next space into a second click, which drops them back out of edit mode.
    event.currentTarget.blur();
    setEditing(!editing);
  });
  $("#deck").addEventListener("click", () =>
    $("#editor").open ? closeDialog($("#editor")) : openDialog("editor"),
  );
  $("#position").addEventListener("click", () => setJumpOpen(!jumpOpen));
  $("#slide-jump").addEventListener("click", (event) => {
    const button = event.target.closest("[data-jump]");
    if (!button) return;
    state = C.goTo(deck, +button.dataset.jump);
    setJumpOpen(false);
    render();
    wake();
  });
  const droppedImage = (transfer) =>
    [...(transfer?.files ?? [])].find((file) => file.type.startsWith("image/"));
  $("#stage").addEventListener("dragover", (event) => {
    if (!editing || ![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    $("#stage").classList.add("drop-active");
  });
  $("#stage").addEventListener("dragleave", (event) => {
    if (!event.relatedTarget?.closest?.("#stage"))
      $("#stage").classList.remove("drop-active");
  });
  $("#stage").addEventListener("drop", async (event) => {
    $("#stage").classList.remove("drop-active");
    if (!editing) return;
    const file = droppedImage(event.dataTransfer);
    if (!file) return;
    event.preventDefault();
    const rect = $("#stage").getBoundingClientRect();
    const slideIndex = state.slide;
    const added = addObject(slideIndex, "image", {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
    if (!added) return;
    const index = deck.slides[slideIndex].objects.indexOf(added);
    await loadPicture(file, `slides.${slideIndex}.objects.${index}.picture`);
  });
  function insertSlide(slide, at) {
    if (deck.slides.length >= C.LIMITS.slides) {
      notify(`אפשר עד ${C.LIMITS.slides} שקפים במצגת אחת.`);
      return;
    }
    deck.slides.splice(at, 0, slide);
    selectedObjectId = null;
    state = C.goTo(deck, at);
    afterStructureChange();
  }
  $("#stage-tools").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.stageAdd) addObject(state.slide, button.dataset.stageAdd);
    else if (button.hasAttribute("data-stage-slide-add")) {
      const type = $("[data-stage-slide-type]")?.value;
      if (C.SLIDE_TYPES[type]) insertSlide(C.blankSlide(type), state.slide + 1);
    } else if (button.hasAttribute("data-stage-slide-duplicate")) {
      const copy = C.clone(deck.slides[state.slide]);
      copy.id = C.newId("slide");
      // Two slides may not share an object ID anywhere in the document.
      copy.objects = copy.objects.map((object) => ({
        ...object,
        id: C.newId("object"),
      }));
      insertSlide(copy, state.slide + 1);
      if (!withinDocumentLimit()) {
        deck.slides.splice(state.slide, 1);
        state = C.goTo(deck, Math.max(0, state.slide - 1));
        afterStructureChange();
        documentLimitMessage();
      }
    } else if (button.hasAttribute("data-stage-slide-hide")) {
      const slide = deck.slides[state.slide];
      slide.visibility = C.isShown(slide) ? "hidden" : "shown";
      button.blur();
      renderedDots = "";
      save();
      render();
      renderEditor();
      notify(
        C.isShown(slide)
          ? "השקף חזר להרצאה."
          : "השקף מדולג. הוא נשאר בעורך, וההצגה תעבור מעליו.",
      );
    } else if (button.hasAttribute("data-stage-slide-remove")) {
      if (deck.slides.length <= 1) return;
      const removed = deck.slides.splice(state.slide, 1)[0];
      selectedObjectId = null;
      state = C.goTo(deck, Math.max(0, state.slide - 1));
      afterStructureChange();
      notify(
        `השקף ״${slideName(removed)}״ נמחק. אפשר להחזיר אותו בכפתור הביטול.`,
      );
    }
    else if (button.hasAttribute("data-stage-layers")) {
      layersOpen = !layersOpen;
      button.blur();
      renderLayers();
      renderStageTools();
    } else if (button.hasAttribute("data-stage-open-deck")) openDialog("editor");
    else if (button.hasAttribute("data-stage-done")) setEditing(false);
  });
  $("#stage-tools").addEventListener("change", (event) => {
    const field = event.target.dataset.stageField;
    if (!field) return;
    deck.slides[state.slide][field] = event.target.value;
    renderedSlide = -1;
    save();
    render();
    renderEditor();
  });
  $("#present").addEventListener("click", () => setPresenting(!presenting));
  $("#exit-present").addEventListener("click", () => setPresenting(false));
  $("#undo").addEventListener("click", () => stepHistory(-1));
  $("#redo").addEventListener("click", () => stepHistory(1));
  $("#appearance").addEventListener("click", () => openDialog("themes"));
  /* The presenter changes these constantly and they were three clicks deep in a
     side panel. They are the same fields the editor renders — read from
     COMMON_FIELDS, so one added there shows up here too. */
  const MOTION_DIALOG_KEYS = ["transition", "motion", "pace", "backdrop", "backdropStrength"];
  function renderMotionDialog() {
    const slide = deck.slides[state.slide];
    const specs = C.SLIDE_TYPES[slide.type].fields;
    $("#motion-slide-name").textContent = `${C.shownPosition(deck, state.slide) || state.slide + 1}. ${slideName(slide)}`;
    $("#motion-fields").innerHTML = fieldsFor(
      slide,
      Object.fromEntries(
        MOTION_DIALOG_KEYS.filter((key) => specs[key]).map((key) => [key, specs[key]]),
      ),
      `slides.${state.slide}`,
    );
  }
  $("#motion").addEventListener("click", () => {
    renderMotionDialog();
    openDialog("motion-dialog");
  });
  /* The dialog's own fields go through the same handlers the editor uses, so a
     change here saves, re-renders and previews exactly as it does there. */
  for (const event of ["input", "change"])
    $("#motion-dialog").addEventListener(event, (e) => {
      const target = e.target;
      if (!target.matches("[data-field]")) return;
      if (event === "input" && target.tagName === "SELECT") return;
      if (event === "change" && target.tagName !== "SELECT") return;
      if (target.type === "range") {
        const readout = target.closest(".range-field")?.querySelector("[data-range-readout]");
        if (readout) readout.textContent = `${target.value}%`;
      }
      setPath(target.dataset.field, target.value);
      renderedSlide = -1;
      renderedSceneKey = null;
      save();
      render();
    });
  $("#motion-replay").addEventListener("click", () => {
    renderedSlide = -1;
    renderedSceneKey = null;
    render();
  });
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
  /* The same panel also sets the palette of the slide in front of you. A theme
     dresses the whole deck; a palette dresses one slide — including a white one
     in the middle of a dark talk — and the panel is where a presenter goes
     looking for either. Rebuilt on open so the pressed state is the truth. */
  function renderPalettes() {
    const slide = deck.slides[state.slide];
    /* Counted over the slides the audience actually sees; the skipped ones are
       released too, they are just not what the presenter is looking at. */
    const shown = deck.slides.filter((s) => C.isShown(s));
    const pinned = shown.filter((s) => s.palette !== "deck").length;
    /* The first choice has no palette of its own, so its swatch is the deck's
       current theme — which is also what makes the theme buttons above visibly
       do something. */
    const theme = C.THEMES[deck.theme];
    $("#palette-options").innerHTML = Object.entries(C.PALETTES)
      .map(([key, name]) => {
        const p = C.PALETTE_STYLES[key];
        const swatch = p
          ? `background:${p.surface};color:${p.text};border-color:${p.line}`
          : `background:${theme.swatch[0]};color:${theme.swatch[1]};border-color:${theme.swatch[1]}`;
        const accent = p ? p.accent : theme.swatch[1];
        return `<button data-palette-choice="${key}" aria-pressed="${slide.palette === key}" title="${esc(name)}"><span class="palette-preview" style="${swatch}"><i>Aa</i><b style="color:${accent}">✳</b></span><span>${esc(name)}</span></button>`;
      })
      .join("");
    $("#palette-note").textContent = pinned
      ? `${pinned} מתוך ${shown.length} השקפים נושאים ערכה משלהם, ולכן הערכה שלמעלה לא משנה אותם. שקף שמוגדר ״לפי ערכת המצגת״ משתנה יחד איתה.`
      : "כל השקפים הולכים אחרי ערכת המצגת. בחירה כאן מצמידה לשקף שמולך ערכה משלו.";
    $("#palette-release").hidden = !pinned;
    $("#palette-release").textContent = "החזרת כל השקפים לערכת המצגת";
  }
  $("#palette-release").addEventListener("click", () => {
    for (const slide of deck.slides) slide.palette = "deck";
    save();
    render();
    renderPalettes();
    notify("כל השקפים הולכים עכשיו אחרי ערכת המצגת.");
  });
  $("#palette-options").addEventListener("click", (event) => {
    const button = event.target.closest("[data-palette-choice]");
    if (!button) return;
    deck.slides[state.slide].palette = button.dataset.paletteChoice;
    save();
    render();
    renderPalettes();
  });
  $("#editor-fields").addEventListener("input", (e) => {
    // Selects also fire input; they are handled on change, where the value is final.
    if (e.target.matches("input[data-field], textarea[data-field]")) {
      /* The readout is updated in place rather than by re-rendering: rebuilding
         the editor mid-drag would replace the slider under the pointer and end
         the gesture. */
      if (e.target.type === "range") {
        const readout = e.target
          .closest(".range-field")
          ?.querySelector("[data-range-readout]");
        if (readout) readout.textContent = `${e.target.value}%`;
      }
      updateField(e.target);
    }
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
      const path = e.target.dataset.field;
      setPath(path, e.target.value);
      const pathParts = path.split(".");
      const slideIndex =
        pathParts[0] === "slides" ? Number(pathParts[1]) : Number.NaN;
      if (Number.isInteger(slideIndex)) state = C.goTo(deck, slideIndex);
      if (path.endsWith(".transition")) {
        previewingSlideTransition = true;
        previewingSlideMotion = false;
        renderedSceneKey = null;
        save();
        render();
        notify(`תצוגה מקדימה: ${C.TRANSITIONS[e.target.value]}`);
        return;
      }
      if (path.endsWith(".motion")) {
        const editedSlide = deck.slides[slideIndex];
        const objectEntrance = C.OBJECT_MOTION_EQUIVALENTS[e.target.value];
        for (const object of editedSlide?.objects ?? []) {
          /* A signature move says something about this one object — `gather`
             carries a mark from where it stood on the slide before, `curtain`
             opens one way and closes the other. Reaching for the slide's motion
             dropdown must not quietly undo either of them. */
          if (SIGNATURE_ENTRANCES.has(object.entrance)) continue;
          // Only text can arrive word by word; anything else simply appears.
          object.entrance =
            objectEntrance === "cascade" && object.type !== "text"
              ? "fade"
              : objectEntrance;
        }
        previewingSlideMotion = true;
        previewingSlideTransition = false;
        renderedSceneKey = null;
        save();
        render();
        notify(`תצוגה מקדימה: ${C.MOTIONS[e.target.value]}`);
        return;
      }
      // Replay the entrance so the presenter sees the preset they just picked.
      renderedSlide = -1;
      renderedSceneKey = null;
      save();
      render();
      // Choosing the picture backdrop reveals its upload field.
      if (path.endsWith(".backdrop")) renderEditor();
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
      addObject(+slideIndex, type);
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
      duplicateObject(+slideIndex, id);
    } else if (data.objectLayer) {
      const [slideIndex, id, direction] = data.objectLayer.split(":");
      moveObjectLayer(+slideIndex, id, Number(direction));
    } else if (data.objectColour) {
      const [slideIndex, id, key, colour] = data.objectColour.split(":");
      const object = objectById(+slideIndex, id);
      if (!object) return;
      object[key] = colour;
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
    } else if (data.pickVideo) {
      pendingVideoPath = data.pickVideo;
      $("#video-file").click();
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
    } else if (data.hideSlide !== undefined) {
      const slide = deck.slides[+data.hideSlide];
      slide.visibility = C.isShown(slide) ? "hidden" : "shown";
      renderedDots = "";
      save();
      render();
      renderEditor();
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
  /* The browser never hands over a real path, so the deck stores the folder
     convention plus the file's own name, and plays the picked file from memory
     until the presenter has put it there. */
  $("#video-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const path = pendingVideoPath;
    pendingVideoPath = null;
    e.target.value = "";
    if (!file || !path) return;
    const target = `videos/${file.name}`;
    if (!C.videoEmbed(target)) {
      notify(
        "סוג הקובץ הזה אינו נתמך. אפשר mp4, webm, mov, m4v או ogv, ובלי תווים מיוחדים בשם.",
      );
      return;
    }
    const slideIndex = Number(path.split(".")[1]);
    const slide = deck.slides[slideIndex];
    setPath(path, target);
    if (slide) {
      pickedVideos.get(slide.id) &&
        URL.revokeObjectURL(pickedVideos.get(slide.id));
      pickedVideos.set(slide.id, URL.createObjectURL(file));
      playing.add(slide.id);
      state = C.goTo(deck, slideIndex);
    }
    renderedSlide = -1;
    save();
    render();
    renderEditor();
    notify(
      `הסרטון מנוגן מכאן לבדיקה. כדי שיעבוד גם אחרי סגירה, שימו את ${file.name} בתיקייה videos שליד קובץ המצגת.`,
    );
  });
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
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      const undoKey = key === "z" && !e.shiftKey;
      const redoKey = key === "y" || (key === "z" && e.shiftKey);
      if (undoKey || redoKey) {
        // A focused text field has its own undo stack, and taking it away
        // would make typing feel broken. Ours governs everything else.
        if (
          e.target.closest('input,textarea,[contenteditable="true"]') ||
          editingObjectTextId ||
          editingSlideText
        )
          return;
        e.preventDefault();
        stepHistory(undoKey ? -1 : 1);
        return;
      }
    }
    if (e.key === "Escape" && presenting && !jumpOpen && !openDialog) {
      e.preventDefault();
      setPresenting(false);
      return;
    }
    if (e.key === "Escape" && jumpOpen) {
      e.preventDefault();
      setJumpOpen(false);
      return;
    }
    if (e.key === "Escape" && openDialog) {
      e.preventDefault();
      closeDialog(openDialog);
      return;
    }
    if (
      editing &&
      !editingObjectTextId &&
      !editingSlideText &&
      ["Delete", "Backspace"].includes(e.key) &&
      !e.target.closest('input,textarea,select,[contenteditable="true"]') &&
      removeSelectedObject()
    ) {
      e.preventDefault();
      return;
    }
    if (
      editing &&
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
    if (e.key === " " && e.target.closest("button, a")) return;
    if ([" ", "PageDown", "ArrowLeft"].includes(e.key)) {
      e.preventDefault();
      act("next");
    } else if (["PageUp", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      act("prev");
    } else if (e.key.toLowerCase() === "p") {
      e.preventDefault();
      setPresenting(!presenting);
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
  // Entering a field starts a session: everything typed there is one step, and
  // coming back to it later is a step of its own.
  document.addEventListener("focusin", (event) => {
    if (event.target.closest("#editor-fields, #object-toolbar"))
      newEditSession();
  });
  document.addEventListener("fullscreenchange", () => {
    if (presenting && !document.fullscreenElement) setPresenting(false);
    $("#fullscreen").setAttribute(
      "aria-label",
      document.fullscreenElement ? "יציאה ממסך מלא" : "מסך מלא",
    );
    wake();
  });
  /* The one case where the stored copy and the published one disagree. Taking
     the new one files the current deck away as a draft first, so a presenter
     who has been editing loses nothing by pressing it; keeping the old one
     records the choice against the new revision so the bar stops asking. */
  function renderSuperseded() {
    const bar = $("#superseded");
    bar.hidden = !supersededBy;
    if (!supersededBy) return;
    bar.innerHTML =
      '<p>יש גרסה חדשה של ההרצאה בקישור. מה שמוצג עכשיו הוא העותק ששמור במכשיר הזה.</p><div class="superseded-actions"><button class="primary-button" data-superseded="take">טעינת הגרסה החדשה</button><button class="text-button" data-superseded="keep">להישאר עם שלי</button></div>';
  }
  $("#superseded").addEventListener("click", (event) => {
    const action = event.target.closest("[data-superseded]")?.dataset.superseded;
    if (!action || !supersededBy) return;
    if (action === "take") {
      const list = readDrafts();
      const stamp = new Date().toISOString().slice(0, 10);
      if (list.length < C.LIMITS.drafts)
        writeDrafts([
          ...list,
          {
            name: `העותק שלי · ${stamp}`,
            savedAt: new Date().toISOString(),
            payload: JSON.stringify(deck),
          },
        ]);
      deck = C.clone(supersededBy);
      state = C.initialState(deck);
      history.reset(JSON.stringify(deck));
      notify("נטענה הגרסה החדשה. העותק הקודם נשמר כטיוטה.");
    } else {
      deck.revision = supersededBy.revision;
      notify("נשארנו עם העותק שלך.");
    }
    supersededBy = null;
    renderSuperseded();
    save();
    render();
  });
  renderSuperseded();
  render();
  save();
  document.body.classList.add("controls-idle");
  /* Whatever went wrong at startup says what it was. "Storage is unavailable"
     used to cover a blocked browser and a stored copy that no longer validates
     alike, which is the one thing this app must not do with the presenter's
     own work: it sends them looking in the wrong place while the real copy sits
     untouched and unexplained. */
  if (startupProblem) notify(startupProblem);
  else if (!canSave)
    notify("השמירה המקומית אינה זמינה. אפשר לערוך ולהוריד עותק דרך העורך.");
})();
