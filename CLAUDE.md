# CLAUDE.md

This project keeps a single working agreement for every AI agent, in `AGENTS.md`. It is imported below so it loads automatically — read it before changing anything.

@AGENTS.md

## Orientation

- `TASKS.md` is the live worklist: what is still open, in the order it should be done. Read it before starting anything, tick an item only after it was measured in a browser, and move what you finish into `PROJECT.md`. If you are picking work up mid-round, that file is where you are.
- `PROJECT.md` is the decision log: what was chosen, why, and what was actually verified versus what is still pending. Add an entry when you change architecture or scope. Do not restate that history in code comments.
- `README.md` is written for the presenter standing in front of a room, not for contributors. Update it when the way the deck is used changes, and keep it in Hebrew.
- **The look is a requirement, not a preference.** `AGENTS.md` opens with the design brief the presenter set — minimal, futuristic, hi-tech, motion with meaning, emphasis that follows the content, real screenshots, logos and their own videos. Build content to it, and say so when a request would pull the deck away from it.
- `src/content.json` is the lecture itself — the user's own script and wording. Treat it as content, not code: rewording it is a content decision that belongs to the user, not a refactor you make in passing. Structure changes (a new field, a new slide) are fair game.
- The presenter works on Windows and presents from `dist/index.html` or from the published site. Do not add anything that assumes a shell, a build step or a network at presentation time.
