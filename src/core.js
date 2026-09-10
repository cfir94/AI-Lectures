/* Shared pure content and navigation rules. No DOM or network dependencies. */
(() => {
  "use strict";
  const THEMES = ["carbon", "paper", "wine"];
  const LIMITS = {
    slides: 40,
    examples: 20,
    steps: 6,
    note: 500,
    image: 1500000,
    importBytes: 12000000,
  };
  // Only raster data URIs the editor itself produced. SVG is excluded on purpose:
  // it can carry script, and nothing here needs it.
  const IMAGE_HEAD = /^data:image\/(png|jpeg|webp|gif);base64,/;
  const NOT_BASE64 = /[^A-Za-z0-9+/=]/;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const newId = (prefix) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const text = (max, required = true) => ({ max, required });
  const choice = (options) => ({ choice: options });
  const picture = () => ({ picture: true, max: LIMITS.image });
  const FITS = { cover: "ממלאת את הבמה", contain: "נכנסת בשלמותה" };
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
    plain: "רקע נקי",
  };
  const TRANSITIONS = {
    fade: "הצלבה",
    push: "החלקה",
    zoom: "זום",
    cut: "חיתוך",
  };
  const COMMON_FIELDS = {
    motion: choice(MOTIONS),
    backdrop: choice(BACKDROPS),
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
    experiment: {
      label: "צ׳אטבוט מול סוכן",
      hint: "הניסוי האינטראקטיבי. המשימה, התשובה והשלבים נערכים במקטע הדוגמאות.",
      fields: { title: text(40) },
      beats: (slide, deck) => 1 + selected(deck).steps.length,
    },
  };
  for (const type of Object.values(SLIDE_TYPES))
    type.fields = { ...type.fields, ...COMMON_FIELDS };
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
    experiment: { title: "הנה הצעה." },
  };
  const blankSlide = (type) => ({
    id: newId("slide"),
    type,
    ...clone(BLANKS[type]),
    motion: "rise",
    backdrop: "arcs",
    note: "",
  });
  const blankItem = (type) =>
    clone(BLANKS[type][SLIDE_TYPES[type].list.key][0]);
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
        if (
          value &&
          (!IMAGE_HEAD.test(value) ||
            NOT_BASE64.test(value.slice(value.indexOf(",") + 1)))
        )
          fail();
        return value;
      }
      if (spec.choice) {
        // An absent preset falls back to the default; a wrong one is a bad file.
        if (v === undefined) return Object.keys(spec.choice)[0];
        if (typeof v !== "string" || !(v in spec.choice)) fail();
        return v;
      }
      const value = spec.required ? v : (v ?? "");
      if (typeof value !== "string" || value.length > spec.max) fail();
      if (spec.required && !value.trim()) fail();
      return value;
    };
    const group = (source, fields) => {
      const out = {};
      for (const [key, spec] of Object.entries(fields))
        out[key] = str(source[key], spec);
      return out;
    };
    if (!obj(raw) || raw.version !== 2 || !THEMES.includes(raw.theme)) fail();
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
          ...group(s, type.fields),
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
          name: str(e.name, text(40)),
          task: str(e.task, text(110)),
          answer: str(e.answer, text(180)),
          steps: e.steps.map((s) => {
            if (!obj(s)) fail();
            return group(s, {
              label: text(18),
              detail: text(120),
              artifact: text(40),
            });
          }),
        };
      }),
    };
    const unique = (values) => new Set(values).size === values.length;
    const ids = result.examples.map((e) => e.id);
    if (
      !unique(result.slides.map((s) => s.id)) ||
      !unique(ids) ||
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
    clone,
    newId,
    blankSlide,
    blankItem,
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
