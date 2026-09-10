# CLAUDE.md

This project keeps a single working agreement for every AI agent, in `AGENTS.md`. It is imported below so it loads automatically — read it before changing anything.

@AGENTS.md

## Orientation

- `PROJECT.md` is the decision log: what was chosen, why, and what was actually verified versus what is still pending. Add an entry when you change architecture or scope. Do not restate that history in code comments.
- `README.md` is written for the presenter standing in front of a room, not for contributors. Update it when the way the deck is used changes, and keep it in Hebrew.
- `src/content.json` is the lecture itself — the user's own script and wording. Treat it as content, not code: rewording it is a content decision that belongs to the user, not a refactor you make in passing. Structure changes (a new field, a new slide) are fair game.
- The presenter works on Windows and presents from `dist/index.html` or from the published site. Do not add anything that assumes a shell, a build step or a network at presentation time.
