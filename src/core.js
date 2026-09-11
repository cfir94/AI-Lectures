/* Shared pure content and navigation rules. No DOM or network dependencies. */
(() => {
  "use strict";
  // key -> what the editor shows, plus the two swatch colours for its preview.
  /* Four themes, cut from the same closed gamut as the slide palettes: white,
     black, purple and blue/cyan. Warm and green were removed on purpose — a
     theme nobody would choose is not an option, it is a way to make the deck
     look like a different deck by accident. */
  const THEMES = {
    carbon: { name: "פחם ותכלת", hint: "עמוק · טכנולוגי", swatch: ["#0e1226", "#ac94df"] },
    paper: { name: "לבן וכחול", hint: "בהיר · מדויק", swatch: ["#fafbfd", "#4f5ea8"] },
    ink: { name: "שחור ולבן", hint: "מינימלי · חד", swatch: ["#0a0b0d", "#ffffff"] },
    nebula: { name: "סגול", hint: "לילי · רחוק", swatch: ["#140e26", "#b79ee6"] },
  };
  const LIMITS = {
    drafts: 25,
    draftName: 60,
    slides: 64,
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
  /* `retired` is a map from an option that no longer exists to the one that
     took over its role, so a document saved before a table was narrowed still
     opens instead of failing whole. */
  const choice = (options, retired) => ({ choice: options, retired });
  const picture = () => ({ picture: true, max: LIMITS.image });
  /* A number the presenter drags rather than picks from a list. `fallback` is
     what a document that predates the field gets, so adding one never changes
     a slide that was authored before it existed. */
  const percent = (fallback, min, max) => ({ percent: true, fallback, min, max });
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
    dissolve: "המסה רכה",
    rise: "עלייה",
    blur: "התבהרות",
    zoom: "התקרבות",
    recede: "התרחקות",
    push: "החלקה",
    wipe: "חשיפה",
    reveal: "חשיפה כלפי מעלה",
    cascade: "מילה אחרי מילה",
    settle: "נחיתה רכה",
    unfold: "פרישה",
    glide: "גלישה מהצד",
    pop: "קפיצה רכה",
    gather: "תנועה משמאל למרכז",
    curtain: "וילון · פתיחה משמאל לימין",
  };
  const OBJECT_EXITS = {
    none: "בלי יציאה",
    fade: "היעלמות",
    dissolve: "המסה רכה",
    fall: "ירידה",
    rise: "עלייה",
    blur: "טשטוש",
    shrink: "התרחקות",
    zoom: "זום פנימה",
    recede: "זום החוצה",
    push: "החלקה",
    wipe: "סגירה",
    reveal: "סגירה כלפי מטה",
    settle: "שקיעה רכה",
    unfold: "קיפול",
    glide: "גלישה החוצה",
    cascade: "מילה אחרי מילה",
    curtain: "וילון · סגירה מימין לשמאל",
  };
  /* A video that starts by itself has to be silent — every browser refuses an
     unmuted autoplay — so this is for an animation standing in for a still,
     not for a clip with a voice in it. */
  const VIDEO_AUTOPLAY = {
    manual: "מתנגן בלחיצה",
    once: "מתנגן פעם אחת, בלי קול, בכניסה לשקף",
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
    reveal: "חשיפה כלפי מעלה",
    cascade: "מילה אחרי מילה",
    zoom: "התקרבות",
    settle: "נחיתה רכה",
    unfold: "פרישה",
    glide: "גלישה מהצד",
    still: "בלי תנועה",
  };
  /* A slide motion is also the default entrance for any freely positioned
     objects on that slide. This keeps "content entrance" truthful after text
     has been converted to a movable box: the presenter still sees the choice
     affect the whole slide, and may then fine-tune one object independently. */
  const OBJECT_MOTION_EQUIVALENTS = {
    rise: "rise",
    blur: "blur",
    wipe: "wipe",
    reveal: "reveal",
    cascade: "cascade",
    zoom: "zoom",
    settle: "settle",
    unfold: "unfold",
    glide: "glide",
    still: "none",
  };
  const BACKDROPS = {
    /* The arc family. `arcs` is the quiet original the presenter picked out —
       two hairline curves that arrive once and then hold still. The three
       below are the same language turned up: they keep moving, and they carry
       the ramp's purple as well as the slide's accent. */
    arcs: "קשתות אור",
    orbit: "קשתות נעות",
    ribbons: "סרטי אור",
    comet: "אור נודד",
    corner: "קשתות בפינה",
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
  /* How a slide arrives. The moving ones animate the slide's *contents*, never
     the slide box — a box that starts off-centre leaves a strip of stage
     uncovered, and the outgoing slide drifts across it in full view. */
  /* How long a slide's own animations run. `natural` is first, so a document
     that predates this field gets it and nothing about that document changes.
     The number multiplies every duration on the slide — its transition, and
     the entrance and exit of every free object on it — so one choice moves the
     whole slide's pace instead of a dozen separate timings. */
  const PACES = {
    natural: "קצב רגיל",
    brisk: "מהיר",
    calm: "רגוע",
    slow: "איטי מאוד",
  };
  const PACE_RATE = { natural: 1, brisk: 0.6, calm: 1.45, slow: 2 };
  /* The base milliseconds each transition takes. The CSS reads these through
     `--arrive-base`; `app.js` reads them to decide when the outgoing slide can
     be removed. Two copies of this drifted apart the moment two transitions
     were added and the outgoing slide started vanishing on frame one, so there
     is one copy and both sides ask it. */
  const TRANSITION_MS = {
    cut: 0,
    fade: 360,
    dissolve: 860,
    push: 720,
    zoom: 700,
    recede: 700,
  };
  const OBJECT_MS = 720;
  const TRANSITIONS = {
    fade: "הצלבה",
    dissolve: "המסה רכה",
    push: "החלקה",
    zoom: "זום פנימה",
    recede: "זום החוצה",
    cut: "חיתוך",
  };
  /* A slide palette changes the whole light field, not just one highlighted
     word. Values remain a closed table so imported documents cannot inject
     arbitrary CSS into the stage. */
  /* "deck" is the absence of a palette: the slide takes the deck's theme rather
     than carrying colours of its own. It is first because it is the sane
     default — without it every slide pins itself, the theme controls nothing
     but the strip around the stage, and choosing one appears to do nothing. */
  /* The closed set. The presenter asked for one palette and named it: white,
     black, purple and blue/cyan — nothing warm, nothing green, nothing grey-
     green. Six entries, each with a role it keeps for the whole talk, and the
     cyan→blue→purple ramp `pearl` carries is the source every other spectrum
     is cut from. A seventh option would not be a richer deck, it would be a
     wider gamut, which is the thing that was wrong. */
  const PALETTES = {
    deck: "לפי ערכת המצגת",
    pearl: "לבן פנינה · תכלת וסגול",
    prism: "דיו · תכלת וסגול",
    ice: "פחם ותכלת",
    cobalt: "כחול עמוק",
    violet: "סגול",
    steel: "שחור ולבן",
  };
  /* Palettes and themes that existed before the gamut was closed. A presenter
     may have a saved copy or an exported file still carrying one, and a
     removed key would fail the whole document — so every retired name is
     translated to the option that took over its role instead. */
  const RETIRED_PALETTES = {
    rose: "violet",
    amber: "violet",
    danger: "steel",
    mint: "ice",
    sand: "pearl",
    paper: "pearl",
    mist: "pearl",
    midnight: "prism",
  };
  const RETIRED_THEMES = { wine: "nebula", forest: "carbon", ember: "carbon" };
  const PALETTE_STYLES = {
    /* THE RAMP. The presenter sampled it off his own reference slide, from the
       core of the letters rather than their anti-aliased edges:
         purple #7a59bc  ·  blue #4378ab
       Hebrew reads right to left, so the purple end is the 98% stop and the
       blue end is the 2% one. Both are muted on purpose — a saturated version
       of the same two hues was tried and read as neon, not as this deck.
       Six palettes, two hues. They cannot tell themselves apart by colour, so
       they do it by *value*: white, light ink, charcoal, navy, aubergine,
       black. That ladder is also what lets the talk step between light and
       dark without the jump landing like a slap. */
    pearl: {
      surface: "#fafbfd", raised: "#ffffff", soft: "#eff2f9", line: "#d3daea",
      text: "#141726", muted: "#5b6480", accent: "#4f5ea8", rgb: "79,94,168",
      spectrum: "linear-gradient(110deg,#4378ab 2%,#5e68b3 50%,#7a59bc 98%)",
      tone: "light",
    },
    /* A dark stage needs the ramp lifted or both hues go to mud against the
       surface. Same two colours, same order, raised in lightness only. */
    prism: {
      surface: "#292b49", raised: "#1c2244", soft: "#161b36", line: "#3a4372",
      gradient: "radial-gradient(ellipse at 12% 10%,#424c73 0%,transparent 65%),linear-gradient(125deg,#303e60 0%,#343152 55%,#483758 100%)",
      text: "#ffffff", muted: "#b3bde0", accent: "#ac94df", rgb: "172,148,223",
      spectrum: "linear-gradient(110deg,#7fb2d9 2%,#96a3dc 50%,#ac94df 98%)",
      tone: "dark",
    },
    /* The house. Charcoal that reads as black from the back of the room. It
       takes the blue end of the ramp; `prism` takes the purple end. */
    ice: {
      surface: "#0a0d12", raised: "#161b24", soft: "#0f141b", line: "#2b3442",
      text: "#f6fafe", muted: "#a4b1c2", accent: "#7fb2d9", rgb: "127,178,217",
      spectrum: "linear-gradient(110deg,#7fb2d9 2%,#96a3dc 50%,#ac94df 98%)",
      tone: "dark",
    },
    /* One step deeper into blue. This is where the talk stops explaining and
       starts doing. */
    cobalt: {
      surface: "#263650", raised: "#122046", soft: "#0b1430", line: "#24407c",
      gradient: "radial-gradient(ellipse at 10% 8%,#425879 0%,transparent 66%),linear-gradient(125deg,#2d4263 0%,#293956 55%,#373451 100%)",
      text: "#f3f7ff", muted: "#a3b6d9", accent: "#8fb0e0", rgb: "143,176,224",
      spectrum: "linear-gradient(110deg,#7fb2d9 2%,#96a3dc 50%,#ac94df 98%)",
      tone: "dark",
    },
    /* The purple end of the ramp, taken all the way into the surface. One
       slide in the talk is about a person rather than a tool, and this is the
       colour it gets — once, on purpose. */
    violet: {
      surface: "#39304e", raised: "#271c48", soft: "#1a1338", line: "#4a3a7a",
      gradient: "radial-gradient(ellipse at 90% 12%,#58446f 0%,transparent 65%),linear-gradient(125deg,#303c60 0%,#433654 60%,#493856 100%)",
      text: "#f9f6ff", muted: "#c0b3e0", accent: "#b79ee6", rgb: "183,158,230",
      spectrum: "linear-gradient(110deg,#ac94df 2%,#b79ee6 50%,#96a3dc 98%)",
      tone: "dark",
    },
    /* No hue at all: black and white and nothing else. It is what a slide looks
       like when the colour drains out of it — which is how this deck says
       something broke, instead of turning the wall red. */
    steel: {
      surface: "#0a0b0d", raised: "#17191c", soft: "#101215", line: "#343840",
      text: "#ffffff", muted: "#98a0a9", accent: "#ffffff", rgb: "255,255,255",
      spectrum: "linear-gradient(110deg,#ffffff 4%,#d2d8e0 52%,#9aa3af 96%)",
      tone: "dark",
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
    palette: choice(PALETTES, RETIRED_PALETTES),
    textStyle: choice(TEXT_STYLES),
    motion: choice(MOTIONS),
    backdrop: choice(BACKDROPS),
    backdropPicture: picture(),
    transition: choice(TRANSITIONS),
    pace: choice(PACES),
    /* 100 is the backdrop as designed. Below it the whole atmosphere fades;
       above it the arc family paints its own light stronger, because an
       atmosphere already at full opacity cannot be made more present by
       raising opacity — the arcs are faint by their own alpha, not by the
       layer's. */
    backdropStrength: percent("100", 0, 240),
  };

  /* Every slide type declares its fields once: validation, the editor and the
     beat count for the presenter's arrow keys all read this table. */
  const SLIDE_TYPES = {
    agent: {
      label: "סוכן בפעולה",
      hint: "המחשה מקומית בשליטת המרצה. מפעילים פעולה, רואים תוצאה ומתקדמים. בחירה ואישור דורשים לחיצה מפורשת. {בחירה} בתוצאה מציג את המועד שנבחר.",
      fields: { title: text(40), caption: text(120, false) },
      list: { key: "items", label: "פעולה", min: 2, max: 6,
        valid: item => item.kind !== "choose" || Boolean(item.first && item.second), fields: {
        word: text(30), caption: text(120, false), tool: text(24),
        kind: choice({run: "הפעלת כלי", choose: "בחירה בין אפשרויות", approve: "עצירה לאישור"}),
        action: text(30), result: text(120), first: text(30, false), second: text(30, false),
      } },
      beats: (slide) => slide.items.length,
    },
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
        imageLayout: choice({overlay: "טקסט על התמונה", editorial: "צילום וכותרת נפרדים"}),
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
        /* A side may carry a glyph of its own. It is optional because most
           comparisons are carried by the words alone — but where the two sides
           are two kinds of thing rather than two opinions, a mark says which is
           which before the sentence does. */
        fields: { heading: text(20), line: text(120, false), icon: picture() },
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
        autoplay: choice(VIDEO_AUTOPLAY),
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
    agent: { title: "תאמו פגישה", caption: "מטרה אחת. כלים. תוצאה.", items: [
      {word: "בודק זמינות.", caption: "קורא את היומן שהרשיתם לו לקרוא.", tool: "יומן", kind: "run", action: "בדיקת זמינות", result: "נמצא מועד פנוי.", first: "", second: ""},
      {word: "עוצר לאישור.", caption: "בודקים לפני שההזמנה יוצאת.", tool: "הזמנה", kind: "approve", action: "אישור ההזמנה", result: "ההזמנה אושרה בהמחשה.", first: "", second: ""},
    ] },
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
    image: { picture: "", fit: "cover", imageLayout: "overlay", title: "", caption: "", alt: "", link: "" },
    number: { value: "100", unit: "", title: "", caption: "" },
    split: {
      title: "",
      sides: [
        { heading: "צד אחד", line: "" },
        { heading: "צד שני", line: "" },
      ],
    },
    timer: { minutes: "10", title: "", caption: "" },
    video: { url: "", poster: "", autoplay: "manual", title: "", caption: "" },
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
      if (spec.percent) {
        if (v === undefined) return spec.fallback;
        return number(v, spec.min, spec.max);
      }
      if (spec.choice) {
        // An absent preset falls back to the default; a wrong one is a bad file.
        if (v === undefined) return Object.keys(spec.choice)[0];
        if (typeof v !== "string") fail();
        const current = spec.retired?.[v] ?? v;
        if (!Object.hasOwn(spec.choice, current)) fail();
        return current;
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
      typeof raw.theme !== "string" ||
      !Object.hasOwn(THEMES, RETIRED_THEMES[raw.theme] ?? raw.theme)
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
      theme: RETIRED_THEMES[raw.theme] ?? raw.theme,
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
            const value = group(item, fields);
            if (type.list.valid && !type.list.valid(value)) fail();
            return value;
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
    OBJECT_MOTION_EQUIVALENTS,
    BACKDROPS,
    TRANSITIONS,
    VIDEO_AUTOPLAY,
    PALETTES,
    PALETTE_STYLES,
    PACES,
    PACE_RATE,
    TRANSITION_MS,
    OBJECT_MS,
    RETIRED_PALETTES,
    RETIRED_THEMES,
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
