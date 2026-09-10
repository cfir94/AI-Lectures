# Project working agreement

## Product

This is a Hebrew RTL, presenter-controlled interactive lecture, not a marketing website. It is the deck the user actually presents from. Use sparse text, large visuals and a calm cinematic aesthetic. The slide skeleton stays fixed across audiences; only the examples change. Audience examples must be editable independently of layout.

Live demos happen in the real tools during the talk, not in this app. A slide carries the single idea worth projecting; the script, the prompts and the detail are presenter notes.

The visual reference is Google's I/O 2026 recap at 3:30–3:35 and 4:57–5:10: a single dominant word, phrase or number; large empty areas; restrained perimeter light; sequential replacement of ideas. Do not restore dashboard cards, node networks, persistent branding, step tracks, or multiple simultaneous explanations. Show only the current action and its short result. Detailed explanations are presenter notes in the editor.

## Architecture

- Edit `src` and the build scripts, then regenerate `dist/index.html`; do not hand-edit generated output.
- Keep the standalone HTML fully self-contained and working on `file://`. No network assets, CDN fonts, remote imports, server-only features or required service workers.
- Keep document validation and navigation in `src/core.js`. Keep content in the versioned document schema and presentation styles in CSS theme tokens.
- Declare a slide type once in `SLIDE_TYPES`: its fields, length limits, list and beat count. Validation, the editor and the presenter keys all read that table — do not special-case a type in the editor.
- `MOTIONS`, `BACKDROPS` and `TRANSITIONS` work the same way: a key CSS hooks onto and a Hebrew name the editor shows. Add an option as a table row plus a CSS block, never as a branch in the render path.
- Keep the two motion layers separate: slide entrance runs on `.scene > *` and is driven by the motion class, which is stripped when only the beat changed; per-beat animation belongs on inner elements. Ambient backdrop loops must survive a restart unnoticed, because a re-render recreates them.
- Avoid adding dependencies for capabilities already supported by the browser. There are currently no runtime or build dependencies.
- Use real buttons, labels and dialogs. Preserve RTL key mappings, keyboard focus and reduced-motion behavior.
- Preserve content-length limits and the 2–6 steps / 20 examples limits unless explicitly changed. Never silently truncate imported content.
- Pictures live inside the document as raster data URIs so the standalone file stays standalone. Shrink on upload, accept only `data:image/(png|jpeg|webp|gif);base64,`, and never accept SVG — it can carry script.
- Slides must stay opaque and occlude each other; a transparent slide makes any crossfade show two headlines at once.
- Escape untrusted text and embedded JSON. Validate the entire imported document before replacing the active one. Never put secrets into a downloadable HTML file.
- Local storage is a convenience, not portable storage; preserve JSON and HTML export and a clear storage-failure message.

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
