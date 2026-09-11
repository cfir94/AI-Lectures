# Project working agreement

## Product

This is a Hebrew RTL, presenter-controlled interactive lecture, not a marketing website. It is the deck the user actually presents from. Use sparse text, large visuals and a calm cinematic aesthetic. The slide skeleton stays fixed across audiences; only the examples change. Audience examples must be editable independently of layout.

Live demos happen in the real tools during the talk, not in this app. A slide carries the single idea worth projecting; the script, the prompts and the detail are presenter notes.

The visual reference is Google's I/O 2026 recap at 3:30–3:35 and 4:57–5:10: a single dominant word, phrase or number; large empty areas; restrained perimeter light; sequential replacement of ideas. Do not restore dashboard cards, persistent branding, step tracks, or multiple simultaneous explanations. Show only the current action and its short result. Detailed explanations are presenter notes in the editor.

Connected nodes are wanted, and the presenter asked for them by name: the `neural` backdrop is a constellation of points and thin links, drifting behind the words. It is atmosphere, never a diagram — it keeps the middle of the frame empty, takes its colour from the slide's accent alone, and if it ever starts explaining something it has stopped doing its job.

## The look this deck is held to

The presenter asked for this in their own words, and it governs every slide you build or touch: **minimal, futuristic, beautiful, hi-tech** — the feel of a good product keynote, not a corporate deck. Treat it as a requirement, the same as any rule in Architecture below. Concretely:

- **One idea per slide, enormous.** A headline, a number or a single word owns the frame; everything else is small, quiet and secondary. Empty space is the design, not a gap waiting to be filled. If a slide needs a second explanation, it is two slides or a presenter note.
- **Motion is chosen, never sprinkled.** Every slide picks a `transition` for how it arrives and a `motion` for how its content enters, and the choice should mean something: `cut` for a hard turn in the argument, `fade` for a continuation, `push` for a sequence, `zoom` for an arrival. Beats reveal an argument in the order it is made. Slow and confident beats fast and busy; if an effect draws attention to itself rather than to the sentence, it is wrong.
- **Emphasis follows the content.** The dominant word on a slide is the one the sentence turns on — that is what `accent`, the `spectrum` text look and the biggest size are for. Never emphasise everything: on a slide where three things shout, nothing is heard.
- **Reach for the platform on purpose.** The tables are there to be used, and an option is chosen because it carries the idea, not because it is pretty: the `orb` for the model itself; `bars` for weights, probabilities or attention; `window` for a tool without a screenshot of one; the `tokens` slide for how language is broken up; `number` for a statistic that must stay in the head; `split` for a comparison; `stars`, `mesh` or `aurora` when a slide should feel like space rather than a page; `plain` when the words need silence around them. A slide left on defaults when a chosen element would have carried the idea is an unfinished slide.
- **Real material beats drawings of it.** Screenshots of the actual tools, the tools' own logos, and the presenter's own video files are what make this deck feel current: pictures ride inside the document as raster data URIs, and videos live beside it under `videos/`. Prefer a real frame of the real product over an illustration of one. Keep logos small, cropped clean, and on a background that lets them breathe. A mark on a demo slide is a class signal, not branding: it sits in one fixed berth above the eyebrow on every demo slide, it means *we are about to leave for the tool itself*, and it appears nowhere else. Brand moments — a slide where the tool is the subject — are separate and stay rare.
- **Restraint is the style.** Futuristic here means depth, light and space — not neon, not gradients on everything, not five colours on one slide. Pick one accent moment per slide and let the theme carry the rest.
- **The deck runs on one closed gamut: white, black, purple, blue/cyan.** Nothing warm, nothing green, no second grey. The presenter set this himself and pointed at the slide that proves it — a headline in a cyan-to-purple ramp on white. `PALETTE_STYLES` is now the whole of it: six palettes, no more, every spectrum cut from the same ramp `pearl` carries. Each keeps one role for the entire talk — `pearl` is the light stage, `prism` the same ramp on ink, `ice` the charcoal house, `cobalt` the deeper ground once the talk is about doing, `violet` the far end of the ramp and exactly one slide (the human moment), and `steel` black and white with the colour drained out, which is how this deck says something broke. A palette that appears once by accident reads as a mistake; a palette that appears once **on purpose**, in the same role every time, reads as a decision. **A tool mark on a light slide must be the black variant** — `assets/tool-marks.json` carries both, a white mark on `pearl` is an invisible mark, and a test now fails if one gets there. The same discipline governs the other tables: most slides are `plain`, `rise` and `fade`, and every departure — a backdrop, a `cut`, a `push`, a `spectrum` headline — has to be able to say what it means. Variety spread evenly is not design, it is noise; before adding a look, count how many the deck already uses and what each one is for. Do not widen the gamut back: an option that gets retired goes into `RETIRED_PALETTES`/`RETIRED_THEMES` so old documents still open, not back into the picker.

