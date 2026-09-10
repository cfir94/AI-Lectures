# Project working agreement

## Product

This is a Hebrew RTL, presenter-controlled interactive lecture, not a marketing website. Keep the current scope at two demo slides unless the user expands it. Use sparse text, large visuals and a calm cinematic aesthetic. Audience examples must be editable independently of layout.

The visual reference is Google's I/O 2026 recap at 3:30–3:35 and 4:57–5:10: a single dominant word, phrase or number; large empty areas; restrained perimeter light; sequential replacement of ideas. Do not restore dashboard cards, node networks, persistent branding, step tracks, or multiple simultaneous explanations. Show only the current action and its short result. Detailed explanations are presenter notes in the editor.

## Architecture

- Edit `src` and the build scripts, then regenerate `dist/index.html`; do not hand-edit generated output.
- Keep the standalone HTML fully self-contained and working on `file://`. No network assets, CDN fonts, remote imports, server-only features or required service workers.
- Keep document validation and navigation in `src/core.js`. Keep content in the versioned document schema and presentation styles in CSS theme tokens.
- Avoid adding dependencies for capabilities already supported by the browser. There are currently no runtime or build dependencies.
- Use real buttons, labels and dialogs. Preserve RTL key mappings, keyboard focus and reduced-motion behavior.
- Preserve content-length limits and the 2–6 steps / 20 examples limits unless explicitly changed. Never silently truncate imported content.
- Escape untrusted text and embedded JSON. Validate the entire imported document before replacing the active one. Never put secrets into a downloadable HTML file.
- Local storage is a convenience, not portable storage; preserve JSON and HTML export and a clear storage-failure message.

## Checks and documentation

- Run `npm run build` followed by `npm test` after source changes.
- For meaningful interaction/layout changes, check both slides, keyboard navigation, editor behavior and small-screen layout in a browser when authorized.
- Recheck HTML export after changing startup, content serialization or the document shell.
- Update README for usage changes and PROJECT for architecture or scope decisions. Keep documentation concise and factual; distinguish verified results from pending checks.
- Keep `dist/index.html` tracked so the user can open the checked-out project without installing anything.
- Do not commit credentials, test downloads, temporary archives or browser-specific personal state.
- Preserve the Sites project ID in `.openai/hosting.json`; do not register a second Site. Use the Sites skills for publication, keeping owner-only access unless a different audience is requested.
- GitHub publication and Sites publication are separate. Do not assume a GitHub destination or overwrite an existing remote.
