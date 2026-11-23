# Andisdad service notes

These instructions apply to work in this PeachJuice checkout. The checkout contains legacy PeachJuice files as well as the Andisdad service, so do not treat the whole workspace as the production document root.

## Production layout and routes

The deployed service root is `/home/pi2/andisdad/`. The running Dullas server is under `dullas/` and mounts the other game servers from sibling folders.

- `/` is served from `dullas/home.html`.
- `/about.html` is the service-level About page from the workspace-root `about.html`.
- `/dullas/<page>` serves the Dullas game files from `dullas/<page>`; its game guide is `dullas/about.html`.
- `/nominate/<page>` is served from `nominate/public/<page>`.
- `/standup/<page>` is served from `standup/public/<page>`.
- `/drying/<page>` is served from `drying/public/<page>`.
- `/history/<page>` is served from `history/public/<page>`.

Use explicit `/dullas/...` URLs for Dullas home, guide, and high-score links. Root `/about.html` belongs to the service, not the Dullas game. For the other games, edit the public page in that game's `public/` folder; for example, Nominate ideas are in `nominate/public/ideas.html`.

## Building and deployment

- Edit readable source files; do not hand-edit generated `.min.*` sidecars.
- When changing HTML, CSS, or JavaScript, use `npm run build:assets` to regenerate sidecars without running the test suite. `npm run build` also runs tests first.
- The servers prefer `.min.html`, `.min.css`, and `.min.js` when those files exist. Deploy a changed source file and its matching generated sidecar together, or remove the stale sidecar on the server.
- Copy history pages to `history/public/`.
- Copy the root `about.html` to the service root. Copy game pages to their matching folders, including `nominate/public/` for Nominate.
- Preserve deployed `data/` and `certs/` contents during deployment.
- Local edits are not live until the corresponding files are deployed to `/home/pi2/andisdad/`; report that distinction clearly.

See [BUILDING.md](BUILDING.md) for the full deployment mapping.
