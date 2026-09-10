/* Shared pure content and navigation rules. No DOM or network dependencies. */
(() => {
  "use strict";
  // key -> what the editor shows, plus the two swatch colours for its preview.
  const THEMES = {
    carbon: { name: "פחם ותכלת", hint: "עמוק · טכנולוגי", swatch: ["#10171e", "#88e6ee"] },
    paper: { name: "לבן וכחול", hint: "בהיר · מדויק", swatch: ["#ffffff", "#2359c4"] },
    wine: { name: "בורדו ולבן", hint: "חם · דרמטי", swatch: ["#280f1c", "#ffe2ec"] },
    forest: { name: "יער ומנטה", hint: "עמוק · רגוע", swatch: ["#101d16", "#7fe3b0"] },
    ember: { name: "פחם וענבר", hint: "חם · ערבי", swatch: ["#1c1510", "#f0b978"] },
    ink: { name: "דיו ונייר", hint: "מינימלי · חד", swatch: ["#0e0e0e", "#e8e2d6"] },
    nebula: { name: "סגול ולילך", hint: "לילי · חלומי", swatch: ["#151327", "#b9a3ff"] },
  };
  const LIMITS = {
    slides: 40,
    examples: 20,
    steps: 6,
    objects: 40,
    note: 500,
    image: 1500000,
    importBytes: 2400000,
  };
  // Only raster data URIs the editor itself produced. SVG is excluded on purpose:
  // it can carry script, and nothing here needs it.
  const IMAGE_HEAD = /^data:image\/(png|jpeg|webp|gif);base64,/;
  const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  const IMAGE_SIGNATURES = {
    png: ["iVBORw0KGgo"],
    jpeg: ["/9j/"],
    webp: ["UklGR"],
    gif: ["R0lGOD"],
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const serializedBytes = (value) =>
    new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const newId = (prefix) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const text = (max, required = true) => ({ max, required });
  const digits = (max) => ({ max, required: true, digits: true });
  const choice = (options) => ({ choice: options });
  const picture = () => ({ picture: true, max: LIMITS.image });
  const FITS = { cover: "ממלאת את הבמה", contain: "נכנסת בשלמותה" };
  const OBJECT_TYPES = {
    text: "טקסט",
    image: "תמונה",
    shape: "צורה",
    visual: "רכיב חזותי",
  };
  const SHAPES = {
    rectangle: "מלבן",
    circle: "עיגול",
    line: "קו",
    arrow: "חץ",
    star: "כוכב",
    blob: "כתם",
    ring: "טבעת",
  };
  const TEXT_STYLES = {
    solid: "צבע אחיד",
    spectrum: "צבעוני",
    outline: "קו מתאר",
  };
  const VISUALS = {
    accordion: "כרטיס אקורדיון",
    glass: "זכוכית נוזלית",
    stars: "שדה כוכבים",
  };
  const OBJECT_ENTRANCES = {
    none: "בלי כניסה",
    fade: "הופעה",
    rise: "עלייה",
    zoom: "התקרבות",
    wipe: "חשיפה",
    pop: "קפיצה רכה",
  };
  const OBJECT_EXITS = {
    none: "בלי יציאה",
    fade: "היעלמות",
    fall: "ירידה",
    shrink: "התרחקות",
    wipe: "סגירה",
  };
  const SNAP_MODES = { on: "נצמד לגריד", off: "תנועה חופשית" };
  const EXAMPLE_FIELDS = {
    name: text(40),
    task: text(110),
    answer: text(180),
  };
  const EXAMPLE_STEP_FIELDS = {
    label: text(18),
    detail: text(120),
    artifact: text(40),
  };
  const OBJECT_TEXT_MAX = 500;
  const ALIGNS = { right: "ימין", center: "מרכז", left: "שמאל" };
  const selected = (deck) =>
    deck.examples.find((e) => e.id === deck.selectedExampleId);

  /* Look and feel the presenter picks per slide. Names are Hebrew because they
     are shown in the editor; the keys are what CSS hooks onto. */
  const MOTIONS = {
    rise: "עלייה רכה",
    blur: "התבהרות",
    wipe: "חשיפה",
    cascade: "מילה אחרי מילה",
    zoom: "התקרבות",
    still: "בלי תנועה",
  };
  const BACKDROPS = {
    arcs: "קשתות אור",
    grid: "רשת",
    particles: "חלקיקים",
    aurora: "זוהר",
    rings: "טבעות",
    beams: "קרני אור",
    waves: "גלים",
    halo: "הילה",
    picture: "תמונה משלך",
    plain: "רקע נקי",
  };
  const TRANSITIONS = {
    fade: "הצלבה",
    push: "החלקה",
    zoom: "זום",
    cut: "חיתוך",
  };
  const COMMON_FIELDS = {
    textStyle: choice(TEXT_STYLES),
    motion: choice(MOTIONS),
    backdrop: choice(BACKDROPS),
    backdropPicture: picture(),
    transition: choice(TRANSITIONS),
  };

  /* Every slide type declares its fields once: validation, the editor and the
     beat count for the presenter's arrow keys all read this table. */
  const SLIDE_TYPES = {
    statement: {
      label: "משפט גדול",
      hint: "כותרת אחת על הבמה. המילה המודגשת והמשפט שמתחת הם רשות.",
      fields: {
        title: text(40),
        accent: text(40, false),
        caption: text(150, false),
      },
      beats: () => 1,
    },
    demo: {
      label: "הדגמה חיה",
      hint: "מחזיק את הבמה בזמן שאתה עובר לכלי עצמו. הפרומפט נשמר כאן, ניתן להעתקה בלחיצה, ואינו מוקרן.",
      fields: {
        title: text(40),
        tool: text(30),
        caption: text(150, false),
        prompt: text(800, false),
      },
      beats: () => 1,
    },
    reveal: {
      label: "מילים שנחשפות",
      hint: "מילה אחת בכל צעד, עם משפט אחד מתחתיה. הקודמות נשארות עמומות.",
      fields: { title: text(40, false) },
      list: {
        key: "items",
        label: "מילה",
        min: 2,
        max: 5,
        fields: { word: text(18), caption: text(120, false) },
      },
      beats: (slide) => slide.items.length,
    },
    tokens: {
      label: "חתיכות של שפה",
      hint: "המשפט נשבר לחתיכות. צעד ראשון המשפט השלם, צעד שני החתיכות.",
      fields: { title: text(40), caption: text(150, false) },
      list: {
        key: "chunks",
        label: "חתיכה",
        min: 3,
        max: 24,
        fields: { text: text(12) },
      },
      beats: () => 2,
    },
    image: {
      label: "תמונה",
      hint: "תמונה שהיא השקף. הכותרת והמשפט מוקרנים מעליה, ואפשר להשאיר אותם ריקים.",
      fields: {
        picture: picture(),
        fit: choice(FITS),
        title: text(40, false),
        caption: text(150, false),
        alt: text(120, false),
      },
      beats: () => 1,
    },
    number: {
      label: "מספר ענק",
      hint: "מספר אחד שממלא את הבמה ומטפס אליו. טוב לנתון שרוצים שיישאר בראש.",
      fields: {
        value: text(9),
        unit: text(20, false),
        title: text(40, false),
        caption: text(150, false),
      },
      beats: () => 1,
    },
    split: {
      label: "שניים זה מול זה",
      hint: "שני צדדים על אותה במה. כל צעד מדליק צד אחד, והקודם נשאר עמום לצידו.",
      fields: { title: text(40, false) },
      list: {
        key: "sides",
        label: "צד",
        min: 2,
        max: 3,
        fields: { heading: text(20), line: text(120, false) },
      },
      beats: (slide) => slide.sides.length,
    },
    timer: {
      label: "טיימר",
      hint: "ספירה לאחור על הבמה, לתרגול או להפסקה. מתחילים, עוצרים ומאפסים בכפתורים שעל השקף.",
      fields: {
        minutes: digits(3),
        title: text(40, false),
        caption: text(150, false),
      },
      beats: () => 1,
    },
    canvas: {
      label: "במה חופשית",
      hint: "שקף ריק עם תיבות טקסט, תמונות וצורות שאפשר למקם ולשנות ישירות על הבמה.",
      fields: {},
      objects: true,
      beats: () => 1,
    },
    experiment: {
      label: "צ׳אטבוט מול סוכן",
      hint: "הניסוי האינטראקטיבי. המשימה, התשובה והשלבים נערכים במקטע הדוגמאות.",
      fields: { title: text(40) },
      beats: (slide, deck) => 1 + selected(deck).steps.length,
    },
  };
  for (const type of Object.values(SLIDE_TYPES)) {
    type.fields = { ...type.fields, ...COMMON_FIELDS };
    type.objects = true;
  }
  const BLANKS = {
    statement: { title: "משפט חדש.", accent: "", caption: "" },
    demo: { title: "הדגמה חדשה.", tool: "הכלי", caption: "", prompt: "" },
    reveal: {
      title: "",
      items: [
        { word: "ראשונה.", caption: "" },
        { word: "שנייה.", caption: "" },
        { word: "שלישית.", caption: "" },
      ],
    },
    tokens: {
      title: "ככה זה נראה.",
      caption: "",
      chunks: [{ text: "חתי" }, { text: "כה" }, { text: " אחת" }],
    },
    image: { picture: "", fit: "cover", title: "", caption: "", alt: "" },
    number: { value: "100", unit: "", title: "", caption: "" },
    split: {
      title: "",
      sides: [
        { heading: "צד אחד", line: "" },
        { heading: "צד שני", line: "" },
      ],
    },
    timer: { minutes: "10", title: "", caption: "" },
    canvas: { objects: [] },
    experiment: { title: "הנה הצעה." },
  };
  const blankSlide = (type) => ({
    id: newId("slide"),
    type,
    ...clone(BLANKS[type]),
    motion: "rise",
    backdrop: "arcs",
    backdropPicture: "",
    transition: "fade",
    objects: [],
    note: "",
  });
  const blankItem = (type) =>
    clone(BLANKS[type][SLIDE_TYPES[type].list.key][0]);
  const blankObject = (type) => {
    const base = {
      id: newId("object"),
      type,
      x: "20",
      y: "25",
      width: "60",
      height: type === "text" ? "22" : "45",
      rotation: "0",
      opacity: "100",
      snap: "on",
      entrance: "fade",
      exit: "fade",
    };
    if (type === "text")
      return {
        ...base,
        text: "טקסט חופשי",
        fontSize: "64",
        weight: "400",
        align: "center",
        color: "#f6f7f8",
        style: "solid",
        bind: "",
      };
    if (type === "image")
      return { ...base, picture: "", fit: "contain", radius: "0", alt: "" };
    if (type === "visual")
      return {
        ...base,
        visual: "accordion",
        color: "#ff5a91",
        secondary: "#212121",
        label1: "רעיון",
        label2: "פעולה",
        label3: "תוצאה",
      };
    return {
      ...base,
      shape: "rectangle",
      color: "#88e6ee",
      stroke: "#f6f7f8",
      strokeWidth: "0",
    };
  };
  /* A bound text object and the slide field it writes into are the same string,
     so the shorter of the two limits governs. Without this the editor happily
     accepts 500 characters into a 40-character title and the document stops
     validating — which reads to the presenter as "saving is unavailable". */
  const textLimit = (slide, object) => {
    const spec =
      object.bind && SLIDE_TYPES[slide.type]?.fields?.[object.bind];
    return spec?.max ?? OBJECT_TEXT_MAX;
  };
  /* Every projected string on a slide can be edited in place, so the editor
     needs the spec behind a dotted path such as "title" or "items.0.word". */
  const fieldSpec = (slide, path) => {
    const type = SLIDE_TYPES[slide.type];
    if (!type) return null;
    const parts = String(path).split(".");
    if (parts.length === 1) return type.fields[parts[0]] ?? null;
    if (parts.length !== 3 || !type.list || parts[0] !== type.list.key)
      return null;
    if (!/^\d+$/.test(parts[1]) || !slide[parts[0]]?.[Number(parts[1])])
      return null;
    return type.list.fields[parts[2]] ?? null;
  };
  const readPath = (slide, path) => {
    const parts = String(path).split(".");
    return parts.length === 1
      ? slide[parts[0]]
      : slide[parts[0]]?.[Number(parts[1])]?.[parts[2]];
  };
  const writePath = (slide, path, value) => {
    const parts = String(path).split(".");
    if (parts.length === 1) slide[parts[0]] = value;
    else slide[parts[0]][Number(parts[1])][parts[2]] = value;
  };
  const safeJSON = (value) =>
    JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");

  function validate(raw) {
    const fail = () => {
      throw new Error(
        "קובץ התוכן אינו מתאים. יש לבחור קובץ JSON שיוצא מההרצאה, בגרסה 2.",
      );
    };
    const obj = (v) => v && typeof v === "object" && !Array.isArray(v);
    const str = (v, spec) => {
      if (spec.picture) {
        const value = v ?? "";
        if (typeof value !== "string" || value.length > spec.max) fail();
        if (value) {
          const head = value.match(IMAGE_HEAD);
          const payload = value.slice(value.indexOf(",") + 1);
          if (
            !head ||
            !payload ||
            !BASE64.test(payload) ||
            !IMAGE_SIGNATURES[head[1]].some((signature) =>
              payload.startsWith(signature),
            )
          )
            fail();
        }
        return value;
      }
      if (spec.choice) {
        // An absent preset falls back to the default; a wrong one is a bad file.
        if (v === undefined) return Object.keys(spec.choice)[0];
        if (typeof v !== "string" || !Object.hasOwn(spec.choice, v)) fail();
        return v;
      }
      const value = spec.required ? v : (v ?? "");
      if (typeof value !== "string" || value.length > spec.max) fail();
      if (spec.required && !value.trim()) fail();
      if (spec.digits && !/^\d+$/.test(value)) fail();
      return value;
    };
    const number = (v, min, max) => {
      if (typeof v !== "string" || !/^-?\d+(\.\d+)?$/.test(v)) fail();
      const raw = Number(v);
      if (!Number.isFinite(raw) || raw < min || raw > max) fail();
      return String(Math.round(raw * 10) / 10);
    };
    const colour = (v) => {
      if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) fail();
      return v.toLowerCase();
    };
    const ownChoice = (v, options) => {
      if (typeof v !== "string" || !Object.hasOwn(options, v)) fail();
      return v;
    };
    const object = (item) => {
      if (!obj(item) || !Object.hasOwn(OBJECT_TYPES, item.type)) fail();
      const base = {
        id: str(item.id, text(100)),
        type: item.type,
        x: number(item.x, 0, 100),
        y: number(item.y, 0, 100),
        width: number(item.width, 2, 100),
        height: number(item.height, 2, 100),
        rotation: number(item.rotation, -180, 180),
        opacity: number(item.opacity, 0, 100),
        snap:
          item.snap === undefined ? "on" : ownChoice(item.snap, SNAP_MODES),
        entrance:
          item.entrance === undefined
            ? "fade"
            : ownChoice(item.entrance, OBJECT_ENTRANCES),
        exit:
          item.exit === undefined
            ? "fade"
            : ownChoice(item.exit, OBJECT_EXITS),
      };
      if (
        Number(base.x) + Number(base.width) > 100 ||
        Number(base.y) + Number(base.height) > 100
      )
        fail();
      if (item.type === "text")
        return {
          ...base,
          text: str(item.text, text(OBJECT_TEXT_MAX)),
          fontSize: number(item.fontSize, 8, 300),
          weight: ownChoice(item.weight, { 300: true, 400: true, 600: true, 800: true }),
          align: ownChoice(item.align, ALIGNS),
          color: colour(item.color),
          style: ownChoice(item.style, TEXT_STYLES),
          bind: str(item.bind, text(80, false)),
        };
      if (item.type === "image")
        return {
          ...base,
          picture: str(item.picture, picture()),
          fit: ownChoice(item.fit, FITS),
          radius: number(item.radius, 0, 50),
          alt: str(item.alt, text(120, false)),
        };
      if (item.type === "visual")
        return {
          ...base,
          visual: ownChoice(item.visual, VISUALS),
          color: colour(item.color),
          secondary: colour(item.secondary),
          label1: str(item.label1, text(40, false)),
          label2: str(item.label2, text(40, false)),
          label3: str(item.label3, text(40, false)),
        };
      return {
        ...base,
        shape: ownChoice(item.shape, SHAPES),
        color: colour(item.color),
        stroke: colour(item.stroke),
        strokeWidth: number(item.strokeWidth, 0, 20),
      };
    };
    const group = (source, fields) => {
      const out = {};
      for (const [key, spec] of Object.entries(fields))
        out[key] = str(source[key], spec);
      return out;
    };
    if (
      !obj(raw) ||
      serializedBytes(raw) > LIMITS.importBytes ||
      raw.version !== 2 ||
      !Object.hasOwn(THEMES, raw.theme)
    )
      fail();
    if (
      !Array.isArray(raw.slides) ||
      !raw.slides.length ||
      raw.slides.length > LIMITS.slides ||
      !Array.isArray(raw.examples) ||
      !raw.examples.length ||
      raw.examples.length > LIMITS.examples
    )
      fail();
    const result = {
      version: 2,
      documentId: str(raw.documentId, text(100)),
      theme: raw.theme,
      transition: str(raw.transition, choice(TRANSITIONS)),
      selectedExampleId: str(raw.selectedExampleId, text(100)),
      slides: raw.slides.map((s) => {
        if (!obj(s)) fail();
        const type = SLIDE_TYPES[s.type];
        if (!type) fail();
        const slide = {
          id: str(s.id, text(100)),
          type: s.type,
          ...group(
            { ...s, transition: s.transition ?? raw.transition },
            type.fields,
          ),
          note: str(s.note, text(LIMITS.note, false)),
        };
        if (type.list) {
          const { key, min, max, fields } = type.list;
          const items = s[key];
          if (!Array.isArray(items) || items.length < min || items.length > max)
            fail();
          slide[key] = items.map((item) => {
            if (!obj(item)) fail();
            return group(item, fields);
          });
        }
        if (type.objects) {
          const objects = s.objects ?? [];
          if (!Array.isArray(objects) || objects.length > LIMITS.objects) fail();
          slide.objects = objects.map(object);
          if (
            new Set(slide.objects.map((item) => item.id)).size !==
            slide.objects.length
          )
            fail();
          const bindings = new Set();
          for (const item of slide.objects) {
            if (!item.bind) continue;
            const spec = type.fields[item.bind];
            if (
              item.type !== "text" ||
              !spec ||
              spec.choice ||
              spec.picture ||
              spec.digits ||
              bindings.has(item.bind) ||
              slide[item.bind] !== item.text
            )
              fail();
            bindings.add(item.bind);
          }
        }
        return slide;
      }),
      examples: raw.examples.map((e) => {
        if (
          !obj(e) ||
          !Array.isArray(e.steps) ||
          e.steps.length < 2 ||
          e.steps.length > LIMITS.steps
        )
          fail();
        return {
          id: str(e.id, text(100)),
          ...group(e, EXAMPLE_FIELDS),
          steps: e.steps.map((s) => {
            if (!obj(s)) fail();
            return group(s, EXAMPLE_STEP_FIELDS);
          }),
        };
      }),
    };
    const unique = (values) => new Set(values).size === values.length;
    const ids = result.examples.map((e) => e.id);
    const objectIds = result.slides.flatMap((slide) =>
      slide.objects.map((item) => item.id),
    );
    if (
      !unique(result.slides.map((s) => s.id)) ||
      !unique(ids) ||
      !unique(objectIds) ||
      !ids.includes(result.selectedExampleId)
    )
      fail();
    return result;
  }

  function portableHTML(template, document, documentId) {
    const portable = validate({ ...clone(document), documentId });
    const start = template.indexOf('<script id="deck-data"');
    const bodyStart = template.indexOf(">", start) + 1;
    const end = template.indexOf("</scr" + "ipt>", bodyStart);
    if (start < 0 || !bodyStart || end < 0)
      throw new Error("Missing embedded content slot");
    const output =
      template.slice(0, bodyStart) + safeJSON(portable) + template.slice(end);
    return (
      "<!doctype html>\n" +
      output.replace(
        /(<html[^>]*data-theme=)"[^"]*"/,
        (_, prefix) => prefix + '"' + portable.theme + '"',
      )
    );
  }

  const beats = (deck, index) => {
    const slide = deck.slides[index];
    return SLIDE_TYPES[slide.type].beats(slide, deck);
  };
  const initialState = () => ({ slide: 0, step: 0 });
  const goTo = (deck, index) => ({
    slide: Math.min(Math.max(index, 0), deck.slides.length - 1),
    step: 0,
  });
  function transition(state, action, deck) {
    let { slide, step } = state;
    if (action === "next") {
      if (step + 1 < beats(deck, slide)) step++;
      else if (slide < deck.slides.length - 1) {
        slide++;
        step = 0;
      }
    } else if (action === "prev") {
      if (step > 0) step--;
      else if (slide > 0) {
        slide--;
        step = beats(deck, slide) - 1;
      }
    } else if (action === "chat" || action === "reset") step = 0;
    else if (action === "agent") step = 1;
    return { slide, step: Math.min(step, beats(deck, slide) - 1) };
  }
  globalThis.LectureCore = {
    THEMES,
    LIMITS,
    SLIDE_TYPES,
    MOTIONS,
    BACKDROPS,
    TRANSITIONS,
    FITS,
    OBJECT_TYPES,
    SHAPES,
    TEXT_STYLES,
    VISUALS,
    OBJECT_ENTRANCES,
    OBJECT_EXITS,
    SNAP_MODES,
    ALIGNS,
    OBJECT_TEXT_MAX,
    EXAMPLE_FIELDS,
    EXAMPLE_STEP_FIELDS,
    textLimit,
    fieldSpec,
    readPath,
    writePath,
    clone,
    serializedBytes,
    newId,
    blankSlide,
    blankItem,
    blankObject,
    safeJSON,
    validate,
    portableHTML,
    selected,
    beats,
    initialState,
    goTo,
    transition,
  };
})();
