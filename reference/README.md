# Reference prototype (read only)

A visual reference made by the planner (Claude) so the worker can see the intended look. It is plain HTML, CSS and a little JavaScript.

- Do NOT serve it from the site, do NOT copy its files into `src/`, and do NOT edit it.
- To look at it: from the repo root run `npx serve reference/prototype -l 4000` and open http://localhost:4000 (it needs to be served from the root because links start with `/`).
- The real site is built in Next.js following `docs/design.md` and `docs/content.md`. Where they differ from the prototype, the docs win.
