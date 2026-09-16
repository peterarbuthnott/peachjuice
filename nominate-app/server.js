/*
 * Nominate — Whist Scoring App server
 *
 * Plain Node/io.js HTTP server — no framework, no cloud database.
 * All game state and player stats are read from and written to
 * flat JSON files in ./data.
 *
 * Built to the same shape as the "dullas" and "standup" game servers:
 *
 *   - exports createHandler(basePath) so this file can run standalone
 *     (`node server.js` / `iojs server.js`) OR be mounted inside an
 *     existing host process under a different base path, e.g. on the
 *     Pi, inside dullas's own server.js:
 *
 *       var nominate = require('/home/pi/scanpi/nominate/server.js').createHandler('/nominate');
 *       // then, as the very first check inside the host's request listener:
 *       if (req.url === '/nominate' || req.url.indexOf('/nominate/') === 0) {
 *         return nominate(req, res);
 *       }
 *
 *   - persists to JSON files instead of a database
 *   - caps the games/players stores and archives overflow instead of
 *     deleting it, so old records can still be reviewed or pruned later
 *     (same idea as standup's highscores.json / lowscore.json split)
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var DATA_DIR = path.join(__dirname, 'data');
var PUBLIC_DIR = path.join(__dirname, 'public');

var GAMES_FILE = path.join(DATA_DIR, 'games.json');
var GAMES_ARCHIVE_FILE = path.join(DATA_DIR, 'games-archive.json');
var PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
var PLAYERS_ARCHIVE_FILE = path.join(DATA_DIR, 'players-archive.json');

var MAX_GAMES = 200;    // game session records kept in games.json before archiving
var MAX_PLAYERS = 500;  // player profiles kept in players.json before archiving

// ---------------------------------------------------------------------------
// tiny JSON-file helpers (best effort — mirrors the try/catch style the
// original client code used around localStorage)
// ---------------------------------------------------------------------------

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  [GAMES_FILE, GAMES_ARCHIVE_FILE, PLAYERS_FILE, PLAYERS_ARCHIVE_FILE].forEach(function (file) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '[]', 'utf8');
  });
}

function readJsonFile(file) {
  try {
    var raw = fs.readFileSync(file, 'utf8');
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read ' + file + ':', err.message);
    return [];
  }
}

function writeJsonFile(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to write ' + file + ':', err.message);
    return false;
  }
}

// Keep `list` at or below `max` entries, moving the oldest overflow
// (by the given date field) into the archive file rather than deleting it.
// `protectFn`, if given, marks entries that must never be archived
// (e.g. the game currently being saved).
function archiveOverflow(list, max, archiveFile, sortKey, protectFn) {
  if (list.length <= max) return list;

  var protected_ = [];
  var evictable = [];
  list.forEach(function (item) {
    if (protectFn && protectFn(item)) {
      protected_.push(item);
    } else {
      evictable.push(item);
    }
  });

  evictable.sort(function (a, b) {
    return new Date(a[sortKey] || 0).getTime() - new Date(b[sortKey] || 0).getTime();
  });

  var overflowCount = Math.max(0, list.length - max);
  var toArchive = evictable.slice(0, overflowCount);
  var toKeep = evictable.slice(overflowCount);

  if (toArchive.length > 0) {
    var archive = readJsonFile(archiveFile);
    writeJsonFile(archiveFile, archive.concat(toArchive));
  }

  return protected_.concat(toKeep);
}

// ---------------------------------------------------------------------------
// request body / response helpers
// ---------------------------------------------------------------------------

function readBody(req, cb) {
  var chunks = [];
  req.on('data', function (chunk) { chunks.push(chunk); });
  req.on('end', function () {
    var raw = Buffer.concat(chunks).toString('utf8');
    // Diagnostic logging: "Invalid JSON body" alone doesn't say whether
    // nothing arrived at all (0 bytes - points at something between the
    // browser and here dropping the body, proxy/CDN territory) or
    // whether bytes DID arrive but weren't valid JSON (points at
    // encoding/truncation - e.g. gzip'd or chunked oddly). Logging the
    // actual byte count and a short raw preview here means the next
    // failure shows up in this terminal with enough detail to tell which
    // case it is, instead of just a generic 400 in the browser console.
    console.error(
      'readBody: ' + req.method + ' ' + req.url + ' - received ' + chunks.length +
      ' chunk(s), ' + raw.length + ' byte(s). declared Content-Length: ' +
      (req.headers['content-length'] || '(none)') + ', Content-Type: ' +
      (req.headers['content-type'] || '(none)') + ', Transfer-Encoding: ' +
      (req.headers['transfer-encoding'] || '(none)') + ', Content-Encoding: ' +
      (req.headers['content-encoding'] || '(none)')
    );
    if (raw.length === 0) {
      console.error('readBody: body was completely empty.');
      return cb(null, null);
    }
    console.error('readBody: raw body preview (first 200 chars): ' + raw.slice(0, 200));

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.error('readBody: JSON.parse failed: ' + parseErr.message);
      return cb(parseErr, null);
    }

    // Body parsed fine - now hand off to the route handler, in its own
    // try/catch (kept separate from the JSON.parse one above so the two
    // failure modes never get conflated again, the way a bug inside a
    // handler once got misreported as "JSON.parse failed"). This still
    // acts as a safety net either way: there's no global
    // uncaughtException handler on this server, so letting a route
    // handler's synchronous bug throw uncaught would crash the entire
    // dullas process - not just fail this one request.
    try {
      cb(null, parsed);
    } catch (cbErr) {
      console.error('readBody: route handler threw after a successful parse: ' + cbErr.message);
    }
  });
  req.on('error', function (err) {
    console.error('readBody: request stream error: ' + err.message);
    cb(err, null);
  });
}

function sendJson(res, statusCode, payload) {
  var body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

var MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, function (err, data) {
    if (err) {
      sendError(res, 404, 'Not found');
      return;
    }
    var ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// API route handlers
// ---------------------------------------------------------------------------

function handleGetGames(req, res, query) {
  var limit = parseInt(query.limit, 10);
  if (!limit || limit < 1) limit = 10;

  var games = readJsonFile(GAMES_FILE);
  games.sort(function (a, b) {
    return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
  });

  sendJson(res, 200, games.slice(0, limit));
}

function handleGetGame(res, gameId) {
  var games = readJsonFile(GAMES_FILE);
  var game = games.filter(function (g) { return g.id === gameId; })[0];
  if (!game) return sendError(res, 404, 'Game not found');
  sendJson(res, 200, game);
}

function handleSaveGame(req, res, gameId) {
  readBody(req, function (err, body) {
    if (err || !body) return sendError(res, 400, 'Invalid JSON body');

    var games = readJsonFile(GAMES_FILE);
    // Object.assign isn't available on the old io.js engine this runs
    // under now that it's require()'d into dullas's process (rather than
    // its own standalone modern Node) - that call used to throw
    // "undefined is not a function", which readBody's try/catch above
    // then misreported as a JSON parse failure. Build the merged object
    // by hand instead, ES5-style, same as the rest of this file.
    var updated = {};
    for (var bodyKey in body) { if (Object.prototype.hasOwnProperty.call(body, bodyKey)) updated[bodyKey] = body[bodyKey]; }
    updated.id = gameId;
    updated.updatedAt = new Date().toISOString();
    var found = false;

    games = games.map(function (g) {
      if (g.id === gameId) { found = true; return updated; }
      return g;
    });
    if (!found) games.push(updated);

    // The game just written is never the one archived away, even if it's oldest.
    games = archiveOverflow(games, MAX_GAMES, GAMES_ARCHIVE_FILE, 'updatedAt', function (g) {
      return g.id === gameId;
    });

    // NOTE: writeJsonFile's result must be checked here. It used to be
    // fired-and-forgotten, which meant a disk write failure on the server
    // (permissions, full disk, read-only filesystem, etc.) still got a 200
    // OK sent back to the browser - the client believed the save worked
    // and moved on, while the game quietly never made it to games.json.
    // That silent failure is exactly what would make a completed round
    // vanish with no error shown anywhere, so any write failure is now
    // reported as a real 500 instead of a lie.
    if (!writeJsonFile(GAMES_FILE, games)) {
      return sendError(res, 500, 'Failed to write games.json on the server - see server console log');
    }
    sendJson(res, 200, updated);
  });
}

function handleDeleteGame(res, gameId) {
  var games = readJsonFile(GAMES_FILE);
  var next = games.filter(function (g) { return g.id !== gameId; });
  if (!writeJsonFile(GAMES_FILE, next)) {
    return sendError(res, 500, 'Failed to write games.json on the server - see server console log');
  }
  sendJson(res, 200, { deleted: gameId });
}

// Sorted leaderboard order: most wins first, then highest total score.
function sortedPlayers() {
  var players = readJsonFile(PLAYERS_FILE);
  players.sort(function (a, b) {
    return (b.gamesWon || 0) - (a.gamesWon || 0) || (b.totalScore || 0) - (a.totalScore || 0);
  });
  return players;
}

// Plain GET /api/players (no query params) keeps its original contract —
// the full array — so the in-app Home/Naming screens don't need to change.
// Pass ?offset=&limit= (as the standalone legends page does) to get the
// same paginated shape standup's highscores endpoint uses:
// { entries, total, offset, limit, hasMore }.
function handleGetPlayers(req, res, query) {
  var players = sortedPlayers();

  if (query.offset === undefined && query.limit === undefined) {
    return sendJson(res, 200, players);
  }

  var offset = parseInt(query.offset, 10);
  if (!offset || offset < 0) offset = 0;
  var limit = parseInt(query.limit, 10);
  if (!limit || limit < 1) limit = 20;

  var page = players.slice(offset, offset + limit);
  sendJson(res, 200, {
    entries: page,
    total: players.length,
    offset: offset,
    limit: limit,
    hasMore: offset + limit < players.length,
  });
}

function handleSavePlayer(req, res, playerId) {
  readBody(req, function (err, body) {
    if (err || !body) return sendError(res, 400, 'Invalid JSON body');

    var players = readJsonFile(PLAYERS_FILE);
    var found = false;
    players = players.map(function (p) {
      if (p.id === playerId) { found = true; return body; }
      return p;
    });
    if (!found) players.push(body);

    players = archiveOverflow(players, MAX_PLAYERS, PLAYERS_ARCHIVE_FILE, 'lastPlayed');
    if (!writeJsonFile(PLAYERS_FILE, players)) {
      return sendError(res, 500, 'Failed to write players.json on the server - see server console log');
    }
    sendJson(res, 200, body);
  });
}

function handleRecordResults(req, res) {
  readBody(req, function (err, body) {
    if (err || !Array.isArray(body)) return sendError(res, 400, 'Expected an array of player results');

    var players = readJsonFile(PLAYERS_FILE);
    var byId = {};
    players.forEach(function (p) { byId[p.id] = p; });

    body.forEach(function (entry) {
      var pId = (entry.name || '').trim().toLowerCase();
      if (!pId) return;
      var existing = byId[pId];
      if (existing) {
        existing.gamesPlayed = (existing.gamesPlayed || 0) + 1;
        existing.gamesWon = (existing.gamesWon || 0) + (entry.won ? 1 : 0);
        existing.totalScore = (existing.totalScore || 0) + (entry.score || 0);
        existing.totalBidsMade = (existing.totalBidsMade || 0) + (entry.bidsMade || 0);
        existing.lastPlayed = new Date().toISOString();
      } else {
        byId[pId] = {
          id: pId,
          name: entry.name,
          gamesPlayed: 1,
          gamesWon: entry.won ? 1 : 0,
          totalScore: entry.score || 0,
          totalBidsMade: entry.bidsMade || 0,
          lastPlayed: new Date().toISOString(),
        };
      }
    });

    var next = Object.keys(byId).map(function (id) { return byId[id]; });
    next = archiveOverflow(next, MAX_PLAYERS, PLAYERS_ARCHIVE_FILE, 'lastPlayed');
    if (!writeJsonFile(PLAYERS_FILE, next)) {
      return sendError(res, 500, 'Failed to write players.json on the server - see server console log');
    }
    sendJson(res, 200, { ok: true });
  });
}

function handleWipe(res) {
  var gamesOk = writeJsonFile(GAMES_FILE, []);
  var playersOk = writeJsonFile(PLAYERS_FILE, []);
  if (!gamesOk || !playersOk) {
    return sendError(res, 500, 'Failed to fully wipe data on the server - see server console log');
  }
  sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// createHandler(basePath) — the piece dullas/standup mount on
// ---------------------------------------------------------------------------

function createHandler(basePath) {
  ensureDataFiles();
  basePath = basePath || '';
  if (basePath.length > 1 && basePath.charAt(basePath.length - 1) === '/') {
    basePath = basePath.slice(0, -1);
  }

  return function requestHandler(req, res) {
    var parsed = url.parse(req.url, true);
    var pathname = parsed.pathname || '/';

    if (basePath && pathname.indexOf(basePath) === 0) {
      pathname = pathname.slice(basePath.length) || '/';
    }

    // ---- JSON API ---------------------------------------------------
    if (pathname === '/api/games' && req.method === 'GET') {
      return handleGetGames(req, res, parsed.query);
    }
    var gameMatch = pathname.match(/^\/api\/games\/([^\/]+)$/);
    if (gameMatch && req.method === 'GET') return handleGetGame(res, gameMatch[1]);
    if (gameMatch && (req.method === 'PUT' || req.method === 'POST')) return handleSaveGame(req, res, gameMatch[1]);
    if (gameMatch && req.method === 'DELETE') return handleDeleteGame(res, gameMatch[1]);

    if (pathname === '/api/players' && req.method === 'GET') return handleGetPlayers(req, res, parsed.query);

    // NOTE: these two specific routes must be checked before the generic
    // /api/players/:id match below — otherwise "record-results" gets
    // captured as a player id and silently corrupts players.json.
    if (pathname === '/api/players/record-results' && req.method === 'POST') return handleRecordResults(req, res);
    if (pathname === '/api/wipe' && req.method === 'POST') return handleWipe(res);

    var playerMatch = pathname.match(/^\/api\/players\/([^\/]+)$/);
    if (playerMatch && (req.method === 'PUT' || req.method === 'POST')) return handleSavePlayer(req, res, playerMatch[1]);

    if (pathname.indexOf('/api/') === 0) return sendError(res, 404, 'Unknown API route');

    // ---- static frontend (plain HTML/CSS/JS in ./public, no build step) --
    var relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    var filePath = path.join(PUBLIC_DIR, relative);

    // guard against escaping PUBLIC_DIR via ../
    if (filePath.indexOf(PUBLIC_DIR) !== 0) return sendError(res, 400, 'Bad request');

    fs.stat(filePath, function (err, stats) {
      if (!err && stats.isFile()) return serveStaticFile(res, filePath);
      // SPA-style fallback: anything else gets index.html
      serveStaticFile(res, path.join(PUBLIC_DIR, 'index.html'));
    });
  };
}

// ---------------------------------------------------------------------------
// standalone mode: `node server.js` / `iojs server.js`
// ---------------------------------------------------------------------------

if (require.main === module) {
  var PORT = process.env.PORT || 5000;
  http.createServer(createHandler('')).listen(PORT, function () {
    console.log('Nominate server listening on http://localhost:' + PORT);
    console.log('Serving static frontend from: ' + PUBLIC_DIR);
    console.log('Data directory: ' + DATA_DIR);
  });
}

module.exports = { createHandler: createHandler };
