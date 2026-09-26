# Nominate — Whist Scoring App

A mobile-first scoring card and tracker for Nomination Whist (18 rounds,
2–8 players). Plain HTML/CSS/JavaScript on the frontend, a plain Node
`http` server on the backend, JSON files for storage. **No `npm install`,
no build step, no React/Vite/Tailwind toolchain required.**

## Run it

You need Node.js installed — nothing else.

```bash
node server.js
```

Then open `http://localhost:5000`. That's it. `package.json` has no
dependencies at all; `npm start` is there purely as a convenience alias for
`node server.js` if you'd rather type that.

Set `PORT` in your environment to use a different port. See `.env.example`
for the variable name — it's read from the real process environment, not
auto-loaded from a `.env` file (no `dotenv` dependency, deliberately).

## Why this version exists

The very first cut of this app used React + Vite + TypeScript + Tailwind,
which needs `npm install` to pull down a full build toolchain before
anything runs. That install kept failing in this environment, so the
whole frontend was rewritten as plain JavaScript ES modules that the
browser runs directly — no bundler, no transpiler, no compile step:

```
public/
  index.html        the one HTML page — just a <div id="app"> and a <script type="module">
  style.css         hand-written CSS (replaces the Tailwind utility classes)
  icons.js          small inline-SVG icon set (replaces lucide-react)
  gameEngine.js      round/scoring rules — plain-JS port of the old gameEngine.ts
  api.js             fetch() wrappers to the JSON-file server below
  app.js             top-level controller: swaps between the four screens
  views/
    home.js          new game / resume / leaderboard tabs
    naming.js        player name entry
    scoring.js        the bidding/tricking round-by-round scoring screen
    results.js        final standings + share-to-clipboard
  types.md            shape reference (there's no TypeScript any more,
                      so this documents what used to be types.ts)
```

Every view keeps its own local state in a plain JS closure and rebuilds
its own markup on change — no virtual DOM, no framework, just
`container.innerHTML = ...` plus `addEventListener`. `app.js` owns the one
piece of state that matters across screens (the current game), the same
way `App.tsx` used to.

**Nothing about the backend changed** — `server.js` was already a
dependency-free Node `http` server reading/writing `data/*.json` (see
below), built to the same shape as the "dullas" and "standup" game
servers (exports `createHandler(basePath)` so it can run standalone or be
mounted inside another host process). That part never needed `npm
install` in the first place; only the old React frontend did.

## What's obsolete now

These files were part of the React/Vite build and are no longer read by
anything (`server.js` now serves straight from `public/`, not from a
built `dist/`). They're harmless to leave, but you can delete them:

- `src/` (the old .tsx components)
- `vite.config.ts`
- `tsconfig.json`
- `metadata.json` (an AI-Studio-specific file, unused either way)

I don't have a file-delete tool in this session, so I left them in place
rather than risk removing something by mistake — delete them yourself
whenever you like, e.g. in File Explorer.

## Data files

```
data/
  games.json            active + finished game sessions
  games-archive.json    overflow evicted once games.json passes MAX_GAMES
  players.json          saved player profiles / leaderboard
  players-archive.json  overflow evicted once players.json passes MAX_PLAYERS
```

Plain JSON — back them up, inspect them, or hand-edit them like any other
file. "Remove All App Data" in the app resets both; caps/archiving are
configured via `MAX_GAMES` / `MAX_PLAYERS` in `server.js`.
