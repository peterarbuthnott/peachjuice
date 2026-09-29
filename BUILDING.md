# Build and content pages

Run `npm install` once to install the development-only minifiers. `npm test` runs the game function, guide-link, sitemap, and ad-spacing checks. `npm run build` runs the same tests first and only then creates adjacent `.min.js`, `.min.css`, and `.min.html` sidecars under `dullas/current`, `nominate`, `standup`, and `drying`. The readable originals remain in place and are the files to edit. After a successful build, the four static servers prefer matching minified sidecars and fall back to readable originals when a sidecar is absent. Generated sidecars are reproducible and may be removed and rebuilt at any time.

Each game has four static HTML guide pages (`about.html`, `hints.html`, `highscores-info.html`, and `ideas.html`) linked from the game's entry page. The root sitemap is served by the Dullas site process and listed in `robots.txt`.