When nothing in the tables fits the idea, add an option as a table row plus a CSS block (see Architecture) rather than bending a slide into something it is not.

## Architecture

- Edit `src` and the build scripts, then regenerate `dist/index.html`; do not hand-edit generated output.
- Keep the standalone HTML fully self-contained and working on `file://`. No network assets, CDN fonts, remote imports, server-only features or required service workers.
- A video slide is the one deliberate exception, and it is scoped: opening the deck must still touch no network at all. The presenter's own file is the primary path — a relative path under the deck, validated as such, never an absolute one and never climbing out with `..` — and the file lives beside the deck, never inside the document or the repository. A YouTube or Drive link is allowed too, and then only an ID matched against the known-source table reaches the embed, never a pasted URL. Either way the video is created only when the presenter presses play, and the slide must stand on its own poster — stored in the document — when the file or the network is missing.
- Keep document validation and navigation in `src/core.js`. Keep content in the versioned document schema and presentation styles in CSS theme tokens.
- Declare a slide type once in `SLIDE_TYPES`: its fields, length limits, list and beat count. Validation, the editor and the presenter keys all read that table — do not special-case a type in the editor.
- `THEMES`, `MOTIONS`, `BACKDROPS` and `TRANSITIONS` work the same way: a key CSS hooks onto and a Hebrew name the editor shows. Add an option as a table row plus a CSS block, never as a branch in the render path.
- The free-object layer covers the whole stage. It must never take pointer events itself — only the objects inside it — or one object is enough to make every structured string on that slide unclickable.
- Free composition is an additive `objects` layer on every slide, plus the blank `canvas` slide type. Keep the structured slide scenes intact; presenters use a canvas slide when every element needs free placement. Declare object, shape, visual and text-style choices in `OBJECT_TYPES`, `SHAPES`, `VISUALS` and `TEXT_STYLES`.
- Object geometry is stored as strings in stage percentages (`x`, `y`, `width`, `height`) so it scales with the 16:9 canvas. Keep direct manipulation and numeric editor fields in sync, preserve layer order, and validate every imported coordinate, colour and object ID before rendering.
- Keep the 5% grid and object-edge/centre snapping in stage coordinates. `snap`, `entrance` and `exit` are per-object choices. Structured text converted to a free box uses one validated `bind`; keep its source field and object text synchronized and never render both copies.
- Do not rebuild the selected free object on the first pointer-down: doing so destroys the browser's native double-click sequence. Inline text editing must end on outside pointer/focus, Escape and Ctrl+Enter. Toolbar interactions must remain usable while the editable text owns focus.
- Nothing on the pointer-down path may cancel the browser's own click sequence. `preventDefault()` on `pointerdown` suppresses the compatibility mouse events, and capturing the pointer redirects the click to the capturing element — either one silently costs the `dblclick` on a free object. Take the capture on the first real movement instead, and hold selection off the object until the pointer has actually travelled.
- Finishing an inline edit must not rebuild the stage while a second click may still be coming. Clean the node up in place, then defer the rebuild through a cancellable refresh that any new press pushes further out.
- Never rebuild a control that is being held: a colour picker or a stepper replaced mid-gesture ends the gesture. A button that changes what its own toolbar says blurs itself first.
- Every content change goes through `save`, which is also what records undo. A change made in a burst — a typed sentence, a dragged slider — passes a token so the burst is one step; the token carries an edit-session counter, so returning to the same field later is a step of its own.
- Preview object presets in isolation while the editor is open. During real navigation, derive outgoing retention and incoming delay from the longest slide/object exit; never leave an opaque outgoing slide over the next entrance with a fixed timeout.
- A slide carries `visibility`, and `hidden` means skipped, never gone: navigation walks past it in both directions, it has no dot and is not counted in the position, and it stays fully present and reachable in the editor, marked. Never let a skipped slide reach an audience, and never let one disappear from the person editing it.
- `transition` is chosen per destination slide. Keep the document-level value only as an import fallback for older version-2 files; do not restore a global transition control.
- Keep every object fully inside the stage, keep object IDs unique across the entire document, and preserve the mobile stage-editing mode that collapses the inspector while direct manipulation is active.
- A slide leaving the stage must lose the class that brought it in. `.slide.entering` and `.slide.leaving` carry equally specific animation rules, so an element holding both replays its entrance instead of exiting — the outgoing slide slides back in from the side and only then disappears. Set `--dir` on the outgoing slide too: it is the direction of the move happening now, not the one that delivered it.
- `render` restores focus by `data-action` after rebuilding the stage, so blur a control *before* rendering, never after.
- Never rebuild the stage from inside a `blur` or `focusout` handler — replacing a node the browser is still unwinding throws `NotFoundError`. Defer the render with `requestAnimationFrame`.
- A text object bound to a slide field is the same string as that field, so it inherits the field's shorter limit. Ask `textLimit` rather than assuming `OBJECT_TEXT_MAX`.
- A panel that covers the stage must be draggable by a grip and must not eat half the slide; a control that only exists inside another mode is a control the presenter can lose.
- Edit mode is an explicit state with a visible control, never a side effect of some panel being open. Anything that only works "while a dialog happens to be open" is a trap: the presenter gets no feedback and reports the feature as broken.
- Every string that reaches the stage carries `data-slide-text` (or `data-example-text`) with the path that owns it, so it can be edited where it sits. Editing must never move or resize the words the presenter aimed at; converting text into a free object is a separate, explicit action.
- `save` distinguishes invalid content from unavailable storage. Never collapse them: telling a presenter that storage failed when the document is invalid hides the defect and eats their work.
- Keep the two motion layers separate: slide entrance runs on `.scene > *` and is driven by the motion class, which is stripped when only the beat changed; per-beat animation belongs on inner elements. Ambient backdrop loops must survive a restart unnoticed, because a re-render recreates them.
- Avoid adding dependencies for capabilities already supported by the browser. There are currently no runtime or build dependencies.
- Preparation tools live in `tools/` and are never part of `npm run build`. `tools/rasterize-logos.mjs` turns a folder of logos into `assets/tool-marks.json` — transparent WebP at one height, which is what gets embedded. Anything a later session will need must land in the repository: a file left in a session's working directory is gone when that session is.
- Use real buttons, labels and dialogs. Preserve RTL key mappings, keyboard focus and reduced-motion behavior.
- Preserve content-length limits and the 2–6 steps / 20 examples limits unless explicitly changed. Never silently truncate imported content.
- A link is `https://` or it does not exist: never `javascript:`, `data:`, `file:` or a bare host, on a slide field or on an object. Open it in a new tab with `rel="noopener noreferrer"` so the deck survives behind it, and keep an object's link inert while editing — the click there belongs to the editor, and the object shows a badge instead.
- Pictures, including free image objects, live inside the document as raster data URIs so the standalone file stays standalone. Shrink on upload, accept only `data:image/(png|jpeg|webp|gif);base64,`, and never accept SVG — it can carry script.
- Enforce the aggregate portable-document budget on import, image upload, duplication and export. Check Base64 structure and raster signatures in core, then decode every imported picture in the browser before replacing the active document.
- Slides must stay opaque and occlude each other; a transparent slide makes any crossfade show two headlines at once.
- Escape untrusted text and embedded JSON. Validate the entire imported document before replacing the active one. Never put secrets into a downloadable HTML file.
- Local storage is a convenience, not portable storage; preserve JSON and HTML export and a clear storage-failure message.
- A copy saved in the browser wins over the embedded document on startup, because it is the presenter's own work. That also means a published change is invisible to anyone who has ever opened the deck, so the document carries a `revision` stamped by the build from the content's own hash: when it differs from the stored copy's, the stored copy still loads and the presenter is told and offered the new one. Never resolve this by overwriting their copy, and never let a publication go unmentioned — both leave a presenter rehearsing a talk that is not the one at the link. Saved drafts live in the same convenience: name them, let each one be downloaded as JSON and as a standalone HTML file, and say plainly that the browser is not a backup.
- A `download` filename must be ASCII. Chromium drops a non-ASCII one on a `file://` page and saves the file as `download`, with no extension — which is how a presenter loses an export without being told.

