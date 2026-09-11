/* One-off preparation, deliberately not part of `npm run build`.

   The presenter edits in the browser, and that copy lives in his localStorage.
   The repository does not know about it, so the two diverge — and every publish
   then forces him to choose one and file the other away as a draft. The way
   back is his own "קובץ תוכן" export, which is byte-for-byte the shape of
   `src/content.json`. This reads it, says in plain words what changed, and
   applies it.

   It is a whole-document replace, not a merge. That is the point of printing
   the diff first: if it lists something neither of us expected, stop.

   usage: node tools/apply-export.mjs <lecture-content.json> [--write] */
import { readFileSync, writeFileSync } from "node:fs";
import "../src/core.js";

const [incoming, ...flags] = process.argv.slice(2);
if (!incoming) {
  console.error("usage: node tools/apply-export.mjs <lecture-content.json> [--write]");
  process.exit(1);
}
const write = flags.includes("--write");
const C = globalThis.LectureCore;

const mine = C.validate(JSON.parse(readFileSync("src/content.json", "utf8")));
let theirs;
try {
  theirs = C.validate(JSON.parse(readFileSync(incoming, "utf8")));
} catch {
  console.error(`${incoming} is not a valid lecture document. Nothing applied.`);
  process.exit(1);
}

const short = (v) => {
  if (typeof v !== "string") return JSON.stringify(v);
  if (v.startsWith("data:")) return `<picture, ${Math.round(v.length / 1024)} KB>`;
  return JSON.stringify(v.length > 48 ? `${v.slice(0, 48)}…` : v);
};
const label = (s) => s.title || s.sides?.[0]?.heading || s.items?.[0]?.word || s.type;

const lines = [];
for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
  if (key === "slides" || key === "revision") continue;
  if (JSON.stringify(mine[key]) !== JSON.stringify(theirs[key]))
    lines.push(`document · ${key}: ${short(mine[key])} → ${short(theirs[key])}`);
}

const byId = (deck) => new Map(deck.slides.map((s) => [s.id, s]));
const a = byId(mine);
const b = byId(theirs);
for (const [id, slide] of b)
  if (!a.has(id)) lines.push(`+ slide added: ${id} (${label(slide)})`);
for (const [id, slide] of a)
  if (!b.has(id)) lines.push(`- slide removed: ${id} (${label(slide)})`);

const order = (deck) => deck.slides.map((s) => s.id).join(",");
if (order(mine) !== order(theirs)) lines.push("slides reordered");

for (const [id, slide] of a) {
  const other = b.get(id);
  if (!other) continue;
  for (const key of new Set([...Object.keys(slide), ...Object.keys(other)])) {
    const was = JSON.stringify(slide[key]);
    const now = JSON.stringify(other[key]);
    if (was === now) continue;
    if (key === "objects") {
      /* Objects are a list of their own; naming which one moved is the whole
         value here, since "objects changed" says nothing a presenter can check. */
      const mineObjects = new Map((slide.objects ?? []).map((o) => [o.id, o]));
      const theirObjects = new Map((other.objects ?? []).map((o) => [o.id, o]));
      for (const [oid, o] of theirObjects)
        if (!mineObjects.has(oid)) lines.push(`  ${id} · object added: ${oid} (${o.type})`);
      for (const [oid, o] of mineObjects)
        if (!theirObjects.has(oid)) lines.push(`  ${id} · object removed: ${oid} (${o.type})`);
      for (const [oid, o] of mineObjects) {
        const p = theirObjects.get(oid);
        if (!p) continue;
        for (const k of new Set([...Object.keys(o), ...Object.keys(p)]))
          if (JSON.stringify(o[k]) !== JSON.stringify(p[k]))
            lines.push(`  ${id} · ${oid} · ${k}: ${short(o[k])} → ${short(p[k])}`);
      }
      continue;
    }
    lines.push(`  ${id} (${label(slide)}) · ${key}: ${short(slide[key])} → ${short(other[key])}`);
  }
}

if (!lines.length) {
  console.log("No difference. The export already matches src/content.json.");
  process.exit(0);
}
console.log(lines.join("\n"));
console.log(`\n${lines.length} change(s)`);
if (!write) {
  console.log("Nothing written. Re-run with --write to apply.");
  process.exit(0);
}
/* The build stamps `revision` from the content's own hash, so carrying the
   exported one in would only be a stale fingerprint. */
delete theirs.revision;
writeFileSync("src/content.json", JSON.stringify(theirs, null, 2) + "\n");
console.log("Applied to src/content.json. Run npm run build && npm test.");
