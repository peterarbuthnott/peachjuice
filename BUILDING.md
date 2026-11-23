# Build and content pages

Run `npm install` once to install the development-only minifiers. `npm test` runs the game function, guide-link, sitemap, and ad-spacing checks. `npm run build` runs those checks and then creates adjacent `.min.js`, `.min.css`, and `.min.html` sidecars. `npm run build:assets` creates the same sidecars without running tests. The build script uses `dullas/current` when that folder exists; otherwise it uses the local `dullas/` folder. It also processes `nominate/`, `standup/`, and `drying/`, while skipping archived versions, data, certificates, and dependencies. The readable originals remain the files to edit. Each service prefers a matching minified sidecar when one exists and falls back to the readable original when it does not. Always regenerate and deploy the matching sidecar with an edited page if a sidecar is present on the server, or the server may continue serving its older copy.

Each game has four static HTML guide pages (`about.html`, `hints.html`, `highscores-info.html`, and `ideas.html`) linked from the game's entry page. The root sitemap is served by the Dullas site process and listed in `robots.txt`.

## Production folder and URL mapping

The deployed service root is `/home/pi2/andisdad/`. The local PeachJuice checkout is not a one-to-one copy of that directory; deploy only the Andisdad files and preserve live data and certificates.

| Public URL | Local source in this checkout | File in deployed service |
| --- | --- | --- |
| `/` | `dullas/home.html` | `dullas/home.html` |
| `/about.html` | `about.html` | `about.html` at service root |
| `/dullas/<page>` | `dullas/<page>` | `dullas/<page>` |
| `/nominate/<page>` | `nominate/public/<page>` | Served by `nominate/server.js` from `nominate/public/` |
| `/standup/<page>` | `standup/public/<page>` | Served by `standup/server.js` from `standup/public/` |
| `/drying/<page>` | `drying/public/<page>` | Served by `drying/server.js` from `drying/public/` |
| `/history/<page>` | `history/public/<page>` | Served by `history/server.js` from `history/public/`, mounted by Dullas |

The Dullas entry card must use explicit `/dullas/...` links for its game, guide pages, and highscores. `/about.html` is the service-level About page, so it must not be used as the Dullas game guide. The Dullas guide is `/dullas/about.html`.

For example, Nominate's ideas page is edited at `nominate/public/ideas.html` and appears at `/nominate/ideas.html`. After editing, run `npm run build:assets` and deploy both the readable file and any generated `.min.html` sidecar to the matching deployed location. The server prefers `.min.html` when it exists.

The Dullas process serves the service-level About page from the checkout's root `about.html`. Deploy that file to `/home/pi2/andisdad/about.html`; the Dullas game guide remains in `/home/pi2/andisdad/dullas/about.html`. Keep deployed `data/` and `certs/` contents intact when copying files.
