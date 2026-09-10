/* Shared pure content and navigation rules. No DOM or network dependencies. */
(() => {
  "use strict";
  const THEMES = ["carbon", "paper", "wine"];
  const LIMITS = {
    title: 40,
    subtitle: 100,
    name: 40,
    task: 110,
    answer: 180,
    label: 18,
    detail: 120,
    artifact: 40,
    examples: 20,
    steps: 6,
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const safeJSON = (value) =>
    JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  function validate(raw) {
    const fail = () => {
      throw new Error(
        "קובץ התוכן אינו מתאים. יש לבחור קובץ JSON שיוצא מההרצאה, בגרסה 1.",
      );
    };
    const obj = (v) => v && typeof v === "object" && !Array.isArray(v);
    const str = (v, max) => {
      if (typeof v !== "string" || !v.trim() || v.length > max) fail();
      return v;
    };
    if (!obj(raw) || raw.version !== 1 || !THEMES.includes(raw.theme)) fail();
    if (
      !obj(raw.intro) ||
      !obj(raw.experiment) ||
      !Array.isArray(raw.examples) ||
      !raw.examples.length ||
      raw.examples.length > LIMITS.examples
    )
      fail();
    const result = {
      version: 1,
      documentId: str(raw.documentId, 100),
      theme: raw.theme,
      selectedExampleId: str(raw.selectedExampleId, 100),
      intro: {
        title: str(raw.intro.title, 40),
        accent: str(raw.intro.accent, 40),
        subtitle: str(raw.intro.subtitle, 100),
      },
      experiment: {
        title: str(raw.experiment.title, 40),
        subtitle: str(raw.experiment.subtitle, 100),
      },
      examples: raw.examples.map((e) => {
        if (
          !obj(e) ||
          !Array.isArray(e.steps) ||
          e.steps.length < 2 ||
          e.steps.length > LIMITS.steps
        )
          fail();
        return {
          id: str(e.id, 100),
          name: str(e.name, 40),
          task: str(e.task, 110),
          answer: str(e.answer, 180),
          steps: e.steps.map((s) => {
            if (!obj(s)) fail();
            return {
              label: str(s.label, 18),
              detail: str(s.detail, 120),
              artifact: str(s.artifact, 40),
            };
          }),
        };
      }),
    };
    const ids = result.examples.map((e) => e.id);
    if (
      new Set(ids).size !== ids.length ||
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
  const selected = (doc) =>
    doc.examples.find((e) => e.id === doc.selectedExampleId);
  const initialState = () => ({ slide: 0, mode: "chat", step: -1 });
  function transition(state, action, count) {
    const s = { ...state };
    if (action === "next") {
      if (s.slide === 0) return { slide: 1, mode: "chat", step: -1 };
      if (s.mode === "chat") return { slide: 1, mode: "agent", step: 0 };
      s.step = Math.min(count - 1, s.step + 1);
    } else if (action === "prev") {
      if (s.slide === 1 && s.mode === "agent" && s.step > 0) s.step--;
      else if (s.slide === 1 && s.mode === "agent") {
        s.mode = "chat";
        s.step = -1;
      } else return initialState();
    } else if (action === "chat" || action === "agent") {
      s.mode = action;
      s.step = action === "agent" ? 0 : -1;
    } else if (action === "reset") {
      s.mode = "chat";
      s.step = -1;
    }
    return s;
  }
  globalThis.LectureCore = {
    THEMES,
    LIMITS,
    clone,
    safeJSON,
    validate,
    portableHTML,
    selected,
    initialState,
    transition,
  };
})();
