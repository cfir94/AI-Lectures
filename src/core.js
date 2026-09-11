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
    drafts: 25,
    draftName: 60,
    slides: 48,
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
  /* A video lives on someone else's server, so only two of them are allowed and
     only the video's own ID is taken from what the presenter pastes. The embed
     address is built here from that ID — a pasted URL never reaches an iframe,
     which is the whole point. */
  const VIDEO_SOURCES = {
    file: "קובץ מהמחשב",
    youtube: "יוטיוב",
    drive: "גוגל דרייב",
  };
  /* A local video is a path relative to the deck, and only that: no scheme, no
     drive letter, no leading slash and no climbing out with "..". A document
     that arrives from somewhere else may not point the presenter's browser at
     an arbitrary file on their disk. */
  const VIDEO_FILE =
    /^(?!\/)(?![A-Za-z]:)(?!.*\.\.)(?:[\w\-. \u0590-\u05FF]+\/)*[\w\-. \u0590-\u05FF]+\.(?:mp4|webm|m4v|mov|ogv)$/i;
  const VIDEO_ID = /^[A-Za-z0-9_-]{6,64}$/;
  const VIDEO_PATTERNS = [
    [/^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([^&#]+)/i, "youtube"],
    [/^https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/(?:embed|v|shorts|live)\/([^?&#/]+)/i, "youtube"],
    [/^https?:\/\/youtu\.be\/([^?&#/]+)/i, "youtube"],
    [/^https?:\/\/(?:drive|docs)\.google\.com\/file\/d\/([^?&#/]+)/i, "drive"],
    [/^https?:\/\/drive\.google\.com\/open\?(?:[^#]*&)?id=([^&#]+)/i, "drive"],
  ];
  function videoEmbed(url) {
    if (typeof url !== "string") return null;
    const clean = url.trim();
    if (VIDEO_FILE.test(clean))
      return { source: "file", kind: "file", id: clean, src: clean, watch: clean };
    for (const [pattern, source] of VIDEO_PATTERNS) {
      const found = clean.match(pattern);
      if (!found || !VIDEO_ID.test(found[1])) continue;
      const id = found[1];
      return {
        source,
        kind: "iframe",
        id,
        src:
          source === "youtube"
            ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&autoplay=1`
            : `https://drive.google.com/file/d/${id}/preview`,
        watch:
          source === "youtube"
            ? `https://youtu.be/${id}`
            : `https://drive.google.com/file/d/${id}/view`,
      };
    }
    return null;
  }
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const serializedBytes = (value) =>
    new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const newId = (prefix) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const text = (max, required = true) => ({ max, required });
  const digits = (max) => ({ max, required: true, digits: true });
  const choice = (options) => ({ choice: options });
  const picture = () => ({ picture: true, max: LIMITS.image });
  const link = () => ({ max: 300, required: false, link: true });
  /* A link is opened by the presenter mid-talk, so only https is accepted:
     never javascript:, data: or file:, and never a document's idea of a local
     path. Empty means the slide simply has no link. */
  const LINK = /^https:\/\/[^\s<>"'`\\]{4,299}$/;
  const safeLink = (value) =>
    typeof value === "string" && LINK.test(value.trim()) ? value.trim() : "";
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
    dots: "שדה נקודות",
    rule: "קו שיער",
  };
  const TEXT_STYLES = {
    solid: "צבע אחיד",
    spectrum: "צבעוני",
    outline: "קו מתאר",
    shimmer: "זוהר נודד",
    sheen: "ברק חולף",
  };
  const VISUALS = {
    accordion: "כרטיס אקורדיון",
    glass: "זכוכית נוזלית",
    approval: "זכוכית · גבול אישור",
    orb: "כדור זוהר",
    bars: "עמודות חיות",
    window: "חלון כלי",
    cloud: "ענן שפה",
    calculation: "חישוב ותוצאה",
    retrieval: "שליפה מתוך מקור",
    generation: "המשך משפט",
    document: "מסמך מוכן",
    connection: "חיבור לכלי",
  };
  /* Fill styles work like the text ones: a key CSS hooks onto and a Hebrew
     name. A visual has no outline state, so it gets the shorter table. */
  const FILL_STYLES = {
    solid: "צבע אחיד",
    spectrum: "צבעוני",
    outline: "קו מתאר",
  };
  const VISUAL_STYLES = { solid: "צבע אחיד", spectrum: "צבעוני" };
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
  const TEXT_WEIGHTS = { 300: "דק", 400: "רגיל", 600: "מודגש", 800: "כבד" };
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
    stars: "שדה כוכבים",
    neural: "רשת חיבורים",
    mesh: "מרחב צבע",
    picture: "תמונה משלך",
    plain: "רקע נקי",
  };
  const TRANSITIONS = {
    fade: "הצלבה",
    push: "החלקה",
    zoom: "זום",
    cut: "חיתוך",
  };
  /* A slide palette changes the whole light field, not just one highlighted
     word. Values remain a closed table so imported documents cannot inject
     arbitrary CSS into the stage. */
  /* "deck" is the absence of a palette: the slide takes the deck's theme rather
     than carrying colours of its own. It is first because it is the sane
     default — without it every slide pins itself, the theme controls nothing
     but the strip around the stage, and choosing one appears to do nothing. */
  const PALETTES = {
    deck: "לפי ערכת המצגת",
    pearl: "לבן פנינה · תכלת וסגול",
    prism: "דיו · תכלת וסגול",
    ice: "קרח ותכלת",
    violet: "סגול חשמלי",
    rose: "ורוד ומג׳נטה",
    amber: "ענבר וזהב",
    danger: "אדום אזהרה",
    mint: "מנטה וירוק",
    cobalt: "כחול קובלט",
    steel: "פלדה ולבן",
    paper: "לבן ודיו",
    mist: "ערפל בהיר",
    sand: "חול וחום",
    midnight: "כחול חצות",
  };
  const PALETTE_STYLES = {
    pearl: {
      surface: "#f8faff", raised: "#ffffff", soft: "#eaf0ff", line: "#bac8e0",
      text: "#182442", muted: "#52617d", accent: "#5264cb", rgb: "82,100,203",
      spectrum: "linear-gradient(110deg,#087caa 5%,#4464d6 50%,#8451c2 96%)",
    },
    prism: {
      surface: "#101323", raised: "#1e2440", soft: "#191d34", line: "#414d76",
      text: "#ffffff", muted: "#b9c5e4", accent: "#adceff", rgb: "173,206,255",
      spectrum: "linear-gradient(110deg,#a3efff 5%,#a3bfff 52%,#c3a1ff 96%)",
    },
    ice: {
      surface: "#10171e", raised: "#1d2933", soft: "#17242d", line: "#365160",
      text: "#f6fbff", muted: "#aebfca", accent: "#88e6ee", rgb: "136,230,238",
      spectrum: "linear-gradient(110deg,#bff8ff 5%,#74c8ff 52%,#b9a3ff 96%)",
    },
    violet: {
      surface: "#171126", raised: "#2a2044", soft: "#221938", line: "#4d3d75",
      text: "#faf7ff", muted: "#c2b7d8", accent: "#b9a3ff", rgb: "185,163,255",
      spectrum: "linear-gradient(110deg,#d8ccff 4%,#a887ff 48%,#ff79c9 96%)",
    },
    rose: {
      surface: "#210f1b", raised: "#3b1a30", soft: "#301326", line: "#693251",
      text: "#fff7fb", muted: "#d4afc2", accent: "#ff72b6", rgb: "255,114,182",
      spectrum: "linear-gradient(110deg,#ffd2e8 5%,#ff72b6 48%,#b99aff 96%)",
    },
    amber: {
      surface: "#21170f", raised: "#382819", soft: "#2d2015", line: "#62472a",
      text: "#fff9ef", muted: "#d5bea1", accent: "#f2bd62", rgb: "242,189,98",
      spectrum: "linear-gradient(110deg,#fff0b8 4%,#f2bd62 50%,#ff8875 96%)",
    },
    danger: {
      surface: "#200f13", raised: "#39191e", soft: "#2e1418", line: "#683039",
      text: "#fff7f7", muted: "#d7b0b4", accent: "#ff6b6b", rgb: "255,107,107",
      spectrum: "linear-gradient(110deg,#ffd0c7 4%,#ff6b6b 48%,#ff8a3d 96%)",
    },
    mint: {
      surface: "#0f1e18", raised: "#1b3429", soft: "#162a21", line: "#315a49",
      text: "#f4fff9", muted: "#add0bf", accent: "#7fe3b0", rgb: "127,227,176",
      spectrum: "linear-gradient(110deg,#c9ffe2 4%,#7fe3b0 50%,#b8e96f 96%)",
    },
    cobalt: {
      surface: "#0d1628", raised: "#172947", soft: "#121f37", line: "#2b4e7b",
      text: "#f5f9ff", muted: "#aec0da", accent: "#6ea8ff", rgb: "110,168,255",
      spectrum: "linear-gradient(110deg,#c9e0ff 4%,#6ea8ff 50%,#7de8e8 96%)",
    },
    /* No hue at all, and the only pure white in the table. It is what a slide
       looks like when the colour drains out of it — which is how this deck says
       something broke, instead of turning the wall red. */
    steel: {
      surface: "#0e1013", raised: "#1b1f24", soft: "#15181c", line: "#39404a",
      text: "#ffffff", muted: "#9aa3ad", accent: "#dbe2ea", rgb: "219,226,234",
      spectrum: "linear-gradient(110deg,#ffffff 4%,#c9d2dc 52%,#8f9aa6 96%)",
    },
    /* Light stages. Everything on the stage is built from these tokens, so a
       pale surface with dark text works the same way round — but `raised` and
       `soft` have to go *darker* than the surface here, not lighter, or every
       panel and chip disappears into the background. */
    paper: {
      surface: "#ffffff", raised: "#eef1f6", soft: "#f5f7fa", line: "#c9d2de",
      text: "#0c1118", muted: "#5a6675", accent: "#1f5fd0", rgb: "31,95,208",
      spectrum: "linear-gradient(110deg,#1f5fd0 4%,#3b4fd8 52%,#7a3fd0 96%)",
    },
    mist: {
      surface: "#e8edf3", raised: "#d6dee8", soft: "#dfe6ee", line: "#adbccd",
      text: "#101823", muted: "#4f5d6e", accent: "#1d5bb8", rgb: "29,91,184",
      spectrum: "linear-gradient(110deg,#1d5bb8 4%,#2f6fa8 52%,#5a4fb0 96%)",
    },
    sand: {
      surface: "#f6f1e7", raised: "#e6ddcc", soft: "#efe8da", line: "#cdbfa5",
      text: "#1c1710", muted: "#6b5c46", accent: "#a35a1c", rgb: "163,90,28",
      spectrum: "linear-gradient(110deg,#a35a1c 4%,#b8762a 52%,#7d5a2e 96%)",
    },
    midnight: {
      surface: "#05070f", raised: "#101728", soft: "#0a0f1c", line: "#243252",
      text: "#eef3ff", muted: "#93a3c2", accent: "#7fd8ff", rgb: "127,216,255",
      spectrum: "linear-gradient(110deg,#d8f4ff 4%,#7fd8ff 50%,#9db4ff 96%)",
    },
  };
  /* Where the words sit in the frame. A deck where every slide centres its
     headline reads as one slide shown thirty-five times, however good that one
     slide is — so this is the table that lets a talk breathe: the same content,
     placed. Each key is a CSS block; nothing branches on it in the renderer. */
  const LAYOUTS = {
    center: "במרכז",
    corner: "פינה עליונה",
    edge: "צמוד לשוליים",
    low: "נמוך בפריים",
    wide: "רחב ופרוס",
  };
  /* Headline size as a deliberate choice rather than a computed constant, so a
     deck can whisper on one slide and shout on the next. */
  const SCALES = {
    auto: "לפי אורך הטקסט",
    small: "קטן",
    medium: "בינוני",
    large: "גדול",
    huge: "ענק",
  };
  /* How a run of words is arranged. The descending stack is the original; a row
     and a stair stop every triple in the deck from looking like the last one. */
  const ARRANGEMENTS = {
    stack: "זו מתחת לזו",
    row: "בשורה אחת",
    stair: "מדרגות",
  };
  /* A slide the presenter is not showing this time. It stays in the document
     and in the editor, and the deck simply walks past it. */
  const VISIBILITY = { shown: "מוצג בהרצאה", hidden: "מדולג" };
  const COMMON_FIELDS = {
    visibility: choice(VISIBILITY),
    layout: choice(LAYOUTS),
    scale: choice(SCALES),
    palette: choice(PALETTES),
    textStyle: choice(TEXT_STYLES),
    motion: choice(MOTIONS),
    backdrop: choice(BACKDROPS),
    backdropPicture: picture(),
    transition: choice(TRANSITIONS),
  };

  /* Every slide type declares its fields once: validation, the editor and the
     beat count for the presenter's arrow keys all read this table. */
  const SLIDE_TYPES = {
    language: {
      label: "מעבדת מילים",
      hint: "ענן שנפתח בלחיצה או משפט להשלמה. האפשרויות מוגדרות כאן מראש; ההפעלה בהרצאה אינה משנה את התוכן השמור.",
      fields: { title: text(40), caption: text(120, false), mode: choice({cloud: "ענן נפתח", completion: "השלמת משפט"}) },
      list: { key: "items", label: "הקשר", min: 2, max: 6, fields: {
        word: text(18), prompt: text(80), first: text(18), second: text(18), third: text(18),
      } },
      beats: () => 1,
    },
    illustrated: {
      label: "רעיון והמחשה",
      hint: "רעיון אחד והמחשה אחת בכל צעד. החצים מחליפים את שניהם יחד. כל מילה בהמחשה ניתנת לעריכה, בנפרד מהעיצוב.",
      fields: { title: text(40, false), composition: choice({split: "רעיון לצד המחשה", theatre: "המחשה במרכז הבמה"}) },
      list: {
        key: "items", label: "רעיון", min: 2, max: 5,
        fields: {
          word: text(18), caption: text(120, false),
          visual: choice(VISUALS),
          label1: text(40, false), label2: text(40, false), label3: text(40, false),
        },
      },
      beats: (slide) => slide.items.length,
    },
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
        accent: text(40, false),
        /* The tool's own mark, beside its name. It belongs to the scene rather
           than to a free object pinned at the centre of the stage, so that it
           follows the slide's composition instead of drifting away from the
           words when the layout is not centred. */
        mark: picture(),
        link: link(),
        caption: text(150, false),
        prompt: text(800, false),
      },
      beats: () => 1,
    },
    reveal: {
      label: "מילים שנחשפות",
      hint: "מילה אחת בכל צעד, עם משפט אחד מתחתיה. הקודמות נשארות עמומות.",
      fields: { title: text(40, false), arrangement: choice(ARRANGEMENTS) },
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
        link: link(),
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
    video: {
      label: "סרטון",
      hint: "סרטון מהמחשב שלכם — הקובץ יושב בתיקייה videos שליד קובץ המצגת, והשקף עובד בלי אינטרנט. אפשר גם קישור מיוטיוב או מגוגל דרייב, ואז השקף הזה צריך רשת. בכל מקרה שמרו תמונת פוסטר: היא מוצגת עד ההפעלה.",
      fields: {
        url: { max: 300, required: false, video: true },
        poster: picture(),
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
    language: { title: "מה יכול לבוא עכשיו?", caption: "בחרו הקשר. פתחו אפשרויות.", mode: "cloud", items: [
      {word: "בוקר", prompt: "הבוקר שלי מתחיל עם", first: "קפה", second: "מוזיקה", third: "ריצה"},
      {word: "רעיון", prompt: "הרעיון הבא שלי הוא", first: "סיפור", second: "אפליקציה", third: "הרצאה"},
    ] },
    illustrated: {
      title: "רעיון אחד בכל רגע",
      items: [
        { word: "שפה.", caption: "מתוך אפשרויות נבנה משפט.", visual: "cloud", label1: "רעיון · שאלה · סיפור", label2: "מה יכול לבוא עכשיו?", label3: "מילה · הקשר · משמעות" },
        { word: "פעולה.", caption: "ממילים לתוצר.", visual: "document", label1: "התוצר", label2: "מוכן לבדיקה", label3: "" },
      ],
    },
    statement: { title: "משפט חדש.", accent: "", caption: "" },
    demo: {
      title: "הדגמה חדשה.",
      accent: "",
      tool: "הכלי",
      link: "",
      caption: "",
      prompt: "",
    },
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
    image: { picture: "", fit: "cover", title: "", caption: "", alt: "", link: "" },
    number: { value: "100", unit: "", title: "", caption: "" },
    split: {
      title: "",
      sides: [
        { heading: "צד אחד", line: "" },
        { heading: "צד שני", line: "" },
      ],
    },
    timer: { minutes: "10", title: "", caption: "" },
    video: { url: "", poster: "", title: "", caption: "" },
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
        link: "",
        fontSize: "64",
        weight: "400",
        align: "center",
        color: "#f6f7f8",
        style: "solid",
        bind: "",
      };
    if (type === "image")
      return {
        ...base,
        picture: "",
        fit: "contain",
        radius: "0",
        zoom: "100",
        focusX: "50",
        focusY: "50",
        alt: "",
        link: "",
      };
    if (type === "visual")
      return {
        ...base,
        style: "solid",
        visual: "accordion",
        color: "#ff5a91",
        secondary: "#212121",
        label1: "רעיון",
        label2: "פעולה",
        label3: "תוצאה",
      };
    return {
      ...base,
      style: "solid",
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
    if (parts.length === 3 && parts[0] === "objects" && /^\d+$/.test(parts[1]) &&
        slide.objects?.[Number(parts[1])]?.type === "visual" && /^label[123]$/.test(parts[2]))
      return text(40, false);
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
      if (spec.link) {
        const value = (v ?? "").trim();
        if (typeof value !== "string" || value.length > spec.max) fail();
        if (value && !LINK.test(value)) fail();
        return value;
      }
      if (spec.video) {
        const value = v ?? "";
        if (typeof value !== "string" || value.length > spec.max) fail();
        // Empty is a slide waiting for its link; anything else must resolve.
        if (value.trim() && !videoEmbed(value)) fail();
        return value.trim();
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
    /* "auto" means the object takes the slide's own text colour instead of
       carrying one. It is what lets a box survive its slide being given a
       light palette: a fixed near-white is invisible on white paper, and the
       presenter should not have to re-colour every box to change a theme. */
    const colour = (v) => {
      if (v === "auto") return "auto";
      if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) fail();
      return v.toLowerCase();
    };
    const ownChoice = (v, options) => {
      if (typeof v !== "string" || !Object.hasOwn(options, v)) fail();
      return v;
    };
    const isLegacyStars = (item) =>
      obj(item) && item.type === "visual" && item.visual === "stars";
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
          weight: ownChoice(item.weight, TEXT_WEIGHTS),
          align: ownChoice(item.align, ALIGNS),
          color: colour(item.color),
          style: ownChoice(item.style, TEXT_STYLES),
          link: str(item.link ?? "", link()),
          bind: str(item.bind, text(80, false)),
        };
      if (item.type === "image")
        return {
          ...base,
          picture: str(item.picture, picture()),
          fit: ownChoice(item.fit, FITS),
          radius: number(item.radius, 0, 50),
          // Absent in documents written before cropping existed.
          zoom: item.zoom === undefined ? "100" : number(item.zoom, 100, 400),
          focusX:
            item.focusX === undefined ? "50" : number(item.focusX, 0, 100),
          focusY:
            item.focusY === undefined ? "50" : number(item.focusY, 0, 100),
          alt: str(item.alt, text(120, false)),
          link: str(item.link ?? "", link()),
        };
      if (item.type === "visual")
        return {
          ...base,
          style:
            item.style === undefined
              ? "solid"
              : ownChoice(item.style, VISUAL_STYLES),
          visual: ownChoice(item.visual, VISUALS),
          color: colour(item.color),
          secondary: colour(item.secondary),
          label1: str(item.label1, text(40, false)),
          label2: str(item.label2, text(40, false)),
          label3: str(item.label3, text(40, false)),
        };
      return {
        ...base,
        style:
          item.style === undefined
            ? "solid"
            : ownChoice(item.style, FILL_STYLES),
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
      /* Stamped by the build from the content itself. A copy saved in a browser
         wins over the published one on startup — it is the presenter's work —
         so this is how the deck can tell that the published document has moved
         on since that copy was taken, and offer it rather than silently showing
         a stale talk. Older documents simply have none. */
      revision: str(raw.revision ?? "", text(40, false)),
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
          let objects = s.objects ?? [];
          if (!Array.isArray(objects) || objects.length > LIMITS.objects) fail();
          /* A star field was a free object before it became a backdrop. Older
             documents keep their stars — behind the slide, where they belong —
             instead of failing on a visual that no longer exists. */
          if (objects.some(isLegacyStars)) {
            objects = objects.filter((item) => !isLegacyStars(item));
            slide.backdrop = "stars";
          }
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

  /* Undo and redo hold whole validated documents as strings: the editor mutates
     the deck in many places, and a snapshot is the only record that cannot go
     out of step with it. Consecutive changes carrying the same token — one
     typing burst, one drag — collapse into a single step, so undo returns to
     before the sentence rather than before the last letter. */
  function createHistory(limit = 60) {
    let past = [],
      future = [],
      current = null,
      token = null;
    return {
      reset(payload) {
        past = [];
        future = [];
        current = payload;
        token = null;
      },
      record(payload, nextToken = null) {
        if (payload === current) return false;
        if (current !== null && !(nextToken !== null && nextToken === token)) {
          past.push(current);
          if (past.length > limit) past.shift();
          future = [];
        }
        token = nextToken;
        current = payload;
        return true;
      },
      undo() {
        if (!past.length) return null;
        future.push(current);
        current = past.pop();
        token = null;
        return current;
      },
      redo() {
        if (!future.length) return null;
        past.push(current);
        current = future.pop();
        token = null;
        return current;
      },
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      current: () => current,
      depth: () => past.length,
    };
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

  const isShown = (slide) => slide?.visibility !== "hidden";
  const shownCount = (deck) => deck.slides.filter(isShown).length;
  // Where the presenter is, counted only in slides an audience will see.
  const shownPosition = (deck, index) =>
    deck.slides.slice(0, index + 1).filter(isShown).length;
  const nextShown = (deck, from, direction) => {
    for (let i = from + direction; i >= 0 && i < deck.slides.length; i += direction)
      if (isShown(deck.slides[i])) return i;
    return -1;
  };
  const beats = (deck, index) => {
    const slide = deck.slides[index];
    return SLIDE_TYPES[slide.type].beats(slide, deck);
  };
  const initialState = (deck) => ({
    slide: deck ? Math.max(0, deck.slides.findIndex(isShown)) : 0,
    step: 0,
  });
  const goTo = (deck, index) => ({
    slide: Math.min(Math.max(index, 0), deck.slides.length - 1),
    step: 0,
  });
  function transition(state, action, deck) {
    let { slide, step } = state;
    if (action === "next") {
      if (step + 1 < beats(deck, slide)) step++;
      else {
        const target = nextShown(deck, slide, 1);
        if (target >= 0) {
          slide = target;
          step = 0;
        }
      }
    } else if (action === "prev") {
      if (step > 0) step--;
      else {
        const target = nextShown(deck, slide, -1);
        if (target >= 0) {
          slide = target;
          step = beats(deck, target) - 1;
        }
      }
    } else if (action === "chat" || action === "reset") step = 0;
    else if (action === "agent") step = 1;
    return { slide, step: Math.min(step, beats(deck, slide) - 1) };
  }
  globalThis.LectureCore = {
    THEMES,
    LIMITS,
    SLIDE_TYPES,
    VIDEO_SOURCES,
    videoEmbed,
    MOTIONS,
    BACKDROPS,
    TRANSITIONS,
    PALETTES,
    PALETTE_STYLES,
    VISIBILITY,
    isShown,
    shownCount,
    shownPosition,
    nextShown,
    FITS,
    OBJECT_TYPES,
    SHAPES,
    LAYOUTS,
    SCALES,
    ARRANGEMENTS,
    TEXT_STYLES,
    FILL_STYLES,
    VISUAL_STYLES,
    VISUALS,
    OBJECT_ENTRANCES,
    OBJECT_EXITS,
    SNAP_MODES,
    ALIGNS,
    TEXT_WEIGHTS,
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
    safeLink,
    validate,
    createHistory,
    portableHTML,
    selected,
    beats,
    initialState,
    goTo,
    transition,
  };
})();