## Verifying in a browser

A passing test suite says nothing about the stage. Build first, then open `dist/index.html`; `src/` on its own renders nothing.

Three things cost time if you do not know them:

- Presenter controls hide when idle. Move the pointer before clicking the toolbar, the navigation dots or an in-slide control, or the click lands on the scene behind them.
- While focus sits on a button, space activates that button instead of advancing the deck. The navigation dots hand focus back deliberately for this reason; do not reintroduce the trap elsewhere.
- Entrance and transition animations run for roughly a second. Screenshot after they settle, unless the moving frame is exactly what you are checking.

Cover every slide type, both directions of keyboard navigation, the editor, an export and a narrow viewport. Watch the console: an error thrown there is a real bug even when the page still looks correct.

## Checks and documentation

- Run `npm run build` followed by `npm test` after source changes.
- For meaningful interaction/layout changes, check every slide type, keyboard navigation in both directions, editor behavior and small-screen layout in a browser when authorized.
- Recheck HTML export after changing startup, content serialization or the document shell.
- Update README for usage changes and PROJECT for architecture or scope decisions. Keep documentation concise and factual; distinguish verified results from pending checks.
- Keep `dist/index.html` tracked so the user can open the checked-out project without installing anything.
- Do not commit credentials, test downloads, temporary archives or browser-specific personal state.
- Preserve the Sites project ID in `.openai/hosting.json`; do not register a second Site. Use the Sites skills for publication, keeping owner-only access unless a different audience is requested.
- GitHub publication and Sites publication are separate. Do not assume a GitHub destination or overwrite an existing remote.
- `.github/workflows/pages.yml` builds and publishes `dist` to GitHub Pages on every push to `main`. Keep the build and test steps in it; it is the live copy the user presents from.
